import net from 'node:net'
import { networkInterfaces } from 'node:os'

export type JwplcDiscoveredDevice = {
  ipAddress: string
  port: number
  label: string
  interfaceName: string
  sourceAddress: string
}

export type JwplcDeviceDiscoveryOptions = {
  port?: number
  timeoutMs?: number
  concurrency?: number
}

const DEFAULT_PORT = 502
const DEFAULT_TIMEOUT_MS = 250
const DEFAULT_CONCURRENCY = 64

const ipToLong = (ip: string) =>
  ip.split('.').reduce((acc, octet) => ((acc << 8) + Number(octet)) >>> 0, 0)

const longToIp = (value: number) =>
  [
    (value >>> 24) & 255,
    (value >>> 16) & 255,
    (value >>> 8) & 255,
    value & 255,
  ].join('.')

const isIpv4 = (family: string | number) => family === 'IPv4' || family === 4

const getScanTargets = () => {
  const targets: Array<{
    ipAddress: string
    interfaceName: string
    sourceAddress: string
  }> = []

  const interfaces = networkInterfaces()

  for (const [interfaceName, entries] of Object.entries(interfaces)) {
    for (const entry of entries ?? []) {
      if (!isIpv4(entry.family) || entry.internal) continue

      const sourceAddress = entry.address
      const sourceLong = ipToLong(sourceAddress)

      // Fase 1: escaneo seguro de /24 local.
      // Evita barridos enormes si Windows reporta una máscara más amplia.
      const networkBase = sourceLong & ipToLong('255.255.255.0')

      for (let host = 1; host <= 254; host++) {
        const ipAddress = longToIp((networkBase + host) >>> 0)
        if (ipAddress === sourceAddress) continue

        targets.push({
          ipAddress,
          interfaceName,
          sourceAddress,
        })
      }
    }
  }

  return targets
}

const testTcpPort = (ipAddress: string, port: number, timeoutMs: number) =>
  new Promise<boolean>((resolve) => {
    const socket = new net.Socket()
    let done = false

    const finish = (result: boolean) => {
      if (done) return
      done = true
      socket.removeAllListeners()
      socket.destroy()
      resolve(result)
    }

    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))

    socket.connect(port, ipAddress)
  })

export const discoverJwplcDevices = async (
  options: JwplcDeviceDiscoveryOptions = {},
): Promise<JwplcDiscoveredDevice[]> => {
  const port = options.port ?? DEFAULT_PORT
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY

  const targets = getScanTargets()
  const found: JwplcDiscoveredDevice[] = []

  let index = 0

  const worker = async () => {
    while (index < targets.length) {
      const target = targets[index++]
      if (!target) continue

      const reachable = await testTcpPort(target.ipAddress, port, timeoutMs)

      if (reachable) {
        found.push({
          ipAddress: target.ipAddress,
          port,
          label: `JWPLC / Modbus TCP - ${target.ipAddress}:${port}`,
          interfaceName: target.interfaceName,
          sourceAddress: target.sourceAddress,
        })
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, Math.max(targets.length, 1)) },
    () => worker(),
  )

  await Promise.all(workers)

  return found.sort((a, b) => a.ipAddress.localeCompare(b.ipAddress))
}
