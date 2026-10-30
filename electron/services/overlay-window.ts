import { BrowserWindow, screen } from 'electron';
import path from 'node:path';
import koffi from 'koffi';

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

interface User32OverlayFunctions {
  GetWindowLongW: (hWnd: bigint | number, nIndex: number) => number;
  SetWindowLongW: (hWnd: bigint | number, nIndex: number, dwNewLong: number) => number;
  SetWindowPos: (
    hWnd: bigint | number,
    hWndInsertAfter: bigint | number,
    X: number,
    Y: number,
    cx: number,
    cy: number,
    uFlags: number
  ) => boolean;
}

const GWL_EXSTYLE = -20;
const WS_EX_TOPMOST = 0x00000008;
const WS_EX_TOOLWINDOW = 0x00000080;
const WS_EX_NOACTIVATE = 0x08000000;

const SWP_NOSIZE = 0x0001;
const SWP_NOMOVE = 0x0002;
const SWP_NOZORDER = 0x0004;
const SWP_NOACTIVATE = 0x0010;
const SWP_FRAMECHANGED = 0x0020;

const OVERLAY_WIDTH = 580;
const OVERLAY_HEIGHT = 310;

let user32Instance: User32OverlayFunctions | null = null;

function getUser32(): User32OverlayFunctions | null {
  if (process.platform !== 'win32') return null;
  if (user32Instance) return user32Instance;
  try {
    const user32 = koffi.load('user32.dll');
    user32Instance = {
      GetWindowLongW: user32.func('int32_t GetWindowLongW(intptr_t hWnd, int nIndex)'),
      SetWindowLongW: user32.func('int32_t SetWindowLongW(intptr_t hWnd, int nIndex, int32_t dwNewLong)'),
      SetWindowPos: user32.func(
        'bool SetWindowPos(intptr_t hWnd, intptr_t hWndInsertAfter, int X, int Y, int cx, int cy, uint32_t uFlags)'
      ),
    };
    return user32Instance;
  } catch (err) {
    console.warn('[NativeOverlayWindow] Failed to bind user32.dll for non-activating style:', err);
    return null;
  }
}

/**
 * NativeOverlayWindow manages a dedicated, transparent, frameless Electron BrowserWindow
 * positioned above the native Win32 child HWND used by libmpv.
 *
 * It uses a compact 580x310 layout with focusable: false and Win32 WS_EX_NOACTIVATE,
 * ensuring mouse interactions on the island and its expanded More Options popover never
 * steal focus or trigger the Windows taskbar during fullscreen playback.
 */
export class NativeOverlayWindow {
  private overlayWindow: BrowserWindow | null = null;
  private overlayHwnd: bigint | null = null;
  private isFullscreenActive = false;

  private applyNonActivatingStyle(): void {
    if (process.platform !== 'win32' || !this.overlayHwnd) return;
    try {
      const u32 = getUser32();
      if (!u32) return;
      const currentExStyle = u32.GetWindowLongW(this.overlayHwnd, GWL_EXSTYLE);
      const targetExStyle = currentExStyle | WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW | WS_EX_TOPMOST;
      if (currentExStyle !== targetExStyle) {
        u32.SetWindowLongW(this.overlayHwnd, GWL_EXSTYLE, targetExStyle);
        u32.SetWindowPos(
          this.overlayHwnd,
          0,
          0,
          0,
          0,
          0,
          SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED
        );
      }
    } catch (err) {
      console.warn('[NativeOverlayWindow] Error applying WS_EX_NOACTIVATE style:', err);
    }
  }

  public create(getMainWindow: () => BrowserWindow | null, isDev: boolean): BrowserWindow | null {
    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      return this.overlayWindow;
    }

    try {
      this.overlayWindow = new BrowserWindow({
        width: OVERLAY_WIDTH,
        height: OVERLAY_HEIGHT,
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
        focusable: false,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          webSecurity: true,
          allowRunningInsecureContent: false,
          preload: path.join(__dirname, 'preload.js'),
        },
      });

      this.overlayWindow.setAlwaysOnTop(true, 'pop-up-menu');
      this.overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      this.overlayWindow.setIgnoreMouseEvents(true, { forward: true });

      try {
        this.overlayHwnd = this.overlayWindow.getNativeWindowHandle().readBigInt64LE();
        this.applyNonActivatingStyle();
      } catch (err) {
        console.warn('[NativeOverlayWindow] Could not obtain native HWND:', err);
      }

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
        this.overlayHwnd = null;
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
      const x = Math.round(display.bounds.x + (display.bounds.width - OVERLAY_WIDTH) / 2);
      const y = Math.round(display.bounds.y + display.bounds.height - OVERLAY_HEIGHT);
      this.overlayWindow.setBounds({
        x,
        y,
        width: OVERLAY_WIDTH,
        height: OVERLAY_HEIGHT,
      });
    } catch (err) {
      console.error('[NativeOverlayWindow] Failed to sync bounds:', err);
    }
  }

  public showFullscreen(mainWindow: BrowserWindow): void {
    if (!this.overlayWindow || this.overlayWindow.isDestroyed()) return;
    this.isFullscreenActive = true;
    this.syncBounds(mainWindow);
    this.overlayWindow.setAlwaysOnTop(true, 'pop-up-menu');
    this.applyNonActivatingStyle();
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
      this.applyNonActivatingStyle();
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
        this.overlayHwnd = null;
      }
    }
  }
}
