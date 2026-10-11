import { contextBridge, ipcRenderer } from 'electron';

/**
 * Public, minimal API exposed to the renderer via contextBridge.
 * Raw IPC and Node.js primitives are strictly withheld.
 */
export interface NosvedAPI {
  getAppInfo: () => Promise<{
    name: string;
    version: string;
    isPackaged: boolean;
    platform: string;
    arch: string;
  }>;
  getSecurityState: () => Promise<{
    contextIsolated: boolean;
    nodeIntegrationDisabled: boolean;
    sandboxEnabled: boolean;
  }>;
  ping: () => Promise<{
    status: string;
    timestamp: number;
  }>;
  testNativeMpv: () => Promise<{
    success: boolean;
    stage: string;
    apiVersion?: {
      raw: number;
      major: number;
      minor: number;
      formatted: string;
    };
    error?: string;
    errorCode?: number;
  }>;
}

const api: NosvedAPI = {
  getAppInfo: () => ipcRenderer.invoke('app:get-info'),
  getSecurityState: () => ipcRenderer.invoke('app:get-security-state'),
  ping: () => ipcRenderer.invoke('app:ping'),
  testNativeMpv: () => ipcRenderer.invoke('app:test-native-mpv'),
};

contextBridge.exposeInMainWorld('nosvedAPI', api);
