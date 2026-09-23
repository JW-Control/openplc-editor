/**
 * Firmware-only VPP devices (JWPLC).
 *
 * Some VPP devices are complete firmwares whose HAL does all the work —
 * e.g. the JWPLC Basic Remote I/O slave, whose outputs belong to the
 * Backplane master and whose IEC program never touches physical I/O.
 * Such a device declares `capabilities.iecProgramOptional: true` in its
 * manifest so the technician can compile and upload it with an empty
 * `main`.
 *
 * The ST transpiler (correctly) rejects a PROGRAM without variables or
 * without a body. For these devices only, an empty PROGRAM is completed
 * in memory — never on disk — with one placeholder variable and a no-op
 * ST body. A PROGRAM with real content is compiled unchanged.
 *
 * Operates on the schema-shape project the compile pipeline carries
 * (`{ type: 'program', data: { language, variables, body } }`).
 */

import type { PLCProjectData, PLCVariable } from '../types/PLC/open-plc'

export const FIRMWARE_IDLE_VARIABLE = 'JwplcFirmwareIdle'

type SchemaPou = PLCProjectData['pous'][number]
type SchemaBody = { language: string; value: unknown }

/** True when the board declares that its IEC program may be empty. */
export function isIecProgramOptional(boardEntry: unknown): boolean {
  const capabilities = (boardEntry as { capabilities?: Record<string, unknown> } | null | undefined)?.capabilities
  return capabilities?.iecProgramOptional === true
}

function isEmptyBody(body: SchemaBody): boolean {
  const { language, value } = body
  if (language === 'st' || language === 'il') return typeof value !== 'string' || value.trim() === ''
  if (language === 'ld') {
    const rungs = (value as { rungs?: unknown[] } | null)?.rungs
    return !Array.isArray(rungs) || rungs.length === 0
  }
  if (language === 'fbd') {
    const nodes = (value as { nodes?: unknown[] } | null)?.nodes
    return !Array.isArray(nodes) || nodes.length === 0
  }
  return false
}

function placeholderVariable(): PLCVariable {
  return {
    name: FIRMWARE_IDLE_VARIABLE,
    class: 'local',
    type: { definition: 'base-type', value: 'BOOL' },
    location: '',
    initialValue: null,
    documentation: 'Generado por el editor: dispositivo de firmware sin programa IEC.',
    debug: false,
  }
}

/**
 * Return a copy of `project` whose empty PROGRAM POUs are compilable, plus
 * the names of the POUs that were completed. Non-empty programs, functions
 * and function blocks are left untouched.
 */
export function completeEmptyFirmwarePrograms(project: PLCProjectData): {
  project: PLCProjectData
  completedPous: string[]
} {
  const completedPous: string[] = []

  const pous = project.pous.map((pou): SchemaPou => {
    if (pou.type !== 'program') return pou

    const program = pou.data
    const variables = program.variables ?? []
    const emptyBody = isEmptyBody(program.body)
    if (variables.length > 0 && !emptyBody) return pou

    completedPous.push(program.name)
    const hasPlaceholder = variables.some((v) => v.name.toLowerCase() === FIRMWARE_IDLE_VARIABLE.toLowerCase())

    return {
      ...pou,
      data: {
        ...program,
        variables: hasPlaceholder ? variables : [...variables, placeholderVariable()],
        ...(emptyBody
          ? { language: 'st' as const, body: { language: 'st' as const, value: `${FIRMWARE_IDLE_VARIABLE} := FALSE;` } }
          : {}),
      },
    }
  })

  return { project: completedPous.length > 0 ? { ...project, pous } : project, completedPous }
}
