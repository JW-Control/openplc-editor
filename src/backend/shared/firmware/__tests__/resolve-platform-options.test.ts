import type { PlatformOption } from '../../../../middleware/shared/ports/types'

import { resolvePlatformOptions } from '../resolve-platform-options'

const packageSource: PlatformOption = {
  key: 'packageSource',
  label: 'Package Source',
  default: 'published',
  values: [
    { id: 'published', label: 'Published / Installed', fqbn: 'jwplc:esp32:jwplcbasic' },
    { id: 'local', label: 'Local Development', fqbn: 'jwplc_local:esp32:jwplcbasic' },
  ],
}

const cpuOption: PlatformOption = {
  key: 'cpu',
  label: 'Processor',
  default: 'atmega328',
  values: [
    { id: 'atmega328', label: 'ATmega328P' },
    { id: 'atmega328old', label: 'ATmega328P (Old Bootloader)' },
  ],
}

describe('resolvePlatformOptions', () => {
  it('keeps the platform unchanged when no options exist', () => {
    expect(resolvePlatformOptions('arduino:avr:mega', undefined, undefined)).toBe('arduino:avr:mega')
  })

  it('resolves the published JWPLC FQBN exactly', () => {
    expect(resolvePlatformOptions('jwplc:esp32:jwplcbasic', [packageSource], { packageSource: 'published' })).toBe(
      'jwplc:esp32:jwplcbasic',
    )
  })

  it('resolves the local JWPLC FQBN exactly', () => {
    expect(resolvePlatformOptions('jwplc:esp32:jwplcbasic', [packageSource], { packageSource: 'local' })).toBe(
      'jwplc_local:esp32:jwplcbasic',
    )
  })

  it('preserves normal Arduino boards.txt menu options', () => {
    expect(resolvePlatformOptions('arduino:avr:nano', [cpuOption], { cpu: 'atmega328old' })).toBe(
      'arduino:avr:nano:cpu=atmega328old',
    )
  })

  it('appends normal menu options after an exact FQBN override', () => {
    expect(
      resolvePlatformOptions('jwplc:esp32:jwplcbasic', [packageSource, cpuOption], {
        packageSource: 'local',
        cpu: 'atmega328old',
      }),
    ).toBe('jwplc_local:esp32:jwplcbasic:cpu=atmega328old')
  })

  it('falls back to the manifest default when a persisted id is stale', () => {
    expect(resolvePlatformOptions('jwplc:esp32:jwplcbasic', [packageSource], { packageSource: 'missing' })).toBe(
      'jwplc:esp32:jwplcbasic',
    )
  })
})
