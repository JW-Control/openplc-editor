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

// ---------------------------------------------------------------------------
// Firmware program template.
//
// A device that declares `capabilities.firmwareProgramTemplate: true` never
// runs the project's IEC program: its HAL is the whole firmware (e.g. the
// JWPLC Remote I/O slave). The technician often compiles it from the same
// project as the Backplane master, whose `main` must not be deleted, edited
// or uploaded to the slave. For these devices the compile pipeline replaces
// the project's POUs, data types, tasks, instances and globals — in memory
// only — with a fixed no-op template. The project on disk is untouched.
// ---------------------------------------------------------------------------

export const FIRMWARE_TEMPLATE_PROGRAM = 'JwplcFirmwareMain'
export const FIRMWARE_TEMPLATE_TASK = 'JwplcFirmwareTask'
export const FIRMWARE_TEMPLATE_INSTANCE = 'JwplcFirmwareInstance'

/** True when the board compiles a generated firmware template instead of the project's program. */
export function usesFirmwareProgramTemplate(boardEntry: unknown): boolean {
  const capabilities = (boardEntry as { capabilities?: Record<string, unknown> } | null | undefined)?.capabilities
  return capabilities?.firmwareProgramTemplate === true
}

/**
 * Return the project to compile for a firmware-template device, plus the
 * names of the project POUs left out (for the build log).
 */
export function buildFirmwareTemplateProject(project: PLCProjectData): {
  project: PLCProjectData
  ignoredPous: string[]
} {
  const ignoredPous = project.pous.map((pou) => pou.data.name)

  const template: SchemaPou = {
    type: 'program',
    data: {
      language: 'st',
      name: FIRMWARE_TEMPLATE_PROGRAM,
      variables: [placeholderVariable()],
      body: { language: 'st', value: `${FIRMWARE_IDLE_VARIABLE} := FALSE;` },
      documentation:
        'Plantilla generada por el editor: el firmware de este dispositivo no usa el programa del proyecto.',
    },
  }

  return {
    project: {
      ...project,
      dataTypes: [],
      pous: [template],
      configuration: {
        resource: {
          tasks: [{ name: FIRMWARE_TEMPLATE_TASK, triggering: 'Cyclic', interval: 'T#20ms', priority: 1 }],
          instances: [
            { name: FIRMWARE_TEMPLATE_INSTANCE, task: FIRMWARE_TEMPLATE_TASK, program: FIRMWARE_TEMPLATE_PROGRAM },
          ],
          globalVariables: [],
        },
      },
      servers: [],
      remoteDevices: [],
      libraries: [],
    },
    ignoredPous,
  }
}
