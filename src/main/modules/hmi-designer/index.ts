/**
 * JWPLC HMI Designer hosted by OpenPLC (`jwplc-hmi-host/1`, bridge 1.4).
 *
 * The Designer (the same web files as the stand-alone .exe), served read-only
 * from 127.0.0.1, appears in two places:
 *
 * - the editor window: the full Designer in a window of its own, to draw the
 *   screen (`desktop.html?host=openplc`);
 * - the "HMI Designer" tab of OpenPLC: a `<webview>` with the cut-down binding
 *   view (`…&view=enlaces`): preview, page tabs, object tree and "Variable PLC".
 *   While the editor window is open the tab is read-only and reloads each time
 *   the window saves.
 *
 * Both pages get a preload that exposes:
 *
 * - `window.JWPLCHMINative`: the bridge the Designer uses with its .exe. Here
 *   the "linked sketch" is always the open OpenPLC project's `hmi/` folder:
 *   "Actualizar HMI" / Save write the header and `JWPLC_HMI.jwhmi` there, the
 *   Designer opens that project itself (`readProject`) and picks serial ports
 *   with its own dialog (Live). Unsaved changes show on the tab like any
 *   OpenPLC file, and OpenPLC's Save writes the design too.
 *   Sketch-only calls (create/change sketch, recent projects, Arduino IDE)
 *   are not exposed: the Designer hides them in OpenPLC mode.
 * - `window.JWPLCHMIHost`: project context and PLC variables (`listVariables`,
 *   refreshed when the project's variables change) for the Designer's OpenPLC
 *   mode.
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

import {
  app,
  BrowserWindow,
  IpcMain,
  IpcMainEvent,
  IpcMainInvokeEvent,
  session,
  shell,
  type WebContents,
} from 'electron'

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
import type { OpenHmiDesignerArgs, PrepareHmiDesignerResult } from '../../../middleware/shared/ports/device-port'

const HEADER_MARKER = '// Código generado por JWPLC HMI Designer'
const MAX_FILE_BYTES = 8 * 1024 * 1024
// Own session: the serial permissions and port picker apply only to the Designer.
const DESIGNER_PARTITION = 'persist:jwplc-hmi-designer'
// Files that only exist in a Designer with the flow this host expects.
const REQUIRED_DESIGNER_FILES = ['desktop.html', 'designer-save-flow.js', 'designer-openplc-host.js']
const SAVE_ON_QUIT_TIMEOUT_MS = 3000
const CLOSE_GUARD_TIMEOUT_MS = 2000
const TAB_RELOAD_DELAY_MS = 400

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
  page: WebContents
  finish: (portId: string) => void
}

type DesignerRoot = { root: string } | { error: string }

const designerPreloadPath = () =>
  app.isPackaged
    ? join(__dirname, 'hmi-designer-preload.js')
    : join(__dirname, '../../configs/dll/hmi-designer-preload.js')

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
  /** The full Designer, in its own window. */
  private window: BrowserWindow | null = null
  /** The binding view: the `<webview>` of the HMI Designer tab. */
  private tab: WebContents | null = null
  /** The OpenPLC renderer that owns the tab. */
  private owner: WebContents | null = null
  private server: http.Server | null = null
  private baseUrl = ''
  private session: Session | null = null
  private registered = false
  private serialInstalled = false
  private serialPickerReady = new WeakSet<WebContents>()
  private serialRequest: SerialPortRequest | null = null
  private serialRequestSeq = 0
  private closeGuardReady = false
  private allowClose = false
  private closeGuardTimer: NodeJS.Timeout | undefined
  private tabReloadTimer: NodeJS.Timeout | undefined
  private dirty = { window: false, tab: false }

  register(ipcMain: IpcMain): void {
    if (this.registered) return
    this.registered = true

    const fromEditor = <T>(handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<T> | T) => {
      return async (event: IpcMainInvokeEvent, ...args: unknown[]) => {
        if (this.pageOf(event.sender)) return { ok: false, error: 'Canal reservado al editor.' }
        return handler(event, ...args)
      }
    }
    ipcMain.handle(
      'hmi-designer:prepare',
      fromEditor((event, args) => this.prepare(event.sender, args as OpenHmiDesignerArgs)),
    )
    ipcMain.handle(
      'hmi-designer:open-window',
      fromEditor(async (event, args) => {
        const prepared = await this.prepare(event.sender, args as OpenHmiDesignerArgs)
        if (!prepared.ok) return prepared
        await this.openWindow(event.sender)
        return { ok: true }
      }),
    )
    ipcMain.handle(
      'hmi-designer:update-variables',
      fromEditor((_event, variables) => this.updateVariables(variables)),
    )
    ipcMain.handle(
      'hmi-designer:save',
      fromEditor(async () => ({ ok: await this.saveCurrent() })),
    )

    const fromDesigner = <T>(handler: (session: Session, page: WebContents, ...args: unknown[]) => Promise<T> | T) => {
      return async (event: IpcMainInvokeEvent, ...args: unknown[]) => {
        if (!this.pageOf(event.sender) || !this.session) {
          return { ok: false, error: 'Canal reservado al HMI Designer.' }
        }
        return handler(this.session, event.sender, ...args)
      }
    }
    const onDesigner = (channel: string, handler: (page: WebContents, payload: unknown) => void) => {
      ipcMain.on(channel, (event: IpcMainEvent, payload: unknown) => {
        if (this.pageOf(event.sender)) handler(event.sender, payload)
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
      fromDesigner((session, page, payload) => this.whenEditable(page, () => this.writeHeader(session, payload))),
    )
    ipcMain.handle(
      'jwplc-hmi:write-project',
      fromDesigner(async (session, page, payload) => {
        const result = await this.whenEditable(page, () => this.writeProject(session, payload))
        // The binding view shows what the editor window just saved.
        if (result.ok && this.pageOf(page) === 'window') this.reloadTabSoon()
        return result
      }),
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
    // "Editar diseño…" of the binding view.
    ipcMain.handle(
      'jwplc-hmi-host:open-editor',
      fromDesigner(async () => {
        if (this.owner && !this.owner.isDestroyed()) await this.openWindow(this.owner)
        return { ok: true }
      }),
    )

    // Unsaved changes of the design: the OpenPLC tab shows them like any other file.
    onDesigner('jwplc-hmi-host:dirty', (page, payload) => {
      const which = this.pageOf(page)
      if (which) this.dirty[which] = Boolean(payload)
      this.sendDirty()
    })

    // Closing the editor window with unsaved changes (designer-save-flow.js).
    onDesigner('jwplc-hmi:close-guard-ready', (page) => {
      if (this.pageOf(page) === 'window') this.closeGuardReady = true
    })
    onDesigner('jwplc-hmi:close-guard-ack', () => clearTimeout(this.closeGuardTimer))
    onDesigner('jwplc-hmi:close-confirmed', (page) => {
      if (this.pageOf(page) !== 'window') return
      this.allowClose = true
      this.window?.close()
    })

    // Serial port picker of the Designer (designer-port-picker.js).
    onDesigner('jwplc-hmi:serial-picker-ready', (page) => {
      this.serialPickerReady.add(page)
    })
    onDesigner('jwplc-hmi:serial-port-chosen', (_page, payload) => {
      const { requestId, portId } = (payload ?? {}) as { requestId?: number; portId?: string }
      if (this.serialRequest && this.serialRequest.requestId === requestId)
        this.serialRequest.finish(String(portId ?? ''))
    })
  }

  /**
   * The OpenPLC window hosts the binding view in a `<webview>`: only the
   * Designer page served by this host may attach, always with the Designer
   * preload and its own partition.
   */
  attachTo(window: BrowserWindow): void {
    window.webContents.on('will-attach-webview', (event, webPreferences, params) => {
      if (!this.baseUrl || !params.src.startsWith(`${this.baseUrl}/`)) {
        event.preventDefault()
        return
      }
      webPreferences.preload = designerPreloadPath()
      webPreferences.partition = DESIGNER_PARTITION
      webPreferences.sandbox = true
      webPreferences.contextIsolation = true
      webPreferences.nodeIntegration = false
      params.partition = DESIGNER_PARTITION
    })
    window.webContents.on('did-attach-webview', (_event, guest) => this.adoptTab(guest))
  }

  /** Save the open design before OpenPLC closes (no dialog, like the files of the project). */
  async flush(timeoutMs = SAVE_ON_QUIT_TIMEOUT_MS): Promise<void> {
    if (!this.session) return
    await Promise.race([this.saveCurrent(), new Promise((resolveTimeout) => setTimeout(resolveTimeout, timeoutMs))])
  }

  private live(page: WebContents | null | undefined): page is WebContents {
    return Boolean(page && !page.isDestroyed())
  }

  private pageOf(sender: WebContents): 'window' | 'tab' | null {
    if (this.window && !this.window.isDestroyed() && sender === this.window.webContents) return 'window'
    if (this.live(this.tab) && sender === this.tab) return 'tab'
    return null
  }

  private windowOpen(): boolean {
    return Boolean(this.window && !this.window.isDestroyed())
  }

  /** While the editor window is open, the binding view does not write hmi/. */
  private async whenEditable<T extends { ok: boolean }>(page: WebContents, write: () => Promise<T>) {
    if (this.pageOf(page) === 'tab' && this.windowOpen()) {
      return { ok: false, error: 'El diseño está abierto en la ventana del HMI Designer.' } as unknown as T
    }
    return write()
  }

  private sendDirty(): void {
    if (this.live(this.owner)) this.owner.send('hmi-designer:dirty', this.dirty.window || this.dirty.tab)
  }

  private sendEditorWindowState(): void {
    if (this.live(this.tab)) this.tab.send('jwplc-hmi-host:editor-window', this.windowOpen())
  }

  private reloadTabSoon(): void {
    clearTimeout(this.tabReloadTimer)
    this.tabReloadTimer = setTimeout(() => {
      if (this.live(this.tab)) this.tab.reloadIgnoringCache()
    }, TAB_RELOAD_DELAY_MS)
  }

  private guardNavigation(page: WebContents): void {
    page.setWindowOpenHandler(() => ({ action: 'deny' }))
    page.on('will-navigate', (navigation, url) => {
      if (!url.startsWith(this.baseUrl)) navigation.preventDefault()
    })
    page.on('did-start-navigation', (details) => {
      // The new page registers its serial picker (and close guard) again.
      if (!details.isMainFrame) return
      this.serialPickerReady.delete(page)
      if (this.pageOf(page) === 'window') this.closeGuardReady = false
    })
  }

  private adoptTab(guest: WebContents): void {
    this.tab = guest
    this.dirty.tab = false
    this.guardNavigation(guest)
    guest.on('did-finish-load', () => this.sendEditorWindowState())
    guest.once('destroyed', () => {
      if (this.tab !== guest) return
      this.tab = null
      this.dirty.tab = false
      this.sendDirty()
      if (this.serialRequest?.page === guest) this.serialRequest.finish('')
    })
  }

  /** Link the Designer to the open project; the tab then loads the returned URL. */
  private async prepare(owner: WebContents, args: OpenHmiDesignerArgs): Promise<PrepareHmiDesignerResult> {
    const projectDir = resolve(String(args?.projectPath ?? '').replace(/project\.json$/i, ''))
    if (!args?.projectPath || !existsSync(join(projectDir, 'project.json'))) {
      return { ok: false, error: 'Guarda el proyecto antes de abrir el HMI Designer.' }
    }
    const designer = resolveDesignerRoot()
    if ('error' in designer) return { ok: false, error: designer.error }

    const previous = this.session
    if (previous && previous.projectDir !== projectDir) {
      // Another project: keep the previous design and start the window over.
      await this.saveCurrent()
      if (this.windowOpen()) this.window?.destroy()
    }
    this.owner = owner
    this.session = {
      projectDir,
      hmiDir: join(projectDir, JWPLC_HMI_PROJECT_DIR),
      projectName: String(args.projectName || 'proyecto'),
      device: String(args.device || ''),
      variables: Array.isArray(args.variables) ? args.variables : [],
    }
    await this.startServer(designer.root)
    this.installSerialSupport()
    return { ok: true, url: `${this.baseUrl}/desktop.html?host=openplc&view=enlaces` }
  }

  /** The project's variables changed in the editor: both Designer pages ask for them again. */
  private updateVariables(variables: unknown): { ok: boolean } {
    if (!this.session || !Array.isArray(variables)) return { ok: false }
    this.session.variables = variables as HmiHostVariable[]
    if (this.live(this.tab)) this.tab.send('jwplc-hmi-host:variables-changed')
    if (this.windowOpen()) this.window?.webContents.send('jwplc-hmi-host:variables-changed')
    return { ok: true }
  }

  /** OpenPLC's Save: the editor window when it is open, otherwise the binding view. */
  private async saveCurrent(): Promise<boolean> {
    const session = this.session
    if (!session) return true
    if (this.windowOpen()) {
      const saved = await this.saveOpenProject(session, this.window!.webContents)
      if (saved) this.reloadTabSoon()
      return saved
    }
    return this.live(this.tab) ? this.saveOpenProject(session, this.tab) : true
  }

  /** The full Designer in its own window ("Editar diseño…", the tree leaf). */
  private async openWindow(owner: WebContents): Promise<void> {
    if (this.windowOpen()) {
      this.window?.focus()
      return
    }
    const session = this.session
    if (!session) return
    // What the binding view has (links not saved yet) is what the window opens.
    if (this.live(this.tab) && this.dirty.tab) await this.saveOpenProject(session, this.tab)

    const parent = BrowserWindow.fromWebContents(owner)
    const window = new BrowserWindow({
      width: 1500,
      height: 920,
      title: `JWPLC HMI Designer · ${session.projectName}`,
      autoHideMenuBar: true,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        preload: designerPreloadPath(),
        partition: DESIGNER_PARTITION,
        backgroundThrottling: false,
      },
    })
    this.window = window
    this.allowClose = false
    this.closeGuardReady = false
    this.dirty.window = false
    this.guardNavigation(window.webContents)
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
      if (this.serialRequest?.page && this.serialRequest.page.isDestroyed()) this.serialRequest.finish('')
      if (this.window === window) this.window = null
      this.dirty.window = false
      this.sendDirty()
      this.sendEditorWindowState()
      // Back in OpenPLC: the binding view shows the design as the window left it.
      this.reloadTabSoon()
    })
    parent?.once('closed', () => {
      if (!window.isDestroyed()) window.destroy()
    })

    this.sendEditorWindowState()
    await window.loadURL(`${this.baseUrl}/desktop.html?host=openplc`)
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
      if (!this.serialPickerReady.has(webContents) || webContents.isDestroyed()) {
        callback('')
        return
      }
      const requestId = ++this.serialRequestSeq
      const ports = new Map(portList.map((port) => [port.portId, port]))
      const request: SerialPortRequest = {
        requestId,
        ports,
        page: webContents,
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
      if (!request || request.page.isDestroyed()) return
      request.page.send('jwplc-hmi:serial-port-list', {
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
   * Save the design of one Designer page to hmi/ without asking (Save in
   * OpenPLC, switching project or closing OpenPLC): the header first, then
   * JWPLC_HMI.jwhmi, so the next compile never finds a design without its
   * header. The Designer then counts it as saved.
   */
  private async saveOpenProject(session: Session, guest: WebContents): Promise<boolean> {
    if (guest.isDestroyed()) return false
    try {
      const { header, project } = (await guest.executeJavaScript(
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
      if (result.ok && !guest.isDestroyed()) {
        await guest.executeJavaScript('window.JWPLCHMISaveFlow && window.JWPLCHMISaveFlow.markSaved()', true)
      }
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
