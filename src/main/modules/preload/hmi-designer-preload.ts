/**
 * Preload of the JWPLC HMI Designer pages hosted by OpenPLC (`jwplc-hmi-host/1`,
 * bridge 1.4): the editor window and the binding view of the OpenPLC tab (its
 * `<webview>` gets it forced by the main process).
 * See `src/main/modules/hmi-designer/index.ts` and the contract in
 * platform-jwplc docs/v2.1.0-alpha.14/A14_F3_CONTRATO_HMI_OPENPLC_20261017.md.
 */

import { contextBridge, ipcRenderer } from 'electron'

type SerialPickerHandlers = {
  onRequest: (request: unknown) => void
  onList: (update: unknown) => void
}

// Same bridge the Designer uses with its stand-alone .exe (electron/preload.cjs),
// without the sketch-only calls: the "linked sketch" is the project's hmi/.
contextBridge.exposeInMainWorld('JWPLCHMINative', {
  isNative: true,
  selectSketchDirectory: () => ipcRenderer.invoke('jwplc-hmi:select-sketch-directory'),
  getLinkedSketch: () => ipcRenderer.invoke('jwplc-hmi:get-linked-sketch'),
  readProject: () => ipcRenderer.invoke('jwplc-hmi:read-project'),
  writeGeneratedHeader: (text: string, overwrite = false) =>
    ipcRenderer.invoke('jwplc-hmi:write-generated-header', { text, overwrite }),
  writeProject: (fileName: string, text: string, overwrite = false) =>
    ipcRenderer.invoke('jwplc-hmi:write-project', { fileName, text, overwrite }),
  openSketchFolder: () => ipcRenderer.invoke('jwplc-hmi:open-sketch-folder'),
  // Closing the editor window with unsaved changes (designer-save-flow.js).
  registerCloseGuard: (onCloseRequested: () => void) => {
    ipcRenderer.on('jwplc-hmi:close-requested', () => {
      ipcRenderer.send('jwplc-hmi:close-guard-ack')
      onCloseRequested()
    })
    ipcRenderer.send('jwplc-hmi:close-guard-ready')
  },
  confirmClose: () => ipcRenderer.send('jwplc-hmi:close-confirmed'),
  // Serial port picker (designer-port-picker.js) for Live Preview and flashing.
  registerSerialPortPicker: ({ onRequest, onList }: SerialPickerHandlers) => {
    ipcRenderer.on('jwplc-hmi:serial-port-request', (_event, request: unknown) => onRequest(request))
    ipcRenderer.on('jwplc-hmi:serial-port-list', (_event, update: unknown) => onList(update))
    ipcRenderer.send('jwplc-hmi:serial-picker-ready')
  },
  chooseSerialPort: (requestId: number, portId?: string) =>
    ipcRenderer.send('jwplc-hmi:serial-port-chosen', { requestId, portId: portId || '' }),
})

// OpenPLC host: project context, PLC variables and the saved project.
contextBridge.exposeInMainWorld('JWPLCHMIHost', {
  version: 1,
  mode: 'openplc',
  getContext: () => ipcRenderer.invoke('jwplc-hmi-host:get-context'),
  listVariables: () => ipcRenderer.invoke('jwplc-hmi-host:list-variables'),
  loadProject: () => ipcRenderer.invoke('jwplc-hmi-host:load-project'),
  // The project's variables changed in OpenPLC: call listVariables again.
  onVariablesChanged: (callback: () => void) => {
    ipcRenderer.on('jwplc-hmi-host:variables-changed', () => callback())
  },
  // Unsaved changes of the design, shown on the OpenPLC tab.
  setDirty: (dirty: boolean) => ipcRenderer.send('jwplc-hmi-host:dirty', Boolean(dirty)),
  // Binding view: "Editar diseño…" opens the editor window; while it is open the view is read-only.
  openEditor: () => ipcRenderer.invoke('jwplc-hmi-host:open-editor'),
  onEditorWindow: (callback: (open: boolean) => void) => {
    ipcRenderer.on('jwplc-hmi-host:editor-window', (_event, open: boolean) => callback(Boolean(open)))
  },
})
