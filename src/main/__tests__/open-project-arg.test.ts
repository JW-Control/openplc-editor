import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { closeRequested, openProjectArg } from '../open-project-arg'

describe('openProjectArg (--open-project, JWPLC Edition)', () => {
  const root = mkdtempSync(join(tmpdir(), 'open-project-'))
  const project = join(root, 'marcha_ld')
  mkdirSync(project)
  writeFileSync(join(project, 'project.json'), '{}')

  it('devuelve la carpeta del proyecto pedida', () => {
    expect(openProjectArg(['editor.exe', `--open-project=${project}`])).toBe(project)
  })

  it('acepta la ruta del project.json y rutas relativas al directorio de trabajo', () => {
    expect(openProjectArg([`--open-project=${join(project, 'project.json')}`])).toBe(project)
    expect(openProjectArg(['--open-project=marcha_ld'], root)).toBe(project)
  })

  it('ignora una carpeta sin project.json, una ruta vacía o la falta del argumento', () => {
    expect(openProjectArg([`--open-project=${root}`])).toBeNull()
    expect(openProjectArg(['--open-project='])).toBeNull()
    expect(openProjectArg(['editor.exe', '--cli'])).toBeNull()
  })

  it('con varios, vale el último (second-instance trae el argv completo)', () => {
    expect(openProjectArg([`--open-project=${root}`, `--open-project=${project}`])).toBe(project)
  })
})

describe('closeRequested (--jwsim-close, JWPLC Edition)', () => {
  it('solo con la bandera exacta', () => {
    expect(closeRequested(['editor.exe', '--jwsim-close'])).toBe(true)
    expect(closeRequested(['editor.exe', '--open-project=x'])).toBe(false)
    expect(closeRequested(['editor.exe', '--jwsim-closed'])).toBe(false)
  })
})
