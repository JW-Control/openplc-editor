import { join } from 'node:path'

import { findSimExecutable, installedSimPaths, simEnvironment, simOpenArgument } from '../paths'

const env = { LOCALAPPDATA: 'C:\\Users\\Ana\\AppData\\Local', ProgramFiles: 'C:\\Program Files' }
const perUser = join(env.LOCALAPPDATA, 'Programs', 'JWPLC Sim', 'JWPLC Sim.exe')

describe('JWPLC Sim paths', () => {
  it('looks in the per-user install first', () => {
    expect(installedSimPaths(env)[0]).toBe(perUser)
  })

  it('skips the roots the environment does not define', () => {
    expect(installedSimPaths({})).toEqual([])
  })

  it('prefers the saved location', () => {
    expect(findSimExecutable('D:\\Sim\\JWPLC Sim.exe', env, () => true)).toBe('D:\\Sim\\JWPLC Sim.exe')
  })

  it('falls back to an install when the saved location is gone', () => {
    expect(findSimExecutable('D:\\Sim\\JWPLC Sim.exe', env, (path) => path === perUser)).toBe(perUser)
  })

  it('returns null when the Sim is not found', () => {
    expect(findSimExecutable(undefined, env, () => false)).toBeNull()
  })

  it('removes ELECTRON_RUN_AS_NODE and keeps the rest of the environment', () => {
    expect(simEnvironment({ ELECTRON_RUN_AS_NODE: '1', PATH: 'x' })).toEqual({ PATH: 'x' })
  })

  it('passes a path with spaces as a single argument', () => {
    expect(simOpenArgument('C:\\Mis proyectos\\blink')).toBe('--jwsim-open=C:\\Mis proyectos\\blink')
  })
})
