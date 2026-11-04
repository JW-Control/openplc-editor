/**
 * JWPLC Edition: carry a pre-4.3 baremetal Modbus configuration forward.
 *
 * Up to 4.2.x the board's VPP screens held the whole Modbus setup in the
 * `modbus_rtu` / `modbus_tcp` sections of `vendorScreenData`. From 4.3 the
 * protocol half is a project `PLCServer` and the screens keep only the line:
 * `serial` (default UART speed, RS-485 pin) and `network` (Ethernet / Wi-Fi).
 * Upstream drops the old sections; JWPLC projects are migrated instead, so a
 * project from 2.1.0-alpha.16 keeps serving the same Modbus after it opens.
 *
 * Pure: the caller reads and writes the files.
 */

import type { ModbusSlaveConfig } from '../../../middleware/shared/ports/types'

/** The fields of a project server the migration reads. */
interface ServerLike {
  name: string
  protocol: string
}

/** A server created by the migration. */
export interface MigratedModbusServer {
  name: string
  protocol: 'modbus-tcp'
  modbusSlaveConfig: Pick<
    ModbusSlaveConfig,
    'enabled' | 'transports' | 'networkInterface' | 'port' | 'slaveId' | 'serialPort' | 'baudRate'
  >
}

type Section = Record<string, unknown>
type ScreenData = Record<string, unknown>

/** Name of the server a migration creates. */
export const MIGRATED_MODBUS_SERVER_NAME = 'modbus_server'

const LEGACY_KEYS = ['modbus_rtu', 'modbus_tcp'] as const

export interface LegacyModbusDeviceConfiguration {
  vendorScreenData?: ScreenData
  vendorScreenDataByBoard?: Record<string, ScreenData>
}

export interface LegacyModbusMigration<T extends LegacyModbusDeviceConfiguration, S extends ServerLike> {
  migrated: boolean
  deviceConfiguration: T
  servers: (S | MigratedModbusServer)[]
  /** The server the migration added, when it added one. */
  createdServer?: MigratedModbusServer
}

function isRecord(value: unknown): value is Section {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(section: Section, key: string): string | undefined {
  const value = section[key]
  if (typeof value === 'string' && value.trim() !== '') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

function readNumber(section: Section, key: string): number | undefined {
  const value = section[key]
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(parsed) ? parsed : undefined
}

export function hasLegacyModbusSections(screens: ScreenData | undefined): boolean {
  return !!screens && LEGACY_KEYS.some((key) => isRecord(screens[key]))
}

/**
 * Move the line settings of the legacy sections into `serial` / `network`.
 * Values already present in the new sections win: they are newer.
 */
export function migrateLegacyScreens(screens: ScreenData): ScreenData {
  if (!hasLegacyModbusSections(screens)) return screens
  const next: ScreenData = { ...screens }
  const rtu = isRecord(screens.modbus_rtu) ? screens.modbus_rtu : undefined
  const tcp = isRecord(screens.modbus_tcp) ? screens.modbus_tcp : undefined

  if (rtu) {
    const serial: Section = isRecord(screens.serial) ? { ...screens.serial } : {}
    const iface = readString(rtu, 'rtu_interface') ?? 'Serial'
    const baud = readString(rtu, 'rtu_baud_rate')
    // The default UART's speed is the screen's; a secondary UART's goes to the server.
    if (baud && iface === 'Serial' && serial.baud_rate === undefined) serial.baud_rate = baud
    if (rtu.enable_rs485_en_pin === true && serial.enable_rs485_en_pin === undefined) {
      serial.enable_rs485_en_pin = true
      const pin = readString(rtu, 'rtu_rs485_en_pin')
      if (pin && serial.rs485_en_pin === undefined) serial.rs485_en_pin = pin
    }
    if (Object.keys(serial).length > 0) next.serial = serial
  }

  if (tcp) {
    const network: Section = isRecord(screens.network) ? { ...screens.network } : {}
    const copy = (from: string, to: string) => {
      if (network[to] === undefined && tcp[from] !== undefined) network[to] = tcp[from]
    }
    if (tcp.enabled === true && network.enabled === undefined) network.enabled = true
    copy('tcp_interface', 'interface')
    copy('tcp_mac_address', 'mac_address')
    copy('enable_dhcp', 'enable_dhcp')
    copy('ip_address', 'ip_address')
    copy('gateway', 'gateway')
    copy('subnet', 'subnet')
    copy('dns', 'dns')
    copy('tcp_wifi_ssid', 'wifi_ssid')
    copy('tcp_wifi_password', 'wifi_password')
    // JWPLC VPP: the device address the debugger dials under DHCP.
    copy('tcp_debug_ip_address', 'tcp_debug_ip_address')
    if (Object.keys(network).length > 0) next.network = network
  }

  for (const key of LEGACY_KEYS) delete next[key]
  return next
}

/** The server the legacy sections describe, or null when neither transport was on. */
export function legacyModbusServer(
  screens: ScreenData,
  name = MIGRATED_MODBUS_SERVER_NAME,
): MigratedModbusServer | null {
  const rtu = isRecord(screens.modbus_rtu) ? screens.modbus_rtu : undefined
  const tcp = isRecord(screens.modbus_tcp) ? screens.modbus_tcp : undefined
  const rtuOn = rtu?.enabled === true
  const tcpOn = tcp?.enabled === true
  if (!rtuOn && !tcpOn) return null

  const transports: ('rtu' | 'tcp')[] = []
  if (rtuOn) transports.push('rtu')
  if (tcpOn) transports.push('tcp')

  const iface = rtu ? (readString(rtu, 'rtu_interface') ?? 'Serial') : undefined
  const baud = rtu ? readNumber(rtu, 'rtu_baud_rate') : undefined
  const slaveId = rtu ? readNumber(rtu, 'rtu_slave_id') : undefined

  return {
    name,
    protocol: 'modbus-tcp',
    modbusSlaveConfig: {
      enabled: true,
      transports,
      networkInterface: '0.0.0.0',
      port: 502,
      ...(slaveId !== undefined ? { slaveId } : {}),
      ...(rtuOn && iface ? { serialPort: iface } : {}),
      ...(rtuOn && iface !== 'Serial' && baud !== undefined ? { baudRate: baud } : {}),
    },
  }
}

/**
 * Migrate a device configuration and the project's servers. Adds a server only
 * when the project has no Modbus server yet; the legacy sections are removed
 * either way so the migration never runs twice.
 */
export function migrateLegacyBaremetalModbus<T extends LegacyModbusDeviceConfiguration, S extends ServerLike>(
  deviceConfiguration: T,
  servers: readonly S[],
): LegacyModbusMigration<T, S> {
  const active = deviceConfiguration.vendorScreenData
  const byBoard = deviceConfiguration.vendorScreenDataByBoard
  const anyLegacy =
    hasLegacyModbusSections(active) || Object.values(byBoard ?? {}).some((screens) => hasLegacyModbusSections(screens))
  if (!anyLegacy) return { migrated: false, deviceConfiguration, servers: [...servers] }

  const hasModbusServer = servers.some((server) => server.protocol === 'modbus-tcp')
  const takenNames = new Set(servers.map((server) => server.name))
  let name = MIGRATED_MODBUS_SERVER_NAME
  for (let suffix = 2; takenNames.has(name); suffix++) name = `${MIGRATED_MODBUS_SERVER_NAME}_${suffix}`

  const source = active && hasLegacyModbusSections(active) ? active : undefined
  const createdServer = !hasModbusServer && source ? (legacyModbusServer(source, name) ?? undefined) : undefined

  const next: T = { ...deviceConfiguration }
  if (active) next.vendorScreenData = migrateLegacyScreens(active)
  if (byBoard) {
    next.vendorScreenDataByBoard = Object.fromEntries(
      Object.entries(byBoard).map(([board, screens]) => [board, migrateLegacyScreens(screens)]),
    )
  }

  return {
    migrated: true,
    deviceConfiguration: next,
    servers: createdServer ? [...servers, createdServer] : [...servers],
    ...(createdServer ? { createdServer } : {}),
  }
}
