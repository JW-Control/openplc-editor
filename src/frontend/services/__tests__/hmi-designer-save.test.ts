import { registerHmiDesignerSaver, saveHmiDesignerDesign } from '../hmi-designer-save'

describe('hmi-designer-save', () => {
  it('has nothing to save without an open HMI Designer tab', async () => {
    await expect(saveHmiDesignerDesign()).resolves.toBe(true)
  })

  it('saves through the registered tab until it unregisters', async () => {
    const saver = jest.fn().mockResolvedValue(false)
    const unregister = registerHmiDesignerSaver(saver)
    await expect(saveHmiDesignerDesign()).resolves.toBe(false)
    expect(saver).toHaveBeenCalledTimes(1)
    unregister()
    await expect(saveHmiDesignerDesign()).resolves.toBe(true)
  })

  it('reports a failed save when the saver throws', async () => {
    const unregister = registerHmiDesignerSaver(() => Promise.reject(new Error('boom')))
    await expect(saveHmiDesignerDesign()).resolves.toBe(false)
    unregister()
  })

  it('keeps a newer saver when an older tab unregisters', async () => {
    const unregisterOld = registerHmiDesignerSaver(() => Promise.resolve(false))
    registerHmiDesignerSaver(() => Promise.resolve(true))
    unregisterOld()
    await expect(saveHmiDesignerDesign()).resolves.toBe(true)
  })
})
