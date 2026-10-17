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
  address: string
  plcType: string
  pointer: string
  /** Bound check emitted as `static_assert(index < limit)`. */
  index: number
  limit: string
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
function bindableVariables(projectData: PLCProjectData): PLCVariable[] {
  const resource = projectData.configuration?.resource
  const variables: PLCVariable[] = [...(resource?.globalVariables ?? [])]
  const programs = new Set((resource?.instances ?? []).map((instance) => instance.program.toLowerCase()))
  for (const pou of projectData.pous ?? []) {
    if (pou.type === 'program' && programs.has(pou.data.name.toLowerCase())) {
      variables.push(...pou.data.variables)
    }
  }
  return variables
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
  plcVariables: PLCVariable[],
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
    const matches = plcVariables.filter((variable) => variable.name.toLowerCase() === link.plc.toLowerCase())
    if (matches.length === 0) {
      return `HMI: la variable PLC "${link.plc}" (enlazada a "${link.hmi}") no existe en las variables globales ni en un programa instanciado.`
    }
    const locations = new Set(matches.map((variable) => variable.location))
    if (locations.size > 1) {
      return `HMI: la variable PLC "${link.plc}" está declarada varias veces con direcciones distintas; renómbrala o usa la dirección directa.`
    }
    const variable = matches[0]
    if (variable.type.definition !== 'base-type') {
      return `HMI: la variable PLC "${link.plc}" es de un tipo de usuario; sólo se enlazan tipos elementales.`
    }
    if (!variable.location) {
      return `HMI: la variable PLC "${link.plc}" no tiene dirección (AT %I/%Q/%M); en esta versión sólo se enlazan variables ubicadas.`
    }
    address = variable.location
    plcType = variable.type.value.toUpperCase()
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
    pointer: slot.pointer,
    index: slot.index,
    limit: slot.limit,
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
  const asserts = links.map(
    (link) =>
      `static_assert(${link.index} < ${link.limit}, "HMI: ${link.address} (${link.plc}) fuera del buffer del runtime");`,
  )
  const shadows = rw.map((link) => `static ${link.hmiType} jwplcHmiShadow_${link.hmi};`)
  const writes = rw.map((link) =>
    [
      `    // ${link.hmi} -> ${link.plc} (${link.address}, ${link.plcType}): sólo si la pantalla cambió el valor`,
      `    if (jwplcHmiSynced && ${link.pointer} != NULL && ${link.hmi} != jwplcHmiShadow_${link.hmi})`,
      '    {',
      `        ${toPlc(link)}`,
      `        jwplcHmiShadow_${link.hmi} = ${link.hmi};`,
      '    }',
    ].join('\n'),
  )
  const reads = links.map((link) => {
    const comment = `    // ${link.hmi} ${link.access === 'RW' ? '<->' : '<-'} ${link.plc} (${link.address}, ${link.plcType})`
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

/** Build the HMI files for a board that declares `hmiDisplay`. */
export function generateJwplcHmi(input: GenerateJwplcHmiInput): GenerateJwplcHmiResult {
  const { header, bindingsJson, jwhmiJson, projectData } = input
  const headerPath = `${JWPLC_HMI_PROJECT_DIR}/${JWPLC_HMI_HEADER_FILE}`
  const fail = (errors: string[]): GenerateJwplcHmiResult => ({ files: {}, errors, messages: [], warnings: [] })

  if (header === undefined) {
    const orphan =
      jwhmiJson !== undefined ? JWPLC_HMI_PROJECT_FILE : bindingsJson !== undefined ? JWPLC_HMI_BINDINGS_FILE : null
    if (orphan !== null) {
      return fail([
        `HMI: hay ${JWPLC_HMI_PROJECT_DIR}/${orphan} pero falta ${headerPath}. En JWPLC HMI Designer pulsa "Actualizar HMI".`,
      ])
    }
    return {
      files: { [`src/${JWPLC_HMI_GLUE_FILE}`]: disabledGlue() },
      errors: [],
      messages: [`HMI: el proyecto no tiene pantalla (${headerPath}); la placa muestra sólo la IDLE.`],
      warnings: [],
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
  const plcVariables = bindableVariables(projectData)
  const errors: string[] = []
  const resolved: ResolvedLink[] = []
  const seen = new Set<string>()
  for (const link of links) {
    if (seen.has(link.hmi)) {
      errors.push(`HMI: "${link.hmi}" está enlazada más de una vez (repetida en ${link.source}).`)
      continue
    }
    seen.add(link.hmi)
    const result = resolveLink(link, hmiVariables, plcVariables)
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
    messages.push(`HMI: ${link.hmi} ${link.access === 'RW' ? '<->' : '<-'} ${link.plc} (${link.address})`)
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
