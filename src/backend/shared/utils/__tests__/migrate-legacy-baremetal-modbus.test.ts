import {
  legacyModbusServer,
  migrateLegacyBaremetalModbus,
  migrateLegacyScreens,
} from '../migrate-legacy-baremetal-modbus'

const alpha16Screens = {
  modbus_rtu: {
    enabled: true,
    rtu_interface: 'Serial2',
    rtu_baud_rate: '19200',
    rtu_slave_id: 3,
    enable_rs485_en_pin: false,
  },
  modbus_tcp: {
    enabled: true,
    tcp_interface: 'Ethernet',
    tcp_mac_address: 'de:ad:be:ef:00:01',
    enable_dhcp: false,
    ip_address: '192.168.1.50',
    gateway: '192.168.1.1',
    subnet: '255.255.255.0',
    dns: '8.8.8.8',
  },
  'module-configuration': { slots: ['jwplc-basic-controller'] },
}

describe('migrateLegacyScreens', () => {
  it('moves the network settings and drops the legacy sections', () => {
    const out = migrateLegacyScreens(alpha16Screens)
    expect(out.modbus_rtu).toBeUndefined()
    expect(out.modbus_tcp).toBeUndefined()
    expect(out.network).toEqual({
      enabled: true,
      interface: 'Ethernet',
      mac_address: 'de:ad:be:ef:00:01',
      enable_dhcp: false,
      ip_address: '192.168.1.50',
      gateway: '192.168.1.1',
      subnet: '255.255.255.0',
      dns: '8.8.8.8',
    })
    expect(out['module-configuration']).toEqual(alpha16Screens['module-configuration'])
  })

  it('keeps the default UART speed and RS-485 pin on the serial screen', () => {
    const out = migrateLegacyScreens({
      modbus_rtu: {
        enabled: true,
        rtu_interface: 'Serial',
        rtu_baud_rate: '9600',
        enable_rs485_en_pin: true,
        rtu_rs485_en_pin: '4',
      },
    })
    expect(out.serial).toEqual({ baud_rate: '9600', enable_rs485_en_pin: true, rs485_en_pin: '4' })
  })

  it('does not overwrite values already on the new screens', () => {
    const out = migrateLegacyScreens({ ...alpha16Screens, network: { ip_address: '10.0.0.2' } })
    expect((out.network as Record<string, unknown>).ip_address).toBe('10.0.0.2')
  })
})

describe('legacyModbusServer', () => {
  it('builds one server with both transports, the RS-485 port and its speed', () => {
    expect(legacyModbusServer(alpha16Screens)).toEqual({
      name: 'modbus_server',
      protocol: 'modbus-tcp',
      modbusSlaveConfig: {
        enabled: true,
        transports: ['rtu', 'tcp'],
        networkInterface: '0.0.0.0',
        port: 502,
        slaveId: 3,
        serialPort: 'Serial2',
        baudRate: 19200,
      },
    })
  })

  it('returns null when neither transport was enabled', () => {
    expect(legacyModbusServer({ modbus_rtu: { enabled: false }, modbus_tcp: { enabled: false } })).toBeNull()
  })
})

describe('migrateLegacyBaremetalModbus', () => {
  it('adds the server and migrates every board', () => {
    const result = migrateLegacyBaremetalModbus(
      {
        deviceBoard: 'JWPLC Basic',
        vendorScreenData: alpha16Screens,
        vendorScreenDataByBoard: { 'JWPLC Basic': alpha16Screens },
      },
      [],
    )
    expect(result.migrated).toBe(true)
    expect(result.servers).toHaveLength(1)
    expect(result.createdServer?.name).toBe('modbus_server')
    expect(result.deviceConfiguration.vendorScreenData?.modbus_tcp).toBeUndefined()
    expect(result.deviceConfiguration.vendorScreenDataByBoard?.['JWPLC Basic'].modbus_rtu).toBeUndefined()
    expect(result.deviceConfiguration.deviceBoard).toBe('JWPLC Basic')
  })

  it('keeps an existing Modbus server and only cleans the screens', () => {
    const existing = { name: 'mb', protocol: 'modbus-tcp' as const }
    const result = migrateLegacyBaremetalModbus({ vendorScreenData: alpha16Screens }, [existing])
    expect(result.servers).toEqual([existing])
    expect(result.createdServer).toBeUndefined()
    expect(result.deviceConfiguration.vendorScreenData?.modbus_rtu).toBeUndefined()
  })

  it('leaves a 4.3 project untouched', () => {
    const config = { vendorScreenData: { network: { enabled: true } } }
    const result = migrateLegacyBaremetalModbus(config, [])
    expect(result.migrated).toBe(false)
    expect(result.deviceConfiguration).toBe(config)
  })
})
