import type { DevicePort } from '../../../shared/ports/device-port'
import type { BoardInfo, CommunicationPort } from '../../../shared/ports/types'
import { createEditorDeviceAdapter } from '../device-adapter'

const mockBoards = new Map<string, BoardInfo>([
  [
    'Arduino Uno',
    {
      compiler: 'arduino-cli',
      core: 'arduino:avr',
      preview: 'uno.png',
      specs: { CPU: 'ATmega328P', RAM: '2 KB' },
      pins: { defaultDin: ['2', '3'], defaultDout: ['4', '5'] },
    },
  ],
])

const mockPorts: CommunicationPort[] = [
  { name: '/dev/ttyUSB0', address: '/dev/ttyUSB0' },
  { name: '/dev/ttyACM0', address: '/dev/ttyACM0' },
]

const mockRefreshResult = [{ board: 'Arduino Uno', version: '1.8.6' }]

beforeEach(() => {
  window.bridge = {
    getAvailableBoards: jest.fn().mockResolvedValue(mockBoards),
    getAvailableCommunicationPorts: jest.fn().mockResolvedValue(mockPorts),
    refreshAvailableBoards: jest.fn().mockResolvedValue(mockRefreshResult),
    refreshCommunicationPorts: jest.fn().mockResolvedValue(mockPorts),
    getPreviewImage: jest.fn().mockResolvedValue('data:image/png;base64,abc123'),
    prepareHmiDesigner: jest.fn().mockResolvedValue({ ok: true, url: 'http://127.0.0.1:1/desktop.html?host=openplc' }),
    updateHmiDesignerVariables: jest.fn().mockResolvedValue({ ok: true }),
    saveHmiDesigner: jest.fn().mockResolvedValue({ ok: true }),
    onHmiDesignerDirty: jest.fn().mockReturnValue(() => undefined),
    discoverJwplcDevices: jest.fn().mockResolvedValue({ devices: [] }),
  } as unknown as typeof window.bridge
})

describe('createEditorDeviceAdapter', () => {
  let adapter: DevicePort

  beforeEach(() => {
    adapter = createEditorDeviceAdapter()
  })

  it('delegates getAvailableBoards to window.bridge', async () => {
    const result = await adapter.getAvailableBoards()
    expect(window.bridge.getAvailableBoards).toHaveBeenCalledTimes(1)
    expect(result).toBe(mockBoards)
  })

  it('delegates getCommunicationPorts to window.bridge', async () => {
    const result = await adapter.getCommunicationPorts()
    expect(window.bridge.getAvailableCommunicationPorts).toHaveBeenCalledTimes(1)
    expect(result).toBe(mockPorts)
  })

  it('delegates refreshBoards to window.bridge', async () => {
    const result = await adapter.refreshBoards()
    expect(window.bridge.refreshAvailableBoards).toHaveBeenCalledTimes(1)
    expect(result).toBe(mockRefreshResult)
  })

  it('delegates refreshCommunicationPorts to window.bridge', async () => {
    const result = await adapter.refreshCommunicationPorts()
    expect(window.bridge.refreshCommunicationPorts).toHaveBeenCalledTimes(1)
    expect(result).toBe(mockPorts)
  })

  it('delegates getPreviewImage to window.bridge with image name', async () => {
    const result = await adapter.getPreviewImage('uno.png')
    expect(window.bridge.getPreviewImage).toHaveBeenCalledWith('uno.png', undefined)
    expect(result).toBe('data:image/png;base64,abc123')
  })

  it('forwards vppPackagePath to window.bridge for VPP-shipped previews', async () => {
    await adapter.getPreviewImage('motor-shield.png', '/path/to/pkg')
    expect(window.bridge.getPreviewImage).toHaveBeenCalledWith('motor-shield.png', '/path/to/pkg')
  })

  it('discovers JWPLC devices through window.bridge', async () => {
    await expect(adapter.discoverJwplcDevices()).resolves.toEqual({ devices: [] })
  })

  it('links JWPLC HMI Designer to the project through window.bridge', async () => {
    const args = { projectPath: '/p', projectName: 'P', device: 'JWPLC', variables: [] }
    await expect(adapter.prepareHmiDesigner?.(args)).resolves.toEqual({
      ok: true,
      url: 'http://127.0.0.1:1/desktop.html?host=openplc',
    })
    expect(window.bridge.prepareHmiDesigner).toHaveBeenCalledWith(args)
  })

  it('sends the PLC variables and saves the design through window.bridge', async () => {
    await expect(adapter.updateHmiDesignerVariables?.([])).resolves.toEqual({ ok: true })
    expect(window.bridge.updateHmiDesignerVariables).toHaveBeenCalledWith([])
    await expect(adapter.saveHmiDesigner?.()).resolves.toEqual({ ok: true })
    expect(window.bridge.saveHmiDesigner).toHaveBeenCalledTimes(1)
  })

  it('subscribes to unsaved changes of the design through window.bridge', () => {
    const callback = jest.fn()
    const unsubscribe = adapter.onHmiDesignerDirty?.(callback)
    expect(window.bridge.onHmiDesignerDirty).toHaveBeenCalledWith(callback)
    expect(typeof unsubscribe).toBe('function')
  })
})
