import { useState, useEffect, useCallback } from 'react';
import {
  AppSettings,
  DEFAULT_SETTINGS,
  parseSettingsFromRaw,
  serializeSettingsToRaw,
  applyThemeToDom,
} from '../types/settings';

export interface AppInfo {
  name: string;
  version: string;
  isPackaged: boolean;
  platform: string;
  arch: string;
}

export interface SecurityState {
  contextIsolated: boolean;
  nodeIntegrationDisabled: boolean;
  sandboxEnabled: boolean;
}

export function useAppSettings() {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [securityState, setSecurityState] = useState<SecurityState | null>(null);
  const [nativePoc, setNativePoc] = useState<{
    success: boolean;
    stage: string;
    apiVersion?: { formatted: string };
  } | null>(null);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    if (!window.nosvedAPI) return;

    window.nosvedAPI.getAppInfo().then(setAppInfo).catch(console.error);
    window.nosvedAPI.getSecurityState().then(setSecurityState).catch(console.error);

    if (window.nosvedAPI.getSettings) {
      window.nosvedAPI
        .getSettings()
        .then((raw) => {
          const parsed = parseSettingsFromRaw(raw);
          setSettings(parsed);
          applyThemeToDom(
            parsed.themeMode,
            parsed.accentPalette,
            parsed.highContrast,
            parsed.compactUi
          );
        })
        .catch(console.error);
    }
  }, []);

  // Dynamic OS color-scheme listener for System mode
  useEffect(() => {
    if (settings.themeMode !== 'system') return;
    if (typeof window === 'undefined' || !window.matchMedia) return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemThemeChange = () => {
      applyThemeToDom(
        'system',
        settings.accentPalette,
        settings.highContrast,
        settings.compactUi
      );
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleSystemThemeChange);
      return () => mediaQuery.removeEventListener('change', handleSystemThemeChange);
    } else if (mediaQuery.addListener) {
      mediaQuery.addListener(handleSystemThemeChange);
      return () => mediaQuery.removeListener(handleSystemThemeChange);
    }
  }, [settings.themeMode, settings.accentPalette, settings.highContrast, settings.compactUi]);

  const handleUpdateSetting = useCallback(
    async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
      setSettings((prev) => {
        const next = { ...prev, [key]: value };
        applyThemeToDom(
          next.themeMode,
          next.accentPalette,
          next.highContrast,
          next.compactUi
        );
        return next;
      });
      if (window.nosvedAPI?.setSetting) {
        await window.nosvedAPI.setSetting(String(key), String(value)).catch(console.error);
      }
    },
    []
  );

  const handleResetSettings = useCallback(async () => {
    setSettings(DEFAULT_SETTINGS);
    applyThemeToDom(
      DEFAULT_SETTINGS.themeMode,
      DEFAULT_SETTINGS.accentPalette,
      DEFAULT_SETTINGS.highContrast,
      DEFAULT_SETTINGS.compactUi
    );
    if (window.nosvedAPI?.resetSettings) {
      await window.nosvedAPI.resetSettings().catch(console.error);
    }
  }, []);

  const handleExportSettings = useCallback(async () => {
    if (!window.nosvedAPI?.exportSettingsFile) return;
    const payload = JSON.stringify(
      {
        app: 'Nosved Player Desktop',
        version: appInfo?.version || '0.1.0',
        exportedAt: new Date().toISOString(),
        settings,
      },
      null,
      2
    );
    const res = await window.nosvedAPI.exportSettingsFile(payload);
    if (res.error) throw new Error(res.error);
  }, [appInfo?.version, settings]);

  const handleImportSettings = useCallback(async () => {
    if (!window.nosvedAPI?.importSettingsFile) return;
    const res = await window.nosvedAPI.importSettingsFile();
    if (res.canceled) return;
    if (res.error || !res.data) throw new Error(res.error || 'Failed to read settings file');
    const parsedJson = JSON.parse(res.data);
    const raw = (parsedJson.settings as Record<string, string>) || (parsedJson as Record<string, string>);
    const newSettings = parseSettingsFromRaw(raw);
    setSettings(newSettings);
    applyThemeToDom(
      newSettings.themeMode,
      newSettings.accentPalette,
      newSettings.highContrast,
      newSettings.compactUi
    );
    if (window.nosvedAPI.setAllSettings) {
      await window.nosvedAPI.setAllSettings(serializeSettingsToRaw(newSettings));
    }
  }, []);

  const isIsolated =
    securityState?.contextIsolated === true &&
    securityState?.nodeIntegrationDisabled === true &&
    typeof (window as unknown as { process?: unknown }).process === 'undefined' &&
    typeof (window as unknown as { require?: unknown }).require === 'undefined' &&
    typeof (window as unknown as { Buffer?: unknown }).Buffer === 'undefined';

  return {
    appInfo,
    securityState,
    nativePoc,
    setNativePoc,
    settings,
    setSettings,
    isIsolated,
    handleUpdateSetting,
    handleResetSettings,
    handleExportSettings,
    handleImportSettings,
  };
}
