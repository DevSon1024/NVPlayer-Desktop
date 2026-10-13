import { nativeTheme, BrowserWindow } from 'electron';
import koffi from 'koffi';

export interface DwmapiFunctions {
  DwmSetWindowAttribute: (
    hwnd: bigint | number,
    dwAttribute: number,
    pvAttribute: Buffer | Uint8Array,
    cbAttribute: number
  ) => number;
}

export const DWMWA_USE_IMMERSIVE_DARK_MODE_BEFORE_20H1 = 19;
export const DWMWA_USE_IMMERSIVE_DARK_MODE = 20;
export const DWMWA_CAPTION_COLOR = 35;
export const DWMWA_TEXT_COLOR = 36;

export const TITLE_BAR_COLORS = {
  dark: {
    bg: '#12141a',
    text: '#e2e2e9',
  },
  amoled: {
    bg: '#000000',
    text: '#ffffff',
  },
  light: {
    bg: '#f8fafc',
    text: '#0f172a',
  },
};

let cachedDwmapi: DwmapiFunctions | null = null;
let currentThemeMode: 'light' | 'dark' | 'system' = 'system';
let currentIsAmoled = false;
let isTrackerInitialized = false;

export function getDwmapiFunctions(): DwmapiFunctions | null {
  if (process.platform !== 'win32') {
    return null;
  }
  if (cachedDwmapi) {
    return cachedDwmapi;
  }

  try {
    const dwmapi = koffi.load('dwmapi.dll');
    cachedDwmapi = {
      DwmSetWindowAttribute: dwmapi.func(
        'int DwmSetWindowAttribute(intptr_t hwnd, uint32_t dwAttribute, const void *pvAttribute, uint32_t cbAttribute)'
      ),
    };
    return cachedDwmapi;
  } catch (err) {
    console.warn('[TitleBar] Failed to bind dwmapi.dll:', err);
    return null;
  }
}

/**
 * Converts a hex string (#RRGGBB) to a Win32 COLORREF (0x00BBGGRR).
 */
export function hexToColorRef(hex: string): number {
  const cleanHex = hex.replace('#', '').trim();
  if (cleanHex.length === 3) {
    const r = parseInt(cleanHex.charAt(0) + cleanHex.charAt(0), 16);
    const g = parseInt(cleanHex.charAt(1) + cleanHex.charAt(1), 16);
    const b = parseInt(cleanHex.charAt(2) + cleanHex.charAt(2), 16);
    return (b << 16) | (g << 8) | r;
  }
  const r = parseInt(cleanHex.substring(0, 2), 16) || 0;
  const g = parseInt(cleanHex.substring(2, 4), 16) || 0;
  const b = parseInt(cleanHex.substring(4, 6), 16) || 0;
  return (b << 16) | (g << 8) | r;
}

/**
 * Applies native DWM window attributes on Windows 10/11.
 */
export function setNativeDwmTitleBarAttributes(
  hwnd: bigint | number,
  isDark: boolean,
  bgHex: string,
  textHex: string
): void {
  const dwm = getDwmapiFunctions();
  if (!dwm) return;

  // 1. Dark mode attribute (attribute 20 for 20H1+, fallback to 19 for 1809-1909)
  try {
    const darkBuf = Buffer.alloc(4);
    darkBuf.writeInt32LE(isDark ? 1 : 0, 0);
    const res20 = dwm.DwmSetWindowAttribute(hwnd, DWMWA_USE_IMMERSIVE_DARK_MODE, darkBuf, 4);
    if (res20 !== 0) {
      dwm.DwmSetWindowAttribute(hwnd, DWMWA_USE_IMMERSIVE_DARK_MODE_BEFORE_20H1, darkBuf, 4);
    }
  } catch (err) {
    console.warn('[TitleBar] Failed to set immersive dark mode DWM attribute:', err);
  }

  // 2. Caption background color attribute (Windows 11 Build 22000+)
  try {
    const captionBuf = Buffer.alloc(4);
    captionBuf.writeUInt32LE(hexToColorRef(bgHex), 0);
    dwm.DwmSetWindowAttribute(hwnd, DWMWA_CAPTION_COLOR, captionBuf, 4);
  } catch {
    // Unsupported on older Windows 10 versions, ignore gracefully
  }

  // 3. Caption text color attribute (Windows 11 Build 22000+)
  try {
    const textBuf = Buffer.alloc(4);
    textBuf.writeUInt32LE(hexToColorRef(textHex), 0);
    dwm.DwmSetWindowAttribute(hwnd, DWMWA_TEXT_COLOR, textBuf, 4);
  } catch {
    // Unsupported on older Windows 10 versions, ignore gracefully
  }
}

/**
 * Applies the selected theme to the Windows native title bar, background, and caption buttons.
 */
export function applyNativeTitleBarTheme(
  win: BrowserWindow | null,
  themeMode: 'light' | 'dark' | 'system',
  isAmoled = false
): boolean {
  if (!win || win.isDestroyed()) {
    return false;
  }

  currentThemeMode = themeMode;
  currentIsAmoled = isAmoled;

  // Sync Electron native theme source
  nativeTheme.themeSource = themeMode;

  const isEffectiveDark =
    themeMode === 'dark' || (themeMode === 'system' && nativeTheme.shouldUseDarkColors);

  const colors = isEffectiveDark
    ? (isAmoled ? TITLE_BAR_COLORS.amoled : TITLE_BAR_COLORS.dark)
    : TITLE_BAR_COLORS.light;

  // Update window background color to avoid flashing on repaint/resizing
  try {
    win.setBackgroundColor(colors.bg);
  } catch (err) {
    console.warn('[TitleBar] Failed to set window background color:', err);
  }

  // Evaluate and safely attempt setTitleBarOverlay if window supports overlay
  try {
    const candidateWin = win as unknown as {
      setTitleBarOverlay?: (opts: { color: string; symbolColor: string }) => void;
    };
    if (typeof candidateWin.setTitleBarOverlay === 'function') {
      candidateWin.setTitleBarOverlay({
        color: colors.bg,
        symbolColor: colors.text,
      });
    }
  } catch {
    // Standard native frame does not use titleBarOverlay; ignore gracefully
  }

  // Apply DWM attributes to the native HWND on Windows
  if (process.platform === 'win32') {
    try {
      const nativeHwnd = win.getNativeWindowHandle().readBigInt64LE();
      setNativeDwmTitleBarAttributes(nativeHwnd, isEffectiveDark, colors.bg, colors.text);
    } catch (err) {
      console.warn('[TitleBar] Failed to read native HWND for DWM styling:', err);
    }
  }

  return true;
}

/**
 * Initializes OS-level theme change listener to automatically update title bar
 * when the app is in 'system' mode.
 */
export function initTitleBarThemeTracking(getMainWindow: () => BrowserWindow | null): void {
  if (isTrackerInitialized) return;
  isTrackerInitialized = true;

  nativeTheme.on('updated', () => {
    if (currentThemeMode === 'system') {
      const win = getMainWindow();
      if (win && !win.isDestroyed()) {
        applyNativeTitleBarTheme(win, 'system', currentIsAmoled);
      }
    }
  });
}
