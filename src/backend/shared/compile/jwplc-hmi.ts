/**
 * JWPLC HMI (Alpha14 v1): the integrated TFT screen of the JWPLC Basic.
 *
 * The screen is designed with JWPLC HMI Designer (the single HMI tool,
 * platform-jwplc `tools/jwplc-hmi-designer`), which writes
 * `JWPLC_HMI_Generated.h`. An OpenPLC project carries it in `hmi/`:
 *
 *   hmi/JWPLC_HMI.jwhmi         Designer project; `plcBinding` per object links it to the PLC
 *   hmi/JWPLC_HMI_Generated.h   header exported by the Designer (never edited by hand)
 *   hmi/bindings.json           extra HMI variable <-> PLC variable links (hand-written, v1)
 *
 * Contract: platform-jwplc docs/v2.1.0-alpha.14/A14_F3_CONTRATO_HMI_OPENPLC_20261017.md
 *
 * When the board declares `capabilities.hmiDisplay`, the compile adds two
 * files next to the HAL (`src/arduino.cpp`):
 *
 *   src/JWPLC_HMI_Generated.h   copied verbatim
 *   src/jwplc_hmi.h             generated here: `JWPLC_HMI_ENABLED`, the
 *                               include of the Designer header and
 *                               `jwplcHMIBindingsSnapshot()`
 *
 * `src/jwplc_hmi.h` is always written for those boards (with
 * `JWPLC_HMI_ENABLED 0` when the project has no screen), so a header left in
 * the build folder by an earlier compile never re-enables the HMI.
 *
 * Links go through the runtime's image-table pointers (`openplc.h`) of
 * located PLC variables:
 *
 *   HMI bool          <- BOOL                     %IX / %QX          bool_input / bool_output
 *   HMI float/int32_t <- INT, UINT, WORD          %IW / %QW / %MW    int_input / int_output / int_memory
 *   HMI float/int32_t <- DINT, UDINT, DWORD, REAL %MD                dint_memory
 *   HMI float/int32_t <- REAL                     %ID / %QD          real_input / real_output
 *
 * `"access": "RW"` (only on %MW / %MD) also writes HMI -> PLC: when the
 * screen confirms a new value (e.g. a MENU EDIT_NUM after OK) it is stored,
 * rounded and clamped to the IEC type, into the PLC memory; the program sees
 * it on the next scan. A shadow copy per RW link tells which side changed;
 * on start-up the PLC value wins. All of it runs in `jwplcHMIBindingsSnapshot()`
 * (HAL `updateOutputBuffers()`), so the HAL of VPP 2.1.0-alpha.30 is enough.
 *
 * Anything else is a compile error, never a silent no-op.
 *
 * Pure: no fs, no DOM. Operates on the schema-shape project the compile
 * pipeline carries (`configuration.resource`, `{ type, data }` POUs).
 */

import type { PLCProjectData, PLCVariable } from '../types/PLC/open-plc'

export const JWPLC_HMI_PROJECT_DIR = 'hmi'
export const JWPLC_HMI_HEADER_FILE = 'JWPLC_HMI_Generated.h'
export const JWPLC_HMI_BINDINGS_FILE = 'bindings.json'
export const JWPLC_HMI_GLUE_FILE = 'jwplc_hmi.h'
export const JWPLC_HMI_PROJECT_FILE = 'JWPLC_HMI.jwhmi'

export const JWPLC_HMI_BINDINGS_FORMAT = 'JWPLC_HMI_BINDINGS'
export const JWPLC_HMI_BINDINGS_VERSION = 1

/** True when the board declares the integrated HMI screen. */
export function hasHmiDisplay(boardEntry: unknown): boolean {
  const capabilities = (boardEntry as { capabilities?: Record<string, unknown> } | null | undefined)?.capabilities
  const value = capabilities?.hmiDisplay
  return value === true || (typeof value === 'object' && value !== null)
}

/**
 * True for the VPP screen of the HMI itself (its sections persist under
 * `hmi_*`, e.g. `hmi_diagnostics`): OpenPLC shows it inside "Pantalla HMI"
 * of Configuration instead of as a second HMI entry of the project tree.
 */
export function isHmiVendorScreen(screenDefinition: unknown): boolean {
  const sections = (screenDefinition as { sections?: Array<{ persistence?: unknown }> } | null | undefined)?.sections
  return (
    Array.isArray(sections) &&
    sections.length > 0 &&
    sections.every((section) => typeof section?.persistence === 'string' && section.persistence.startsWith('hmi_'))
  )
}

export interface GenerateJwplcHmiInput {
  /** Contents of `hmi/JWPLC_HMI_Generated.h`, or undefined when absent. */
  header: string | undefined
  /** Contents of `hmi/bindings.json`, or undefined when absent. */
  bindingsJson: string | undefined
  /** Contents of `hmi/JWPLC_HMI.jwhmi`, or undefined when absent. */
  jwhmiJson?: string
  /** True when `hmi/JWPLC_HMI.jwhmi` is newer than the header. */
  jwhmiNewerThanHeader?: boolean
  /** Compile-ready project (locations already resolved from aliases). */
  projectData: PLCProjectData
}

export interface GenerateJwplcHmiResult {
  /** Bundle entries keyed like the firmware skeleton (`src/...`). */
  files: Record<string, string>
  /** Non-empty means the compile must stop. */
  errors: string[]
  /** Build-log lines describing what was included. */
  messages: string[]
  /** Build-log warnings (the compile goes on). */
  warnings: string[]
}

type Access = 'R' | 'RW'
type HmiType = 'bool' | 'float' | 'int32_t'

interface BindingLink {
  hmi: string
  plc: string
  access: Access
  /** File the link came from. */
  source: string
}

interface ResolvedLink {
  hmi: string
  hmiType: HmiType
  plc: string
  access: Access
  /** `%MW1`, or the debug path (`INSTANCE0.MARCHA`) of an unlocated variable. */
  address: string
  plcType: string
  /** `image`: runtime buffer (`int_memory[1]`); `program`: STruC++ debug table (unlocated variable). */
  via: 'image' | 'program'
  pointer: string
  /** Bound check emitted as `static_assert(index < limit)` (image links only). */
  index: number
  limit: string
}

/** A PLC variable an HMI link may name, with its debug-table path. */
interface PlcEntry {
  variable: PLCVariable
  path: string
}

export interface ImageSlot {
  /** `bool_output[0][1]`, `int_memory[3]`, ... */
  pointer: string
  index: number
  limit: string
  /** IEC types that may live at this address. */
  types: readonly string[]
  /** Type assumed when the link names the address directly. */
  defaultType: string
  /** Kind of HMI variable the slot can feed. */
  kind: 'bool' | 'number'
  /** PLC memory (%M): the only area the HMI may write. */
  writable: boolean
}

const GLUE_BANNER = [
  `// ${JWPLC_HMI_GLUE_FILE}: generado por OpenPLC Editor al compilar. No editar.`,
  `// Origen: ${JWPLC_HMI_PROJECT_DIR}/${JWPLC_HMI_HEADER_FILE} (JWPLC HMI Designer)`,
  `//         + ${JWPLC_HMI_PROJECT_DIR}/${JWPLC_HMI_BINDINGS_FILE} (enlaces HMI <-> PLC).`,
  '#pragma once',
]

function disabledGlue(): string {
  return [...GLUE_BANNER, '#define JWPLC_HMI_ENABLED 0', ''].join('\n')
}

/**
 * HMI variables declared by the Designer header, `name -> C++ type`
 * (`bool estado = false;`, `float nivel = 0.0f;`, `char texto[13] = {};`).
 */
export function parseHmiVariables(header: string): Map<string, string> {
  const variables = new Map<string, string>()
  const declaration = /^(bool|float|double|char|u?int(?:8|16|32|64)_t)\s+([A-Za-z_]\w*)\s*(\[\s*\d+\s*\])?\s*=/gm
  for (const match of header.matchAll(declaration)) {
    variables.set(match[2], match[3] ? `${match[1]}[]` : match[1])
  }
  return variables
}

/** Every variable an HMI link may name: globals plus instantiated programs. */
function bindableEntries(projectData: PLCProjectData): PlcEntry[] {
  const resource = projectData.configuration?.resource
  // Debug-map paths (STruC++): globals by name, program variables as <INSTANCE>.<NAME>.
  const entries: PlcEntry[] = (resource?.globalVariables ?? []).map((variable) => ({
    variable,
    path: variable.name.toUpperCase(),
  }))
  const instances = resource?.instances ?? []
  for (const pou of projectData.pous ?? []) {
    if (pou.type !== 'program') continue
    // A program instantiated twice is reached through its first instance.
    const instance = instances.find((candidate) => candidate.program.toLowerCase() === pou.data.name.toLowerCase())
    if (!instance) continue
    for (const variable of pou.data.variables) {
      // VAR_EXTERNAL is the global itself (already listed).
      if (variable.class === 'external') continue
      entries.push({ variable, path: `${instance.name.toUpperCase()}.${variable.name.toUpperCase()}` })
    }
  }
  return entries
}

/**
 * Unlocated variables reached through the STruC++ debug table: the C type
 * that holds the value and the clamp range for HMI writes.
 */
const PROGRAM_VAR_TYPES: Record<string, { cType: string; kind: 'bool' | 'number'; bounds?: string }> = {
  BOOL: { cType: 'uint8_t', kind: 'bool' },
  SINT: { cType: 'int8_t', kind: 'number', bounds: '-128.0, 127.0' },
  USINT: { cType: 'uint8_t', kind: 'number', bounds: '0.0, 255.0' },
  BYTE: { cType: 'uint8_t', kind: 'number', bounds: '0.0, 255.0' },
  INT: { cType: 'int16_t', kind: 'number', bounds: '-32768.0, 32767.0' },
  UINT: { cType: 'uint16_t', kind: 'number', bounds: '0.0, 65535.0' },
  WORD: { cType: 'uint16_t', kind: 'number', bounds: '0.0, 65535.0' },
  DINT: { cType: 'int32_t', kind: 'number', bounds: '-2147483648.0, 2147483647.0' },
  UDINT: { cType: 'uint32_t', kind: 'number', bounds: '0.0, 4294967295.0' },
  DWORD: { cType: 'uint32_t', kind: 'number', bounds: '0.0, 4294967295.0' },
  REAL: { cType: 'float', kind: 'number' },
}

/** `'bool'` or `'number'` when an unlocated variable of this IEC type can be linked; otherwise why not. */
export function programVarKind(iecType: string, variableClass?: string): string {
  if (variableClass === 'temp') return 'variable temporal (VAR_TEMP): no existe entre scans'
  const support = PROGRAM_VAR_TYPES[iecType.toUpperCase()]
  if (!support)
    return `${iecType.toUpperCase()} sin dirección todavía no se enlaza (BOOL, enteros hasta 32 bits y REAL)`
  return support.kind
}

const PROGRAM_VAR_MARK = /@@JWPLC_HMI_VAR\(([^,()@]+),([A-Z]+)\)@@/g

/** Placeholder for the debug-table indexes of an unlocated variable, resolved after STruC++. */
function programVarMark(link: ResolvedLink): string {
  return `@@JWPLC_HMI_VAR(${link.address},${link.plcType})@@`
}

const WORD_TYPES = ['INT', 'UINT', 'WORD'] as const
const DWORD_TYPES = ['DINT', 'UDINT', 'DWORD', 'REAL'] as const

/** Map a located address to its runtime image-table slot (or why it has none). */
export function imageSlot(address: string): ImageSlot | string {
  const match = /^%([IQM])([XWDL])(\d+)(?:\.(\d+))?$/i.exec(address)
  if (!match) return `no es una dirección IEC válida`
  const area = match[1].toUpperCase()
  const size = match[2].toUpperCase()
  const index = Number(match[3])
  const bit = match[4]

  if (size === 'X') {
    if (area === 'M') return 'las marcas %MX no tienen buffer en el runtime de la placa'
    if (bit === undefined || Number(bit) > 7) return 'el bit debe ser 0..7'
    const input = area === 'I'
    return {
      pointer: `${input ? 'bool_input' : 'bool_output'}[${index}][${bit}]`,
      index,
      limit: `(${input ? 'MAX_DIGITAL_INPUT' : 'MAX_DIGITAL_OUTPUT'} / 8)`,
      types: ['BOOL'],
      defaultType: 'BOOL',
      kind: 'bool',
      writable: false,
    }
  }
  if (bit !== undefined) return 'sólo las direcciones de bit (X) llevan ".bit"'
  if (size === 'W') {
    const [buffer, limit] = {
      I: ['int_input', 'MAX_ANALOG_INPUT'],
      Q: ['int_output', 'MAX_ANALOG_OUTPUT'],
      M: ['int_memory', 'MAX_MEMORY_WORD'],
    }[area] as [string, string]
    return {
      pointer: `${buffer}[${index}]`,
      index,
      limit,
      types: WORD_TYPES,
      defaultType: 'INT',
      kind: 'number',
      writable: area === 'M',
    }
  }
  if (size === 'D') {
    if (area === 'M') {
      return {
        pointer: `dint_memory[${index}]`,
        index,
        limit: 'MAX_MEMORY_DWORD',
        types: DWORD_TYPES,
        defaultType: 'DINT',
        kind: 'number',
        writable: true,
      }
    }
    // OpenPLC convention on arduino-cli targets: %ID / %QD are REAL.
    const input = area === 'I'
    return {
      pointer: `${input ? 'real_input' : 'real_output'}[${index}]`,
      index,
      limit: input ? 'MAX_REAL_INPUT' : 'MAX_REAL_OUTPUT',
      types: ['REAL'],
      defaultType: 'REAL',
      kind: 'number',
      writable: false,
    }
  }
  return 'las direcciones de 64 bits (%xL) todavía no se enlazan'
}

/** C++ expression of the PLC value (its natural numeric type). */
function plcValue(link: ResolvedLink): string {
  if (link.via === 'program') return link.hmiType === 'bool' ? '(raw != 0)' : 'raw'
  const pointer = link.pointer
  if (link.hmiType === 'bool') return `(*${pointer} != 0)`
  if (pointer.startsWith('real_')) return `(*${pointer})`
  if (link.plcType === 'REAL') return `jwplcHmiReadReal(${pointer})`
  const signedCast = { INT: '(int16_t)', DINT: '(int32_t)' }[link.plcType] ?? ''
  return `${signedCast}(*${pointer})`
}

/** C++ expression converting the PLC value to the HMI variable type. */
function toHmi(link: ResolvedLink): string {
  const value = plcValue(link)
  if (link.hmiType === 'bool') return value
  if (link.hmiType === 'float') return `(float)${value}`
  const isReal = link.plcType === 'REAL'
  return isReal ? `(int32_t)llroundf(${value})` : `(int32_t)${value}`
}

/** C++ statement storing the HMI variable into PLC memory (RW links). */
function toPlc(link: ResolvedLink): string {
  if (link.via === 'program') {
    const { cType, bounds } = PROGRAM_VAR_TYPES[link.plcType]
    const value =
      link.plcType === 'BOOL'
        ? `(${cType})(${link.hmi} ? 1 : 0)`
        : bounds === undefined
          ? `(${cType})${link.hmi}`
          : `(${cType})jwplcHmiClampRound((double)${link.hmi}, ${bounds})`
    return `jwplcHmiWriteVar(${programVarMark(link)}, ${value});`
  }
  const pointer = link.pointer
  if (link.plcType === 'REAL') return `jwplcHmiWriteReal(${pointer}, (float)${link.hmi});`
  const range: Record<string, [string, string, string]> = {
    INT: ['IEC_UINT', '(int16_t)', '-32768.0, 32767.0'],
    UINT: ['IEC_UINT', '', '0.0, 65535.0'],
    WORD: ['IEC_UINT', '', '0.0, 65535.0'],
    DINT: ['IEC_UDINT', '(int32_t)', '-2147483648.0, 2147483647.0'],
    UDINT: ['IEC_UDINT', '', '0.0, 4294967295.0'],
    DWORD: ['IEC_UDINT', '', '0.0, 4294967295.0'],
  }
  const [storage, signedCast, bounds] = range[link.plcType]
  return `*${pointer} = (${storage})${signedCast}jwplcHmiClampRound((double)${link.hmi}, ${bounds});`
}

function resolveLink(
  link: BindingLink,
  hmiVariables: Map<string, string>,
  plcEntries: PlcEntry[],
): ResolvedLink | string {
  const hmiType = hmiVariables.get(link.hmi)
  if (hmiType === undefined) {
    return `HMI: "${link.hmi}" no es una variable de ${JWPLC_HMI_HEADER_FILE}.`
  }
  if (hmiType !== 'bool' && hmiType !== 'float' && hmiType !== 'int32_t') {
    return `HMI: "${link.hmi}" es ${hmiType}; en esta versión sólo se enlazan variables bool, float e int32_t.`
  }

  let address = link.plc
  let plcType: string | undefined
  if (!link.plc.startsWith('%')) {
    const matches = plcEntries.filter((entry) => entry.variable.name.toLowerCase() === link.plc.toLowerCase())
    if (matches.length === 0) {
      return `HMI: la variable PLC "${link.plc}" (enlazada a "${link.hmi}") no existe en las variables globales ni en un programa instanciado.`
    }
    const places = new Set(matches.map((entry) => entry.variable.location || entry.path))
    if (places.size > 1) {
      return `HMI: la variable PLC "${link.plc}" está declarada en varios lugares (${[...places].join(', ')}); renómbrala o usa la dirección directa.`
    }
    const { variable, path } = matches[0]
    if (variable.type.definition !== 'base-type') {
      return `HMI: la variable PLC "${link.plc}" es de un tipo de usuario; sólo se enlazan tipos elementales.`
    }
    plcType = variable.type.value.toUpperCase()
    if (!variable.location) return resolveProgramLink(link, hmiType, plcType, path, variable.class)
    address = variable.location
  }

  const slot = imageSlot(address)
  if (typeof slot === 'string') {
    return `HMI: "${link.plc}" está en ${address}: ${slot}.`
  }
  plcType ??= slot.defaultType
  if (!slot.types.includes(plcType)) {
    return `HMI: "${link.plc}" es ${plcType} pero ${address} admite ${slot.types.join(', ')}.`
  }
  const hmiKind = hmiType === 'bool' ? 'bool' : 'number'
  if (slot.kind !== hmiKind) {
    const expected = slot.kind === 'bool' ? 'bool' : 'float o int32_t'
    return `HMI: "${link.hmi}" es ${hmiType} y "${link.plc}" (${plcType}) necesita una variable HMI ${expected}.`
  }
  if (link.access === 'RW' && !slot.writable) {
    return `HMI: "${link.hmi}" pide escritura (RW) pero "${link.plc}" está en ${address}; la pantalla sólo escribe en memoria %MW/%MD (las entradas y salidas las escriben el HAL y el programa en cada scan).`
  }
  return {
    hmi: link.hmi,
    hmiType,
    plc: link.plc,
    access: link.access,
    address: address.toUpperCase(),
    plcType,
    via: 'image',
    pointer: slot.pointer,
    index: slot.index,
    limit: slot.limit,
  }
}

/** Unlocated variable: read and written through the STruC++ debug table (any access). */
function resolveProgramLink(
  link: BindingLink,
  hmiType: HmiType,
  plcType: string,
  path: string,
  variableClass: string | undefined,
): ResolvedLink | string {
  const kind = programVarKind(plcType, variableClass)
  if (kind !== 'bool' && kind !== 'number') return `HMI: la variable PLC "${link.plc}" es ${kind}.`
  const hmiKind = hmiType === 'bool' ? 'bool' : 'number'
  if (kind !== hmiKind) {
    const expected = kind === 'bool' ? 'bool' : 'float o int32_t'
    return `HMI: "${link.hmi}" es ${hmiType} y "${link.plc}" (${plcType}) necesita una variable HMI ${expected}.`
  }
  return {
    hmi: link.hmi,
    hmiType,
    plc: link.plc,
    access: link.access,
    address: path,
    plcType,
    via: 'program',
    pointer: '',
    index: 0,
    limit: '',
  }
}

function parseBindings(bindingsJson: string): BindingLink[] | string {
  let parsed: unknown
  try {
    parsed = JSON.parse(bindingsJson)
  } catch (error) {
    return `HMI: ${JWPLC_HMI_PROJECT_DIR}/${JWPLC_HMI_BINDINGS_FILE} no es un JSON válido (${(error as Error).message}).`
  }
  const document = parsed as { format?: unknown; version?: unknown; bindings?: unknown } | null
  if (
    document?.format !== JWPLC_HMI_BINDINGS_FORMAT ||
    document.version !== JWPLC_HMI_BINDINGS_VERSION ||
    !Array.isArray(document.bindings)
  ) {
    return `HMI: ${JWPLC_HMI_PROJECT_DIR}/${JWPLC_HMI_BINDINGS_FILE} debe tener "format": "${JWPLC_HMI_BINDINGS_FORMAT}", "version": ${JWPLC_HMI_BINDINGS_VERSION} y una lista "bindings".`
  }
  const links: BindingLink[] = []
  for (const [index, entry] of (document.bindings as unknown[]).entries()) {
    const link = entry as { hmi?: unknown; plc?: unknown; access?: unknown } | null
    if (typeof link?.hmi !== 'string' || typeof link.plc !== 'string' || !link.hmi.trim() || !link.plc.trim()) {
      return `HMI: el enlace #${index + 1} de ${JWPLC_HMI_BINDINGS_FILE} necesita "hmi" y "plc" (texto).`
    }
    const access = parseAccess(link.access)
    if (access === undefined) {
      return `HMI: el enlace #${index + 1} de ${JWPLC_HMI_BINDINGS_FILE} tiene "access": ${JSON.stringify(link.access)}; usa "R" o "RW".`
    }
    links.push({ hmi: link.hmi.trim(), plc: link.plc.trim(), access, source: JWPLC_HMI_BINDINGS_FILE })
  }
  return links
}

function parseAccess(value: unknown): Access | undefined {
  const access = value === undefined ? 'R' : typeof value === 'string' ? value.toUpperCase() : ''
  return access === 'R' || access === 'RW' ? access : undefined
}

interface JwhmiBindable {
  type?: unknown
  name?: unknown
  label?: unknown
  id?: unknown
  variable?: unknown
  plcBinding?: unknown
  nodes?: unknown
}

/**
 * Links declared in the Designer project: `plcBinding: { var, access }` on
 * fields and on MENU nodes (contract section 2). Objects without `plcBinding`
 * are skipped (static objects, or an Arduino-mode project).
 */
export function extractJwhmiBindings(jwhmiJson: string): BindingLink[] | string {
  const file = `${JWPLC_HMI_PROJECT_DIR}/${JWPLC_HMI_PROJECT_FILE}`
  let parsed: unknown
  try {
    parsed = JSON.parse(jwhmiJson)
  } catch (error) {
    return `HMI: ${file} no es un JSON válido (${(error as Error).message}).`
  }
  const fields = (parsed as { fields?: unknown } | null)?.fields
  if (!Array.isArray(fields)) return `HMI: ${file} no tiene la lista "fields" de un proyecto del Designer.`

  const objects: JwhmiBindable[] = []
  for (const field of fields as Array<JwhmiBindable | null>) {
    if (field === null || typeof field !== 'object') continue
    objects.push(field)
    if (field.type === 'MENU' && Array.isArray(field.nodes)) objects.push(...(field.nodes as JwhmiBindable[]))
  }

  const links: BindingLink[] = []
  for (const object of objects) {
    if (object === null || typeof object !== 'object' || object.plcBinding === undefined) continue
    const where = String(object.name ?? object.label ?? object.id ?? object.type)
    const binding = object.plcBinding as { var?: unknown; access?: unknown } | null
    if (typeof object.variable !== 'string' || !object.variable.trim()) {
      return `HMI: el objeto "${where}" de ${file} tiene plcBinding pero no "variable".`
    }
    if (typeof binding?.var !== 'string' || !binding.var.trim()) {
      return `HMI: el plcBinding del objeto "${where}" de ${file} necesita "var" (texto).`
    }
    const access = parseAccess(binding.access)
    if (access === undefined) {
      return `HMI: el plcBinding del objeto "${where}" de ${file} tiene "access": ${JSON.stringify(binding.access)}; usa "R" o "RW".`
    }
    links.push({ hmi: object.variable.trim(), plc: binding.var.trim(), access, source: JWPLC_HMI_PROJECT_FILE })
  }
  return links
}

function enabledGlue(links: ResolvedLink[]): string {
  const rw = links.filter((link) => link.access === 'RW')
  const viaProgram = links.some((link) => link.via === 'program')
  const asserts = links
    .filter((link) => link.via === 'image')
    .map(
      (link) =>
        `static_assert(${link.index} < ${link.limit}, "HMI: ${link.address} (${link.plc}) fuera del buffer del runtime");`,
    )
  const shadows = rw.map((link) => `static ${link.hmiType} jwplcHmiShadow_${link.hmi};`)
  const writes = rw.map((link) =>
    [
      `    // ${link.hmi} -> ${link.plc} (${link.address}, ${link.plcType}): sólo si la pantalla cambió el valor`,
      link.via === 'program'
        ? `    if (jwplcHmiSynced && ${link.hmi} != jwplcHmiShadow_${link.hmi})`
        : `    if (jwplcHmiSynced && ${link.pointer} != NULL && ${link.hmi} != jwplcHmiShadow_${link.hmi})`,
      '    {',
      `        ${toPlc(link)}`,
      `        jwplcHmiShadow_${link.hmi} = ${link.hmi};`,
      '    }',
    ].join('\n'),
  )
  const reads = links.map((link) => {
    const comment = `    // ${link.hmi} ${link.access === 'RW' ? '<->' : '<-'} ${link.plc} (${link.address}, ${link.plcType})`
    if (link.via === 'program') return programRead(link, comment)
    if (link.access === 'R') return `${comment}\n    if (${link.pointer} != NULL) ${link.hmi} = ${toHmi(link)};`
    return [
      comment,
      `    if (${link.pointer} != NULL)`,
      '    {',
      `        const ${link.hmiType} plc = ${toHmi(link)};`,
      `        if (!jwplcHmiSynced || plc != jwplcHmiShadow_${link.hmi})`,
      '        {',
      `            ${link.hmi} = plc;`,
      `            jwplcHmiShadow_${link.hmi} = plc;`,
      '        }',
      '    }',
    ].join('\n')
  })

  return [
    ...GLUE_BANNER,
    '#define JWPLC_HMI_ENABLED 1',
    '',
    '#include <math.h>',
    '#include <string.h>',
    `#include "${JWPLC_HMI_HEADER_FILE}"`,
    '',
    ...asserts,
    ...(asserts.length > 0 ? [''] : []),
    '// REAL en %MD comparte el slot IEC_UDINT: se copian los bits.',
    'static inline float jwplcHmiReadReal(const IEC_UDINT *slot)',
    '{',
    '    float value;',
    '    memcpy(&value, slot, sizeof value);',
    '    return value;',
    '}',
    '',
    'static inline void jwplcHmiWriteReal(IEC_UDINT *slot, float value)',
    '{',
    '    memcpy(slot, &value, sizeof value);',
    '}',
    '',
    ...(viaProgram ? PROGRAM_VAR_HELPERS : []),
    '// Redondea y limita al rango del tipo IEC destino.',
    'static inline long long jwplcHmiClampRound(double value, double low, double high)',
    '{',
    '    if (value < low) value = low;',
    '    if (value > high) value = high;',
    '    return llround(value);',
    '}',
    '',
    ...(rw.length > 0
      ? [
          '// Escritura HMI -> PLC: la sombra guarda el último valor sincronizado.',
          '// Al arrancar manda el PLC (jwplcHmiSynced = false hasta la primera copia).',
          'static bool jwplcHmiSynced = false;',
          ...shadows,
          '',
        ]
      : []),
    '// El HAL la llama en updateOutputBuffers(), al final de cada scan:',
    '// 1) HMI -> PLC (enlaces RW): lo confirmado en pantalla llega al programa en el scan siguiente;',
    '// 2) PLC -> HMI: el Display sólo redibuja lo que cambió.',
    'static inline void jwplcHMIBindingsSnapshot()',
    '{',
    ...writes,
    ...reads,
    ...(rw.length > 0 ? ['    jwplcHmiSynced = true;'] : []),
    '}',
    '',
  ].join('\n')
}

const PROGRAM_VAR_HELPERS = [
  '// Variables sin dirección: se leen y escriben por la tabla de depuración de STruC++',
  '// (índices de debug-map.json, resueltos al compilar). La escritura no fuerza: si el',
  '// depurador fuerza la variable, manda el forzado.',
  'extern "C" uint16_t openplc_debug_read(uint8_t arr, uint16_t elem, uint8_t *dest);',
  'extern "C" uint8_t openplc_debug_write(uint8_t arr, uint16_t elem, const uint8_t *bytes, uint16_t len);',
  '',
  'template <typename T>',
  'static inline bool jwplcHmiReadVar(uint8_t arr, uint16_t elem, T &value)',
  '{',
  '    uint8_t bytes[sizeof(T)];',
  '    if (openplc_debug_read(arr, elem, bytes) != sizeof(T)) return false;',
  '    memcpy(&value, bytes, sizeof(T));',
  '    return true;',
  '}',
  '',
  'template <typename T>',
  'static inline void jwplcHmiWriteVar(uint8_t arr, uint16_t elem, T value)',
  '{',
  '    uint8_t bytes[sizeof(T)];',
  '    memcpy(bytes, &value, sizeof(T));',
  '    openplc_debug_write(arr, elem, bytes, sizeof(T));',
  '}',
  '',
]

/** PLC -> HMI copy of an unlocated variable (debug table). */
function programRead(link: ResolvedLink, comment: string): string {
  const { cType } = PROGRAM_VAR_TYPES[link.plcType]
  const read = `jwplcHmiReadVar(${programVarMark(link)}, raw)`
  if (link.access === 'R') {
    return [
      comment,
      '    {',
      `        ${cType} raw;`,
      `        if (${read}) ${link.hmi} = ${toHmi(link)};`,
      '    }',
    ].join('\n')
  }
  return [
    comment,
    '    {',
    `        ${cType} raw;`,
    `        if (${read})`,
    '        {',
    `            const ${link.hmiType} plc = ${toHmi(link)};`,
    `            if (!jwplcHmiSynced || plc != jwplcHmiShadow_${link.hmi})`,
    '            {',
    `                ${link.hmi} = plc;`,
    `                jwplcHmiShadow_${link.hmi} = plc;`,
    '            }',
    '        }',
    '    }',
  ].join('\n')
}

interface DebugMapLeaf {
  arrayIdx: number
  elemIdx: number
  path: string
  type: string
}

/**
 * Replace the debug-table placeholders of `jwplc_hmi.h` with the indexes of
 * STruC++'s `debug-map.json` (known only after the ST compile). Errors name
 * the variable when the map lacks it or gives it another type.
 */
export function resolveJwplcHmiProgramVars(glue: string, debugMapJson: string): { text: string; errors: string[] } {
  const marks = [...glue.matchAll(PROGRAM_VAR_MARK)]
  if (marks.length === 0) return { text: glue, errors: [] }
  let leaves: DebugMapLeaf[]
  try {
    const parsed = JSON.parse(debugMapJson) as { leaves?: unknown }
    if (!Array.isArray(parsed.leaves)) throw new Error('sin "leaves"')
    leaves = parsed.leaves as DebugMapLeaf[]
  } catch (error) {
    return {
      text: glue,
      errors: [
        `HMI: no se pudo leer el mapa de depuración del programa (debug-map.json: ${(error as Error).message}); las variables sin dirección no se pueden enlazar.`,
      ],
    }
  }
  const byPath = new Map(leaves.map((leaf) => [String(leaf.path).toUpperCase(), leaf]))
  const errors = new Set<string>()
  const text = glue.replace(PROGRAM_VAR_MARK, (_mark, path: string, type: string) => {
    const leaf = byPath.get(path.toUpperCase())
    if (!leaf) {
      errors.add(
        `HMI: ${path} no está en el mapa de depuración del programa compilado; no se puede enlazar a la pantalla.`,
      )
      return '0, 0'
    }
    if (String(leaf.type).toUpperCase() !== type) {
      errors.add(`HMI: ${path} es ${leaf.type} en el programa compilado y el enlace esperaba ${type}.`)
    }
    return `${leaf.arrayIdx}, ${leaf.elemIdx}`
  })
  return { text, errors: [...errors] }
}

/** Pipeline hook: resolve the HMI placeholders of the firmware skeleton with the debug map. */
export function finalizeJwplcHmiSkeleton(
  skeleton: Record<string, string>,
  debugMapJson: string,
): { files: Record<string, string>; errors: string[] } {
  const key = `src/${JWPLC_HMI_GLUE_FILE}`
  const glue = skeleton[key]
  if (glue === undefined) return { files: skeleton, errors: [] }
  const { text, errors } = resolveJwplcHmiProgramVars(glue, debugMapJson)
  if (errors.length > 0) return { files: skeleton, errors }
  return { files: { ...skeleton, [key]: text }, errors: [] }
}

/** Build the HMI files for a board that declares `hmiDisplay`. */
export function generateJwplcHmi(input: GenerateJwplcHmiInput): GenerateJwplcHmiResult {
  const { header, bindingsJson, jwhmiJson, projectData } = input
  const headerPath = `${JWPLC_HMI_PROJECT_DIR}/${JWPLC_HMI_HEADER_FILE}`
  const fail = (errors: string[]): GenerateJwplcHmiResult => ({ files: {}, errors, messages: [], warnings: [] })

  if (header === undefined) {
    const orphan =
      jwhmiJson !== undefined ? JWPLC_HMI_PROJECT_FILE : bindingsJson !== undefined ? JWPLC_HMI_BINDINGS_FILE : null
    // A design without its header (never "Actualizar HMI") does not stop the build: the board shows the IDLE.
    return {
      files: { [`src/${JWPLC_HMI_GLUE_FILE}`]: disabledGlue() },
      errors: [],
      messages:
        orphan === null ? [`HMI: el proyecto no tiene pantalla (${headerPath}); la placa muestra sólo la IDLE.`] : [],
      warnings:
        orphan === null
          ? []
          : [
              `HMI: hay ${JWPLC_HMI_PROJECT_DIR}/${orphan} pero falta ${headerPath}; se compila sin la pantalla del proyecto (la placa muestra la IDLE). En JWPLC HMI Designer pulsa "Actualizar HMI".`,
            ],
    }
  }

  if (!/\bvoid\s+jwplcHMISetup\s*\(/.test(header) || !/\bvoid\s+jwplcUIUpdate\s*\(/.test(header)) {
    return fail([
      `HMI: ${headerPath} no parece generado por JWPLC HMI Designer (faltan jwplcHMISetup() o jwplcUIUpdate()).`,
    ])
  }

  const projectLinks = jwhmiJson === undefined ? [] : extractJwhmiBindings(jwhmiJson)
  if (typeof projectLinks === 'string') return fail([projectLinks])
  const fileLinks = bindingsJson === undefined ? [] : parseBindings(bindingsJson)
  if (typeof fileLinks === 'string') return fail([fileLinks])
  const links = [...projectLinks, ...fileLinks]

  const hmiVariables = parseHmiVariables(header)
  const plcEntries = bindableEntries(projectData)
  const errors: string[] = []
  const resolved: ResolvedLink[] = []
  const seen = new Set<string>()
  for (const link of links) {
    if (seen.has(link.hmi)) {
      errors.push(`HMI: "${link.hmi}" está enlazada más de una vez (repetida en ${link.source}).`)
      continue
    }
    seen.add(link.hmi)
    const result = resolveLink(link, hmiVariables, plcEntries)
    if (typeof result === 'string') errors.push(result)
    else resolved.push(result)
  }
  if (errors.length > 0) return fail(errors)

  const messages = [`HMI: pantalla del proyecto incluida (${headerPath}).`]
  if (resolved.length === 0) {
    messages.push(
      `HMI: sin enlaces a variables PLC (plcBinding en ${JWPLC_HMI_PROJECT_FILE} o ${JWPLC_HMI_BINDINGS_FILE}); la pantalla mostrará los valores iniciales.`,
    )
  }
  for (const link of resolved) {
    const where = link.via === 'program' ? `${link.address}, sin dirección` : link.address
    messages.push(`HMI: ${link.hmi} ${link.access === 'RW' ? '<->' : '<-'} ${link.plc} (${where})`)
  }

  return {
    files: {
      [`src/${JWPLC_HMI_HEADER_FILE}`]: header,
      [`src/${JWPLC_HMI_GLUE_FILE}`]: enabledGlue(resolved),
    },
    errors: [],
    messages,
    warnings: input.jwhmiNewerThanHeader
      ? [
          `HMI: ${JWPLC_HMI_PROJECT_FILE} es más nuevo que ${JWPLC_HMI_HEADER_FILE}; si cambiaste la pantalla, pulsa "Actualizar HMI" en el Designer.`,
        ]
      : [],
  }
}
