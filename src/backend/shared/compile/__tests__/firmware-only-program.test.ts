import type { PLCProjectData, PLCVariable } from '../../types/PLC/open-plc'
import { completeEmptyFirmwarePrograms, FIRMWARE_IDLE_VARIABLE, isIecProgramOptional } from '../firmware-only-program'

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

  it('ignores functions and function blocks', () => {
    const fb = {
      type: 'function-block',
      data: { language: 'st', name: 'Fb', variables: [], body: { language: 'st', value: '' }, documentation: '' },
    } as unknown as SchemaPou
    const { completedPous } = completeEmptyFirmwarePrograms(project([fb]))
    expect(completedPous).toEqual([])
  })
})
