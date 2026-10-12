export type ThemeMode = 'dark' | 'light' | 'system';

export type AccentPalette =
  | 'default'
  | 'seal'
  | 'amoled'
  | 'nord'
  | 'catppuccin'
  | 'sunset'
  | 'ocean';

export interface PaletteMetadata {
  id: AccentPalette;
  name: string;
  description: string;
  accentColor: string;
  secondaryColor: string;
  surfaceColor: string;
  sourceInspiration: string;
}

export const AVAILABLE_PALETTES: PaletteMetadata[] = [
  {
    id: 'default',
    name: 'Material Expressive',
    description: 'Refined classic Material 3 cobalt blue and slate accents',
    accentColor: '#a8c7fa',
    secondaryColor: '#1a4277',
    surfaceColor: '#12141a',
    sourceInspiration: 'Google Material 3',
  },
  {
    id: 'seal',
    name: 'Seal Emerald',
    description: 'Vibrant teal and deep emerald green inspired by the Seal app',
    accentColor: '#2ec4b6',
    secondaryColor: '#134e4a',
    surfaceColor: '#0c1a1a',
    sourceInspiration: 'Seal Android Media',
  },
  {
    id: 'amoled',
    name: 'Pure AMOLED',
    description: 'Pure pitch black background with vivid electric cyan highlights',
    accentColor: '#38bdf8',
    secondaryColor: '#0284c7',
    surfaceColor: '#000000',
    sourceInspiration: 'True Black Display',
  },
  {
    id: 'nord',
    name: 'Nordic Frost',
    description: 'Cool Arctic polar night tones with gentle glacier ice blue',
    accentColor: '#88c0d0',
    secondaryColor: '#4c566a',
    surfaceColor: '#1e222a',
    sourceInspiration: 'Nord Theme',
  },
  {
    id: 'catppuccin',
    name: 'Catppuccin Mocha',
    description: 'Warm soothing pastel lavender and mauve on deep velvet',
    accentColor: '#cba6f7',
    secondaryColor: '#585b70',
    surfaceColor: '#181825',
    sourceInspiration: 'Catppuccin Mocha',
  },
  {
    id: 'sunset',
    name: 'Sunset Amber',
    description: 'Warm glowing amber and coral pink on rich obsidian mahogany',
    accentColor: '#f59e0b',
    secondaryColor: '#78350f',
    surfaceColor: '#1c1316',
    sourceInspiration: 'Sunset Glow',
  },
  {
    id: 'ocean',
    name: 'Deep Abyss',
    description: 'Midnight navy depths with radiant sapphire ocean accents',
    accentColor: '#60a5fa',
    secondaryColor: '#1e3a8a',
    surfaceColor: '#080e1e',
    sourceInspiration: 'Oceanic Sapphire',
  },
];

export interface AppSettings {
  // Appearance & Themes
  themeMode: ThemeMode;
  accentPalette: AccentPalette;
  highContrast: boolean;
  compactUi: boolean;

  // Playback & Controls
  autoPlayNext: boolean;
  resumePlaybackPrompt: boolean;
  rememberVolume: boolean;
  defaultVolume: number;
  seekStepSeconds: number;
  hideControlsTimeoutMs: number;
  showHoverIsland: boolean;

  // Native libmpv Engine
  hardwareDecoding: 'auto-safe' | 'auto' | 'd3d11va' | 'nvdec' | 'no';
  videoOutput: 'gpu' | 'gpu-next' | 'direct3d';
  audioNormalization: boolean;
  deinterlace: boolean;
  customMpvOptions: string;

  // Subtitles & Audio
  subtitlesEnabled: boolean;
  subtitleFontSize: number;
  subtitleColor: string;
  preferAudioLanguage: string;

  // Library & Storage
  autoExtractThumbnails: boolean;
  historyLimit: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  themeMode: 'dark',
  accentPalette: 'default',
  highContrast: false,
  compactUi: false,

  autoPlayNext: true,
  resumePlaybackPrompt: true,
  rememberVolume: true,
  defaultVolume: 100,
  seekStepSeconds: 10,
  hideControlsTimeoutMs: 5000,
  showHoverIsland: true,

  hardwareDecoding: 'auto-safe',
  videoOutput: 'gpu',
  audioNormalization: false,
  deinterlace: false,
  customMpvOptions: '',

  subtitlesEnabled: true,
  subtitleFontSize: 42,
  subtitleColor: '#FFFFFF',
  preferAudioLanguage: 'eng',

  autoExtractThumbnails: true,
  historyLimit: 50,
};

export function parseSettingsFromRaw(raw: Record<string, string>): AppSettings {
  return {
    themeMode: (raw.themeMode as ThemeMode) || DEFAULT_SETTINGS.themeMode,
    accentPalette: (raw.accentPalette as AccentPalette) || DEFAULT_SETTINGS.accentPalette,
    highContrast: raw.highContrast !== undefined ? raw.highContrast === 'true' : DEFAULT_SETTINGS.highContrast,
    compactUi: raw.compactUi !== undefined ? raw.compactUi === 'true' : DEFAULT_SETTINGS.compactUi,

    autoPlayNext: raw.autoPlayNext !== undefined ? raw.autoPlayNext === 'true' : DEFAULT_SETTINGS.autoPlayNext,
    resumePlaybackPrompt:
      raw.resumePlaybackPrompt !== undefined ? raw.resumePlaybackPrompt === 'true' : DEFAULT_SETTINGS.resumePlaybackPrompt,
    rememberVolume: raw.rememberVolume !== undefined ? raw.rememberVolume === 'true' : DEFAULT_SETTINGS.rememberVolume,
    defaultVolume: raw.defaultVolume ? Number(raw.defaultVolume) : DEFAULT_SETTINGS.defaultVolume,
    seekStepSeconds: raw.seekStepSeconds ? Number(raw.seekStepSeconds) : DEFAULT_SETTINGS.seekStepSeconds,
    hideControlsTimeoutMs: raw.hideControlsTimeoutMs ? Number(raw.hideControlsTimeoutMs) : DEFAULT_SETTINGS.hideControlsTimeoutMs,
    showHoverIsland: raw.showHoverIsland !== undefined ? raw.showHoverIsland === 'true' : DEFAULT_SETTINGS.showHoverIsland,

    hardwareDecoding:
      (raw.hardwareDecoding as AppSettings['hardwareDecoding']) || DEFAULT_SETTINGS.hardwareDecoding,
    videoOutput: (raw.videoOutput as AppSettings['videoOutput']) || DEFAULT_SETTINGS.videoOutput,
    audioNormalization:
      raw.audioNormalization !== undefined ? raw.audioNormalization === 'true' : DEFAULT_SETTINGS.audioNormalization,
    deinterlace: raw.deinterlace !== undefined ? raw.deinterlace === 'true' : DEFAULT_SETTINGS.deinterlace,
    customMpvOptions: raw.customMpvOptions || DEFAULT_SETTINGS.customMpvOptions,

    subtitlesEnabled:
      raw.subtitlesEnabled !== undefined ? raw.subtitlesEnabled === 'true' : DEFAULT_SETTINGS.subtitlesEnabled,
    subtitleFontSize: raw.subtitleFontSize ? Number(raw.subtitleFontSize) : DEFAULT_SETTINGS.subtitleFontSize,
    subtitleColor: raw.subtitleColor || DEFAULT_SETTINGS.subtitleColor,
    preferAudioLanguage: raw.preferAudioLanguage || DEFAULT_SETTINGS.preferAudioLanguage,

    autoExtractThumbnails:
      raw.autoExtractThumbnails !== undefined ? raw.autoExtractThumbnails === 'true' : DEFAULT_SETTINGS.autoExtractThumbnails,
    historyLimit: raw.historyLimit ? Number(raw.historyLimit) : DEFAULT_SETTINGS.historyLimit,
  };
}

export function serializeSettingsToRaw(settings: AppSettings): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(settings)) {
    result[key] = String(value);
  }
  return result;
}

export function applyThemeToDom(
  themeMode: ThemeMode,
  accentPalette: AccentPalette,
  highContrast: boolean,
  compactUi: boolean
): void {
  const root = document.documentElement;

  // Resolve system mode
  let effectiveTheme: 'dark' | 'light' = 'dark';
  if (themeMode === 'system') {
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    effectiveTheme = prefersDark ? 'dark' : 'light';
  } else {
    effectiveTheme = themeMode;
  }

  root.setAttribute('data-theme', effectiveTheme);
  root.setAttribute('data-palette', accentPalette);
  if (highContrast) {
    root.setAttribute('data-contrast', 'high');
  } else {
    root.removeAttribute('data-contrast');
  }
  if (compactUi) {
    root.setAttribute('data-density', 'compact');
  } else {
    root.removeAttribute('data-density');
  }
}
