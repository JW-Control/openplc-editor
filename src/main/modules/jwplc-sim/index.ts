import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { tr } from '@root/frontend/locales/tr'
import type { OpenInJwplcSimResult } from '@root/middleware/shared/ports/device-port'
import { BrowserWindow, dialog, type IpcMain } from 'electron'

import { store } from '../store'
import { findSimExecutable, simEnvironment, simOpenArgument } from './paths'

const SIM_DOWNLOAD_URL = 'https://github.com/JW-Control/jwplc-sim/releases/latest'

async function pickSimExecutable(window: BrowserWindow | null): Promise<string | null> {
  const options = {
    title: tr('Locate JWPLC Sim'),
    message: tr('JWPLC Sim was not found. Select its program, or download it from {{url}}', { url: SIM_DOWNLOAD_URL }),
    properties: ['openFile' as const],
    filters: process.platform === 'win32' ? [{ name: 'JWPLC Sim', extensions: ['exe'] }] : [],
  }
  const picked = await (window ? dialog.showOpenDialog(window, options) : dialog.showOpenDialog(options))
  return picked.canceled ? null : (picked.filePaths[0] ?? null)
}

/** Resolves once the process started, so a program that cannot run reaches the user as an error. */
function launch(executable: string, projectPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [simOpenArgument(projectPath)], {
      detached: true,
      stdio: 'ignore',
      env: simEnvironment(process.env),
    })
    child.once('error', reject)
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
  })
}

async function openInJwplcSim(window: BrowserWindow | null, projectPath: unknown): Promise<OpenInJwplcSimResult> {
  if (typeof projectPath !== 'string' || !existsSync(join(projectPath, 'project.json'))) {
    return { ok: false, error: tr('The project has no project.json on disk.') }
  }
  const executable =
    findSimExecutable(store.get('jwplc_sim_path'), process.env, existsSync) ?? (await pickSimExecutable(window))
  if (!executable) return { ok: false }
  try {
    await launch(executable, projectPath)
  } catch (error) {
    return { ok: false, error: tr('JWPLC Sim could not be started: {{reason}}', { reason: String(error) }) }
  }
  store.set('jwplc_sim_path', executable)
  return { ok: true }
}

/** "Simulate" button of the activity bar (gate JWSIM_G6_SIMULATE_BUTTON of jwplc-sim). */
export function registerJwplcSim(ipcMain: IpcMain): void {
  ipcMain.handle('jwplc-sim:open', (event, projectPath: unknown) =>
    openInJwplcSim(BrowserWindow.fromWebContents(event.sender), projectPath),
  )
}
