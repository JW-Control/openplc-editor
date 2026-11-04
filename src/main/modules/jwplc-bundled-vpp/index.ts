/**
 * JWPLC Edition: the JWPLC Basic VPP ships inside the installer
 * (`resources/jwplc-vpp/`) and is installed on launch when it is missing or
 * older than the bundled one. The install goes through
 * `PackageManagerModule.importFromFile`, so the same signature and
 * `minEditorVersion` checks as "Add from file…" apply.
 */
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { z } from 'zod'

import { compareVersions } from '../updater/version-order'

/** `bundled.json`, written next to the .vpp by the release workflow. */
const BundledVppIndex = z.object({
  file: z.string().regex(/^[\w.-]+\.vpp$/),
  packageId: z.string().min(1),
  version: z.string().min(1),
})
export type BundledVpp = z.infer<typeof BundledVppIndex>

export const BUNDLED_VPP_INDEX = 'bundled.json'

/** The bundled package described by `<dir>/bundled.json`, or null when there is none or it is unreadable. */
export function readBundledVpp(dir: string): (BundledVpp & { path: string }) | null {
  const indexPath = join(dir, BUNDLED_VPP_INDEX)
  if (!existsSync(indexPath)) return null
  try {
    const parsed = BundledVppIndex.safeParse(JSON.parse(readFileSync(indexPath, 'utf-8')))
    if (!parsed.success) return null
    const path = join(dir, parsed.data.file)
    return existsSync(path) ? { ...parsed.data, path } : null
  } catch {
    return null
  }
}

/**
 * Whether the bundled version should be installed over what is installed.
 * Never downgrades: a newer package the user installed by hand stays.
 */
export function shouldInstallBundled(installedVersion: string | undefined, bundledVersion: string): boolean {
  if (installedVersion === undefined) return true
  const order = compareVersions(bundledVersion, installedVersion)
  return order !== null && order > 0
}

interface PackageInstaller {
  listInstalled(): { packageId: string; version: string }[]
  importFromFile(path: string): Promise<{ success: boolean; error?: string }>
}

export type BundledVppOutcome =
  | { state: 'absent' }
  | { state: 'up-to-date'; version: string }
  | { state: 'installed'; version: string }
  | { state: 'failed'; error: string }

/** Installs the bundled VPP from `dir` when needed. Never throws. */
export async function installBundledVpp(packages: PackageInstaller, dir: string): Promise<BundledVppOutcome> {
  const bundled = readBundledVpp(dir)
  if (!bundled) return { state: 'absent' }
  try {
    const installed = packages.listInstalled().find((entry) => entry.packageId === bundled.packageId)
    if (!shouldInstallBundled(installed?.version, bundled.version)) {
      return { state: 'up-to-date', version: installed?.version ?? bundled.version }
    }
    const result = await packages.importFromFile(bundled.path)
    if (!result.success) return { state: 'failed', error: result.error ?? 'unknown error' }
    return { state: 'installed', version: bundled.version }
  } catch (error) {
    return { state: 'failed', error: error instanceof Error ? error.message : String(error) }
  }
}
