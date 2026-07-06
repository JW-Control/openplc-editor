import dgram from 'node:dgram'
import net from 'node:net'
import { networkInterfaces } from 'node:os'

export type JwplcDiscoveredDevice = {
  ipAddress: string
  port: number
  label: string
  interfaceName: string
  sourceAddress: string
  discoveryType: 'jwplc-native' | 'modbus-tcp'
  isJwplc: boolean
  vendor?: string
  model?: string
  macAddress?: string
  networkMode?: string
}

export type JwplcDeviceDiscoveryOptions = {
  port?: number
  timeoutMs?: number
  concurrency?: number
  udpTimeoutMs?: number
}

type LocalNetwork = {
  interfaceName: string
  sourceAddress: string
  broadcastAddress: string
}

const DEFAULT_PORT = 502
const DEFAULT_TIMEOUT_MS = 250
const DEFAULT_UDP_TIMEOUT_MS = 800
const DEFAULT_CONCURRENCY = 64
const JWPLC_DISCOVERY_PORT = 54880
const JWPLC_DISCOVERY_REQUEST = 'JWPLC_DISCOVER_V1'
const JWPLC_DISCOVERY_RESPONSE = 'JWPLC_DEVICE_V1'

const ipToLong = (ip: string) => ip.split('.').reduce((acc, octet) => ((acc << 8) + Number(octet)) >>> 0, 0)

const longToIp = (value: number) =>
  [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join('.')

const isIpv4 = (family: string | number) => family === 'IPv4' || family === 4

const getLocalNetworks = (): LocalNetwork[] => {
  const networks: LocalNetwork[] = []
  const interfaces = networkInterfaces()

  for (const [interfaceName, entries] of Object.entries(interfaces)) {
    for (const entry of entries ?? []) {
      if (!isIpv4(entry.family) || entry.internal) continue

      const sourceAddress = entry.address
      const sourceLong = ipToLong(sourceAddress)

      // Fase 2: mantenemos /24 como alcance seguro para evitar barridos enormes.
      const networkBase = sourceLong & ipToLong('255.255.255.0')
      const broadcastAddress = longToIp((networkBase + 255) >>> 0)

      networks.push({
        interfaceName,
        sourceAddress,
        broadcastAddress,
      })
    }
  }

  return networks
}

const getScanTargets = (networks: LocalNetwork[]) => {
  const targets: Array<{
    ipAddress: string
    interfaceName: string
    sourceAddress: string
  }> = []

  for (const network of networks) {
    const sourceLong = ipToLong(network.sourceAddress)
    const networkBase = sourceLong & ipToLong('255.255.255.0')

    for (let host = 1; host <= 254; host++) {
      const ipAddress = longToIp((networkBase + host) >>> 0)
      if (ipAddress === network.sourceAddress) continue

      targets.push({
        ipAddress,
        interfaceName: network.interfaceName,
        sourceAddress: network.sourceAddress,
      })
    }
  }

  return targets
}

const parseDiscoveryPayload = (text: string) => {
  const parts = text.trim().split(';')
  if (parts[0] !== JWPLC_DISCOVERY_RESPONSE) return null

  const payload: Record<string, string> = {}

  for (const part of parts.slice(1)) {
    const separatorIndex = part.indexOf('=')
    if (separatorIndex <= 0) continue

    const key = part.slice(0, separatorIndex).trim()
    const value = part.slice(separatorIndex + 1).trim()
    payload[key] = value
  }

  return payload
}

const discoverNativeOnNetwork = (network: LocalNetwork, timeoutMs: number): Promise<JwplcDiscoveredDevice[]> =>
  new Promise((resolve) => {
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })
    const found = new Map<string, JwplcDiscoveredDevice>()

    const closeSocket = () => {
      try {
        socket.close()
      } catch {
        // Socket may already be closed.
      }
    }

    const finish = () => {
      closeSocket()
      resolve([...found.values()])
    }

    const timer = setTimeout(finish, timeoutMs)

    socket.once('error', () => {
      clearTimeout(timer)
      finish()
    })

    socket.on('message', (message, rinfo) => {
      const payload = parseDiscoveryPayload(message.toString('utf8'))
      if (!payload) return

      const ipAddress = payload.ip || rinfo.address
      const port = Number(payload.port || DEFAULT_PORT)
      const model = payload.model || 'JWPLC Basic'
      const vendor = payload.vendor || 'JW Control'
      const macAddress = payload.mac
      const networkMode = payload.mode

      found.set(`${ipAddress}:${port}`, {
        ipAddress,
        port,
        label: `${model} · ${ipAddress}:${port}`,
        interfaceName: network.interfaceName,
        sourceAddress: network.sourceAddress,
        discoveryType: 'jwplc-native',
        isJwplc: true,
        vendor,
        model,
        macAddress,
        networkMode,
      })
    })

    socket.bind(0, network.sourceAddress, () => {
      try {
        socket.setBroadcast(true)

        const targets = [...new Set(['255.255.255.255', network.broadcastAddress])]

        for (const target of targets) {
          socket.send(JWPLC_DISCOVERY_REQUEST, JWPLC_DISCOVERY_PORT, target)
        }
      } catch {
        clearTimeout(timer)
        finish()
      }
    })
  })

const discoverNativeJwplcDevices = async (networks: LocalNetwork[], timeoutMs: number) => {
  const results = await Promise.all(networks.map((network) => discoverNativeOnNetwork(network, timeoutMs)))
  return results.flat()
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

const discoverModbusTcpDevices = async (
  networks: LocalNetwork[],
  port: number,
  timeoutMs: number,
  concurrency: number,
) => {
  const targets = getScanTargets(networks)
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
          label: `Modbus TCP detectado · ${target.ipAddress}:${port}`,
          interfaceName: target.interfaceName,
          sourceAddress: target.sourceAddress,
          discoveryType: 'modbus-tcp',
          isJwplc: false,
        })
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, Math.max(targets.length, 1)) }, () => worker())

  await Promise.all(workers)

  return found
}

const mergeDiscoveryResults = (nativeDevices: JwplcDiscoveredDevice[], tcpDevices: JwplcDiscoveredDevice[]) => {
  const merged = new Map<string, JwplcDiscoveredDevice>()

  for (const device of nativeDevices) {
    merged.set(`${device.ipAddress}:${device.port}`, device)
  }

  for (const device of tcpDevices) {
    const key = `${device.ipAddress}:${device.port}`
    if (!merged.has(key)) {
      merged.set(key, device)
    }
  }

  return [...merged.values()].sort((a, b) => {
    if (a.isJwplc !== b.isJwplc) return a.isJwplc ? -1 : 1
    return a.ipAddress.localeCompare(b.ipAddress, undefined, { numeric: true })
  })
}

export const discoverJwplcDevices = async (
  options: JwplcDeviceDiscoveryOptions = {},
): Promise<JwplcDiscoveredDevice[]> => {
  const port = options.port ?? DEFAULT_PORT
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const udpTimeoutMs = options.udpTimeoutMs ?? DEFAULT_UDP_TIMEOUT_MS
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY

  const networks = getLocalNetworks()

  const nativeDevices = await discoverNativeJwplcDevices(networks, udpTimeoutMs)
  const tcpDevices = await discoverModbusTcpDevices(networks, port, timeoutMs, concurrency)

  return mergeDiscoveryResults(nativeDevices, tcpDevices)
}
