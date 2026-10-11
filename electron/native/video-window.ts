import koffi from 'koffi';

export interface VideoWindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  visible?: boolean;
}

export interface User32Functions {
  CreateWindowExW: (
    dwExStyle: number,
    lpClassName: string,
    lpWindowName: string,
    dwStyle: number,
    X: number,
    Y: number,
    nWidth: number,
    nHeight: number,
    hWndParent: bigint | number,
    hMenu: bigint | number,
    hInstance: bigint | number,
    lpParam: unknown
  ) => bigint | number;
  DestroyWindow: (hWnd: bigint | number) => boolean;
  SetWindowPos: (
    hWnd: bigint | number,
    hWndInsertAfter: bigint | number,
    X: number,
    Y: number,
    cx: number,
    cy: number,
    uFlags: number
  ) => boolean;
  ShowWindow: (hWnd: bigint | number, nCmdShow: number) => boolean;
  IsWindow: (hWnd: bigint | number) => boolean;
}

// Win32 Window Styles & Flags
export const WS_CHILD = 0x40000000;
export const WS_VISIBLE = 0x10000000;
export const WS_CLIPSIBLINGS = 0x04000000;
export const WS_CLIPCHILDREN = 0x02000000;

export const SW_HIDE = 0;
export const SW_SHOWNORMAL = 1;
export const SW_SHOWNOACTIVATE = 4;

export const SWP_NOSIZE = 0x0001;
export const SWP_NOMOVE = 0x0002;
export const SWP_NOZORDER = 0x0004;
export const SWP_NOREDRAW = 0x0008;
export const SWP_NOACTIVATE = 0x0010;
export const SWP_SHOWWINDOW = 0x0040;
export const SWP_HIDEWINDOW = 0x0080;
export const SWP_ASYNCWINDOWPOS = 0x4000;

let cachedUser32: User32Functions | null = null;

export function getUser32Functions(): User32Functions | null {
  if (process.platform !== 'win32') {
    return null;
  }
  if (cachedUser32) {
    return cachedUser32;
  }

  try {
    const user32 = koffi.load('user32.dll');
    cachedUser32 = {
      CreateWindowExW: user32.func(
        'intptr_t CreateWindowExW(uint32_t dwExStyle, const wchar_t *lpClassName, const wchar_t *lpWindowName, uint32_t dwStyle, int X, int Y, int nWidth, int nHeight, intptr_t hWndParent, intptr_t hMenu, intptr_t hInstance, void *lpParam)'
      ),
      DestroyWindow: user32.func('bool DestroyWindow(intptr_t hWnd)'),
      SetWindowPos: user32.func(
        'bool SetWindowPos(intptr_t hWnd, intptr_t hWndInsertAfter, int X, int Y, int cx, int cy, uint32_t uFlags)'
      ),
      ShowWindow: user32.func('bool ShowWindow(intptr_t hWnd, int nCmdShow)'),
      IsWindow: user32.func('bool IsWindow(intptr_t hWnd)'),
    };
    return cachedUser32;
  } catch (err) {
    console.error('[NativeVideoWindow] Failed to bind user32.dll:', err);
    return null;
  }
}

/**
 * Manages dedicated native child HWND for libmpv video surface.
 */
export class NativeVideoWindow {
  private user32: User32Functions | null;
  private childHwnd: bigint | number | null = null;
  private parentHwnd: bigint | number | null = null;
  private isVisible = false;
  private currentBounds: VideoWindowBounds = { x: 0, y: 0, width: 0, height: 0 };

  constructor(customUser32?: User32Functions | null) {
    this.user32 = customUser32 !== undefined ? customUser32 : getUser32Functions();
  }

  public create(parentHwnd: bigint | number, initialBounds?: VideoWindowBounds): bigint | number | null {
    if (!this.user32) {
      console.warn('[NativeVideoWindow] user32 bindings unavailable; native child window skipped');
      return null;
    }

    if (this.childHwnd && this.isValid()) {
      return this.childHwnd;
    }

    this.parentHwnd = parentHwnd;
    const b = initialBounds || { x: 0, y: 0, width: 0, height: 0 };
    this.currentBounds = { ...b };

    try {
      const style = WS_CHILD | WS_CLIPSIBLINGS | WS_CLIPCHILDREN;
      const hwnd = this.user32.CreateWindowExW(
        0,
        'STATIC',
        'NosvedNativeVideoSurface',
        style,
        b.x,
        b.y,
        b.width,
        b.height,
        parentHwnd,
        0,
        0,
        null
      );

      if (!hwnd || hwnd === 0 || hwnd === 0n) {
        console.error('[NativeVideoWindow] CreateWindowExW returned null HWND');
        return null;
      }

      this.childHwnd = hwnd;
      this.isVisible = false;
      this.user32.ShowWindow(hwnd, SW_HIDE);
      return hwnd;
    } catch (err) {
      console.error('[NativeVideoWindow] Error creating child window:', err);
      return null;
    }
  }

  public getHwnd(): bigint | number | null {
    return this.childHwnd;
  }

  public isValid(): boolean {
    if (!this.childHwnd || !this.user32) return false;
    try {
      return Boolean(this.user32.IsWindow(this.childHwnd));
    } catch {
      return false;
    }
  }

  public setBounds(x: number, y: number, width: number, height: number): void {
    this.currentBounds = { x, y, width, height, visible: this.isVisible };
    if (!this.childHwnd || !this.user32 || !this.isValid()) return;

    try {
      const flags = SWP_NOZORDER | SWP_NOACTIVATE | SWP_ASYNCWINDOWPOS;
      this.user32.SetWindowPos(this.childHwnd, 0, x, y, width, height, flags);
    } catch (err) {
      console.error('[NativeVideoWindow] Failed to set window bounds:', err);
    }
  }

  public setVisible(visible: boolean): void {
    this.isVisible = visible;
    if (!this.childHwnd || !this.user32 || !this.isValid()) return;

    try {
      if (visible && this.currentBounds.width > 0 && this.currentBounds.height > 0) {
        this.user32.ShowWindow(this.childHwnd, SW_SHOWNOACTIVATE);
      } else {
        this.user32.ShowWindow(this.childHwnd, SW_HIDE);
      }
    } catch (err) {
      console.error('[NativeVideoWindow] Failed to toggle visibility:', err);
    }
  }

  public destroy(): void {
    if (this.childHwnd && this.user32) {
      try {
        if (this.isValid()) {
          this.user32.DestroyWindow(this.childHwnd);
        }
      } catch (err) {
        console.error('[NativeVideoWindow] Error destroying child window:', err);
      } finally {
        this.childHwnd = null;
        this.parentHwnd = null;
        this.isVisible = false;
      }
    }
  }
}
