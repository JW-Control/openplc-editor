import { EventEmitter } from 'events'

import { ModbusRtuClient } from '../modbus-rtu-client'

// Fake of the serialport API surface ModbusRtuClient uses. Each test drives
// the "device" by calling `respond()` and observes drain/close ordering.
class FakeSerialPort extends EventEmitter {
  static last: FakeSerialPort | null = null
  isOpen = false
  writes: Buffer[] = []
  calls: string[] = []
  closeCallbackFires = true

  constructor() {
    super()
    FakeSerialPort.last = this
    setTimeout(() => {
      this.isOpen = true
      this.emit('open')
    }, 0)
  }

  write(data: Buffer, cb: (err?: Error | null) => void) {
    this.writes.push(Buffer.from(data))
    cb(null)
  }

  flush(cb: (err: Error | null) => void) {
    cb(null)
  }

  drain(cb: () => void) {
    this.calls.push('drain')
    cb()
  }

  close(cb?: () => void) {
    this.calls.push('close')
    this.isOpen = false
    if (this.closeCallbackFires) cb?.()
  }

  respond(bytes: number[]) {
    this.emit('data', Buffer.from(bytes))
  }
}

jest.mock('serialport', () => ({ SerialPort: jest.fn().mockImplementation(() => new FakeSerialPort()) }))

// MD5 response: [id][fc 0x45][status 0x7E][md5 "abc"][trailer 0xDE 0xAD][crc:2]
const MD5_RESPONSE = [0x01, 0x45, 0x7e, 0x61, 0x62, 0x63, 0xde, 0xad, 0x00, 0x00]

async function connectedClient(): Promise<{ client: ModbusRtuClient; port: FakeSerialPort }> {
  const client = new ModbusRtuClient({ port: 'COM3', baudRate: 115200, slaveId: 1, timeout: 5000 })
  const connecting = client.connect()
  await jest.advanceTimersByTimeAsync(3000) // open + bootloader delay
  await connecting
  return { client, port: FakeSerialPort.last! }
}

describe('ModbusRtuClient.disconnect — graceful close', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    FakeSerialPort.last = null
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('lets the request on the wire finish, then drains and closes the port', async () => {
    const { client, port } = await connectedClient()

    const md5 = client.getMd5Hash()
    await jest.advanceTimersByTimeAsync(1) // request written
    const closing = client.disconnect()

    // The port must not close while the PLC is still answering.
    expect(port.calls).toEqual([])
    port.respond(MD5_RESPONSE)
    await jest.advanceTimersByTimeAsync(20) // frame-complete timeout

    await expect(md5).resolves.toMatchObject({ md5: 'abc' })
    await closing
    expect(port.calls).toEqual(['drain', 'close'])
    expect(port.isOpen).toBe(false)
  })

  it('fails requests queued after the close started instead of writing them', async () => {
    const { client, port } = await connectedClient()

    const closing = client.disconnect()
    const late = client.getVariablesList([0])
    await jest.advanceTimersByTimeAsync(10)
    await closing

    await expect(late).resolves.toMatchObject({ success: false })
    expect(port.writes).toHaveLength(0)
  })

  it('does not wait forever for an unanswered request or a missing close callback', async () => {
    const { client, port } = await connectedClient()
    port.closeCallbackFires = false

    void client.getMd5Hash().catch(() => undefined)
    await jest.advanceTimersByTimeAsync(1)

    let done = false
    const closing = client.disconnect().then(() => {
      done = true
    })
    await jest.advanceTimersByTimeAsync(1500 + 1000 + 10)
    await closing

    expect(done).toBe(true)
    expect(port.calls).toEqual(['drain', 'close'])
  })

  it('closes an injected port (simulator) synchronously', async () => {
    class InjectedPort extends EventEmitter {
      isOpen = false
      close = jest.fn(() => {
        this.isOpen = false
      })
      open() {
        this.isOpen = true
        this.emit('open')
      }
    }
    const injected = new InjectedPort()
    const client = new ModbusRtuClient({
      port: 'simulator',
      baudRate: 115200,
      slaveId: 1,
      timeout: 5000,
      serialPort: injected,
    })
    await client.connect()

    await client.disconnect()
    expect(injected.close).toHaveBeenCalledTimes(1)
  })

  it('is a no-op when never connected', async () => {
    const client = new ModbusRtuClient({ port: 'COM3', baudRate: 115200, slaveId: 1, timeout: 5000 })
    await expect(client.disconnect()).resolves.toBeUndefined()
  })
})
