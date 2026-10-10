import type { PLCProjectData, PLCVariable } from '../../types/PLC/open-plc'
import {
  buildFirmwareTemplateProject,
  completeEmptyFirmwarePrograms,
  FIRMWARE_IDLE_VARIABLE,
  FIRMWARE_TEMPLATE_INSTANCE,
  FIRMWARE_TEMPLATE_PROGRAM,
  FIRMWARE_TEMPLATE_TASK,
  isIecProgramOptional,
  usesFirmwareProgramTemplate,
} from '../firmware-only-program'

type SchemaPou = PLCProjectData['pous'][number]

const boolVar = (name: string): PLCVariable => ({
  name,
  class: 'local',
  type: { definition: 'base-type', value: 'BOOL' },
  location: '',
  initialValue: null,
  documentation: '',
  debug: false,
})

const ldProgram = (name: string, variables: PLCVariable[], rungs: unknown[]): SchemaPou =>
  ({
    type: 'program',
    data: {
      language: 'ld',
      name,
      variables,
      body: { language: 'ld', value: { name, rungs } },
      documentation: '',
    },
  }) as unknown as SchemaPou

const project = (pous: SchemaPou[]): PLCProjectData => ({ dataTypes: [], pous }) as unknown as PLCProjectData

const programOf = (p: PLCProjectData, i = 0) => (p.pous[i] as Extract<SchemaPou, { type: 'program' }>).data

describe('isIecProgramOptional', () => {
  it('reads the VPP capability flag', () => {
    expect(isIecProgramOptional({ capabilities: { iecProgramOptional: true } })).toBe(true)
    expect(isIecProgramOptional({ capabilities: { iecProgramOptional: 'yes' } })).toBe(false)
    expect(isIecProgramOptional({ capabilities: {} })).toBe(false)
    expect(isIecProgramOptional(undefined)).toBe(false)
  })
})

describe('completeEmptyFirmwarePrograms', () => {
  it('completes an empty LD main (no variables, no rungs) with a no-op ST body', () => {
    const { project: out, completedPous } = completeEmptyFirmwarePrograms(project([ldProgram('main', [], [])]))
    expect(completedPous).toEqual(['main'])
    const main = programOf(out)
    expect(main.variables.map((v) => v.name)).toEqual([FIRMWARE_IDLE_VARIABLE])
    expect(main.language).toBe('st')
    expect(main.body).toEqual({ language: 'st', value: `${FIRMWARE_IDLE_VARIABLE} := FALSE;` })
  })

  it('keeps user variables when only the body is empty', () => {
    const { project: out } = completeEmptyFirmwarePrograms(project([ldProgram('main', [boolVar('vida')], [])]))
    expect(programOf(out).variables.map((v) => v.name)).toEqual(['vida', FIRMWARE_IDLE_VARIABLE])
    expect(programOf(out).body.language).toBe('st')
  })

  it('adds only the variable when the body has content', () => {
    const rungs = [{ id: 'r1' }]
    const { project: out } = completeEmptyFirmwarePrograms(project([ldProgram('main', [], rungs)]))
    expect(programOf(out).variables.map((v) => v.name)).toEqual([FIRMWARE_IDLE_VARIABLE])
    expect(programOf(out).language).toBe('ld')
    expect(programOf(out).body).toEqual({ language: 'ld', value: { name: 'main', rungs } })
  })

  it('leaves a complete program and the input project untouched', () => {
    const input = project([ldProgram('main', [boolVar('vida')], [{ id: 'r1' }])])
    const { project: out, completedPous } = completeEmptyFirmwarePrograms(input)
    expect(completedPous).toEqual([])
    expect(out).toBe(input)
  })

  it('does not mutate the original project', () => {
    const input = project([ldProgram('main', [], [])])
    completeEmptyFirmwarePrograms(input)
    expect(programOf(input).variables).toEqual([])
    expect(programOf(input).language).toBe('ld')
  })

  const programWithBody = (language: string, body: unknown, variables: PLCVariable[] = []): SchemaPou =>
    ({
      type: 'program',
      data: { language, name: 'main', variables, body: { language, value: body }, documentation: '' },
    }) as unknown as SchemaPou

  it('treats an FBD program without nodes as empty and one with nodes as having a body', () => {
    const empty = completeEmptyFirmwarePrograms(project([programWithBody('fbd', { nodes: [] }, [boolVar('a')])]))
    expect(programOf(empty.project).body.language).toBe('st')
    const withNodes = completeEmptyFirmwarePrograms(project([programWithBody('fbd', { nodes: [{ id: 'n1' }] })]))
    expect(programOf(withNodes.project).body.language).toBe('fbd')
  })

  it('treats a blank ST body as empty', () => {
    const { project: out } = completeEmptyFirmwarePrograms(project([programWithBody('st', '   ', [boolVar('a')])]))
    expect(programOf(out).body).toEqual({ language: 'st', value: `${FIRMWARE_IDLE_VARIABLE} := FALSE;` })
  })

  it('never replaces the body of other languages, only adds the variable', () => {
    const { project: out } = completeEmptyFirmwarePrograms(project([programWithBody('python', '')]))
    expect(programOf(out).body.language).toBe('python')
    expect(programOf(out).variables.map((v) => v.name)).toEqual([FIRMWARE_IDLE_VARIABLE])
  })

  it('does not duplicate an existing placeholder variable', () => {
    const { project: out } = completeEmptyFirmwarePrograms(
      project([programWithBody('ld', { rungs: [] }, [boolVar(FIRMWARE_IDLE_VARIABLE)])]),
    )
    expect(programOf(out).variables.map((v) => v.name)).toEqual([FIRMWARE_IDLE_VARIABLE])
  })

  it('ignores functions and function blocks', () => {
    const fb = {
      type: 'function-block',
      data: { language: 'st', name: 'Fb', variables: [], body: { language: 'st', value: '' }, documentation: '' },
    } as unknown as SchemaPou
    const { completedPous } = completeEmptyFirmwarePrograms(project([fb]))
    expect(completedPous).toEqual([])
  })
})

describe('usesFirmwareProgramTemplate', () => {
  it('reads the VPP capability flag', () => {
    expect(usesFirmwareProgramTemplate({ capabilities: { firmwareProgramTemplate: true } })).toBe(true)
    expect(usesFirmwareProgramTemplate({ capabilities: { firmwareProgramTemplate: 1 } })).toBe(false)
    expect(usesFirmwareProgramTemplate({ capabilities: { iecProgramOptional: true } })).toBe(false)
    expect(usesFirmwareProgramTemplate(null)).toBe(false)
  })
})

describe('buildFirmwareTemplateProject', () => {
  // A Backplane master project: its main uses remote aliases and must not
  // reach the slave firmware.
  const masterProject = {
    dataTypes: [{ name: 'MyStruct' }],
    pous: [
      ldProgram('main', [boolVar('RI0'), boolVar('RQ0')], [{ id: 'rung-1' }]),
      { type: 'function-block', data: { name: 'MyFb' } },
    ],
    configuration: {
      resource: {
        tasks: [{ name: 'task0', triggering: 'Cyclic', interval: 'T#20ms', priority: 1 }],
        instances: [{ name: 'instance0', task: 'task0', program: 'main' }],
        globalVariables: [boolVar('G1')],
      },
    },
    servers: [{ name: 'srv' }],
    remoteDevices: [{ name: 'dev' }],
    libraries: [{ name: 'lib' }],
  } as unknown as PLCProjectData

  it('replaces the project program with a fixed no-op template', () => {
    const { project: built, ignoredPous } = buildFirmwareTemplateProject(masterProject)

    expect(ignoredPous).toEqual(['main', 'MyFb'])
    expect(built.pous).toHaveLength(1)
    const template = programOf(built)
    expect(template.name).toBe(FIRMWARE_TEMPLATE_PROGRAM)
    expect(template.language).toBe('st')
    expect(template.variables.map((v) => v.name)).toEqual([FIRMWARE_IDLE_VARIABLE])
    expect(template.body).toEqual({ language: 'st', value: `${FIRMWARE_IDLE_VARIABLE} := FALSE;` })

    expect(built.configuration.resource).toEqual({
      tasks: [{ name: FIRMWARE_TEMPLATE_TASK, triggering: 'Cyclic', interval: 'T#20ms', priority: 1 }],
      instances: [
        { name: FIRMWARE_TEMPLATE_INSTANCE, task: FIRMWARE_TEMPLATE_TASK, program: FIRMWARE_TEMPLATE_PROGRAM },
      ],
      globalVariables: [],
    })
    expect(built.dataTypes).toEqual([])
    expect(built.servers).toEqual([])
    expect(built.remoteDevices).toEqual([])
    expect(built.libraries).toEqual([])
  })

  it('never modifies the original project', () => {
    const snapshot = JSON.stringify(masterProject)
    buildFirmwareTemplateProject(masterProject)
    expect(JSON.stringify(masterProject)).toBe(snapshot)
  })

  it('works with a project that has no POUs', () => {
    const { project: built, ignoredPous } = buildFirmwareTemplateProject({ ...masterProject, pous: [] })
    expect(ignoredPous).toEqual([])
    expect(programOf(built).name).toBe(FIRMWARE_TEMPLATE_PROGRAM)
  })
})
