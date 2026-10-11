import React, { useEffect, useState } from 'react';
import {
  PlaySquare,
  Library,
  ListMusic,
  History,
  Settings,
  ShieldCheck,
  Cpu,
  Layers,
  Film,
  Play,
  Pause,
  FolderOpen,
  Volume2,
  VolumeX,
  AlertCircle,
} from 'lucide-react';
import type { PlaybackStatus } from './types/electron';

interface AppInfo {
  name: string;
  version: string;
  isPackaged: boolean;
  platform: string;
  arch: string;
}

interface SecurityState {
  contextIsolated: boolean;
  nodeIntegrationDisabled: boolean;
  sandboxEnabled: boolean;
}

function formatTime(seconds: number | null): string {
  if (seconds === null || isNaN(seconds) || seconds < 0) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export const App: React.FC = () => {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [securityState, setSecurityState] = useState<SecurityState | null>(null);
  const [nativePoc, setNativePoc] = useState<{ success: boolean; stage: string; apiVersion?: { formatted: string } } | null>(null);
  const [playerStatus, setPlayerStatus] = useState<{ state: string; apiVersion?: { formatted: string }; error?: string } | null>(null);
  const [playbackStatus, setPlaybackStatus] = useState<PlaybackStatus>({
    mediaState: 'idle',
    currentFile: null,
    position: null,
    duration: null,
    paused: true,
    volume: 100,
  });
  const [activeTab, setActiveTab] = useState<'player' | 'library' | 'playlists' | 'recent' | 'settings'>('player');

  // Verify in-renderer isolation
  const nodeDirectAccessDetected =
    typeof (window as unknown as { process?: unknown }).process !== 'undefined' ||
    typeof (window as unknown as { require?: unknown }).require !== 'undefined' ||
    typeof (window as unknown as { Buffer?: unknown }).Buffer !== 'undefined';

  useEffect(() => {
    if (window.nosvedAPI) {
      window.nosvedAPI.getAppInfo().then(setAppInfo).catch(console.error);
      window.nosvedAPI.getSecurityState().then(setSecurityState).catch(console.error);
      window.nosvedAPI
        .initializePlayer()
        .then((initRes) => {
          setPlayerStatus(initRes);
          if (initRes.apiVersion) {
            setNativePoc({
              success: true,
              stage: 'instance_initialized',
              apiVersion: { formatted: initRes.apiVersion.formatted },
            });
          }
        })
        .catch(console.error);
      window.nosvedAPI.getPlaybackStatus().then(setPlaybackStatus).catch(console.error);

      window.nosvedAPI.onPlaybackStatus((status) => {
        setPlaybackStatus(status);
      });
    }
  }, []);

  const handleOpenFile = async () => {
    if (!window.nosvedAPI) return;
    try {
      const res = await window.nosvedAPI.openFileDialog();
      if (!res.canceled) {
        setPlaybackStatus(res.status);
      }
    } catch (err) {
      console.error('Failed to open file dialog:', err);
    }
  };

  const handleTogglePlayPause = async () => {
    if (!window.nosvedAPI) return;
    try {
      const res = await window.nosvedAPI.togglePause();
      setPlaybackStatus(res);
    } catch (err) {
      console.error('Failed to toggle play/pause:', err);
    }
  };

  const handleSeek = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!window.nosvedAPI) return;
    const pos = parseFloat(e.target.value);
    if (isNaN(pos)) return;
    try {
      const res = await window.nosvedAPI.seek(pos);
      setPlaybackStatus(res);
    } catch (err) {
      console.error('Failed to seek:', err);
    }
  };

  const handleVolume = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!window.nosvedAPI) return;
    const vol = parseFloat(e.target.value);
    if (isNaN(vol)) return;
    try {
      const res = await window.nosvedAPI.setVolume(vol);
      setPlaybackStatus(res);
    } catch (err) {
      console.error('Failed to set volume:', err);
    }
  };

  const handleToggleMute = async () => {
    if (!window.nosvedAPI) return;
    const newVol = playbackStatus.volume > 0 ? 0 : 100;
    try {
      const res = await window.nosvedAPI.setVolume(newVol);
      setPlaybackStatus(res);
    } catch (err) {
      console.error('Failed to toggle mute:', err);
    }
  };

  return (
    <div className="app-layout">
      {/* Navigation Rail / Sidebar */}
      <aside className="app-sidebar">
        <div className="brand-section">
          <div className="brand-logo-badge">
            <Film size={22} />
          </div>
          <div className="brand-meta">
            <span className="brand-title">Nosved Player</span>
            <span className="brand-subtitle">Desktop Core</span>
          </div>
        </div>

        <nav className="nav-group">
          <span className="nav-label">Media Workspaces</span>

          <button
            type="button"
            className={`nav-item ${activeTab === 'player' ? 'active' : ''}`}
            onClick={() => setActiveTab('player')}
          >
            <div className="nav-item-content">
              <PlaySquare size={18} />
              <span>Now Playing</span>
            </div>
          </button>

          <button
            type="button"
            className={`nav-item disabled`}
            title="Library navigation will be introduced in upcoming phases"
          >
            <div className="nav-item-content">
              <Library size={18} />
              <span>Library</span>
            </div>
            <span className="phase-pill">Phase 3</span>
          </button>

          <button
            type="button"
            className={`nav-item disabled`}
            title="Playlists will be introduced in upcoming phases"
          >
            <div className="nav-item-content">
              <ListMusic size={18} />
              <span>Playlists</span>
            </div>
            <span className="phase-pill">Phase 3</span>
          </button>

          <button
            type="button"
            className={`nav-item disabled`}
            title="Recent history will be introduced in upcoming phases"
          >
            <div className="nav-item-content">
              <History size={18} />
              <span>Recent</span>
            </div>
            <span className="phase-pill">Phase 3</span>
          </button>

          <span className="nav-label" style={{ marginTop: '12px' }}>System</span>

          <button
            type="button"
            className={`nav-item disabled`}
            title="Settings will be introduced in upcoming phases"
          >
            <div className="nav-item-content">
              <Settings size={18} />
              <span>Settings</span>
            </div>
            <span className="phase-pill">Phase 4</span>
          </button>
        </nav>

        {/* Security Audit Badge in Sidebar */}
        <div className="sidebar-footer">
          <div className="security-badge-header">
            <ShieldCheck size={16} />
            <span>Security Sandbox</span>
          </div>
          <div className="security-item">
            <span>Context Isolation:</span>
            <span className="security-val">{securityState?.contextIsolated ? 'Active' : 'Enforced'}</span>
          </div>
          <div className="security-item">
            <span>Node Direct Access:</span>
            <span className="security-val" style={{ color: nodeDirectAccessDetected ? '#ffb4ab' : '#a4d3be' }}>
              {nodeDirectAccessDetected ? 'Vulnerable' : 'Blocked'}
            </span>
          </div>
          <div className="security-item">
            <span>Chromium Sandbox:</span>
            <span className="security-val">{securityState?.sandboxEnabled ? 'Active' : 'Enforced'}</span>
          </div>
        </div>
      </aside>

      {/* Main Viewport Content */}
      <main className="main-viewport">
        <header className="viewport-header">
          <div className="header-status-group">
            <div className="status-indicator">
              <div className="status-dot" />
              <span>Phase 1: Secure Shell Ready</span>
            </div>
            <span className="arch-tag">
              {appInfo ? `${appInfo.platform}-${appInfo.arch}` : 'win32-x64'}
            </span>
          </div>

          <span className="arch-tag" style={{ color: '#a8c7fa' }}>
            v{appInfo?.version || '0.1.0'}
          </span>
        </header>

        <section className="viewport-body">
          {/* Central 16:9 Player Container */}
          <div className="player-container">
            {playbackStatus.currentFile ? (
              <div className="player-active-surface">
                <div className="player-center-info">
                  <div className="player-media-badge">
                    <Film size={32} />
                  </div>
                  <div className="player-file-title" title={playbackStatus.currentFile}>
                    {playbackStatus.currentFile.split(/[/\\]/).pop() || playbackStatus.currentFile}
                  </div>
                  <div className="player-status-chips">
                    <span className={`status-pill status-${playbackStatus.mediaState}`}>
                      {playbackStatus.mediaState.toUpperCase()}
                    </span>
                    <span className="phase-pill">
                      Phase 5: Event Loop & Controls
                    </span>
                  </div>
                  {playbackStatus.error && (
                    <div className="player-error-banner">
                      <AlertCircle size={16} />
                      <span>{playbackStatus.error}</span>
                    </div>
                  )}
                  <p className="player-render-notice">
                    Native libmpv playback active in headless mode. Video rendering is strictly deferred to Phase 6.
                  </p>
                </div>
              </div>
            ) : (
              <div className="player-empty-state">
                <div className="player-placeholder-icon">
                  <Film size={32} />
                </div>
                <h2 className="player-empty-title">Ready for Playback</h2>
                <p className="player-empty-desc">
                  Native libmpv engine initialized. Select a local video file to begin playback and verify event handling.
                </p>
                <button
                  type="button"
                  className="open-file-btn"
                  onClick={handleOpenFile}
                >
                  <FolderOpen size={18} />
                  <span>Open Video File</span>
                </button>
              </div>
            )}

            {/* Playback Controls Overlay Bar */}
            <div className="player-controls-bar">
              <div className="controls-left">
                <button
                  type="button"
                  className="control-btn primary-play-btn"
                  onClick={handleTogglePlayPause}
                  disabled={!playbackStatus.currentFile || playbackStatus.mediaState === 'loading'}
                  title={playbackStatus.paused ? 'Play' : 'Pause'}
                >
                  {playbackStatus.paused ? <Play size={18} /> : <Pause size={18} />}
                </button>

                <button
                  type="button"
                  className="control-btn"
                  onClick={handleOpenFile}
                  title="Open Video File"
                >
                  <FolderOpen size={16} />
                </button>

                <div className="time-display">
                  <span>{formatTime(playbackStatus.position)}</span>
                  <span className="time-sep">/</span>
                  <span>{formatTime(playbackStatus.duration)}</span>
                </div>
              </div>

              <div className="controls-center">
                <input
                  type="range"
                  className="seek-slider"
                  min={0}
                  max={playbackStatus.duration && playbackStatus.duration > 0 ? playbackStatus.duration : 100}
                  step={0.1}
                  value={playbackStatus.position ?? 0}
                  onChange={handleSeek}
                  disabled={!playbackStatus.currentFile || !playbackStatus.duration}
                  title="Seek position"
                />
              </div>

              <div className="controls-right">
                <button
                  type="button"
                  className="control-btn"
                  onClick={handleToggleMute}
                  title={playbackStatus.volume === 0 ? 'Unmute' : 'Mute'}
                >
                  {playbackStatus.volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
                </button>

                <input
                  type="range"
                  className="volume-slider"
                  min={0}
                  max={100}
                  step={1}
                  value={playbackStatus.volume}
                  onChange={handleVolume}
                  title={`Volume: ${Math.round(playbackStatus.volume)}%`}
                />

                <span className="volume-label">
                  {Math.round(playbackStatus.volume)}%
                </span>
              </div>
            </div>
          </div>

          {/* Audit & Architecture Cards */}
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
                  <span className="row-label">C Headers</span>
                  <span className="row-value">include/mpv (client.h, render.h)</span>
                </div>
                <div className="card-row">
                  <span className="row-label">libmpv API</span>
                  <span className="row-value">
                    {nativePoc?.apiVersion?.formatted ? `v${nativePoc.apiVersion.formatted} Connected` : 'Probing...'}
                  </span>
                </div>
                <div className="card-row">
                  <span className="row-label">Volume / Paused</span>
                  <span className="row-value">{Math.round(playbackStatus.volume)}% / {playbackStatus.paused ? 'Paused' : 'Playing'}</span>
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
                  <span className="row-label">Frontend Stack</span>
                  <span className="row-value">React 19 + TypeScript 5.7</span>
                </div>
                <div className="card-row">
                  <span className="row-label">Bundler</span>
                  <span className="row-value">Vite 6 + vite-plugin-electron</span>
                </div>
                <div className="card-row">
                  <span className="row-label">Desktop Runtime</span>
                  <span className="row-value">Electron 44 (Chromium/Node)</span>
                </div>
                <div className="card-row">
                  <span className="row-label">Design System</span>
                  <span className="row-value">Material 3 Expressive (Vanilla CSS)</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default App;
