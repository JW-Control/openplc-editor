/**
 * JWPLC HMI Designer hosted by OpenPLC (`jwplc-hmi-host/1`, Alpha14 F3).
 *
 * Pure helpers for the OpenPLC side of the contract
 * (platform-jwplc docs/v2.1.0-alpha.14/A14_F3_CONTRATO_HMI_OPENPLC_20261017.md):
 *
 * - `collectHmiCandidates()` takes the editor's compile-ready project (store
 *   shape: aliases already resolved to addresses) and lists the variables an
 *   HMI object may name: globals plus variables of instantiated programs.
 * - `describeHmiVariables()` turns them into the `HostVariable` list the
 *   Designer receives from `listVariables()`, with the same rules the compile
 *   applies (`jwplc-hmi.ts`), so the Designer only offers links that compile.
 * - `pickJwhmiToLoad()` chooses the Designer project to open from `hmi/`.
 * - `describeHmiFolder()` is the Designer's "linked sketch" in OpenPLC: the
 *   project's `hmi/` folder (contract 1.1).
 * - `describeHmiSerialPort()` is the port list entry of the Designer's own
 *   serial port picker (Live Preview and Live Bridge flashing).
 */

import { imageSlot, JWPLC_HMI_HEADER_FILE, JWPLC_HMI_PROJECT_FILE } from './jwplc-hmi'

export type HmiHostType = 'bool' | 'float' | 'int32_t'

export interface HmiCandidateVariable {
  name: string
  scope: 'global' | 'program'
  pou?: string
  type: { definition: string; value: string }
  location: string
}

export interface HmiHostVariable {
  name: string
  scope: 'global' | 'program'
  pou?: string
  iecType: string
  address: string | null
  hmiTypes: HmiHostType[]
  access: 'R' | 'RW' | null
  reason?: string
}

type StoreVariable = { name: string; type: { definition: string; value: string }; location?: string }

/** Minimal slice of the editor store's project data that this module reads. */
export interface HmiStoreProject {
  pous?: Array<{ name: string; pouType?: string; interface?: { variables?: StoreVariable[] } }>
  configurations?: {
    resource?: {
      instances?: Array<{ program: string }>
      globalVariables?: StoreVariable[]
    }
  }
}

/** Globals plus variables of instantiated programs (same scope as the compile). */
export function collectHmiCandidates(project: HmiStoreProject): HmiCandidateVariable[] {
  const resource = project.configurations?.resource
  const toCandidate = (variable: StoreVariable, scope: 'global' | 'program', pou?: string): HmiCandidateVariable => ({
    name: variable.name,
    scope,
    ...(pou ? { pou } : {}),
    type: variable.type,
    location: variable.location ?? '',
  })
  const candidates = (resource?.globalVariables ?? []).map((variable) => toCandidate(variable, 'global'))
  const instantiated = new Set((resource?.instances ?? []).map((instance) => instance.program.toLowerCase()))
  for (const pou of project.pous ?? []) {
    if (pou.pouType !== 'program' || !instantiated.has(pou.name.toLowerCase())) continue
    for (const variable of pou.interface?.variables ?? []) candidates.push(toCandidate(variable, 'program', pou.name))
  }
  return candidates
}

/** The `listVariables()` answer: every candidate, bindable or with the reason it is not. */
export function describeHmiVariables(candidates: HmiCandidateVariable[]): HmiHostVariable[] {
  return candidates.map((candidate) => {
    const iecType = candidate.type.value.toUpperCase()
    const base = {
      name: candidate.name,
      scope: candidate.scope,
      ...(candidate.pou ? { pou: candidate.pou } : {}),
      iecType,
      address: candidate.location ? candidate.location.toUpperCase() : null,
    }
    const notBindable = (reason: string): HmiHostVariable => ({ ...base, hmiTypes: [], access: null, reason })

    if (candidate.type.definition !== 'base-type')
      return notBindable('tipo de usuario; sólo se enlazan tipos elementales')
    if (!candidate.location) return notBindable('sin dirección; asígnale una %MW/%MD (o %IX/%QX si es E/S)')
    const slot = imageSlot(candidate.location)
    if (typeof slot === 'string') return notBindable(slot)
    if (!slot.types.includes(iecType)) return notBindable(`${candidate.location} admite ${slot.types.join(', ')}`)
    return {
      ...base,
      hmiTypes: slot.kind === 'bool' ? ['bool'] : ['float', 'int32_t'],
      access: slot.writable ? 'RW' : 'R',
    }
  })
}

/**
 * Designer project to open: `JWPLC_HMI.jwhmi` when present; otherwise the only
 * `.jwhmi` in `hmi/` (a project from before F3, saved back under the canonical
 * name); otherwise none (new screen).
 */
export function pickJwhmiToLoad(fileNames: string[]): string | null {
  if (fileNames.includes(JWPLC_HMI_PROJECT_FILE)) return JWPLC_HMI_PROJECT_FILE
  const projects = fileNames.filter((name) => name.toLowerCase().endsWith('.jwhmi'))
  return projects.length === 1 ? projects[0] : null
}

/** `getLinkedSketch()` answer: the Designer writes to and reads from the project's `hmi/` folder. */
export interface HmiFolderInfo {
  ok: true
  name: string
  path: string
  headerExists: boolean
  projectFile: string
  projectExists: boolean
}

export function describeHmiFolder(projectName: string, hmiDir: string, fileNames: string[]): HmiFolderInfo {
  return {
    ok: true,
    name: projectName,
    path: hmiDir,
    headerExists: fileNames.includes(JWPLC_HMI_HEADER_FILE),
    // Saving always writes the canonical name; an older single .jwhmi still opens.
    projectFile: JWPLC_HMI_PROJECT_FILE,
    projectExists: pickJwhmiToLoad(fileNames) !== null,
  }
}

/** USB-serial chips found on ESP32 boards (vendorId in hex), as in the Designer's .exe. */
const USB_SERIAL_CHIPS: Record<string, string> = {
  '1a86': 'CH340 / CH343',
  '10c4': 'CP210x',
  '0403': 'FTDI',
  '303a': 'Espressif USB',
}

export interface HmiSerialPortInput {
  portId: string
  portName?: string
  displayName?: string
  vendorId?: string | number
  productId?: string | number
}

export interface HmiSerialPort {
  portId: string
  portName: string
  displayName: string
  vendorId: string
  productId: string
  chip: string
}

/** Electron gives USB ids as decimal strings; the picker shows them in hex. */
function toHexUsbId(value: string | number | undefined): string {
  if (value === undefined || value === '') return ''
  const n = Number.parseInt(String(value), 10)
  return Number.isFinite(n) ? n.toString(16).padStart(4, '0') : String(value)
}

export function describeHmiSerialPort(port: HmiSerialPortInput): HmiSerialPort {
  const vendorId = toHexUsbId(port.vendorId)
  return {
    portId: port.portId,
    portName: port.portName ?? '',
    displayName: port.displayName ?? '',
    vendorId,
    productId: toHexUsbId(port.productId),
    chip: USB_SERIAL_CHIPS[vendorId] ?? '',
  }
}
