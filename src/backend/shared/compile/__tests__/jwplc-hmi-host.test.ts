import {
  collectHmiCandidates,
  describeHmiFolder,
  describeHmiSerialPort,
  describeHmiVariables,
  type HmiStoreProject,
  pickJwhmiToLoad,
} from '../jwplc-hmi-host'

const v = (name: string, value: string, location?: string, definition = 'base-type') => ({
  name,
  type: { definition, value },
  ...(location === undefined ? {} : { location }),
})

describe('collectHmiCandidates', () => {
  it('lists globals and variables of instantiated programs only', () => {
    const project: HmiStoreProject = {
      pous: [
        { name: 'main', pouType: 'program', interface: { variables: [v('RELE', 'BOOL', '%QX0.0')] } },
        { name: 'unused', pouType: 'program', interface: { variables: [v('X', 'BOOL', '%QX0.1')] } },
        { name: 'fb', pouType: 'function-block', interface: { variables: [v('Y', 'BOOL', '%QX0.2')] } },
        { name: 'Aux', pouType: 'program' },
      ],
      configurations: {
        resource: { instances: [{ program: 'MAIN' }, { program: 'aux' }], globalVariables: [v('LIMITE', 'INT')] },
      },
    }
    expect(collectHmiCandidates(project)).toEqual([
      { name: 'LIMITE', scope: 'global', type: { definition: 'base-type', value: 'INT' }, location: '' },
      {
        name: 'RELE',
        scope: 'program',
        pou: 'main',
        type: { definition: 'base-type', value: 'BOOL' },
        location: '%QX0.0',
      },
    ])
  })

  it('tolerates an empty project', () => {
    expect(collectHmiCandidates({})).toEqual([])
  })
})

describe('unlocated variables', () => {
  it('lists program and global variables without address as read-write, skipping VAR_EXTERNAL', () => {
    const project: HmiStoreProject = {
      pous: [
        {
          name: 'main',
          pouType: 'program',
          interface: {
            variables: [
              { name: 'MARCHA', class: 'local', type: { definition: 'base-type', value: 'BOOL' } },
              { name: 'ALARMA', class: 'external', type: { definition: 'base-type', value: 'BOOL' } },
              { name: 'CUENTA', type: { definition: 'base-type', value: 'INT' }, location: '' },
            ],
          },
        },
      ],
      configurations: {
        resource: {
          instances: [{ program: 'main' }],
          globalVariables: [{ name: 'ALARMA', type: { definition: 'base-type', value: 'BOOL' } }],
        },
      },
    }
    const described = describeHmiVariables(collectHmiCandidates(project))
    expect(described.map((variable) => [variable.name, variable.scope, variable.hmiTypes, variable.access])).toEqual([
      ['ALARMA', 'global', ['bool'], 'RW'],
      ['MARCHA', 'program', ['bool'], 'RW'],
      ['CUENTA', 'program', ['float', 'int32_t'], 'RW'],
    ])
    expect(described[1]).toMatchObject({ address: null })
    expect(described[1]).not.toHaveProperty('reason')
  })
})

describe('describeHmiVariables', () => {
  const candidate = (name: string, value: string, location: string, definition = 'base-type') => ({
    name,
    scope: 'program' as const,
    pou: 'main',
    type: { definition, value },
    location,
  })

  it('marks bindable variables with their HMI types and access', () => {
    const [rele, limite, entrada] = describeHmiVariables([
      candidate('RELE', 'bool', '%qx0.0'),
      candidate('LIMITE', 'INT', '%MW1'),
      { name: 'ENTRADA', scope: 'global', type: { definition: 'base-type', value: 'INT' }, location: '%IW0' },
    ])
    expect(rele).toEqual({
      name: 'RELE',
      scope: 'program',
      pou: 'main',
      iecType: 'BOOL',
      address: '%QX0.0',
      hmiTypes: ['bool'],
      access: 'R',
    })
    expect(limite).toMatchObject({ hmiTypes: ['float', 'int32_t'], access: 'RW', address: '%MW1' })
    expect(entrada).toMatchObject({ scope: 'global', access: 'R' })
    expect(entrada).not.toHaveProperty('pou')
  })

  it.each([
    [candidate('T', 'TON', '', 'derived'), 'tipo de usuario'],
    [candidate('S', 'TIME', ''), 'TIME sin dirección'],
    [{ ...candidate('TMP', 'INT', ''), class: 'temp' }, 'VAR_TEMP'],
    [candidate('M', 'BOOL', '%MX0.0'), 'marcas %MX'],
    [candidate('W', 'BOOL', '%MW0'), 'admite INT, UINT, WORD'],
  ])('explains why %j is not bindable', (input, reason) => {
    const [described] = describeHmiVariables([input])
    expect(described.access).toBeNull()
    expect(described.hmiTypes).toEqual([])
    expect(described.reason).toContain(reason)
  })
})

describe('pickJwhmiToLoad', () => {
  it('prefers the canonical project, else the only .jwhmi, else none', () => {
    expect(pickJwhmiToLoad(['A.jwhmi', 'JWPLC_HMI.jwhmi'])).toBe('JWPLC_HMI.jwhmi')
    expect(pickJwhmiToLoad(['bindings.json', 'Old.JWHMI'])).toBe('Old.JWHMI')
    expect(pickJwhmiToLoad(['A.jwhmi', 'B.jwhmi'])).toBeNull()
    expect(pickJwhmiToLoad([])).toBeNull()
  })
})

describe('describeHmiFolder', () => {
  it('reports the hmi/ folder as the linked sketch, saving under the canonical name', () => {
    expect(describeHmiFolder('HMIProbe', '/p/hmi', ['JWPLC_HMI_Generated.h', 'Old.jwhmi'])).toEqual({
      ok: true,
      name: 'HMIProbe',
      path: '/p/hmi',
      headerExists: true,
      projectFile: 'JWPLC_HMI.jwhmi',
      projectExists: true,
    })
    expect(describeHmiFolder('P', '/p/hmi', ['A.jwhmi', 'B.jwhmi'])).toMatchObject({
      headerExists: false,
      projectExists: false,
    })
  })
})

describe('describeHmiSerialPort', () => {
  it('shows USB ids in hex and names the usual ESP32 chips', () => {
    expect(
      describeHmiSerialPort({
        portId: '1',
        portName: 'COM6',
        displayName: 'USB-SERIAL',
        vendorId: '6790',
        productId: '29987',
      }),
    ).toEqual({
      portId: '1',
      portName: 'COM6',
      displayName: 'USB-SERIAL',
      vendorId: '1a86',
      productId: '7523',
      chip: 'CH340 / CH343',
    })
    expect(describeHmiSerialPort({ portId: '2', vendorId: 'x', productId: '' })).toEqual({
      portId: '2',
      portName: '',
      displayName: '',
      vendorId: 'x',
      productId: '',
      chip: '',
    })
    expect(describeHmiSerialPort({ portId: '3', vendorId: 4292 }).chip).toBe('CP210x')
  })
})
