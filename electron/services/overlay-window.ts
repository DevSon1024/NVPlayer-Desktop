import { BrowserWindow, screen } from 'electron';
import path from 'node:path';

export interface OverlaySyncState {
  showOverlay: boolean;
  activePlaylist?: {
    playlistId: string;
    playlistName: string;
    itemCount: number;
    currentIndex: number;
  } | null;
  isLooping?: boolean;
  selectedAudioTrack?: { id: number | string; lang?: string; title?: string } | null;
  selectedSubTrack?: { id: number | string; lang?: string; title?: string } | null;
}

/**
 * NativeOverlayWindow manages a dedicated, transparent, frameless Electron BrowserWindow
 * positioned above the native Win32 child HWND used by libmpv.
 *
 * This guarantees the fullscreen floating playback island is never occluded by native Direct3D/mpv surfaces,
 * while maintaining transparent-window click-through for all video areas outside the controls.
 */
export class NativeOverlayWindow {
  private overlayWindow: BrowserWindow | null = null;
  private isFullscreenActive = false;

  public create(getMainWindow: () => BrowserWindow | null, isDev: boolean): BrowserWindow | null {
    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      return this.overlayWindow;
    }

    try {
      this.overlayWindow = new BrowserWindow({
        width: 1920,
        height: 320,
        show: false,
        frame: false,
        transparent: true,
        backgroundColor: '#00000000',
        hasShadow: false,
        resizable: false,
        movable: false,
        skipTaskbar: true,
        alwaysOnTop: true,
        acceptFirstMouse: true,
        focusable: true,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          webSecurity: true,
          allowRunningInsecureContent: false,
          preload: path.join(__dirname, 'preload.js'),
        },
      });

      this.overlayWindow.setAlwaysOnTop(true, 'screen-saver', 1);
      this.overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      this.overlayWindow.setIgnoreMouseEvents(true, { forward: true });

      // Deny unauthorized window creation and navigation
      this.overlayWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      this.overlayWindow.webContents.on('will-navigate', (event) => {
        event.preventDefault();
      });

      if (isDev && process.env.VITE_DEV_SERVER_URL) {
        this.overlayWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}?window=overlay`);
      } else {
        this.overlayWindow.loadFile(path.join(__dirname, '../dist/index.html'), {
          query: { window: 'overlay' },
        });
      }

      this.overlayWindow.on('closed', () => {
        this.overlayWindow = null;
      });

      return this.overlayWindow;
    } catch (err) {
      console.error('[NativeOverlayWindow] Error creating overlay window:', err);
      return null;
    }
  }

  public getWindow(): BrowserWindow | null {
    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      return this.overlayWindow;
    }
    return null;
  }

  public syncBounds(mainWindow: BrowserWindow): void {
    if (!this.overlayWindow || this.overlayWindow.isDestroyed()) return;
    try {
      const display = screen.getDisplayMatching(mainWindow.getBounds());
      const overlayHeight = 320;
      this.overlayWindow.setBounds({
        x: display.bounds.x,
        y: display.bounds.y + display.bounds.height - overlayHeight,
        width: display.bounds.width,
        height: overlayHeight,
      });
    } catch (err) {
      console.error('[NativeOverlayWindow] Failed to sync bounds:', err);
    }
  }

  public showFullscreen(mainWindow: BrowserWindow): void {
    if (!this.overlayWindow || this.overlayWindow.isDestroyed()) return;
    this.isFullscreenActive = true;
    this.syncBounds(mainWindow);
    this.overlayWindow.setAlwaysOnTop(true, 'screen-saver', 1);
    this.overlayWindow.showInactive();
    this.overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  }

  public hideFullscreen(): void {
    this.isFullscreenActive = false;
    if (!this.overlayWindow || this.overlayWindow.isDestroyed()) return;
    this.overlayWindow.hide();
    this.overlayWindow.setIgnoreMouseEvents(true);
  }

  public isFullscreen(): boolean {
    return this.isFullscreenActive;
  }

  public setIgnoreMouse(ignore: boolean, forward?: boolean): void {
    if (!this.overlayWindow || this.overlayWindow.isDestroyed()) return;
    try {
      this.overlayWindow.setIgnoreMouseEvents(ignore, { forward: Boolean(forward) });
    } catch (err) {
      console.error('[NativeOverlayWindow] Failed to setIgnoreMouseEvents:', err);
    }
  }

  public send(channel: string, ...args: unknown[]): void {
    if (!this.overlayWindow || this.overlayWindow.isDestroyed()) return;
    try {
      this.overlayWindow.webContents.send(channel, ...args);
    } catch (err) {
      console.error(`[NativeOverlayWindow] Failed to send on channel ${channel}:`, err);
    }
  }

  public destroy(): void {
    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      try {
        this.overlayWindow.destroy();
      } catch (err) {
        console.error('[NativeOverlayWindow] Error destroying overlay window:', err);
      } finally {
        this.overlayWindow = null;
      }
    }
  }
}
