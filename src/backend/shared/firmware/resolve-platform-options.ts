import type { PlatformOption } from '../../../middleware/shared/ports/types'

/**
 * Resolve VPP-declared Arduino platform options into the effective FQBN.
 *
 * Ordinary values preserve the historical boards.txt menu behaviour and append
 * `:key=id`. A value that declares `fqbn` replaces the base platform exactly;
 * any ordinary options are then appended to that replacement. Stale persisted
 * ids fall back to the manifest default instead of leaking an invalid choice
 * into arduino-cli.
 */
export function resolvePlatformOptions(
  platform: string,
  platformOptions: PlatformOption[] | undefined,
  selected: Record<string, string> | undefined,
): string {
  if (!platformOptions || platformOptions.length === 0) return platform

  let effectivePlatform = platform
  const segments: string[] = []

  for (const option of platformOptions) {
    const requestedId = selected?.[option.key] ?? option.default
    const requestedValue = option.values.find((value) => value.id === requestedId)
    const defaultValue = option.values.find((value) => value.id === option.default)
    const resolvedValue = requestedValue ?? defaultValue
    const resolvedId = resolvedValue?.id ?? option.default

    if (resolvedValue?.fqbn) {
      effectivePlatform = resolvedValue.fqbn
      continue
    }

    segments.push(`${option.key}=${resolvedId}`)
  }

  return segments.length > 0 ? `${effectivePlatform}:${segments.join(':')}` : effectivePlatform
}
