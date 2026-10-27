import {
  finalizeJwplcHmiSkeleton,
  generateJwplcHmi,
  hasHmiDisplay,
  isHmiVendorScreen,
  JWPLC_HMI_BINDINGS_FORMAT,
  parseHmiVariables,
  programVarKind,
  resolveJwplcHmiProgramVars,
} from '../jwplc-hmi'
import type { PLCProjectData, PLCVariable } from '../../types/PLC/open-plc'

// Header exported by JWPLC HMI Designer for gate A15 F0 (BOOL <- relay Q0_0),
// trimmed to the parts the generator reads.
const F0_HEADER = `// Código generado por JWPLC HMI Designer
#pragma once

#include <JWPLC_Display.h>

enum HMIFieldId : uint8_t
{
    FIELD_RELE_Q0_0 = 1,
};

// Variables HMI
bool rele_q0_0 = false;
float nivel = 0.0f;
int32_t limite = 10;
char estado[13] = {};

static const JWPLC_UIField HMI_FIELDS[] =
{
};

void jwplcHMISetup()
{
}

void jwplcUIUpdate()
{
}
`

const variable = (name: string, location: string, value = 'BOOL', definition = 'base-type'): PLCVariable =>
  ({
    name,
    class: 'local',
    type: { definition, value },
    location,
    initialValue: null,
    documentation: '',
  }) as PLCVariable

const project = (options: {
  globals?: PLCVariable[]
  programs?: Array<{ name: string; variables: PLCVariable[] }>
  instances?: string[]
}): PLCProjectData =>
  ({
    dataTypes: [],
    pous: (options.programs ?? []).map((program) => ({
      type: 'program',
      data: { language: 'ld', name: program.name, variables: program.variables, body: {}, documentation: '' },
    })),
    configuration: {
      resource: {
        tasks: [],
        instances: (options.instances ?? []).map((program, index) => ({
          name: `INSTANCE${index}`,
          task: 'task0',
          program,
        })),
        globalVariables: options.globals ?? [],
      },
    },
  }) as unknown as PLCProjectData

const bindings = (links: unknown[]) =>
  JSON.stringify({ format: JWPLC_HMI_BINDINGS_FORMAT, version: 1, bindings: links })

const f0Project = () =>
  project({
    programs: [{ name: 'main', variables: [variable('PULSADOR', '%IX0.0'), variable('RELE', '%QX0.0')] }],
    instances: ['main'],
  })

describe('isHmiVendorScreen', () => {
  it('recognises the HMI screen of the VPP (every section persists under hmi_*)', () => {
    expect(isHmiVendorScreen({ sections: [{ id: 'hmi_diagnostics', persistence: 'hmi_diagnostics' }] })).toBe(true)
  })

  it('leaves other screens, mixed screens and malformed definitions alone', () => {
    expect(isHmiVendorScreen({ sections: [{ persistence: 'modbus' }] })).toBe(false)
    expect(isHmiVendorScreen({ sections: [{ persistence: 'hmi_x' }, { persistence: 'backplane' }] })).toBe(false)
    expect(isHmiVendorScreen({ sections: [{}] })).toBe(false)
    expect(isHmiVendorScreen({ sections: [] })).toBe(false)
    expect(isHmiVendorScreen({})).toBe(false)
    expect(isHmiVendorScreen(null)).toBe(false)
  })
})

describe('hasHmiDisplay', () => {
  it('accepts true or a descriptor object', () => {
    expect(hasHmiDisplay({ capabilities: { hmiDisplay: true } })).toBe(true)
    expect(hasHmiDisplay({ capabilities: { hmiDisplay: { width: 320, height: 170 } } })).toBe(true)
  })

  it('rejects anything else', () => {
    expect(hasHmiDisplay({ capabilities: { hmiDisplay: 'yes' } })).toBe(false)
    expect(hasHmiDisplay({ capabilities: { hmiDisplay: null } })).toBe(false)
    expect(hasHmiDisplay({ capabilities: {} })).toBe(false)
    expect(hasHmiDisplay(undefined)).toBe(false)
  })
})

describe('parseHmiVariables', () => {
  it('reads the variables the Designer declares', () => {
    const variables = parseHmiVariables(F0_HEADER)
    expect(Object.fromEntries(variables)).toEqual({
      rele_q0_0: 'bool',
      nivel: 'float',
      limite: 'int32_t',
      estado: 'char[]',
    })
  })
})

describe('generateJwplcHmi numeric links (F0b)', () => {
  const numericProject = () =>
    project({
      globals: [
        variable('C_INT', '%MW0', 'INT'),
        variable('C_UINT', '%MW1', 'uint'),
        variable('C_WORD', '%IW2', 'WORD'),
        variable('C_DINT', '%MD0', 'DINT'),
        variable('C_UDINT', '%MD1', 'UDINT'),
        variable('C_REAL', '%MD2', 'REAL'),
        variable('C_AI', '%ID0', 'REAL'),
      ],
    })

  const glueFor = (plc: string) => {
    const result = generateJwplcHmi({
      header: F0_HEADER,
      bindingsJson: bindings([{ hmi: 'nivel', plc }]),
      projectData: numericProject(),
    })
    expect(result.errors).toEqual([])
    return result.files['src/jwplc_hmi.h']
  }

  it.each([
    ['C_INT', 'static_assert(0 < MAX_MEMORY_WORD', 'nivel = (float)(int16_t)(*int_memory[0]);'],
    ['C_UINT', 'static_assert(1 < MAX_MEMORY_WORD', 'nivel = (float)(*int_memory[1]);'],
    ['C_WORD', 'static_assert(2 < MAX_ANALOG_INPUT', 'nivel = (float)(*int_input[2]);'],
    ['%QW3', 'static_assert(3 < MAX_ANALOG_OUTPUT', 'nivel = (float)(int16_t)(*int_output[3]);'],
    ['C_DINT', 'static_assert(0 < MAX_MEMORY_DWORD', 'nivel = (float)(int32_t)(*dint_memory[0]);'],
    ['C_UDINT', 'static_assert(1 < MAX_MEMORY_DWORD', 'nivel = (float)(*dint_memory[1]);'],
    ['%MD4', '(%MD4, DINT)', 'nivel = (float)(int32_t)(*dint_memory[4]);'],
    ['C_REAL', '(%MD2, REAL)', 'nivel = (float)jwplcHmiReadReal(dint_memory[2]);'],
    ['C_AI', 'static_assert(0 < MAX_REAL_INPUT', 'nivel = (float)(*real_input[0]);'],
    ['%QD1', 'static_assert(1 < MAX_REAL_OUTPUT', 'nivel = (float)(*real_output[1]);'],
  ])('links %s', (plc, assertion, copy) => {
    const glue = glueFor(plc)
    expect(glue).toContain('#include <string.h>')
    expect(glue).toContain(assertion)
    expect(glue).toContain(copy)
  })
})

describe('generateJwplcHmi read/write links (F0c)', () => {
  const memoryProject = () =>
    project({
      globals: [
        variable('LIMITE', '%MW1', 'INT'),
        variable('SP_UINT', '%MW2', 'UINT'),
        variable('SP_WORD', '%MW3', 'WORD'),
        variable('SP_DINT', '%MD0', 'DINT'),
        variable('SP_UDINT', '%MD1', 'UDINT'),
        variable('SP_DWORD', '%MD2', 'DWORD'),
        variable('CONSIGNA', '%MD3', 'REAL'),
        variable('ENTRADA', '%IW0', 'INT'),
        variable('SALIDA', '%QX0.1'),
        variable('ANALOGICA', '%ID0', 'REAL'),
      ],
    })

  const glueFor = (links: unknown[]) => {
    const result = generateJwplcHmi({ header: F0_HEADER, bindingsJson: bindings(links), projectData: memoryProject() })
    expect(result.errors).toEqual([])
    return result
  }

  it('writes an int32_t HMI value back to an INT in %MW with a shadow copy', () => {
    const { files, messages } = glueFor([{ hmi: 'limite', plc: 'LIMITE', access: 'rw' }])
    const glue = files['src/jwplc_hmi.h']
    expect(messages).toContain('HMI: limite <-> LIMITE (%MW1)')
    expect(glue).toContain('static bool jwplcHmiSynced = false;')
    expect(glue).toContain('static int32_t jwplcHmiShadow_limite;')
    expect(glue).toContain('if (jwplcHmiSynced && int_memory[1] != NULL && limite != jwplcHmiShadow_limite)')
    expect(glue).toContain('*int_memory[1] = (IEC_UINT)(int16_t)jwplcHmiClampRound((double)limite, -32768.0, 32767.0);')
    expect(glue).toContain('const int32_t plc = (int32_t)(int16_t)(*int_memory[1]);')
    expect(glue).toContain('if (!jwplcHmiSynced || plc != jwplcHmiShadow_limite)')
    expect(glue).toContain('    jwplcHmiSynced = true;\n}')
    // The write runs before the read in the same snapshot.
    expect(glue.indexOf('*int_memory[1] =')).toBeLessThan(glue.indexOf('const int32_t plc ='))
  })

  it.each([
    ['nivel', 'SP_UINT', '*int_memory[2] = (IEC_UINT)jwplcHmiClampRound((double)nivel, 0.0, 65535.0);'],
    ['nivel', 'SP_WORD', '*int_memory[3] = (IEC_UINT)jwplcHmiClampRound((double)nivel, 0.0, 65535.0);'],
    [
      'nivel',
      'SP_DINT',
      '*dint_memory[0] = (IEC_UDINT)(int32_t)jwplcHmiClampRound((double)nivel, -2147483648.0, 2147483647.0);',
    ],
    ['nivel', 'SP_UDINT', '*dint_memory[1] = (IEC_UDINT)jwplcHmiClampRound((double)nivel, 0.0, 4294967295.0);'],
    ['nivel', 'SP_DWORD', '*dint_memory[2] = (IEC_UDINT)jwplcHmiClampRound((double)nivel, 0.0, 4294967295.0);'],
    ['nivel', 'CONSIGNA', 'jwplcHmiWriteReal(dint_memory[3], (float)nivel);'],
    ['nivel', '%MW5', '*int_memory[5] = (IEC_UINT)(int16_t)jwplcHmiClampRound((double)nivel, -32768.0, 32767.0);'],
  ])('writes %s <-> %s', (hmi, plc, write) => {
    const glue = glueFor([{ hmi, plc, access: 'RW' }]).files['src/jwplc_hmi.h']
    expect(glue).toContain(write)
    expect(glue).toContain('static float jwplcHmiShadow_nivel;')
  })

  it('converts REAL and INT reads for int32_t HMI variables', () => {
    expect(glueFor([{ hmi: 'limite', plc: 'CONSIGNA' }]).files['src/jwplc_hmi.h']).toContain(
      'limite = (int32_t)llroundf(jwplcHmiReadReal(dint_memory[3]));',
    )
    const readOnly = glueFor([{ hmi: 'limite', plc: 'LIMITE', access: 'R' }]).files['src/jwplc_hmi.h']
    expect(readOnly).toContain('if (int_memory[1] != NULL) limite = (int32_t)(int16_t)(*int_memory[1]);')
    expect(readOnly).not.toContain('jwplcHmiSynced')
  })

  it.each([
    [{ hmi: 'limite', plc: 'ENTRADA', access: 'RW' }, 'sólo escribe en memoria %MW/%MD'],
    [{ hmi: 'rele_q0_0', plc: 'SALIDA', access: 'RW' }, 'sólo escribe en memoria %MW/%MD'],
    [{ hmi: 'nivel', plc: 'ANALOGICA', access: 'RW' }, 'sólo escribe en memoria %MW/%MD'],
    [{ hmi: 'limite', plc: 'LIMITE', access: 'W' }, '"access": "W"'],
    [{ hmi: 'limite', plc: 'LIMITE', access: 1 }, '"access": 1'],
    [{ hmi: 'rele_q0_0', plc: 'LIMITE' }, 'necesita una variable HMI float o int32_t'],
  ])('rejects %j', (link, expected) => {
    const result = generateJwplcHmi({ header: F0_HEADER, bindingsJson: bindings([link]), projectData: memoryProject() })
    expect(result.files).toEqual({})
    expect(result.errors[0]).toContain(expected)
  })
})

describe('generateJwplcHmi with plcBinding in the .jwhmi (F3)', () => {
  const memory = () =>
    project({
      globals: [variable('LIMITE', '%MW1', 'INT'), variable('RELE', '%QX0.0')],
    })

  const jwhmi = (fields: unknown) => JSON.stringify({ format: 'JWPLC_HMI_PROJECT', version: 1, fields })

  it('links fields and MENU nodes from plcBinding', () => {
    const result = generateJwplcHmi({
      header: F0_HEADER,
      bindingsJson: undefined,
      jwhmiJson: jwhmi([
        { type: 'BOOL', name: 'Rele', variable: 'rele_q0_0', plcBinding: { var: 'RELE' } },
        { type: 'RECT', name: 'Marco' },
        null,
        {
          type: 'MENU',
          name: 'Ajustes',
          nodes: [
            { type: 'SUBMENU', label: 'Avanzado' },
            { type: 'EDIT_NUM', label: 'Limite', variable: 'limite', plcBinding: { var: 'LIMITE', access: 'rw' } },
          ],
        },
        { type: 'MENU', name: 'Vacio' },
      ]),
      projectData: memory(),
    })
    expect(result.errors).toEqual([])
    expect(result.messages).toContain('HMI: rele_q0_0 <- RELE (%QX0.0)')
    expect(result.messages).toContain('HMI: limite <-> LIMITE (%MW1)')
    expect(result.warnings).toEqual([])
  })

  it('merges bindings.json and rejects the same HMI variable twice', () => {
    const merged = generateJwplcHmi({
      header: F0_HEADER,
      bindingsJson: bindings([{ hmi: 'limite', plc: 'LIMITE' }]),
      jwhmiJson: jwhmi([{ type: 'BOOL', variable: 'rele_q0_0', plcBinding: { var: 'RELE' } }]),
      projectData: memory(),
    })
    expect(merged.errors).toEqual([])
    expect(merged.messages).toHaveLength(3)

    const repeated = generateJwplcHmi({
      header: F0_HEADER,
      bindingsJson: bindings([{ hmi: 'rele_q0_0', plc: 'RELE' }]),
      jwhmiJson: jwhmi([{ type: 'BOOL', variable: 'rele_q0_0', plcBinding: { var: 'RELE' } }]),
      projectData: memory(),
    })
    expect(repeated.errors[0]).toContain('repetida en bindings.json')
  })

  it('warns when the project is newer than the header', () => {
    const result = generateJwplcHmi({
      header: F0_HEADER,
      bindingsJson: undefined,
      jwhmiJson: jwhmi([]),
      jwhmiNewerThanHeader: true,
      projectData: memory(),
    })
    expect(result.warnings[0]).toContain('Actualizar HMI')
    expect(result.messages[1]).toContain('sin enlaces')
  })

  it.each([
    [F0_HEADER, '{ roto', 'no es un JSON válido'],
    [F0_HEADER, 'null', 'no tiene la lista "fields"'],
    [
      F0_HEADER,
      jwhmi([{ type: 'BOOL', name: 'B', plcBinding: { var: 'RELE' } }]),
      'tiene plcBinding pero no "variable"',
    ],
    [F0_HEADER, jwhmi([{ type: 'BOOL', id: 'F1', variable: ' ', plcBinding: { var: 'RELE' } }]), 'pero no "variable"'],
    [F0_HEADER, jwhmi([{ type: 'BOOL', variable: 'rele_q0_0', plcBinding: null }]), 'necesita "var"'],
    [F0_HEADER, jwhmi([{ type: 'BOOL', variable: 'rele_q0_0', plcBinding: { var: '' } }]), 'necesita "var"'],
    [
      F0_HEADER,
      jwhmi([
        { type: 'MENU', nodes: [{ label: 'L', variable: 'limite', plcBinding: { var: 'LIMITE', access: 'W' } }] },
      ]),
      '"access": "W"',
    ],
  ])('rejects an invalid project (%#)', (header, jwhmiJson, expected) => {
    const result = generateJwplcHmi({ header, bindingsJson: undefined, jwhmiJson, projectData: memory() })
    expect(result.files).toEqual({})
    expect(result.errors[0]).toContain(expected)
  })
})

describe('generateJwplcHmi', () => {
  it('writes a disabled glue when the project has no screen', () => {
    const result = generateJwplcHmi({ header: undefined, bindingsJson: undefined, projectData: f0Project() })
    expect(result.errors).toEqual([])
    expect(Object.keys(result.files)).toEqual(['src/jwplc_hmi.h'])
    expect(result.files['src/jwplc_hmi.h']).toContain('#define JWPLC_HMI_ENABLED 0')
    expect(result.files['src/jwplc_hmi.h']).not.toContain('#include')
    expect(result.messages[0]).toContain('no tiene pantalla')
  })

  it('links a BOOL HMI variable to a located program variable (gate F0)', () => {
    const result = generateJwplcHmi({
      header: F0_HEADER,
      bindingsJson: bindings([{ hmi: 'rele_q0_0', plc: 'rele' }]),
      projectData: f0Project(),
    })
    expect(result.errors).toEqual([])
    expect(result.files['src/JWPLC_HMI_Generated.h']).toBe(F0_HEADER)
    const glue = result.files['src/jwplc_hmi.h']
    expect(glue).toContain('#define JWPLC_HMI_ENABLED 1')
    expect(glue).toContain('#include "JWPLC_HMI_Generated.h"')
    expect(glue).toContain('static_assert(0 < (MAX_DIGITAL_OUTPUT / 8)')
    expect(glue).toContain('if (bool_output[0][0] != NULL) rele_q0_0 = (*bool_output[0][0] != 0);')
    expect(result.messages).toEqual([
      'HMI: pantalla del proyecto incluida (hmi/JWPLC_HMI_Generated.h).',
      'HMI: rele_q0_0 <- rele (%QX0.0)',
    ])
  })

  it('accepts a direct %IX address and global variables', () => {
    const result = generateJwplcHmi({
      header: F0_HEADER,
      bindingsJson: bindings([{ hmi: 'rele_q0_0', plc: '%ix1.3' }]),
      projectData: project({ globals: [variable('MARCHA', '%QX0.1')] }),
    })
    expect(result.errors).toEqual([])
    expect(result.files['src/jwplc_hmi.h']).toContain('static_assert(1 < (MAX_DIGITAL_INPUT / 8)')
    expect(result.files['src/jwplc_hmi.h']).toContain('bool_input[1][3]')

    const global = generateJwplcHmi({
      header: F0_HEADER,
      bindingsJson: bindings([{ hmi: ' rele_q0_0 ', plc: 'MARCHA' }]),
      projectData: project({ globals: [variable('MARCHA', '%QX0.1')] }),
    })
    expect(global.files['src/jwplc_hmi.h']).toContain('bool_output[0][1]')
  })

  it('includes the screen without links when bindings.json is absent', () => {
    const result = generateJwplcHmi({ header: F0_HEADER, bindingsJson: undefined, projectData: f0Project() })
    expect(result.errors).toEqual([])
    expect(result.files['src/jwplc_hmi.h']).not.toContain('static_assert')
    expect(result.messages[1]).toContain('sin enlaces')
  })

  it('ignores variables of programs that are not instantiated', () => {
    const result = generateJwplcHmi({
      header: F0_HEADER,
      bindingsJson: bindings([{ hmi: 'rele_q0_0', plc: 'RELE' }]),
      projectData: project({ programs: [{ name: 'main', variables: [variable('RELE', '%QX0.0')] }] }),
    })
    expect(result.errors[0]).toContain('no existe')
    expect(result.files).toEqual({})
  })

  it('tolerates a project without configuration', () => {
    const result = generateJwplcHmi({
      header: F0_HEADER,
      bindingsJson: bindings([{ hmi: 'rele_q0_0', plc: 'RELE' }]),
      projectData: { dataTypes: [] } as unknown as PLCProjectData,
    })
    expect(result.errors[0]).toContain('no existe')
  })

  it.each([
    ['// otro header\nbool x = false;\n', undefined, 'no parece generado por JWPLC HMI Designer'],
    [F0_HEADER, '{ roto', 'no es un JSON válido'],
    [F0_HEADER, 'null', '"format": "JWPLC_HMI_BINDINGS"'],
    [F0_HEADER, JSON.stringify({ format: JWPLC_HMI_BINDINGS_FORMAT, version: 2, bindings: [] }), '"version": 1'],
    [F0_HEADER, JSON.stringify({ format: JWPLC_HMI_BINDINGS_FORMAT, version: 1 }), 'lista "bindings"'],
    [F0_HEADER, bindings([null]), 'enlace #1'],
    [F0_HEADER, bindings([{ hmi: 'rele_q0_0' }]), 'enlace #1'],
    [F0_HEADER, bindings([{ hmi: ' ', plc: 'RELE' }]), 'enlace #1'],
    [F0_HEADER, bindings([{ hmi: 'rele_q0_0', plc: ' ' }]), 'enlace #1'],
  ])('rejects invalid input (%#)', (header, bindingsJson, expected) => {
    const result = generateJwplcHmi({ header, bindingsJson, projectData: f0Project() })
    expect(result.files).toEqual({})
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain(expected)
  })

  it.each([
    [{ hmi: 'no_existe', plc: 'RELE' }, 'no es una variable de JWPLC_HMI_Generated.h'],
    [{ hmi: 'nivel', plc: '%QX0.5' }, 'necesita una variable HMI bool'],
    [{ hmi: 'estado', plc: 'RELE' }, 'sólo se enlazan variables bool, float e int32_t'],
    [{ hmi: 'nivel', plc: 'CONTADOR_MAL' }, 'admite DINT, UDINT, DWORD, REAL'],
    [{ hmi: 'nivel', plc: '%ML0' }, '64 bits'],
    [{ hmi: 'nivel', plc: '%QW0.1' }, 'sólo las direcciones de bit'],
    [{ hmi: 'nivel', plc: 'RARA' }, 'no es una dirección IEC válida'],
    [{ hmi: 'rele_q0_0', plc: '%QX0' }, 'bit debe ser 0..7'],
    [{ hmi: 'rele_q0_0', plc: 'OTRA' }, 'no existe'],
    [{ hmi: 'rele_q0_0', plc: 'CONTADOR' }, 'necesita una variable HMI float'],
    [{ hmi: 'rele_q0_0', plc: 'TIPO_USUARIO' }, 'tipo de usuario'],
    [{ hmi: 'rele_q0_0', plc: 'SUELTA' }, 'TIME sin dirección todavía no se enlaza'],
    [{ hmi: 'nivel', plc: 'TEMPORAL' }, 'variable temporal'],
    [{ hmi: 'nivel', plc: 'MARCHA' }, 'necesita una variable HMI bool'],
    [{ hmi: 'rele_q0_0', plc: 'CUENTA_SD' }, 'necesita una variable HMI float o int32_t'],
    [{ hmi: 'rele_q0_0', plc: 'MEMORIA' }, 'marcas %MX'],
    [{ hmi: 'rele_q0_0', plc: '%QX0.8' }, 'bit debe ser 0..7'],
    [{ hmi: 'rele_q0_0', plc: 'DOBLE' }, 'varios lugares'],
    [{ hmi: 'rele_q0_0', plc: 'SIN_DIR' }, 'varios lugares (SIN_DIR, INSTANCE0.SIN_DIR)'],
  ])('rejects link %j', (link, expected) => {
    const projectData = project({
      globals: [
        variable('CONTADOR', '%QW0', 'INT'),
        variable('CONTADOR_MAL', '%MD0', 'INT'),
        variable('RARA', '%Q', 'INT'),
        variable('TIPO_USUARIO', '%QX0.2', 'MI_TIPO', 'user-data-type'),
        variable('SUELTA', '', 'TIME'),
        variable('MARCHA', ''),
        variable('CUENTA_SD', '', 'INT'),
        variable('MEMORIA', '%MX0.0'),
        variable('DOBLE', '%QX0.3'),
      ],
      programs: [
        {
          name: 'main',
          variables: [
            variable('DOBLE', '%QX0.4'),
            variable('SIN_DIR', ''),
            { ...variable('TEMPORAL', '', 'INT'), class: 'temp' } as PLCVariable,
          ],
        },
      ],
      instances: ['main'],
    })
    projectData.configuration.resource.globalVariables.push(variable('SIN_DIR', ''))
    const result = generateJwplcHmi({ header: F0_HEADER, bindingsJson: bindings([link]), projectData })
    expect(result.files).toEqual({})
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain(expected)
  })

  it('reports every bad link and duplicated HMI variables', () => {
    const result = generateJwplcHmi({
      header: F0_HEADER,
      bindingsJson: bindings([
        { hmi: 'rele_q0_0', plc: 'RELE' },
        { hmi: 'rele_q0_0', plc: 'PULSADOR' },
        { hmi: 'nivel', plc: 'RELE' },
      ]),
      projectData: f0Project(),
    })
    expect(result.errors).toHaveLength(2)
    expect(result.errors[0]).toContain('más de una vez')
    expect(result.errors[1]).toContain('necesita una variable HMI bool')
  })

  it('accepts the same variable declared twice at one address', () => {
    const result = generateJwplcHmi({
      header: F0_HEADER,
      bindingsJson: bindings([{ hmi: 'rele_q0_0', plc: 'RELE' }]),
      projectData: project({
        globals: [variable('RELE', '%QX0.0')],
        programs: [{ name: 'main', variables: [variable('rele', '%QX0.0')] }],
        instances: ['main'],
      }),
    })
    expect(result.errors).toEqual([])
  })
})

describe('missing header', () => {
  it.each([
    [undefined, '{}', 'hmi/bindings.json'],
    ['{"fields":[]}', undefined, 'hmi/JWPLC_HMI.jwhmi'],
  ])('compiles without the screen and warns (%#)', (jwhmiJson, bindingsJson, orphan) => {
    const result = generateJwplcHmi({ header: undefined, bindingsJson, jwhmiJson, projectData: f0Project() })
    expect(result.errors).toEqual([])
    expect(result.messages).toEqual([])
    expect(result.files['src/jwplc_hmi.h']).toContain('#define JWPLC_HMI_ENABLED 0')
    expect(result.warnings[0]).toContain(`hay ${orphan} pero falta hmi/JWPLC_HMI_Generated.h`)
    expect(result.warnings[0]).toContain('Actualizar HMI')
  })
})

describe('unlocated variables (STruC++ debug table)', () => {
  const jwhmi = (fields: unknown) => JSON.stringify({ format: 'JWPLC_HMI_PROJECT', version: 1, fields })
  const header = `${F0_HEADER}uint8_t pequeno = 0;\n`
  const programProject = () =>
    project({
      globals: [variable('ALARMA', ''), variable('LIMITE_G', '', 'UDINT')],
      programs: [
        {
          name: 'main',
          variables: [
            variable('MARCHA', ''),
            variable('CUENTA', '', 'INT'),
            variable('TEMP', '', 'REAL'),
            { ...variable('ALARMA', ''), class: 'external' } as PLCVariable,
          ],
        },
      ],
      instances: ['main', 'main'],
    })
  const withFunctionBlock = () => {
    const data = programProject()
    data.pous.push({ type: 'function-block', data: { name: 'FB1', variables: [variable('X', '')] } } as never)
    return data
  }

  it('links them with placeholders, read-only and read-write, for every kind', () => {
    const result = generateJwplcHmi({
      header,
      bindingsJson: bindings([{ hmi: 'nivel', plc: 'TEMP', access: 'RW' }]),
      jwhmiJson: jwhmi([{ type: 'BOOL', variable: 'rele_q0_0', plcBinding: { var: 'alarma' } }]),
      projectData: programProject(),
    })
    expect(result.errors).toEqual([])
    const glue = result.files['src/jwplc_hmi.h']
    expect(glue).toContain('extern "C" uint8_t openplc_debug_write(')
    expect(glue).toContain('static inline bool jwplcHmiReadVar(')
    expect(glue).toContain('if (jwplcHmiReadVar(@@JWPLC_HMI_VAR(ALARMA,BOOL)@@, raw)) rele_q0_0 = (raw != 0);')
    expect(glue).not.toContain('static_assert')
    expect(result.messages).toContain('HMI: rele_q0_0 <- alarma (ALARMA, sin dirección)')
  })

  it('writes HMI changes back with the right C type and range', () => {
    const result = generateJwplcHmi({
      header,
      bindingsJson: bindings([
        { hmi: 'rele_q0_0', plc: 'MARCHA', access: 'RW' },
        { hmi: 'nivel', plc: 'TEMP', access: 'RW' },
        { hmi: 'limite', plc: 'CUENTA', access: 'RW' },
      ]),
      projectData: withFunctionBlock(),
    })
    const glue = result.files['src/jwplc_hmi.h']
    expect(glue).toContain('jwplcHmiWriteVar(@@JWPLC_HMI_VAR(INSTANCE0.MARCHA,BOOL)@@, (uint8_t)(rele_q0_0 ? 1 : 0));')
    expect(glue).toContain('jwplcHmiWriteVar(@@JWPLC_HMI_VAR(INSTANCE0.TEMP,REAL)@@, (float)nivel);')
    expect(glue).toContain(
      'jwplcHmiWriteVar(@@JWPLC_HMI_VAR(INSTANCE0.CUENTA,INT)@@, (int16_t)jwplcHmiClampRound((double)limite, -32768.0, 32767.0));',
    )
    expect(glue).toContain('if (jwplcHmiSynced && limite != jwplcHmiShadow_limite)')
    expect(glue).toContain('const int32_t plc = (int32_t)raw;')
    expect(glue).toContain('const float plc = (float)raw;')
  })

  it('reads a REAL into an int32_t rounding it', () => {
    const result = generateJwplcHmi({
      header,
      bindingsJson: bindings([
        { hmi: 'limite', plc: 'TEMP' },
        { hmi: 'nivel', plc: 'LIMITE_G' },
      ]),
      projectData: programProject(),
    })
    expect(result.files['src/jwplc_hmi.h']).toContain('limite = (int32_t)llroundf(raw);')
    expect(result.files['src/jwplc_hmi.h']).toContain('uint32_t raw;')
  })

  it('classifies the IEC types it can link', () => {
    expect(programVarKind('bool')).toBe('bool')
    expect(programVarKind('DWORD', 'local')).toBe('number')
    expect(programVarKind('LREAL')).toContain('LREAL sin dirección')
    expect(programVarKind('INT', 'temp')).toContain('VAR_TEMP')
  })
})

describe('resolveJwplcHmiProgramVars', () => {
  const map = JSON.stringify({
    leaves: [
      { arrayIdx: 0, elemIdx: 0, path: 'ALARMA', type: 'BOOL', size: 1 },
      { arrayIdx: 1, elemIdx: 3, path: 'INSTANCE0.CUENTA', type: 'INT', size: 2 },
    ],
  })
  const glue = 'a(@@JWPLC_HMI_VAR(ALARMA,BOOL)@@); b(@@JWPLC_HMI_VAR(instance0.cuenta,INT)@@);'

  it('replaces the placeholders with the debug-map indexes', () => {
    expect(resolveJwplcHmiProgramVars(glue, map)).toEqual({ text: 'a(0, 0); b(1, 3);', errors: [] })
    expect(resolveJwplcHmiProgramVars('sin marcas', 'no es json')).toEqual({ text: 'sin marcas', errors: [] })
  })

  it('names the variables the map lacks or types differently', () => {
    const result = resolveJwplcHmiProgramVars(
      'x(@@JWPLC_HMI_VAR(NO_ESTA,BOOL)@@) y(@@JWPLC_HMI_VAR(INSTANCE0.CUENTA,REAL)@@)',
      map,
    )
    expect(result.errors).toEqual([
      'HMI: NO_ESTA no está en el mapa de depuración del programa compilado; no se puede enlazar a la pantalla.',
      'HMI: INSTANCE0.CUENTA es INT en el programa compilado y el enlace esperaba REAL.',
    ])
  })

  it('reports an unreadable map', () => {
    expect(resolveJwplcHmiProgramVars(glue, '{ roto').errors[0]).toContain('debug-map.json')
    expect(resolveJwplcHmiProgramVars(glue, '{}').errors[0]).toContain('sin "leaves"')
  })

  it('finalizes only the HMI glue of the firmware skeleton', () => {
    const skeleton = { 'src/jwplc_hmi.h': glue, 'src/otro.h': '@@JWPLC_HMI_VAR(ALARMA,BOOL)@@' }
    expect(finalizeJwplcHmiSkeleton(skeleton, map)).toEqual({
      files: { 'src/jwplc_hmi.h': 'a(0, 0); b(1, 3);', 'src/otro.h': '@@JWPLC_HMI_VAR(ALARMA,BOOL)@@' },
      errors: [],
    })
    expect(finalizeJwplcHmiSkeleton({ 'src/otro.h': 'x' }, map)).toEqual({ files: { 'src/otro.h': 'x' }, errors: [] })
    const failed = finalizeJwplcHmiSkeleton({ 'src/jwplc_hmi.h': glue }, '{}')
    expect(failed.files).toEqual({ 'src/jwplc_hmi.h': glue })
    expect(failed.errors).toHaveLength(1)
  })
})
