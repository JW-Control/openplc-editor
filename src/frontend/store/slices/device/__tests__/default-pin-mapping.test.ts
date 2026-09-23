import { buildDefaultPinMapping } from '../default-pin-mapping'

describe('buildDefaultPinMapping', () => {
  it('materializes JWPLC-style digital defaults with canonical IEC addresses', () => {
    const pins = buildDefaultPinMapping({
      defaultDin: ['I0_0', 'I0_1', 'I0_2', 'I0_3', 'I0_4', 'I0_5', 'I0_6', 'I0_7'],
      defaultDout: ['Q0_0', 'Q0_1', 'Q0_2', 'Q0_3', 'Q0_4', 'Q0_5', 'Q0_6', 'Q0_7'],
    })

    expect(pins).toHaveLength(16)
    expect(pins[0]).toEqual({ pin: 'I0_0', pinType: 'digitalInput', address: '%IX0.0', alias: '' })
    expect(pins[7]).toEqual({ pin: 'I0_7', pinType: 'digitalInput', address: '%IX0.7', alias: '' })
    expect(pins[8]).toEqual({ pin: 'Q0_0', pinType: 'digitalOutput', address: '%QX0.0', alias: '' })
    expect(pins[15]).toEqual({ pin: 'Q0_7', pinType: 'digitalOutput', address: '%QX0.7', alias: '' })
  })

  it('rolls digital addresses to the next byte', () => {
    const pins = buildDefaultPinMapping({
      defaultDin: ['I0', 'I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'I7', 'I8'],
    })

    expect(pins[8]?.address).toBe('%IX1.0')
  })

  it('materializes analog defaults with word addresses', () => {
    const pins = buildDefaultPinMapping({
      defaultAin: ['AI0', 'AI1'],
      defaultAout: ['AO0', 'AO1'],
    })

    expect(pins).toEqual([
      { pin: 'AI0', pinType: 'analogInput', address: '%IW0', alias: '' },
      { pin: 'AI1', pinType: 'analogInput', address: '%IW1', alias: '' },
      { pin: 'AO0', pinType: 'analogOutput', address: '%QW0', alias: '' },
      { pin: 'AO1', pinType: 'analogOutput', address: '%QW1', alias: '' },
    ])
  })

  it('ignores blank manifest entries without shifting valid addresses', () => {
    const pins = buildDefaultPinMapping({ defaultDin: [' I0_0 ', '', '   ', 'I0_1'] })

    expect(pins).toEqual([
      { pin: 'I0_0', pinType: 'digitalInput', address: '%IX0.0', alias: '' },
      { pin: 'I0_1', pinType: 'digitalInput', address: '%IX0.1', alias: '' },
    ])
  })
})
