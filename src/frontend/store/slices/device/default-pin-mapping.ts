import type { DevicePin, PinType } from '../../../../middleware/shared/ports/types'

import { createNewAddress, getHighestPinAddress } from './validation/pins'

type BoardPinDefaults = {
  defaultDin?: string[]
  defaultDout?: string[]
  defaultAin?: string[]
  defaultAout?: string[]
}

function appendDefaultPins(target: DevicePin[], names: string[] | undefined, pinType: PinType): void {
  for (const rawName of names ?? []) {
    const pin = rawName.trim()
    if (!pin) continue

    const previousAddress = getHighestPinAddress(target, pinType)
    target.push({
      pin,
      pinType,
      address: createNewAddress('INCREMENT', previousAddress),
      alias: '',
    })
  }
}

/**
 * Materialize a VPP board's declarative default pin lists into the same
 * DevicePin shape used by the Configuration -> Pin Mapping table.
 *
 * Address allocation deliberately reuses the table's canonical IEC helpers:
 *   digital inputs  -> %IX0.0, %IX0.1, ...
 *   digital outputs -> %QX0.0, %QX0.1, ...
 *   analog inputs   -> %IW0, %IW1, ...
 *   analog outputs  -> %QW0, %QW1, ...
 */
export function buildDefaultPinMapping(defaults: BoardPinDefaults | undefined): DevicePin[] {
  const pins: DevicePin[] = []

  appendDefaultPins(pins, defaults?.defaultDin, 'digitalInput')
  appendDefaultPins(pins, defaults?.defaultDout, 'digitalOutput')
  appendDefaultPins(pins, defaults?.defaultAin, 'analogInput')
  appendDefaultPins(pins, defaults?.defaultAout, 'analogOutput')

  return pins
}

export type { BoardPinDefaults }
