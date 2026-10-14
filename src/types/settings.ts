export type ThemeMode = 'dark' | 'light' | 'system';

export type AccentPalette =
  | 'cinematic'
  | 'blue'
  | 'emerald'
  | 'sunset'
  | 'rose'
  | 'midnight'
  | 'default'
  | 'seal'
  | 'amoled'
  | 'nord'
  | 'catppuccin'
  | 'ocean';

export type ThumbnailMode = 'smart' | 'frame_position';

export interface ThumbnailStrategyOption {
  id: ThumbnailMode;
  name: string;
  description: string;
  isBeta?: boolean;
}

export const THUMBNAIL_STRATEGIES: ThumbnailStrategyOption[] = [
  {
    id: 'smart',
    name: 'Smart (Embedded + 5%)',
    description: 'Default fast strategy: prioritizes embedded cover art, falling back to a rapid early frame at 5% of duration',
  },
  {
    id: 'frame_position',
    name: 'Frame Position (Beta)',
    description: 'Extracts a frame at a custom exact percentage ratio of the video duration (configurable via slider)',
    isBeta: true,
  },
];

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
    id: 'cinematic',
    name: 'Cinematic',
    description: 'Vibrant cyan with warm amber contrast for movie lovers',
    accentColor: '#00bcd4',
    secondaryColor: '#ffb300',
    surfaceColor: '#0c1a1f',
    sourceInspiration: 'Android Theme',
  },
  {
    id: 'blue',
    name: 'Nosved Blue',
    description: 'Signature Nosved material blue and royal indigo accents',
    accentColor: '#1a73e8',
    secondaryColor: '#3949ab',
    surfaceColor: '#0d131f',
    sourceInspiration: 'Android Theme',
  },
  {
    id: 'emerald',
    name: 'Emerald',
    description: 'Deep forest teal and energetic mint highlights',
    accentColor: '#00897b',
    secondaryColor: '#43a047',
    surfaceColor: '#0c1a16',
    sourceInspiration: 'Android Theme',
  },
  {
    id: 'sunset',
    name: 'Sunset',
    description: 'Fiery coral orange blending into warm golden radiance',
    accentColor: '#e64a19',
    secondaryColor: '#f9a825',
    surfaceColor: '#1c1310',
    sourceInspiration: 'Android Theme',
  },
  {
    id: 'rose',
    name: 'Rose',
    description: 'Elegant ruby magenta and vivid violet flourishes',
    accentColor: '#d81b60',
    secondaryColor: '#8e24aa',
    surfaceColor: '#1c1018',
    sourceInspiration: 'Android Theme',
  },
  {
    id: 'midnight',
    name: 'Midnight',
    description: 'Muted slate steel with serene twilight blue tones',
    accentColor: '#3949ab',
    secondaryColor: '#607d8b',
    surfaceColor: '#111420',
    sourceInspiration: 'Android Theme',
  },
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
  dynamicColor: boolean;
  isAmoledTheme: boolean;
  highContrast: boolean;
  compactUi: boolean;

  // Thumbnails
  showThumbnails: boolean;
  thumbnailMode: ThumbnailMode;
  thumbnailFramePosition: number;

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
  themeMode: 'system',
  accentPalette: 'default',
  dynamicColor: false,
  isAmoledTheme: false,
  highContrast: false,
  compactUi: false,

  showThumbnails: true,
  thumbnailMode: 'smart',
  thumbnailFramePosition: 5,

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
    dynamicColor: raw.dynamicColor !== undefined ? raw.dynamicColor === 'true' : DEFAULT_SETTINGS.dynamicColor,
    isAmoledTheme: raw.isAmoledTheme !== undefined ? raw.isAmoledTheme === 'true' : DEFAULT_SETTINGS.isAmoledTheme,
    highContrast: raw.highContrast !== undefined ? raw.highContrast === 'true' : DEFAULT_SETTINGS.highContrast,
    compactUi: raw.compactUi !== undefined ? raw.compactUi === 'true' : DEFAULT_SETTINGS.compactUi,

    showThumbnails: raw.showThumbnails !== undefined ? raw.showThumbnails === 'true' : DEFAULT_SETTINGS.showThumbnails,
    thumbnailMode: raw.thumbnailMode === 'frame_position' ? 'frame_position' : 'smart',
    thumbnailFramePosition: raw.thumbnailFramePosition ? Number(raw.thumbnailFramePosition) : DEFAULT_SETTINGS.thumbnailFramePosition,

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

export function resolveEffectiveTheme(themeMode: ThemeMode): 'dark' | 'light' {
  if (themeMode === 'system') {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'dark';
  }
  return themeMode;
}

export function applyThemeToDom(
  themeMode: ThemeMode,
  accentPalette: AccentPalette,
  highContrast: boolean,
  compactUi: boolean,
  dynamicColor = false,
  systemAccentColor: string | null = null,
  isAmoledTheme = false
): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const effectiveTheme = resolveEffectiveTheme(themeMode);

  root.setAttribute('data-theme', effectiveTheme);
  root.classList.toggle('dark', effectiveTheme === 'dark');
  root.style.colorScheme = effectiveTheme;

  if (dynamicColor && systemAccentColor) {
    root.setAttribute('data-palette', 'dynamic');
    root.style.setProperty('--md-sys-color-primary', systemAccentColor);
    root.style.setProperty('--md-sys-color-primary-container', systemAccentColor);
    root.style.setProperty('--md-sys-color-on-primary-container', '#ffffff');
  } else {
    root.style.removeProperty('--md-sys-color-primary');
    root.style.removeProperty('--md-sys-color-primary-container');
    root.style.removeProperty('--md-sys-color-on-primary-container');
    root.setAttribute('data-palette', accentPalette);
  }

  if (isAmoledTheme && effectiveTheme === 'dark') {
    root.setAttribute('data-amoled', 'true');
  } else {
    root.removeAttribute('data-amoled');
  }

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
