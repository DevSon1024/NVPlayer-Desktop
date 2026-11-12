import { BrowserWindow, IpcMainInvokeEvent } from 'electron';

let overlayWindowGetter: (() => BrowserWindow | null) | null = null;

export function registerOverlayWindowGetter(getter: () => BrowserWindow | null): void {
  overlayWindowGetter = getter;
}

/**
 * Strict sender validation to prevent unauthorized IPC calls
 * from iframes, child windows, or unexpected origins.
 */
export function validateIpcSender(
  event: IpcMainInvokeEvent,
  mainWindow: BrowserWindow | null,
  isDev: boolean
): boolean {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return false;
  }
  const overlayWin = overlayWindowGetter ? overlayWindowGetter() : null;
  const isMain = event.sender.id === mainWindow.webContents.id;
  const isOverlay = Boolean(
    overlayWin && !overlayWin.isDestroyed() && event.sender.id === overlayWin.webContents.id
  );

  if (!isMain && !isOverlay) {
    return false;
  }

  const frameUrl = event.senderFrame?.url;
  if (!frameUrl) {
    return false;
  }

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    const devUrl = process.env.VITE_DEV_SERVER_URL;
    return (
      frameUrl.startsWith(devUrl) ||
      frameUrl.startsWith('http://localhost:') ||
      frameUrl.startsWith('http://127.0.0.1:')
    );
  }

  return frameUrl.startsWith('file://');
}
