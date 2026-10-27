/**
 * Preload of the JWPLC HMI Designer page in the OpenPLC tab (`jwplc-hmi-host/1`,
 * bridge 1.1), forced on its `<webview>` by the main process.
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
  // The Designer runs inside an OpenPLC tab (not in a window of its own).
  embedded: true,
  getContext: () => ipcRenderer.invoke('jwplc-hmi-host:get-context'),
  listVariables: () => ipcRenderer.invoke('jwplc-hmi-host:list-variables'),
  loadProject: () => ipcRenderer.invoke('jwplc-hmi-host:load-project'),
  // The project's variables changed in OpenPLC: call listVariables again.
  onVariablesChanged: (callback: () => void) => {
    ipcRenderer.on('jwplc-hmi-host:variables-changed', () => callback())
  },
  // Unsaved changes of the design, shown on the OpenPLC tab.
  setDirty: (dirty: boolean) => ipcRenderer.send('jwplc-hmi-host:dirty', Boolean(dirty)),
})
