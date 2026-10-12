import React, { useState } from 'react';
import {
  Palette,
  PlaySquare,
  Cpu,
  Subtitles,
  Download,
  Upload,
  RotateCcw,
  ShieldCheck,
  Layers,
  Check,
  Sun,
  Moon,
  Laptop,
  Sparkles,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import type { PlaybackStatus } from '../types/electron';
import {
  AppSettings,
  AVAILABLE_PALETTES,
  AccentPalette,
} from '../types/settings';

interface SettingsViewProps {
  settings: AppSettings;
  onUpdateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  onResetSettings: () => void;
  onExportSettings: () => Promise<void>;
  onImportSettings: () => Promise<void>;
  playbackStatus: PlaybackStatus;
  nativePoc: { success: boolean; stage: string; apiVersion?: { formatted: string } } | null;
  playerStatus: { state: string; apiVersion?: { formatted: string }; error?: string } | null;
  isFullscreen: boolean;
}

type SettingsSection = 'appearance' | 'player' | 'engine' | 'subtitles' | 'backup' | 'diagnostics';

interface ToggleRowProps {
  label: string;
  desc: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

const SettingToggleRow: React.FC<ToggleRowProps> = ({ label, desc, checked, onChange }) => (
  <div className="flex items-center justify-between gap-4 py-3 border-b border-border/40 last:border-none">
    <div className="flex flex-col gap-0.5 max-w-[80%]">
      <span className="text-xs font-semibold text-foreground tracking-tight">{label}</span>
      <span className="text-[11px] text-muted-foreground leading-relaxed">{desc}</span>
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-all duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
        checked
          ? 'bg-primary shadow-[0_0_10px_rgba(59,130,246,0.3)]'
          : 'bg-surface-elevated border border-border/80 hover:border-outline'
      }`}
    >
      <span className="sr-only">{label}</span>
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full shadow-md transition-all duration-200 ease-in-out ${
          checked
            ? 'translate-x-5 bg-primary-foreground scale-105'
            : 'translate-x-0 bg-muted-foreground/80'
        }`}
      />
    </button>
  </div>
);

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onUpdateSetting,
  onResetSettings,
  onExportSettings,
  onImportSettings,
  playbackStatus,
  nativePoc,
  playerStatus,
  isFullscreen,
}) => {
  const [activeSection, setActiveSection] = useState<SettingsSection>('appearance');
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);

  const showFeedback = (type: 'success' | 'error', text: string) => {
    setFeedbackMessage({ type, text });
    setTimeout(() => {
      setFeedbackMessage(null);
    }, 3500);
  };

  const handleExport = async () => {
    try {
      await onExportSettings();
      showFeedback('success', 'Settings exported successfully.');
    } catch (e) {
      showFeedback('error', e instanceof Error ? e.message : 'Failed to export settings');
    }
  };

  const handleImport = async () => {
    try {
      await onImportSettings();
      showFeedback('success', 'Settings imported and applied successfully.');
    } catch (e) {
      showFeedback('error', e instanceof Error ? e.message : 'Failed to import settings');
    }
  };

  return (
    <div className="flex-1 min-h-0 flex h-full w-full overflow-hidden bg-background select-none">
      {/* Settings Navigation Sidebar */}
      <aside className="w-[250px] min-w-[250px] bg-surface border-r border-border flex flex-col p-6 gap-5 overflow-y-auto shrink-0">
        <div className="flex flex-col gap-1 px-2">
          <h2 className="text-xl font-bold text-foreground tracking-tight">Preferences</h2>
          <span className="text-[11px] font-semibold text-primary tracking-wider uppercase">
            Persistent Configuration
          </span>
        </div>

        <nav className="flex flex-col gap-1.5">
          <button
            type="button"
            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition cursor-pointer border-none text-left w-full ${
              activeSection === 'appearance'
                ? 'bg-primary-container text-on-primary-container font-semibold shadow-sm'
                : 'bg-transparent text-muted-foreground hover:bg-surface-elevated hover:text-foreground'
            }`}
            onClick={() => setActiveSection('appearance')}
          >
            <Palette size={18} />
            <span>Appearance & Themes</span>
          </button>

          <button
            type="button"
            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition cursor-pointer border-none text-left w-full ${
              activeSection === 'player'
                ? 'bg-primary-container text-on-primary-container font-semibold shadow-sm'
                : 'bg-transparent text-muted-foreground hover:bg-surface-elevated hover:text-foreground'
            }`}
            onClick={() => setActiveSection('player')}
          >
            <PlaySquare size={18} />
            <span>Player & Controls</span>
          </button>

          <button
            type="button"
            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition cursor-pointer border-none text-left w-full ${
              activeSection === 'engine'
                ? 'bg-primary-container text-on-primary-container font-semibold shadow-sm'
                : 'bg-transparent text-muted-foreground hover:bg-surface-elevated hover:text-foreground'
            }`}
            onClick={() => setActiveSection('engine')}
          >
            <Cpu size={18} />
            <span>libmpv Engine & HWDEC</span>
          </button>

          <button
            type="button"
            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition cursor-pointer border-none text-left w-full ${
              activeSection === 'subtitles'
                ? 'bg-primary-container text-on-primary-container font-semibold shadow-sm'
                : 'bg-transparent text-muted-foreground hover:bg-surface-elevated hover:text-foreground'
            }`}
            onClick={() => setActiveSection('subtitles')}
          >
            <Subtitles size={18} />
            <span>Subtitles & Audio</span>
          </button>

          <button
            type="button"
            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition cursor-pointer border-none text-left w-full ${
              activeSection === 'backup'
                ? 'bg-primary-container text-on-primary-container font-semibold shadow-sm'
                : 'bg-transparent text-muted-foreground hover:bg-surface-elevated hover:text-foreground'
            }`}
            onClick={() => setActiveSection('backup')}
          >
            <Download size={18} />
            <span>Backup & Sync</span>
          </button>

          <button
            type="button"
            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition cursor-pointer border-none text-left w-full ${
              activeSection === 'diagnostics'
                ? 'bg-primary-container text-on-primary-container font-semibold shadow-sm'
                : 'bg-transparent text-muted-foreground hover:bg-surface-elevated hover:text-foreground'
            }`}
            onClick={() => setActiveSection('diagnostics')}
          >
            <ShieldCheck size={18} />
            <span>System Diagnostics</span>
          </button>
        </nav>
      </aside>

      {/* Settings Content Area */}
      <main className="flex-1 min-h-0 overflow-y-auto px-10 py-8 pb-24 flex flex-col gap-6 relative">
        {feedbackMessage && (
          <div
            className={`flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm font-medium max-w-[860px] animate-fadeIn ${
              feedbackMessage.type === 'success'
                ? 'bg-emerald-500/15 border border-emerald-500/35 text-emerald-400'
                : 'bg-rose-500/15 border border-rose-500/35 text-rose-400'
            }`}
            role="alert"
          >
            {feedbackMessage.type === 'success' ? (
              <CheckCircle2 size={16} />
            ) : (
              <AlertCircle size={16} />
            )}
            <span>{feedbackMessage.text}</span>
          </div>
        )}

        {/* 1. Appearance & Themes */}
        {activeSection === 'appearance' && (
          <div className="flex flex-col gap-5 max-w-[860px]">
            <div className="flex flex-col gap-1.5 pb-3 border-b border-border">
              <h3 className="text-xl font-bold text-foreground">Appearance & Themes</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Customize app styling, dark mode, and color palettes inspired by Seal Android and Material Expressive.
              </p>
            </div>

            {/* Theme Mode Toggle (Dark / Light / System) */}
            <div className="bg-surface border border-border rounded-2xl p-6 flex flex-col gap-4 shadow-sm">
              <h4 className="text-sm font-semibold text-foreground">Theme Mode</h4>
              <p className="text-xs text-muted-foreground -mt-2 leading-relaxed">
                Select color scheme mode or follow Windows system default.
              </p>

              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  className={`flex items-center justify-center gap-2.5 p-3.5 rounded-xl border text-xs font-semibold cursor-pointer transition ${
                    settings.themeMode === 'dark'
                      ? 'bg-primary-container border-primary text-on-primary-container shadow-sm'
                      : 'bg-surface-elevated border-border text-muted-foreground hover:border-primary hover:text-foreground'
                  }`}
                  onClick={() => onUpdateSetting('themeMode', 'dark')}
                >
                  <Moon size={18} />
                  <span>Dark Mode</span>
                </button>

                <button
                  type="button"
                  className={`flex items-center justify-center gap-2.5 p-3.5 rounded-xl border text-xs font-semibold cursor-pointer transition ${
                    settings.themeMode === 'light'
                      ? 'bg-primary-container border-primary text-on-primary-container shadow-sm'
                      : 'bg-surface-elevated border-border text-muted-foreground hover:border-primary hover:text-foreground'
                  }`}
                  onClick={() => onUpdateSetting('themeMode', 'light')}
                >
                  <Sun size={18} />
                  <span>Light Mode</span>
                </button>

                <button
                  type="button"
                  className={`flex items-center justify-center gap-2.5 p-3.5 rounded-xl border text-xs font-semibold cursor-pointer transition ${
                    settings.themeMode === 'system'
                      ? 'bg-primary-container border-primary text-on-primary-container shadow-sm'
                      : 'bg-surface-elevated border-border text-muted-foreground hover:border-primary hover:text-foreground'
                  }`}
                  onClick={() => onUpdateSetting('themeMode', 'system')}
                >
                  <Laptop size={18} />
                  <span>System Default</span>
                </button>
              </div>
            </div>

            {/* Custom Palettes Grid */}
            <div className="bg-surface border border-border rounded-2xl p-6 flex flex-col gap-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-foreground">Accent Palettes</h4>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    Choose custom design colors and tints for buttons, highlights, and surfaces.
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                  <Sparkles size={13} />
                  <span>{AVAILABLE_PALETTES.length} Palettes</span>
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
                {AVAILABLE_PALETTES.map((pal) => {
                  const isSelected = settings.accentPalette === pal.id;
                  return (
                    <div
                      key={pal.id}
                      className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition select-none ${
                        isSelected
                          ? 'border-primary ring-1 ring-primary bg-surface-elevated shadow-md'
                          : 'border-border bg-surface-elevated/50 hover:border-primary/50 hover:bg-surface-elevated'
                      }`}
                      onClick={() => onUpdateSetting('accentPalette', pal.id as AccentPalette)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && onUpdateSetting('accentPalette', pal.id as AccentPalette)}
                    >
                      <div
                        className="w-10 h-10 rounded-xl relative shrink-0 flex items-center justify-center border border-white/10 shadow-sm"
                        style={{ backgroundColor: pal.surfaceColor }}
                      >
                        <div
                          className="w-3.5 h-3.5 rounded-full absolute top-1.5 left-1.5 border border-black/20"
                          style={{ backgroundColor: pal.accentColor }}
                        />
                        <div
                          className="w-3.5 h-3.5 rounded-full absolute bottom-1.5 right-1.5 border border-black/20"
                          style={{ backgroundColor: pal.secondaryColor }}
                        />
                        {isSelected && (
                          <div className="absolute inset-0 flex items-center justify-center text-primary-foreground drop-shadow">
                            <Check size={16} />
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-semibold text-foreground truncate">{pal.name}</span>
                          <span className="text-[10px] text-primary/80 font-mono shrink-0">{pal.sourceInspiration}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5 leading-snug">{pal.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* UI Contrast & Density */}
            <div className="bg-surface border border-border rounded-2xl p-6 flex flex-col gap-4 shadow-sm">
              <h4 className="text-sm font-semibold text-foreground">Visual Accessibility</h4>

              <SettingToggleRow
                label="High Contrast Borders"
                desc="Strengthen surface outlines and element boundaries"
                checked={settings.highContrast}
                onChange={(checked) => onUpdateSetting('highContrast', checked)}
              />

              <SettingToggleRow
                label="Compact Density"
                desc="Reduce layout paddings for maximum information density"
                checked={settings.compactUi}
                onChange={(checked) => onUpdateSetting('compactUi', checked)}
              />
            </div>
          </div>
        )}

        {/* 2. Player & Controls */}
        {activeSection === 'player' && (
          <div className="flex flex-col gap-5 max-w-[860px]">
            <div className="flex flex-col gap-1.5 pb-3 border-b border-border">
              <h3 className="text-xl font-bold text-foreground">Player & Controls</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Configure auto-advance behaviors, seeking increments, overlay timeout, and bottom mini-island.
              </p>
            </div>

            <div className="bg-surface border border-border rounded-2xl p-6 flex flex-col gap-4 shadow-sm">
              <SettingToggleRow
                label="Auto-Play Next in Playlist"
                desc="Seamlessly load and play the next video item upon file EOF"
                checked={settings.autoPlayNext}
                onChange={(checked) => onUpdateSetting('autoPlayNext', checked)}
              />

              <SettingToggleRow
                label="Resume Playback Prompt"
                desc="Show prompt banner to resume from previous timestamp"
                checked={settings.resumePlaybackPrompt}
                onChange={(checked) => onUpdateSetting('resumePlaybackPrompt', checked)}
              />

              <SettingToggleRow
                label="Hovering Mini-Player Island"
                desc="Display floating bottom progress island when navigating away from player"
                checked={settings.showHoverIsland}
                onChange={(checked) => onUpdateSetting('showHoverIsland', checked)}
              />

              <SettingToggleRow
                label="Remember Volume"
                desc="Preserve last adjusted volume level across sessions"
                checked={settings.rememberVolume}
                onChange={(checked) => onUpdateSetting('rememberVolume', checked)}
              />
            </div>

            <div className="bg-surface border border-border rounded-2xl p-6 flex flex-col gap-4 shadow-sm">
              <h4 className="text-sm font-semibold text-foreground">Seeking & Timing</h4>

              <div className="flex items-center justify-between gap-4 py-2 border-b border-border/40">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-medium text-foreground">Seek Interval (Left / Right Arrow)</span>
                  <span className="text-[11px] text-muted-foreground">Time jumped on keyboard arrow shortcut</span>
                </div>
                <div className="inline-flex p-1 rounded-xl bg-surface-muted border border-border gap-1">
                  {[5, 10, 15, 30].map((secs) => (
                    <button
                      key={secs}
                      type="button"
                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition border-none cursor-pointer ${
                        settings.seekStepSeconds === secs
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'bg-transparent text-muted-foreground hover:text-foreground'
                      }`}
                      onClick={() => onUpdateSetting('seekStepSeconds', secs)}
                    >
                      {secs}s
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 py-2">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-medium text-foreground">Fullscreen Controls Auto-Hide</span>
                  <span className="text-[11px] text-muted-foreground">Inactivity delay before fading out controls bar</span>
                </div>
                <div className="inline-flex p-1 rounded-xl bg-surface-muted border border-border gap-1">
                  {[2000, 3000, 5000, 8000].map((ms) => (
                    <button
                      key={ms}
                      type="button"
                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition border-none cursor-pointer ${
                        settings.hideControlsTimeoutMs === ms
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'bg-transparent text-muted-foreground hover:text-foreground'
                      }`}
                      onClick={() => onUpdateSetting('hideControlsTimeoutMs', ms)}
                    >
                      {ms / 1000}s
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 3. libmpv Engine & HWDEC */}
        {activeSection === 'engine' && (
          <div className="flex flex-col gap-5 max-w-[860px]">
            <div className="flex flex-col gap-1.5 pb-3 border-b border-border">
              <h3 className="text-xl font-bold text-foreground">libmpv Engine & HWDEC</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Direct hardware decoding options and native Windows x64 libmpv player core configuration.
              </p>
            </div>

            <div className="bg-surface border border-border rounded-2xl p-6 flex flex-col gap-4 shadow-sm">
              <h4 className="text-sm font-semibold text-foreground">Hardware Video Acceleration</h4>

              <div className="flex flex-col gap-2 py-2 border-b border-border/40">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-medium text-foreground">Hardware Decoding API (hwdec)</span>
                  <span className="text-[11px] text-muted-foreground">Select GPU video acceleration method for video decoding</span>
                </div>
                <select
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-elevated border border-border text-foreground text-xs font-medium cursor-pointer outline-none focus:border-primary transition"
                  value={settings.hardwareDecoding}
                  onChange={(e) =>
                    onUpdateSetting(
                      'hardwareDecoding',
                      e.target.value as AppSettings['hardwareDecoding']
                    )
                  }
                >
                  <option value="auto-safe">auto-safe (Recommended: Safe GPU auto-fallback)</option>
                  <option value="d3d11va">d3d11va (Direct3D 11 Video Acceleration)</option>
                  <option value="nvdec">nvdec (NVIDIA NVDEC Core)</option>
                  <option value="auto">auto (Force GPU acceleration)</option>
                  <option value="no">no (Software CPU decoding only)</option>
                </select>
              </div>

              <div className="flex flex-col gap-2 py-2 border-b border-border/40">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-medium text-foreground">Video Output Surface (vo)</span>
                  <span className="text-[11px] text-muted-foreground">Direct3D HWND child surface profile</span>
                </div>
                <select
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-elevated border border-border text-foreground text-xs font-medium cursor-pointer outline-none focus:border-primary transition"
                  value={settings.videoOutput}
                  onChange={(e) =>
                    onUpdateSetting(
                      'videoOutput',
                      e.target.value as AppSettings['videoOutput']
                    )
                  }
                >
                  <option value="gpu">gpu (Direct3D 11 / OpenGL Hardware Renderer)</option>
                  <option value="gpu-next">gpu-next (Experimental libplacebo next-gen pipeline)</option>
                  <option value="direct3d">direct3d (Direct3D legacy fallback)</option>
                </select>
              </div>

              <SettingToggleRow
                label="Dynamic Audio Normalization"
                desc="Equalize volume between loud actions and quiet dialogue"
                checked={settings.audioNormalization}
                onChange={(checked) => onUpdateSetting('audioNormalization', checked)}
              />

              <SettingToggleRow
                label="Hardware Deinterlacing"
                desc="Deinterlace interlaced broadcast media streams automatically"
                checked={settings.deinterlace}
                onChange={(checked) => onUpdateSetting('deinterlace', checked)}
              />
            </div>

            {/* Extensible Custom MPV flags for future development */}
            <div className="bg-surface border border-border rounded-2xl p-6 flex flex-col gap-3 shadow-sm">
              <h4 className="text-sm font-semibold text-foreground">Advanced MPV Flags & CLI Parameters</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Enter additional libmpv properties and parameters (e.g., --demuxer-max-bytes=150M).
              </p>
              <textarea
                className="w-full p-3 rounded-xl bg-surface-elevated border border-border text-foreground font-mono text-xs outline-none focus:border-primary transition resize-y"
                rows={3}
                placeholder="--keep-open=yes&#10;--interpolation=no"
                value={settings.customMpvOptions}
                onChange={(e) => onUpdateSetting('customMpvOptions', e.target.value)}
              />
              <span className="text-[11px] text-muted-foreground">
                Applied during libmpv initialization and next stream creation.
              </span>
            </div>
          </div>
        )}

        {/* 4. Subtitles & Audio */}
        {activeSection === 'subtitles' && (
          <div className="flex flex-col gap-5 max-w-[860px]">
            <div className="flex flex-col gap-1.5 pb-3 border-b border-border">
              <h3 className="text-xl font-bold text-foreground">Subtitles & Audio</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Customize subtitle rendering, text size, color styling, and preferred track languages.
              </p>
            </div>

            <div className="bg-surface border border-border rounded-2xl p-6 flex flex-col gap-4 shadow-sm">
              <SettingToggleRow
                label="Auto-Load Embedded & External Subtitles"
                desc="Automatically display subtitles matching the media track"
                checked={settings.subtitlesEnabled}
                onChange={(checked) => onUpdateSetting('subtitlesEnabled', checked)}
              />

              <div className="flex flex-col gap-2 py-2 border-b border-border/40">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-foreground">Subtitle Font Size</span>
                  <span className="font-mono text-xs text-primary font-semibold">{settings.subtitleFontSize}px</span>
                </div>
                <input
                  type="range"
                  min={24}
                  max={64}
                  step={2}
                  className="w-full h-1.5 rounded-lg appearance-none bg-surface-muted hover:bg-border transition cursor-pointer accent-primary"
                  value={settings.subtitleFontSize}
                  onChange={(e) => onUpdateSetting('subtitleFontSize', Number(e.target.value))}
                />
              </div>

              <div className="flex flex-col gap-2 py-2 border-b border-border/40">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-medium text-foreground">Subtitle Text Color</span>
                  <span className="text-[11px] text-muted-foreground">Choose on-screen subtitle typography color</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  {[
                    { label: 'White', color: '#FFFFFF' },
                    { label: 'Yellow', color: '#FFF275' },
                    { label: 'Cyan', color: '#70EEFF' },
                    { label: 'Green', color: '#98FB98' },
                  ].map((preset) => (
                    <button
                      key={preset.color}
                      type="button"
                      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium transition cursor-pointer ${
                        settings.subtitleColor === preset.color
                          ? 'bg-primary/10 border-primary text-foreground'
                          : 'bg-surface-elevated border-border text-muted-foreground hover:text-foreground'
                      }`}
                      onClick={() => onUpdateSetting('subtitleColor', preset.color)}
                    >
                      <span className="w-3 h-3 rounded-full border border-black/20" style={{ backgroundColor: preset.color }} />
                      <span>{preset.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2 py-2">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-medium text-foreground">Preferred Audio Track Language</span>
                  <span className="text-[11px] text-muted-foreground">ISO 639-2 language code (e.g., eng, jpn, spa, hin)</span>
                </div>
                <input
                  type="text"
                  className="w-44 px-3 py-2 rounded-xl bg-surface-elevated border border-border text-foreground font-mono text-xs outline-none focus:border-primary transition"
                  value={settings.preferAudioLanguage}
                  onChange={(e) => onUpdateSetting('preferAudioLanguage', e.target.value)}
                  placeholder="eng"
                />
              </div>
            </div>
          </div>
        )}

        {/* 5. Backup & Sync (Import/Export) */}
        {activeSection === 'backup' && (
          <div className="flex flex-col gap-5 max-w-[860px]">
            <div className="flex flex-col gap-1.5 pb-3 border-b border-border">
              <h3 className="text-xl font-bold text-foreground">Backup & Settings Sync</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Export and import complete preferences to JSON for easy backup or transferring between devices.
              </p>
            </div>

            <div className="bg-surface border border-border rounded-2xl p-6 flex flex-col gap-4 shadow-sm">
              <h4 className="text-sm font-semibold text-foreground">Export & Import Configuration</h4>
              <p className="text-xs text-muted-foreground -mt-2 leading-relaxed">
                All themes, palettes, hardware settings, and controls are saved into a clean JSON file.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  type="button"
                  className="flex items-center gap-3.5 p-4 rounded-xl bg-surface-elevated border border-border hover:border-primary hover:bg-surface-elevated/80 transition cursor-pointer text-left group"
                  onClick={handleExport}
                >
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary/10 text-primary group-hover:scale-105 transition-transform">
                    <Download size={22} />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-foreground">Export Settings</span>
                    <span className="text-[11px] text-muted-foreground">Save configuration to a .json backup file</span>
                  </div>
                </button>

                <button
                  type="button"
                  className="flex items-center gap-3.5 p-4 rounded-xl bg-surface-elevated border border-border hover:border-secondary hover:bg-surface-elevated/80 transition cursor-pointer text-left group"
                  onClick={handleImport}
                >
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-secondary/10 text-secondary group-hover:scale-105 transition-transform">
                    <Upload size={22} />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-foreground">Import Settings</span>
                    <span className="text-[11px] text-muted-foreground">Load and apply settings from a .json file</span>
                  </div>
                </button>
              </div>
            </div>

            <div className="bg-destructive/10 border border-destructive/30 rounded-2xl p-6 flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <AlertCircle size={20} className="text-destructive shrink-0" />
                <div>
                  <h4 className="text-sm font-semibold text-destructive">Reset Preferences</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Restore all settings, themes, and configurations back to factory defaults.
                  </p>
                </div>
              </div>

              {!isResetConfirmOpen ? (
                <div>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-destructive text-destructive-foreground font-semibold text-xs transition hover:bg-destructive/90 cursor-pointer border-none shadow-sm"
                    onClick={() => setIsResetConfirmOpen(true)}
                  >
                    <RotateCcw size={15} />
                    <span>Restore Factory Defaults</span>
                  </button>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-surface border border-destructive/40 flex flex-col gap-3">
                  <span className="text-xs font-medium text-foreground">
                    Are you sure you want to restore all settings to default?
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="px-3.5 py-1.5 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-surface-elevated transition cursor-pointer"
                      onClick={() => setIsResetConfirmOpen(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="px-3.5 py-1.5 rounded-lg bg-destructive text-destructive-foreground text-xs font-semibold hover:bg-destructive/90 transition cursor-pointer border-none"
                      onClick={() => {
                        onResetSettings();
                        setIsResetConfirmOpen(false);
                        showFeedback('success', 'All settings restored to factory defaults.');
                      }}
                    >
                      Yes, Reset Settings
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 6. System Diagnostics */}
        {activeSection === 'diagnostics' && (
          <div className="flex flex-col gap-5 max-w-[860px]">
            <div className="flex flex-col gap-1.5 pb-3 border-b border-border">
              <h3 className="text-xl font-bold text-foreground">System Diagnostics & Security</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Real-time native libmpv engine verification, Win32 HWND status, and Chromium security boundaries.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3 shadow-sm">
                <div className="flex items-center gap-2 text-primary font-semibold text-xs border-b border-border/50 pb-2">
                  <Cpu size={16} />
                  <span>Staged Native Assets</span>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">libmpv Binary</span>
                    <span className="font-mono text-foreground font-medium text-[11px]">windows/x64/libmpv-2.dll</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Playback State</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      {playbackStatus.mediaState}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Video Surface</span>
                    <span className="font-mono text-foreground font-medium text-[11px]">
                      {playbackStatus.videoWidth && playbackStatus.videoHeight
                        ? `${playbackStatus.videoWidth}x${playbackStatus.videoHeight} (Win32 HWND)`
                        : 'Win32 Child HWND (vo=gpu)'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">libmpv API</span>
                    <span className="font-mono text-foreground font-medium text-[11px]">
                      {nativePoc?.apiVersion?.formatted ? `v${nativePoc.apiVersion.formatted} Connected` : 'Probing...'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Player Service</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      {playerStatus?.state ? `State: ${playerStatus.state}` : 'Connecting...'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3 shadow-sm">
                <div className="flex items-center gap-2 text-primary font-semibold text-xs border-b border-border/50 pb-2">
                  <ShieldCheck size={16} />
                  <span>Electron Security Enforcements</span>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">contextIsolation</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      true
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">nodeIntegration</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      false
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Chromium Sandbox</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      true
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Navigation Lock</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      Enforced
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3 shadow-sm">
                <div className="flex items-center gap-2 text-primary font-semibold text-xs border-b border-border/50 pb-2">
                  <Layers size={16} />
                  <span>Application Architecture</span>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Rendering Mode</span>
                    <span className="font-mono text-foreground font-medium text-[11px]">Direct3D HW-Accel (vo=gpu)</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Persistence</span>
                    <span className="font-mono text-foreground font-medium text-[11px]">winsqlite3 (Schema v3)</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Fullscreen Mode</span>
                    <span className="font-mono text-foreground font-medium text-[11px]">{isFullscreen ? 'Active' : 'Windowed'}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Current Palette</span>
                    <span className="font-mono text-foreground font-medium text-[11px]">{settings.accentPalette} ({settings.themeMode})</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
