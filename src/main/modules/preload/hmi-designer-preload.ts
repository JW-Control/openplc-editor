/**
 * Preload of the JWPLC HMI Designer window (Alpha14 F3, `jwplc-hmi-host/1`).
 * See `src/main/modules/hmi-designer/index.ts` and the contract in
 * platform-jwplc docs/v2.1.0-alpha.14/A14_F3_CONTRATO_HMI_OPENPLC_20261017.md.
 */

import { contextBridge, ipcRenderer } from 'electron'

// Same bridge the Designer uses with its stand-alone .exe.
contextBridge.exposeInMainWorld('JWPLCHMINative', {
  isNative: true,
  selectSketchDirectory: () => ipcRenderer.invoke('jwplc-hmi:select-sketch-directory'),
  getLinkedSketch: () => ipcRenderer.invoke('jwplc-hmi:get-linked-sketch'),
  writeGeneratedHeader: (text: string, overwrite = false) =>
    ipcRenderer.invoke('jwplc-hmi:write-generated-header', { text, overwrite }),
  writeProject: (fileName: string, text: string, overwrite = false) =>
    ipcRenderer.invoke('jwplc-hmi:write-project', { fileName, text, overwrite }),
})

// OpenPLC host: project context, PLC variables and the saved project.
contextBridge.exposeInMainWorld('JWPLCHMIHost', {
  version: 1,
  mode: 'openplc',
  getContext: () => ipcRenderer.invoke('jwplc-hmi-host:get-context'),
  listVariables: () => ipcRenderer.invoke('jwplc-hmi-host:list-variables'),
  loadProject: () => ipcRenderer.invoke('jwplc-hmi-host:load-project'),
})
