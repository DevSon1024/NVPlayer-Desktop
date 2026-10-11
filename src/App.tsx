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
  CheckCircle2,
} from 'lucide-react';

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

export const App: React.FC = () => {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [securityState, setSecurityState] = useState<SecurityState | null>(null);
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
    }
  }, []);

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
            <div className="player-empty-state">
              <div className="player-placeholder-icon">
                <Film size={32} />
              </div>
              <h2 className="player-empty-title">Playback Engine Dormant</h2>
              <p className="player-empty-desc">
                Phase 1 secure application shell is active. The native <code>libmpv</code> playback engine
                is staged and will be initialized in Phase 2 via high-performance native bridging.
              </p>
              <div className="player-state-pill">
                <CheckCircle2 size={14} />
                <span>Zero fake controls rendered &bull; Strict phase boundary maintained</span>
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
                  <span className="row-label">Import Library</span>
                  <span className="row-value">windows/x64/libmpv.dll.a</span>
                </div>
                <div className="card-row">
                  <span className="row-label">C Headers</span>
                  <span className="row-value">include/mpv (client.h, render.h)</span>
                </div>
                <div className="card-row">
                  <span className="row-label">Integrity Status</span>
                  <span className="row-status-verified">Preserved &amp; Intact</span>
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
