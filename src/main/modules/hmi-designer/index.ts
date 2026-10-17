/**
 * JWPLC HMI Designer hosted by OpenPLC (Alpha14 F3, `jwplc-hmi-host/1`).
 *
 * Opens the Designer (the same web files as the stand-alone .exe) in its own
 * window, served read-only from 127.0.0.1, with a preload that exposes:
 *
 * - `window.JWPLCHMINative`: the bridge the Designer already uses with its
 *   .exe (linked folder, write header, write project). Here the "linked
 *   sketch" is always the open OpenPLC project's `hmi/` folder, so the
 *   current Designer works unchanged.
 * - `window.JWPLCHMIHost`: project context, PLC variables (`listVariables`)
 *   and the saved project (`loadProject`), for the Designer's OpenPLC mode
 *   (Alpha15 A15-6).
 *
 * Contract: platform-jwplc docs/v2.1.0-alpha.14/A14_F3_CONTRATO_HMI_OPENPLC_20261017.md
 *
 * Where the Designer files come from (v1, development): the
 * `JWPLC_HMI_DESIGNER_DIR` environment variable, or the sibling checkout
 * `../platform-jwplc/tools/jwplc-hmi-designer/poc`. Shipping them inside the
 * signed VPP comes later.
 */

import { createReadStream, existsSync, statSync } from 'node:fs'
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { extname, isAbsolute, join, relative, resolve } from 'node:path'

import { app, BrowserWindow, IpcMain, IpcMainInvokeEvent } from 'electron'

import {
  JWPLC_HMI_HEADER_FILE,
  JWPLC_HMI_PROJECT_DIR,
  JWPLC_HMI_PROJECT_FILE,
} from '../../../backend/shared/compile/jwplc-hmi'
import { type HmiHostVariable, pickJwhmiToLoad } from '../../../backend/shared/compile/jwplc-hmi-host'
import type { OpenHmiDesignerArgs, OpenHmiDesignerResult } from '../../../middleware/shared/ports/device-port'

const HEADER_MARKER = '// Código generado por JWPLC HMI Designer'
const MAX_FILE_BYTES = 8 * 1024 * 1024

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
}

interface Session {
  projectDir: string
  hmiDir: string
  projectName: string
  device: string
  variables: HmiHostVariable[]
}

/** Designer web root, or null when it is not available on this machine. */
export function resolveDesignerRoot(): string | null {
  const candidates = [
    process.env.JWPLC_HMI_DESIGNER_DIR,
    join(app.getAppPath(), '..', 'platform-jwplc', 'tools', 'jwplc-hmi-designer', 'poc'),
    join(process.cwd(), '..', 'platform-jwplc', 'tools', 'jwplc-hmi-designer', 'poc'),
  ]
  for (const candidate of candidates) {
    if (candidate && existsSync(join(candidate, 'desktop.html'))) return resolve(candidate)
  }
  return null
}

class HmiDesignerHost {
  private window: BrowserWindow | null = null
  private server: http.Server | null = null
  private baseUrl = ''
  private session: Session | null = null
  private registered = false

  register(ipcMain: IpcMain): void {
    if (this.registered) return
    this.registered = true

    ipcMain.handle('hmi-designer:open', (event, args: OpenHmiDesignerArgs) => this.open(event, args))

    const fromDesigner = <T>(handler: (session: Session, ...args: unknown[]) => Promise<T> | T) => {
      return async (event: IpcMainInvokeEvent, ...args: unknown[]) => {
        if (!this.window || event.sender !== this.window.webContents || !this.session) {
          return { ok: false, error: 'Canal reservado a la ventana del HMI Designer.' }
        }
        return handler(this.session, ...args)
      }
    }

    ipcMain.handle(
      'jwplc-hmi:get-linked-sketch',
      fromDesigner((session) => this.linkedInfo(session)),
    )
    ipcMain.handle(
      'jwplc-hmi:select-sketch-directory',
      fromDesigner((session) => this.linkedInfo(session)),
    )
    ipcMain.handle(
      'jwplc-hmi:write-generated-header',
      fromDesigner((session, payload) => this.writeHeader(session, payload)),
    )
    ipcMain.handle(
      'jwplc-hmi:write-project',
      fromDesigner((session, payload) => this.writeProject(session, payload)),
    )
    ipcMain.handle(
      'jwplc-hmi-host:get-context',
      fromDesigner((session) => ({
        projectName: session.projectName,
        device: session.device,
        display: { width: 320, height: 170 },
      })),
    )
    ipcMain.handle(
      'jwplc-hmi-host:list-variables',
      fromDesigner((session) => session.variables),
    )
    ipcMain.handle(
      'jwplc-hmi-host:load-project',
      fromDesigner((session) => this.readProject(session)),
    )
  }

  private async open(event: IpcMainInvokeEvent, args: OpenHmiDesignerArgs): Promise<OpenHmiDesignerResult> {
    if (this.window && event.sender === this.window.webContents) {
      return { ok: false, error: 'Canal reservado al editor.' }
    }
    const projectDir = resolve(String(args?.projectPath ?? '').replace(/project\.json$/i, ''))
    if (!args?.projectPath || !existsSync(join(projectDir, 'project.json'))) {
      return { ok: false, error: 'Guarda el proyecto antes de abrir el HMI Designer.' }
    }
    const root = resolveDesignerRoot()
    if (!root) {
      return {
        ok: false,
        error:
          'No se encontró JWPLC HMI Designer. Define JWPLC_HMI_DESIGNER_DIR con la carpeta tools/jwplc-hmi-designer/poc de platform-jwplc.',
      }
    }

    const previous = this.session
    const sameProject = previous?.projectDir === projectDir
    if (previous && !sameProject) await this.saveOpenProject(previous)
    this.session = {
      projectDir,
      hmiDir: join(projectDir, JWPLC_HMI_PROJECT_DIR),
      projectName: String(args.projectName || 'proyecto'),
      device: String(args.device || ''),
      variables: Array.isArray(args.variables) ? args.variables : [],
    }

    if (this.window && !this.window.isDestroyed()) {
      if (!sameProject) {
        // Another project: reload so the Designer starts from that project's hmi/.
        await this.window.loadURL(`${this.baseUrl}/desktop.html?host=openplc`)
        await this.applySavedProject()
      }
      this.window.focus()
      return { ok: true }
    }

    await this.startServer(root)
    const owner = BrowserWindow.fromWebContents(event.sender)
    const preload = app.isPackaged
      ? join(__dirname, 'hmi-designer-preload.js')
      : join(__dirname, '../../configs/dll/hmi-designer-preload.js')
    const window = new BrowserWindow({
      width: 1500,
      height: 920,
      title: `JWPLC HMI Designer · ${this.session.projectName}`,
      autoHideMenuBar: true,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, preload },
    })
    this.window = window
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-navigate', (navigation, url) => {
      if (!url.startsWith(this.baseUrl)) navigation.preventDefault()
    })
    window.on('page-title-updated', (titleEvent) => titleEvent.preventDefault())
    // Save the design on close so reopening shows the last screen.
    let savedOnClose = false
    window.on('close', (closeEvent) => {
      if (savedOnClose || !this.session) return
      closeEvent.preventDefault()
      const session = this.session
      void this.saveOpenProject(session).finally(() => {
        savedOnClose = true
        if (!window.isDestroyed()) window.close()
      })
    })
    window.on('closed', () => {
      this.window = null
      this.server?.close()
      this.server = null
    })
    owner?.once('closed', () => {
      if (this.window && !this.window.isDestroyed()) this.window.close()
    })

    await window.loadURL(`${this.baseUrl}/desktop.html?host=openplc`)
    await this.applySavedProject()
    return { ok: true }
  }

  private startServer(root: string): Promise<void> {
    if (this.server) return Promise.resolve()
    const server = http.createServer((request, response) => {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405)
        response.end()
        return
      }
      let pathname = '/desktop.html'
      try {
        pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname)
      } catch {
        pathname = ''
      }
      if (pathname === '/') pathname = '/desktop.html'
      const file = resolve(root, `.${pathname}`)
      const rel = relative(root, file)
      if (!pathname || rel.startsWith('..') || isAbsolute(rel) || !existsSync(file) || !statSync(file).isFile()) {
        response.writeHead(404)
        response.end()
        return
      }
      response.writeHead(200, {
        'Content-Type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
      })
      createReadStream(file).pipe(response)
    })
    this.server = server
    return new Promise((resolveListen) => {
      server.listen(0, '127.0.0.1', () => {
        this.baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
        resolveListen()
      })
    })
  }

  /** Load hmi/JWPLC_HMI.jwhmi (or the only .jwhmi there) into the Designer. */
  private async applySavedProject(): Promise<void> {
    if (!this.window || !this.session) return
    const project = await this.readProject(this.session)
    if (!project) return
    const script = `(async () => {
      for (let i = 0; i < 200 && !(window.JWPLCHMIProject && window.JWPLCHMIProject.apply); i += 1) {
        await new Promise((r) => setTimeout(r, 50));
      }
      if (!(window.JWPLCHMIProject && window.JWPLCHMIProject.apply)) return false;
      await window.JWPLCHMIProject.apply(${JSON.stringify(project)});
      return true;
    })()`
    await this.window.webContents.executeJavaScript(script, true)
  }

  private async readProject(session: Session): Promise<object | null> {
    let names: string[]
    try {
      names = await readdir(session.hmiDir)
    } catch {
      return null
    }
    const file = pickJwhmiToLoad(names)
    if (!file) return null
    try {
      return JSON.parse(await readFile(join(session.hmiDir, file), 'utf-8')) as object
    } catch {
      return null
    }
  }

  private async linkedInfo(session: Session) {
    let headerExists = false
    try {
      headerExists = (await stat(join(session.hmiDir, JWPLC_HMI_HEADER_FILE))).isFile()
    } catch {
      headerExists = false
    }
    return { ok: true, name: session.projectName, path: session.hmiDir, headerExists }
  }

  private async writeHeader(session: Session, payload: unknown) {
    const raw = (payload as { text?: unknown } | null)?.text
    const text = typeof raw === 'string' ? raw : ''
    if (!text.startsWith(HEADER_MARKER) || Buffer.byteLength(text) > MAX_FILE_BYTES) {
      return { ok: false, error: `El texto no es un ${JWPLC_HMI_HEADER_FILE} del Designer.` }
    }
    const target = join(session.hmiDir, JWPLC_HMI_HEADER_FILE)
    await mkdir(session.hmiDir, { recursive: true })
    await writeFile(target, text, 'utf-8')
    // "Actualizar HMI" also saves the design, so JWPLC_HMI.jwhmi (plcBinding)
    // and the header never drift apart and reopening shows the same screen.
    await this.saveOpenProject(session)
    return { ok: true, path: target }
  }

  /** Save the Designer's current project to hmi/JWPLC_HMI.jwhmi. */
  private async saveOpenProject(session: Session): Promise<boolean> {
    if (!this.window || this.window.isDestroyed()) return false
    try {
      const text = (await this.window.webContents.executeJavaScript(
        'window.JWPLCHMIProject && window.JWPLCHMIProject.serialize ? JSON.stringify(window.JWPLCHMIProject.serialize(), null, 2) + "\\n" : ""',
        true,
      )) as string
      if (!text) return false
      const result = await this.writeProject(session, { text })
      return result.ok
    } catch {
      return false
    }
  }

  private async writeProject(session: Session, payload: unknown) {
    const raw = (payload as { text?: unknown } | null)?.text
    const text = typeof raw === 'string' ? raw : ''
    let format: unknown
    try {
      format = (JSON.parse(text) as { format?: unknown }).format
    } catch {
      format = undefined
    }
    if (format !== 'JWPLC_HMI_PROJECT' || Buffer.byteLength(text) > MAX_FILE_BYTES) {
      return { ok: false, error: 'El texto no es un proyecto .jwhmi del Designer.' }
    }
    const target = join(session.hmiDir, JWPLC_HMI_PROJECT_FILE)
    await mkdir(session.hmiDir, { recursive: true })
    await writeFile(target, text, 'utf-8')
    return { ok: true, path: target, fileName: JWPLC_HMI_PROJECT_FILE }
  }
}

export const hmiDesignerHost = new HmiDesignerHost()
