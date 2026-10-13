import { BrowserWindow, IpcMainInvokeEvent } from 'electron';

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
  if (event.sender.id !== mainWindow.webContents.id) {
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
