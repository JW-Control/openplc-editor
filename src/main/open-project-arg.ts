/**
 * JWPLC Edition: `--open-project=<carpeta>` abre ese proyecto al arrancar el
 * editor o, si ya está abierto, en la ventana actual (evento second-instance).
 * Lo usa JWPLC Sim para mandar a programar el proyecto IEC que acaba de crear
 * con la CLI (`--cli create`) o que el usuario quiere editar: es el espejo de
 * `--jwsim-open`, con el que el editor abre el Sim.
 *
 * El proyecto se abre como «Archivo ▸ Abrir reciente»
 * (`project:open-recent-accelerator`), así pasa por el mismo aviso de cambios
 * sin guardar.
 */
import { existsSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

export const OPEN_PROJECT_FLAG = '--open-project='

/** Carpeta del proyecto pedida en `argv`, o null si no hay o no es un proyecto. */
export function openProjectArg(argv: readonly string[], cwd: string = process.cwd()): string | null {
  const arg = [...argv].reverse().find((a) => a.startsWith(OPEN_PROJECT_FLAG))
  if (!arg) return null
  const raw = arg.slice(OPEN_PROJECT_FLAG.length).replace(/^"(.*)"$/, '$1')
  if (!raw) return null
  let dir = resolve(cwd, raw)
  // También vale la ruta del project.json.
  if (existsSync(dir) && statSync(dir).isFile() && dir.toLowerCase().endsWith('project.json')) dir = resolve(dir, '..')
  return existsSync(join(dir, 'project.json')) ? dir : null
}
