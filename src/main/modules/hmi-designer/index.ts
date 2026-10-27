/**
 * JWPLC HMI Designer hosted by OpenPLC (`jwplc-hmi-host/1`, bridge 1.1).
 *
 * Opens the Designer (the same web files as the stand-alone .exe) in its own
 * window, served read-only from 127.0.0.1, with a preload that exposes:
 *
 * - `window.JWPLCHMINative`: the bridge the Designer uses with its .exe. Here
 *   the "linked sketch" is always the open OpenPLC project's `hmi/` folder:
 *   "Actualizar HMI" / Save write the header and `JWPLC_HMI.jwhmi` there, the
 *   Designer opens that project itself (`readProject`), asks before closing
 *   with unsaved changes and picks serial ports with its own dialog (Live).
 *   Sketch-only calls (create/change sketch, recent projects, Arduino IDE)
 *   are not exposed: the Designer hides them in OpenPLC mode.
 * - `window.JWPLCHMIHost`: project context and PLC variables (`listVariables`)
 *   for the Designer's OpenPLC mode.
 *
 * Contract: platform-jwplc docs/v2.1.0-alpha.14/A14_F3_CONTRATO_HMI_OPENPLC_20261017.md
 *
 * Where the Designer files come from, in order: the `JWPLC_HMI_DESIGNER_DIR`
 * environment variable; the copy bundled into the installer
 * (`resources/jwplc-hmi-designer/poc`, filled by the JWPLC Edition pre-release
 * workflow from platform-jwplc); in development, the sibling checkout
 * `../platform-jwplc/tools/jwplc-hmi-designer/poc`. It must be the Designer of
 * 2.1.0-alpha.14 or later with the OpenPLC mode.
 */

import { createReadStream, existsSync, statSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { extname, isAbsolute, join, relative, resolve } from 'node:path'

import { app, BrowserWindow, IpcMain, IpcMainEvent, IpcMainInvokeEvent, session, shell } from 'electron'

import {
  JWPLC_HMI_HEADER_FILE,
  JWPLC_HMI_PROJECT_DIR,
  JWPLC_HMI_PROJECT_FILE,
} from '../../../backend/shared/compile/jwplc-hmi'
import {
  describeHmiFolder,
  describeHmiSerialPort,
  type HmiHostVariable,
  pickJwhmiToLoad,
} from '../../../backend/shared/compile/jwplc-hmi-host'
import type { OpenHmiDesignerArgs, OpenHmiDesignerResult } from '../../../middleware/shared/ports/device-port'

const HEADER_MARKER = '// Código generado por JWPLC HMI Designer'
const MAX_FILE_BYTES = 8 * 1024 * 1024
// Own session: the serial permissions and port picker apply only to the Designer.
const DESIGNER_PARTITION = 'persist:jwplc-hmi-designer'
// Files that only exist in a Designer with the flow this host expects.
const REQUIRED_DESIGNER_FILES = ['desktop.html', 'designer-save-flow.js', 'designer-openplc-host.js']
const CLOSE_GUARD_TIMEOUT_MS = 2000

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.bin': 'application/octet-stream',
}

interface Session {
  projectDir: string
  hmiDir: string
  projectName: string
  device: string
  variables: HmiHostVariable[]
}

interface SerialPortRequest {
  requestId: number
  ports: Map<string, Electron.SerialPort>
  finish: (portId: string) => void
}

type DesignerRoot = { root: string } | { error: string }

const designerCandidates = () =>
  [
    process.env.JWPLC_HMI_DESIGNER_DIR,
    app.isPackaged ? join(process.resourcesPath, 'jwplc-hmi-designer', 'poc') : undefined,
    join(app.getAppPath(), '..', 'platform-jwplc', 'tools', 'jwplc-hmi-designer', 'poc'),
    join(process.cwd(), '..', 'platform-jwplc', 'tools', 'jwplc-hmi-designer', 'poc'),
  ].filter((candidate): candidate is string => Boolean(candidate))

/** Designer web root, or why it cannot be used on this machine. */
export function resolveDesignerRoot(): DesignerRoot {
  for (const candidate of designerCandidates()) {
    if (!existsSync(join(candidate, 'desktop.html'))) continue
    const missing = REQUIRED_DESIGNER_FILES.filter((file) => !existsSync(join(candidate, file)))
    if (missing.length === 0) return { root: resolve(candidate) }
    return {
      error:
        `El HMI Designer de ${resolve(candidate)} es anterior a 2.1.0-alpha.14 o no tiene el modo OpenPLC ` +
        `(falta ${missing.join(', ')}). Cambia platform-jwplc a la rama v2.1.0-alpha.15/OpenPLC-HMI/main.`,
    }
  }
  return {
    error:
      'No se encontró JWPLC HMI Designer. Define JWPLC_HMI_DESIGNER_DIR con la carpeta tools/jwplc-hmi-designer/poc de platform-jwplc.',
  }
}

class HmiDesignerHost {
  private window: BrowserWindow | null = null
  private server: http.Server | null = null
  private baseUrl = ''
  private session: Session | null = null
  private registered = false
  private serialInstalled = false
  private serialPickerReady = false
  private serialRequest: SerialPortRequest | null = null
  private serialRequestSeq = 0
  private closeGuardReady = false
  private allowClose = false
  private closeGuardTimer: NodeJS.Timeout | undefined

  register(ipcMain: IpcMain): void {
    if (this.registered) return
    this.registered = true

    ipcMain.handle('hmi-designer:open', (event, args: OpenHmiDesignerArgs) => this.open(event, args))

    const fromDesigner = <T>(handler: (session: Session, ...args: unknown[]) => Promise<T> | T) => {
      return async (event: IpcMainInvokeEvent, ...args: unknown[]) => {
        if (!this.isDesigner(event) || !this.session) {
          return { ok: false, error: 'Canal reservado a la ventana del HMI Designer.' }
        }
        return handler(this.session, ...args)
      }
    }
    const onDesigner = (channel: string, handler: (payload: unknown) => void) => {
      ipcMain.on(channel, (event: IpcMainEvent, payload: unknown) => {
        if (this.isDesigner(event)) handler(payload)
      })
    }

    // There is no sketch to choose: the "linked sketch" is the project's hmi/.
    ipcMain.handle(
      'jwplc-hmi:get-linked-sketch',
      fromDesigner((session) => this.linkedInfo(session)),
    )
    ipcMain.handle(
      'jwplc-hmi:select-sketch-directory',
      fromDesigner((session) => this.linkedInfo(session)),
    )
    ipcMain.handle(
      'jwplc-hmi:read-project',
      fromDesigner((session) => this.readProjectText(session)),
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
      'jwplc-hmi:open-sketch-folder',
      fromDesigner(async (session) => {
        await mkdir(session.hmiDir, { recursive: true })
        const error = await shell.openPath(session.hmiDir)
        return error ? { ok: false, error } : { ok: true }
      }),
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

    // Closing with unsaved changes: the Designer asks and then confirms.
    onDesigner('jwplc-hmi:close-guard-ready', () => {
      this.closeGuardReady = true
    })
    onDesigner('jwplc-hmi:close-guard-ack', () => clearTimeout(this.closeGuardTimer))
    onDesigner('jwplc-hmi:close-confirmed', () => {
      this.allowClose = true
      this.window?.close()
    })

    // Serial port picker of the Designer (designer-port-picker.js).
    onDesigner('jwplc-hmi:serial-picker-ready', () => {
      this.serialPickerReady = true
    })
    onDesigner('jwplc-hmi:serial-port-chosen', (payload) => {
      const { requestId, portId } = (payload ?? {}) as { requestId?: number; portId?: string }
      if (this.serialRequest && this.serialRequest.requestId === requestId)
        this.serialRequest.finish(String(portId ?? ''))
    })
  }

  private isDesigner(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
    return Boolean(this.window && !this.window.isDestroyed() && event.sender === this.window.webContents)
  }

  private async open(event: IpcMainInvokeEvent, args: OpenHmiDesignerArgs): Promise<OpenHmiDesignerResult> {
    if (this.isDesigner(event)) {
      return { ok: false, error: 'Canal reservado al editor.' }
    }
    const projectDir = resolve(String(args?.projectPath ?? '').replace(/project\.json$/i, ''))
    if (!args?.projectPath || !existsSync(join(projectDir, 'project.json'))) {
      return { ok: false, error: 'Guarda el proyecto antes de abrir el HMI Designer.' }
    }
    const designer = resolveDesignerRoot()
    if ('error' in designer) return { ok: false, error: designer.error }

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
      // Another project: reload so the Designer starts from that project's hmi/.
      if (!sameProject) await this.window.loadURL(`${this.baseUrl}/desktop.html?host=openplc`)
      this.window.focus()
      return { ok: true }
    }

    await this.startServer(designer.root)
    this.installSerialSupport()
    const owner = BrowserWindow.fromWebContents(event.sender)
    const preload = app.isPackaged
      ? join(__dirname, 'hmi-designer-preload.js')
      : join(__dirname, '../../configs/dll/hmi-designer-preload.js')
    const window = new BrowserWindow({
      width: 1500,
      height: 920,
      title: `JWPLC HMI Designer · ${this.session.projectName}`,
      autoHideMenuBar: true,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        preload,
        partition: DESIGNER_PARTITION,
        backgroundThrottling: false,
      },
    })
    this.window = window
    this.allowClose = false
    this.closeGuardReady = false
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-navigate', (navigation, url) => {
      if (!url.startsWith(this.baseUrl)) navigation.preventDefault()
    })
    window.webContents.on('did-start-navigation', (details) => {
      // The new page registers its close guard and serial picker again.
      if (details.isMainFrame) {
        this.closeGuardReady = false
        this.serialPickerReady = false
      }
    })
    window.on('page-title-updated', (titleEvent) => titleEvent.preventDefault())
    window.on('close', (closeEvent) => {
      if (this.allowClose || !this.closeGuardReady || window.webContents.isCrashed()) return
      // The Designer asks about unsaved changes; if it hangs, close anyway.
      closeEvent.preventDefault()
      window.webContents.send('jwplc-hmi:close-requested')
      clearTimeout(this.closeGuardTimer)
      this.closeGuardTimer = setTimeout(() => {
        this.allowClose = true
        if (!window.isDestroyed()) window.close()
      }, CLOSE_GUARD_TIMEOUT_MS)
    })
    window.on('closed', () => {
      clearTimeout(this.closeGuardTimer)
      this.serialRequest?.finish('')
      this.window = null
      this.server?.close()
      this.server = null
    })
    owner?.once('closed', () => {
      if (!this.window || this.window.isDestroyed()) return
      // OpenPLC is closing: keep the design (no dialog), then close.
      const designerWindow = this.window
      const current = this.session
      void (current ? this.saveOpenProject(current) : Promise.resolve(false)).finally(() => {
        if (!designerWindow.isDestroyed()) designerWindow.destroy()
      })
    })

    await window.loadURL(`${this.baseUrl}/desktop.html?host=openplc`)
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

  /** WebSerial for Live Preview / Live Bridge flashing, with the Designer's own port picker. */
  private installSerialSupport(): void {
    if (this.serialInstalled) return
    this.serialInstalled = true
    const ses = session.fromPartition(DESIGNER_PARTITION)
    ses.setPermissionCheckHandler((_webContents, permission) => permission === 'serial')
    ses.setDevicePermissionHandler((details) => details.deviceType === 'serial')

    ses.on('select-serial-port', (event, portList, webContents, callback) => {
      event.preventDefault()
      this.serialRequest?.finish('')
      if (!this.serialPickerReady || webContents.isDestroyed()) {
        callback('')
        return
      }
      const requestId = ++this.serialRequestSeq
      const ports = new Map(portList.map((port) => [port.portId, port]))
      const request: SerialPortRequest = {
        requestId,
        ports,
        finish: (portId) => {
          if (this.serialRequest !== request) return
          this.serialRequest = null
          callback(portId && ports.has(portId) ? portId : '')
        },
      }
      this.serialRequest = request
      webContents.send('jwplc-hmi:serial-port-request', { requestId, ports: portList.map(describeHmiSerialPort) })
    })

    const sendPortList = () => {
      const request = this.serialRequest
      if (!request || !this.window || this.window.isDestroyed()) return
      this.window.webContents.send('jwplc-hmi:serial-port-list', {
        requestId: request.requestId,
        ports: [...request.ports.values()].map(describeHmiSerialPort),
      })
    }
    ses.on('serial-port-added', (_event, port) => {
      if (!this.serialRequest) return
      this.serialRequest.ports.set(port.portId, port)
      sendPortList()
    })
    ses.on('serial-port-removed', (_event, port) => {
      if (!this.serialRequest) return
      this.serialRequest.ports.delete(port.portId)
      sendPortList()
    })
  }

  private async hmiFileNames(session: Session): Promise<string[]> {
    try {
      return await readdir(session.hmiDir)
    } catch {
      return []
    }
  }

  /** The Designer project to open from hmi/ (JWPLC_HMI.jwhmi, or the only .jwhmi there). */
  private async readProjectText(session: Session) {
    const file = pickJwhmiToLoad(await this.hmiFileNames(session))
    if (!file) return { ok: false, missing: true, fileName: JWPLC_HMI_PROJECT_FILE }
    try {
      const text = await readFile(join(session.hmiDir, file), 'utf-8')
      return { ok: true, text, fileName: file }
    } catch (error) {
      return { ok: false, error: `No se pudo leer ${file}: ${String(error)}`, fileName: file }
    }
  }

  private async readProject(session: Session): Promise<object | null> {
    const result = await this.readProjectText(session)
    if (!result.ok || typeof result.text !== 'string') return null
    try {
      return JSON.parse(result.text) as object
    } catch {
      return null
    }
  }

  private async linkedInfo(session: Session) {
    return describeHmiFolder(session.projectName, session.hmiDir, await this.hmiFileNames(session))
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
    return { ok: true, path: target }
  }

  /**
   * Save the Designer's current design to hmi/ without asking (switching
   * project or closing OpenPLC): the header first, then JWPLC_HMI.jwhmi, so the
   * next compile never finds a design without its header.
   */
  private async saveOpenProject(session: Session): Promise<boolean> {
    if (!this.window || this.window.isDestroyed()) return false
    try {
      const { header, project } = (await this.window.webContents.executeJavaScript(
        `(async () => {
          const api = window.JWPLCHMIProject;
          if (!api || !api.serialize) return { header: '', project: '' };
          let header = '';
          try { header = await window.JWPLCHMIProjectIntegrationFix.buildHeader(); } catch (_) { header = ''; }
          return { header: header || '', project: JSON.stringify(api.serialize(), null, 2) + '\\n' };
        })()`,
        true,
      )) as { header: string; project: string }
      if (!project) return false
      if (header) await this.writeHeader(session, { text: header })
      const result = await this.writeProject(session, { text: project })
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
