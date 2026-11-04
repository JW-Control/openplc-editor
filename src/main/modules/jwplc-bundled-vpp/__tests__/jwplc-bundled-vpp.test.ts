import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { installBundledVpp, readBundledVpp, shouldInstallBundled } from '../index'

describe('shouldInstallBundled', () => {
  it('installs when the package is missing or older', () => {
    expect(shouldInstallBundled(undefined, '2.1.0-alpha.17')).toBe(true)
    expect(shouldInstallBundled('2.1.0-alpha.16', '2.1.0-alpha.17')).toBe(true)
  })

  it('keeps an equal or newer installed package', () => {
    expect(shouldInstallBundled('2.1.0-alpha.17', '2.1.0-alpha.17')).toBe(false)
    expect(shouldInstallBundled('2.1.0', '2.1.0-alpha.17')).toBe(false)
  })
})

describe('installBundledVpp', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'bundled-vpp-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  function bundle(version = '2.1.0-alpha.17') {
    writeFileSync(join(dir, 'JWPLC-Basic.vpp'), 'zip')
    writeFileSync(
      join(dir, 'bundled.json'),
      JSON.stringify({ file: 'JWPLC-Basic.vpp', packageId: 'com.jwcontrol.jwplc-basic', version }),
    )
  }

  it('does nothing without a bundled package', async () => {
    const packages = { listInstalled: jest.fn(() => []), importFromFile: jest.fn() }
    await expect(installBundledVpp(packages, dir)).resolves.toEqual({ state: 'absent' })
    expect(packages.importFromFile).not.toHaveBeenCalled()
  })

  it('rejects an index that names a path outside the directory', () => {
    writeFileSync(join(dir, 'bundled.json'), JSON.stringify({ file: '../x.vpp', packageId: 'a', version: '1.0.0' }))
    expect(readBundledVpp(dir)).toBeNull()
  })

  it('installs a missing package through importFromFile', async () => {
    bundle()
    const packages = {
      listInstalled: jest.fn(() => []),
      importFromFile: jest.fn(() => Promise.resolve({ success: true })),
    }
    await expect(installBundledVpp(packages, dir)).resolves.toEqual({ state: 'installed', version: '2.1.0-alpha.17' })
    expect(packages.importFromFile).toHaveBeenCalledWith(join(dir, 'JWPLC-Basic.vpp'))
  })

  it('leaves an up-to-date package alone', async () => {
    bundle()
    const packages = {
      listInstalled: jest.fn(() => [{ packageId: 'com.jwcontrol.jwplc-basic', version: '2.1.0-alpha.17' }]),
      importFromFile: jest.fn(),
    }
    await expect(installBundledVpp(packages, dir)).resolves.toEqual({ state: 'up-to-date', version: '2.1.0-alpha.17' })
    expect(packages.importFromFile).not.toHaveBeenCalled()
  })

  it('reports a failed install (bad signature) without throwing', async () => {
    bundle()
    const packages = {
      listInstalled: jest.fn(() => []),
      importFromFile: jest.fn(() =>
        Promise.resolve({ success: false, error: 'Package signature verification failed' }),
      ),
    }
    await expect(installBundledVpp(packages, dir)).resolves.toEqual({
      state: 'failed',
      error: 'Package signature verification failed',
    })
  })
})
