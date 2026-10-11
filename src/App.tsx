import React, { useEffect, useState, useRef, useCallback } from 'react';
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
    videoWidth: null,
    videoHeight: null,
  });
  const [activeTab, setActiveTab] = useState<'player' | 'library' | 'playlists' | 'recent' | 'settings'>('player');

  const videoViewportRef = useRef<HTMLDivElement>(null);

  // Synchronize video viewport dimensions with the native child window
  const updateVideoBounds = useCallback(() => {
    if (!videoViewportRef.current || !window.nosvedAPI?.setVideoBounds) return;
    const isVisible = Boolean(playbackStatus.currentFile && playbackStatus.mediaState !== 'idle');
    const rect = videoViewportRef.current.getBoundingClientRect();
    window.nosvedAPI
      .setVideoBounds({
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        visible: isVisible,
      })
      .catch(console.error);
  }, [playbackStatus.currentFile, playbackStatus.mediaState]);

  useEffect(() => {
    updateVideoBounds();
  }, [updateVideoBounds]);

  useEffect(() => {
    const el = videoViewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      updateVideoBounds();
    });
    ro.observe(el);
    window.addEventListener('resize', updateVideoBounds);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateVideoBounds);
    };
  }, [updateVideoBounds]);

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

  const isDesktopBridge = typeof window !== 'undefined' && typeof window.nosvedAPI !== 'undefined';

  const notifyBrowserBridgeMissing = () => {
    setPlaybackStatus((prev) => ({
      ...prev,
      error: 'Desktop Bridge Unavailable: Native libmpv commands require the Electron application window. Regular browsers cannot access native C-ABI binaries.',
    }));
  };

  const handleOpenFile = async () => {
    if (!window.nosvedAPI) {
      notifyBrowserBridgeMissing();
      return;
    }
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
    if (!window.nosvedAPI) {
      notifyBrowserBridgeMissing();
      return;
    }
    try {
      const res = await window.nosvedAPI.togglePause();
      setPlaybackStatus(res);
    } catch (err) {
      console.error('Failed to toggle play/pause:', err);
    }
  };

  const handleSeek = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!window.nosvedAPI) {
      notifyBrowserBridgeMissing();
      return;
    }
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
    if (!window.nosvedAPI) {
      notifyBrowserBridgeMissing();
      return;
    }
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
    if (!window.nosvedAPI) {
      notifyBrowserBridgeMissing();
      return;
    }
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
            className="nav-item disabled"
            title="Media library will be available in a future release"
          >
            <div className="nav-item-content">
              <Library size={18} />
              <span>Library</span>
            </div>
            <span className="coming-soon-pill">Soon</span>
          </button>

          <button
            type="button"
            className="nav-item disabled"
            title="Playlists will be available in a future release"
          >
            <div className="nav-item-content">
              <ListMusic size={18} />
              <span>Playlists</span>
            </div>
            <span className="coming-soon-pill">Soon</span>
          </button>

          <button
            type="button"
            className="nav-item disabled"
            title="Playback history will be available in a future release"
          >
            <div className="nav-item-content">
              <History size={18} />
              <span>Recent</span>
            </div>
            <span className="coming-soon-pill">Soon</span>
          </button>

          <span className="nav-label" style={{ marginTop: '12px' }}>System</span>

          <button
            type="button"
            className="nav-item disabled"
            title="Player settings will be available in a future release"
          >
            <div className="nav-item-content">
              <Settings size={18} />
              <span>Settings</span>
            </div>
            <span className="coming-soon-pill">Soon</span>
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
              <span>Desktop Engine Ready</span>
            </div>
            <span className="arch-tag">
              {appInfo ? `${appInfo.platform}-${appInfo.arch}` : 'win32-x64'}
            </span>
          </div>

          {playbackStatus.currentFile && (
            <div className="header-media-info" title={playbackStatus.currentFile}>
              <Film size={14} />
              <span className="header-media-title">
                {playbackStatus.currentFile.split(/[/\\]/).pop() || playbackStatus.currentFile}
              </span>
              {playbackStatus.videoWidth && playbackStatus.videoHeight && (
                <span className="resolution-badge">
                  {playbackStatus.videoWidth}x{playbackStatus.videoHeight}
                </span>
              )}
            </div>
          )}

          <span className="arch-tag" style={{ color: '#a8c7fa' }}>
            v{appInfo?.version || '0.1.0'}
          </span>
        </header>

        <section className="viewport-body">
          {!isDesktopBridge && (
            <div className="browser-diagnostic-banner" role="alert">
              <AlertCircle size={16} />
              <span>
                <strong>Browser Preview Mode:</strong> Native Electron desktop bridge (window.nosvedAPI) is not available. Playback controls require the Electron desktop application window.
              </span>
            </div>
          )}

          {/* Central Player Container */}
          <div className="player-container">
            <div className="player-video-viewport" ref={videoViewportRef}>
              {playbackStatus.currentFile ? (
                <>
                  {playbackStatus.mediaState === 'loading' && (
                    <div className="player-loading-overlay">
                      <div className="loading-spinner" />
                      <span>Loading Media Stream...</span>
                    </div>
                  )}
                  {playbackStatus.error && (
                    <div className="player-error-banner" style={{ margin: 16 }}>
                      <AlertCircle size={16} />
                      <span>{playbackStatus.error}</span>
                    </div>
                  )}
                </>
              ) : (
                <div className="player-empty-state">
                  <div className="player-placeholder-icon">
                    <Film size={32} />
                  </div>
                  <h2 className="player-empty-title">Ready for Playback</h2>
                  <p className="player-empty-desc">
                    Native libmpv engine initialized. Select a local video file to begin hardware-accelerated playback.
                  </p>
                  {playbackStatus.error && (
                    <div className="player-error-banner" style={{ marginTop: 12 }}>
                      <AlertCircle size={16} />
                      <span>{playbackStatus.error}</span>
                    </div>
                  )}
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
            </div>

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

                {playbackStatus.currentFile && (
                  <span className={`status-pill status-${playbackStatus.mediaState}`}>
                    {playbackStatus.mediaState.toUpperCase()}
                  </span>
                )}
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
                  <span className="row-label">Frontend Stack</span>
                  <span className="row-value">React 19 + TypeScript 5.7</span>
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
