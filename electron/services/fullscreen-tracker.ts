import { BrowserWindow, screen } from 'electron';

let fullscreenActivityTimer: NodeJS.Timeout | null = null;
let lastCursorPos = { x: -1, y: -1 };

export function startFullscreenActivityTracker(getMainWindow: () => BrowserWindow | null): void {
  stopFullscreenActivityTracker();
  try {
    lastCursorPos = screen.getCursorScreenPoint();
  } catch {
    lastCursorPos = { x: -1, y: -1 };
  }

  fullscreenActivityTimer = setInterval(() => {
    const mainWindow = getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.isFullScreen()) {
      stopFullscreenActivityTracker();
      return;
    }
    try {
      const current = screen.getCursorScreenPoint();
      if (current.x !== lastCursorPos.x || current.y !== lastCursorPos.y) {
        lastCursorPos = current;
        const bounds = mainWindow.getBounds();
        const isInside =
          current.x >= bounds.x &&
          current.x <= bounds.x + bounds.width &&
          current.y >= bounds.y &&
          current.y <= bounds.y + bounds.height;
        if (isInside) {
          mainWindow.webContents.send('window:user-active');
        }
      }
    } catch {
      // Screen query may fail if displays change
    }
  }, 150);
  fullscreenActivityTimer.unref();
}

export function stopFullscreenActivityTracker(): void {
  if (fullscreenActivityTimer) {
    clearInterval(fullscreenActivityTimer);
    fullscreenActivityTimer = null;
  }
}
