/**
 * Editor DevicePort adapter — delegates to Electron IPC bridge.
 *
 * Communicates with the main process HardwareModule which reads HAL
 * JSON files from resources/sources/boards/ and queries arduino-cli
 * for installed cores. Board preview images are returned as base64
 * data URIs from the local filesystem.
 *
 * IPC channels:
 *   hardware:get-available-boards              (invoke)
 *   hardware:get-available-communication-ports  (invoke)
 *   hardware:refresh-available-boards           (invoke)
 *   hardware:refresh-communication-ports        (invoke)
 *   util:get-preview-image                      (invoke)
 *   hmi-designer:prepare                        (invoke)
 *   hmi-designer:open-window                    (invoke)
 *   hmi-designer:update-variables               (invoke)
 *   hmi-designer:save                           (invoke)
 *   hmi-designer:dirty                          (on)
 *   device:read-license                         (invoke)
 *   device:refresh-license                      (invoke)
 */

import type { HmiHostVariable } from '../../../backend/shared/compile/jwplc-hmi-host'
import type {
  DeviceConnectionStatusPayload,
  DeviceConnectResult,
  DeviceLicenseReport,
  DeviceLicenseRequest,
  DevicePort,
  JwplcDeviceDiscoveryResult,
  OpenHmiDesignerArgs,
  OpenHmiDesignerResult,
  OpenInJwplcSimResult,
  PrepareHmiDesignerResult,
} from '../../shared/ports/device-port'
import type { BoardInfo, CommunicationPort, DebugConnectionConfig } from '../../shared/ports/types'
import { buildVendorDocumentUrl } from '../../shared/vendor-document/document-url'

export function createEditorDeviceAdapter(): DevicePort {
  return {
    getAvailableBoards(): Promise<Map<string, BoardInfo>> {
      return window.bridge.getAvailableBoards()
    },

    getCommunicationPorts(): Promise<CommunicationPort[]> {
      return window.bridge.getAvailableCommunicationPorts()
    },

    refreshBoards(): Promise<Array<{ board: string; version: string }>> {
      return window.bridge.refreshAvailableBoards()
    },

    refreshCommunicationPorts(): Promise<CommunicationPort[]> {
      return window.bridge.refreshCommunicationPorts()
    },

    discoverJwplcDevices(): Promise<JwplcDeviceDiscoveryResult> {
      return window.bridge.discoverJwplcDevices() as Promise<JwplcDeviceDiscoveryResult>
    },

    getPreviewImage(imageName: string, packagePath?: string): Promise<string> {
      return window.bridge.getPreviewImage(imageName, packagePath)
    },

    openInJwplcSim(projectPath: string): Promise<OpenInJwplcSimResult> {
      return window.bridge.openInJwplcSim(projectPath)
    },

    prepareHmiDesigner(args: OpenHmiDesignerArgs): Promise<PrepareHmiDesignerResult> {
      return window.bridge.prepareHmiDesigner(args)
    },

    openHmiDesignerWindow(args: OpenHmiDesignerArgs): Promise<OpenHmiDesignerResult> {
      return window.bridge.openHmiDesignerWindow(args)
    },

    updateHmiDesignerVariables(variables: HmiHostVariable[]): Promise<{ ok: boolean }> {
      return window.bridge.updateHmiDesignerVariables(variables)
    },

    saveHmiDesigner(): Promise<{ ok: boolean }> {
      return window.bridge.saveHmiDesigner()
    },

    onHmiDesignerDirty(callback: (dirty: boolean) => void): () => void {
      return window.bridge.onHmiDesignerDirty(callback)
    },

    getVendorDocumentUrl(packageId: string, relPath: string): string | null {
      return buildVendorDocumentUrl(packageId, relPath)
    },

    connect(candidates: DebugConnectionConfig[]): Promise<DeviceConnectResult> {
      return window.bridge.deviceConnect(candidates)
    },

    openRuntimeSession(params: { address: string; debug: DebugConnectionConfig }): Promise<{
      success: boolean
      error?: string
    }> {
      return window.bridge.openRuntimeSession(params)
    },

    closeRuntimeSession(): Promise<{ success: boolean }> {
      return window.bridge.closeRuntimeSession()
    },

    async releaseSerialPort(port: string | null | undefined): Promise<boolean> {
      const result = await window.bridge.deviceReleaseSerialPort(port)
      return result.released
    },

    disconnect(): Promise<{ success: boolean }> {
      return window.bridge.deviceDisconnect()
    },

    readLicense(request: DeviceLicenseRequest): Promise<DeviceLicenseReport> {
      return window.bridge.deviceReadLicense(request)
    },

    refreshLicense(request: DeviceLicenseRequest): Promise<DeviceLicenseReport> {
      return window.bridge.deviceRefreshLicense(request)
    },

    onLinkLog(callback: (message: string) => void): () => void {
      return window.bridge.onDeviceLinkLog(callback)
    },

    onConnectionStatus(callback: (payload: DeviceConnectionStatusPayload) => void): () => void {
      return window.bridge.onDeviceConnectionStatus(callback)
    },

    onPlcState(callback: (payload: { port: string; plcState?: number; switchPosition?: number }) => void): () => void {
      return window.bridge.onDevicePlcState(callback)
    },
  }
}
