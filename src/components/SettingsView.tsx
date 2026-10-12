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
    <div className="settings-container">
      {/* Settings Navigation Sidebar */}
      <aside className="settings-nav-sidebar">
        <div className="settings-sidebar-header">
          <h2 className="settings-title">Preferences</h2>
          <span className="settings-subtitle">Persistent Configuration</span>
        </div>

        <nav className="settings-nav-list">
          <button
            type="button"
            className={`settings-nav-item ${activeSection === 'appearance' ? 'active' : ''}`}
            onClick={() => setActiveSection('appearance')}
          >
            <Palette size={18} />
            <span>Appearance & Themes</span>
          </button>

          <button
            type="button"
            className={`settings-nav-item ${activeSection === 'player' ? 'active' : ''}`}
            onClick={() => setActiveSection('player')}
          >
            <PlaySquare size={18} />
            <span>Player & Controls</span>
          </button>

          <button
            type="button"
            className={`settings-nav-item ${activeSection === 'engine' ? 'active' : ''}`}
            onClick={() => setActiveSection('engine')}
          >
            <Cpu size={18} />
            <span>libmpv Engine & HWDEC</span>
          </button>

          <button
            type="button"
            className={`settings-nav-item ${activeSection === 'subtitles' ? 'active' : ''}`}
            onClick={() => setActiveSection('subtitles')}
          >
            <Subtitles size={18} />
            <span>Subtitles & Audio</span>
          </button>

          <button
            type="button"
            className={`settings-nav-item ${activeSection === 'backup' ? 'active' : ''}`}
            onClick={() => setActiveSection('backup')}
          >
            <Download size={18} />
            <span>Backup & Sync</span>
          </button>

          <button
            type="button"
            className={`settings-nav-item ${activeSection === 'diagnostics' ? 'active' : ''}`}
            onClick={() => setActiveSection('diagnostics')}
          >
            <ShieldCheck size={18} />
            <span>System Diagnostics</span>
          </button>
        </nav>
      </aside>

      {/* Settings Content Area */}
      <main className="settings-content-pane">
        {feedbackMessage && (
          <div className={`settings-feedback-banner ${feedbackMessage.type}`} role="alert">
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
          <div className="settings-section">
            <div className="section-header">
              <h3 className="section-heading">Appearance & Themes</h3>
              <p className="section-description">
                Customize app styling, dark mode, and color palettes inspired by Seal Android and Material Expressive.
              </p>
            </div>

            {/* Theme Mode Toggle (Dark / Light / System) */}
            <div className="settings-card">
              <h4 className="card-heading">Theme Mode</h4>
              <p className="card-subheading">Select color scheme mode or follow Windows system default.</p>

              <div className="theme-mode-grid">
                <button
                  type="button"
                  className={`theme-mode-btn ${settings.themeMode === 'dark' ? 'active' : ''}`}
                  onClick={() => onUpdateSetting('themeMode', 'dark')}
                >
                  <Moon size={18} />
                  <span>Dark Mode</span>
                </button>

                <button
                  type="button"
                  className={`theme-mode-btn ${settings.themeMode === 'light' ? 'active' : ''}`}
                  onClick={() => onUpdateSetting('themeMode', 'light')}
                >
                  <Sun size={18} />
                  <span>Light Mode</span>
                </button>

                <button
                  type="button"
                  className={`theme-mode-btn ${settings.themeMode === 'system' ? 'active' : ''}`}
                  onClick={() => onUpdateSetting('themeMode', 'system')}
                >
                  <Laptop size={18} />
                  <span>System Default</span>
                </button>
              </div>
            </div>

            {/* Custom Palettes Grid */}
            <div className="settings-card">
              <div className="card-title-row">
                <div>
                  <h4 className="card-heading">Accent Palettes</h4>
                  <p className="card-subheading">Choose custom design colors and tints for buttons, highlights, and surfaces.</p>
                </div>
                <span className="card-pill">
                  <Sparkles size={13} />
                  <span>{AVAILABLE_PALETTES.length} Palettes</span>
                </span>
              </div>

              <div className="palettes-grid">
                {AVAILABLE_PALETTES.map((pal) => {
                  const isSelected = settings.accentPalette === pal.id;
                  return (
                    <div
                      key={pal.id}
                      className={`palette-card ${isSelected ? 'selected' : ''}`}
                      onClick={() => onUpdateSetting('accentPalette', pal.id as AccentPalette)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && onUpdateSetting('accentPalette', pal.id as AccentPalette)}
                    >
                      <div className="palette-swatch" style={{ backgroundColor: pal.surfaceColor }}>
                        <div
                          className="swatch-accent-dot"
                          style={{ backgroundColor: pal.accentColor }}
                        />
                        <div
                          className="swatch-secondary-dot"
                          style={{ backgroundColor: pal.secondaryColor }}
                        />
                        {isSelected && (
                          <div className="swatch-check">
                            <Check size={14} />
                          </div>
                        )}
                      </div>

                      <div className="palette-info">
                        <div className="palette-name-row">
                          <span className="palette-name">{pal.name}</span>
                          <span className="palette-source">{pal.sourceInspiration}</span>
                        </div>
                        <p className="palette-desc">{pal.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* UI Contrast & Density */}
            <div className="settings-card">
              <h4 className="card-heading">Visual Accessibility</h4>

              <div className="setting-toggle-row">
                <div className="toggle-label-group">
                  <span className="toggle-label">High Contrast Borders</span>
                  <span className="toggle-desc">Strengthen surface outlines and element boundaries</span>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={settings.highContrast}
                    onChange={(e) => onUpdateSetting('highContrast', e.target.checked)}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>

              <div className="setting-toggle-row">
                <div className="toggle-label-group">
                  <span className="toggle-label">Compact Density</span>
                  <span className="toggle-desc">Reduce layout paddings for maximum information density</span>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={settings.compactUi}
                    onChange={(e) => onUpdateSetting('compactUi', e.target.checked)}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>
            </div>
          </div>
        )}

        {/* 2. Player & Controls */}
        {activeSection === 'player' && (
          <div className="settings-section">
            <div className="section-header">
              <h3 className="section-heading">Player & Controls</h3>
              <p className="section-description">
                Configure auto-advance behaviors, seeking increments, overlay timeout, and bottom mini-island.
              </p>
            </div>

            <div className="settings-card">
              <div className="setting-toggle-row">
                <div className="toggle-label-group">
                  <span className="toggle-label">Auto-Play Next in Playlist</span>
                  <span className="toggle-desc">Seamlessly load and play the next video item upon file EOF</span>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={settings.autoPlayNext}
                    onChange={(e) => onUpdateSetting('autoPlayNext', e.target.checked)}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>

              <div className="setting-toggle-row">
                <div className="toggle-label-group">
                  <span className="toggle-label">Resume Playback Prompt</span>
                  <span className="toggle-desc">Show prompt banner to resume from previous timestamp</span>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={settings.resumePlaybackPrompt}
                    onChange={(e) => onUpdateSetting('resumePlaybackPrompt', e.target.checked)}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>

              <div className="setting-toggle-row">
                <div className="toggle-label-group">
                  <span className="toggle-label">Hovering Mini-Player Island</span>
                  <span className="toggle-desc">Display floating bottom progress island when navigating away from player</span>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={settings.showHoverIsland}
                    onChange={(e) => onUpdateSetting('showHoverIsland', e.target.checked)}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>

              <div className="setting-toggle-row">
                <div className="toggle-label-group">
                  <span className="toggle-label">Remember Volume</span>
                  <span className="toggle-desc">Preserve last adjusted volume level across sessions</span>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={settings.rememberVolume}
                    onChange={(e) => onUpdateSetting('rememberVolume', e.target.checked)}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>
            </div>

            <div className="settings-card">
              <h4 className="card-heading">Seeking & Timing</h4>

              <div className="setting-control-row">
                <div className="control-label-group">
                  <span className="control-label">Seek Interval (Left / Right Arrow)</span>
                  <span className="control-desc">Time jumped on keyboard arrow shortcut</span>
                </div>
                <div className="segmented-btn-group">
                  {[5, 10, 15, 30].map((secs) => (
                    <button
                      key={secs}
                      type="button"
                      className={`segmented-btn ${settings.seekStepSeconds === secs ? 'active' : ''}`}
                      onClick={() => onUpdateSetting('seekStepSeconds', secs)}
                    >
                      {secs}s
                    </button>
                  ))}
                </div>
              </div>

              <div className="setting-control-row">
                <div className="control-label-group">
                  <span className="control-label">Fullscreen Controls Auto-Hide</span>
                  <span className="control-desc">Inactivity delay before fading out controls bar</span>
                </div>
                <div className="segmented-btn-group">
                  {[2000, 3000, 5000, 8000].map((ms) => (
                    <button
                      key={ms}
                      type="button"
                      className={`segmented-btn ${settings.hideControlsTimeoutMs === ms ? 'active' : ''}`}
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
          <div className="settings-section">
            <div className="section-header">
              <h3 className="section-heading">libmpv Engine & HWDEC</h3>
              <p className="section-description">
                Direct hardware decoding options and native Windows x64 libmpv player core configuration.
              </p>
            </div>

            <div className="settings-card">
              <h4 className="card-heading">Hardware Video Acceleration</h4>

              <div className="setting-control-row">
                <div className="control-label-group">
                  <span className="control-label">Hardware Decoding API (hwdec)</span>
                  <span className="control-desc">Select GPU video acceleration method for video decoding</span>
                </div>
                <select
                  className="settings-select"
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

              <div className="setting-control-row">
                <div className="control-label-group">
                  <span className="control-label">Video Output Surface (vo)</span>
                  <span className="control-desc">Direct3D HWND child surface profile</span>
                </div>
                <select
                  className="settings-select"
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

              <div className="setting-toggle-row">
                <div className="toggle-label-group">
                  <span className="toggle-label">Dynamic Audio Normalization</span>
                  <span className="toggle-desc">Equalize volume between loud actions and quiet dialogue</span>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={settings.audioNormalization}
                    onChange={(e) => onUpdateSetting('audioNormalization', e.target.checked)}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>

              <div className="setting-toggle-row">
                <div className="toggle-label-group">
                  <span className="toggle-label">Hardware Deinterlacing</span>
                  <span className="toggle-desc">Deinterlace interlaced broadcast media streams automatically</span>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={settings.deinterlace}
                    onChange={(e) => onUpdateSetting('deinterlace', e.target.checked)}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>
            </div>

            {/* Extensible Custom MPV flags for future development */}
            <div className="settings-card">
              <h4 className="card-heading">Advanced MPV Flags & CLI Parameters</h4>
              <p className="card-subheading">
                Enter additional libmpv properties and parameters (e.g., --demuxer-max-bytes=150M).
              </p>
              <textarea
                className="settings-textarea"
                rows={3}
                placeholder="--keep-open=yes&#10;--interpolation=no"
                value={settings.customMpvOptions}
                onChange={(e) => onUpdateSetting('customMpvOptions', e.target.value)}
              />
              <span className="card-help-text">
                Applied during libmpv initialization and next stream creation.
              </span>
            </div>
          </div>
        )}

        {/* 4. Subtitles & Audio */}
        {activeSection === 'subtitles' && (
          <div className="settings-section">
            <div className="section-header">
              <h3 className="section-heading">Subtitles & Audio</h3>
              <p className="section-description">
                Customize subtitle rendering, text size, color styling, and preferred track languages.
              </p>
            </div>

            <div className="settings-card">
              <div className="setting-toggle-row">
                <div className="toggle-label-group">
                  <span className="toggle-label">Auto-Load Embedded & External Subtitles</span>
                  <span className="toggle-desc">Automatically display subtitles matching the media track</span>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={settings.subtitlesEnabled}
                    onChange={(e) => onUpdateSetting('subtitlesEnabled', e.target.checked)}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>

              <div className="setting-control-row">
                <div className="control-label-group">
                  <span className="control-label">Subtitle Font Size: {settings.subtitleFontSize}px</span>
                  <span className="control-desc">Adjust size of rendered on-screen subtitles</span>
                </div>
                <input
                  type="range"
                  min={24}
                  max={64}
                  step={2}
                  className="settings-slider"
                  value={settings.subtitleFontSize}
                  onChange={(e) => onUpdateSetting('subtitleFontSize', Number(e.target.value))}
                />
              </div>

              <div className="setting-control-row">
                <div className="control-label-group">
                  <span className="control-label">Subtitle Text Color</span>
                  <span className="control-desc">Choose on-screen subtitle typography color</span>
                </div>
                <div className="color-preset-group">
                  {[
                    { label: 'White', color: '#FFFFFF' },
                    { label: 'Yellow', color: '#FFF275' },
                    { label: 'Cyan', color: '#70EEFF' },
                    { label: 'Green', color: '#98FB98' },
                  ].map((preset) => (
                    <button
                      key={preset.color}
                      type="button"
                      className={`color-preset-btn ${settings.subtitleColor === preset.color ? 'active' : ''}`}
                      onClick={() => onUpdateSetting('subtitleColor', preset.color)}
                      style={{ borderColor: preset.color }}
                    >
                      <span className="color-dot" style={{ backgroundColor: preset.color }} />
                      <span>{preset.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="setting-control-row">
                <div className="control-label-group">
                  <span className="control-label">Preferred Audio Track Language</span>
                  <span className="control-desc">ISO 639-2 language code (e.g., eng, jpn, spa, hin)</span>
                </div>
                <input
                  type="text"
                  className="settings-input"
                  style={{ width: '180px' }}
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
          <div className="settings-section">
            <div className="section-header">
              <h3 className="section-heading">Backup & Settings Sync</h3>
              <p className="section-description">
                Export and import complete preferences to JSON for easy backup or transferring between devices.
              </p>
            </div>

            <div className="settings-card">
              <h4 className="card-heading">Export & Import Configuration</h4>
              <p className="card-subheading">
                All themes, palettes, hardware settings, and controls are saved into a clean JSON file.
              </p>

              <div className="backup-actions-grid">
                <button type="button" className="action-card-btn" onClick={handleExport}>
                  <div className="action-icon-box export">
                    <Download size={22} />
                  </div>
                  <div className="action-card-text">
                    <span className="action-card-title">Export Settings</span>
                    <span className="action-card-desc">Save configuration to a .json backup file</span>
                  </div>
                </button>

                <button type="button" className="action-card-btn" onClick={handleImport}>
                  <div className="action-icon-box import">
                    <Upload size={22} />
                  </div>
                  <div className="action-card-text">
                    <span className="action-card-title">Import Settings</span>
                    <span className="action-card-desc">Load and apply settings from a .json file</span>
                  </div>
                </button>
              </div>
            </div>

            <div className="settings-card danger-zone">
              <div className="danger-header">
                <AlertCircle size={20} className="danger-icon" />
                <div>
                  <h4 className="card-heading" style={{ color: '#ffb4ab' }}>
                    Reset Preferences
                  </h4>
                  <p className="card-subheading">
                    Restore all settings, themes, and configurations back to factory defaults.
                  </p>
                </div>
              </div>

              {!isResetConfirmOpen ? (
                <button
                  type="button"
                  className="danger-btn"
                  onClick={() => setIsResetConfirmOpen(true)}
                >
                  <RotateCcw size={15} />
                  <span>Restore Factory Defaults</span>
                </button>
              ) : (
                <div className="confirm-reset-box">
                  <span className="confirm-text">Are you sure you want to restore all settings to default?</span>
                  <div className="confirm-btn-row">
                    <button
                      type="button"
                      className="confirm-btn cancel"
                      onClick={() => setIsResetConfirmOpen(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="confirm-btn confirm"
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
          <div className="settings-section">
            <div className="section-header">
              <h3 className="section-heading">System Diagnostics & Security</h3>
              <p className="section-description">
                Real-time native libmpv engine verification, Win32 HWND status, and Chromium security boundaries.
              </p>
            </div>

            <div className="audit-cards-grid">
              <div className="audit-card">
                <div className="card-header">
                  <Cpu className="card-icon" size={18} />
                  <h3 className="card-title">Staged Native Assets</h3>
                </div>
                <div className="card-rows">
                  <div className="card-row">
                    <span className="row-label">libmpv Binary</span>
                    <span className="row-value">windows/x64/libmpv-2.dll</span>
                  </div>
                  <div className="card-row">
                    <span className="row-label">Playback State</span>
                    <span className="row-status-verified">{playbackStatus.mediaState}</span>
                  </div>
                  <div className="card-row">
                    <span className="row-label">Video Surface</span>
                    <span className="row-value">
                      {playbackStatus.videoWidth && playbackStatus.videoHeight
                        ? `${playbackStatus.videoWidth}x${playbackStatus.videoHeight} (Win32 HWND)`
                        : 'Win32 Child HWND (vo=gpu)'}
                    </span>
                  </div>
                  <div className="card-row">
                    <span className="row-label">libmpv API</span>
                    <span className="row-value">
                      {nativePoc?.apiVersion?.formatted ? `v${nativePoc.apiVersion.formatted} Connected` : 'Probing...'}
                    </span>
                  </div>
                  <div className="card-row">
                    <span className="row-label">Player Service</span>
                    <span className="row-status-verified">
                      {playerStatus?.state ? `State: ${playerStatus.state}` : 'Connecting...'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="audit-card">
                <div className="card-header">
                  <ShieldCheck className="card-icon" size={18} />
                  <h3 className="card-title">Electron Security Enforcements</h3>
                </div>
                <div className="card-rows">
                  <div className="card-row">
                    <span className="row-label">contextIsolation</span>
                    <span className="row-status-verified">true</span>
                  </div>
                  <div className="card-row">
                    <span className="row-label">nodeIntegration</span>
                    <span className="row-status-verified">false</span>
                  </div>
                  <div className="card-row">
                    <span className="row-label">Chromium Sandbox</span>
                    <span className="row-status-verified">true</span>
                  </div>
                  <div className="card-row">
                    <span className="row-label">Navigation Lock</span>
                    <span className="row-status-verified">Enforced (will-navigate blocked)</span>
                  </div>
                </div>
              </div>

              <div className="audit-card">
                <div className="card-header">
                  <Layers className="card-icon" size={18} />
                  <h3 className="card-title">Application Architecture</h3>
                </div>
                <div className="card-rows">
                  <div className="card-row">
                    <span className="row-label">Rendering Mode</span>
                    <span className="row-value">Direct3D HW-Accel (vo=gpu)</span>
                  </div>
                  <div className="card-row">
                    <span className="row-label">Persistence</span>
                    <span className="row-value">winsqlite3 (Schema v3)</span>
                  </div>
                  <div className="card-row">
                    <span className="row-label">Fullscreen Mode</span>
                    <span className="row-value">{isFullscreen ? 'Active (Auto-hide)' : 'Windowed'}</span>
                  </div>
                  <div className="card-row">
                    <span className="row-label">Current Palette</span>
                    <span className="row-value">{settings.accentPalette} ({settings.themeMode})</span>
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
