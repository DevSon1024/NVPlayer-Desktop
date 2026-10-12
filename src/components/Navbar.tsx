import React from 'react';
import {
  Film,
  PlaySquare,
  Library,
  ListMusic,
  History,
  Settings,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';

export type TabType = 'player' | 'library' | 'playlists' | 'recent' | 'settings';

interface NavbarProps {
  activeTab: TabType;
  onSelectTab: (tab: TabType) => void;
  isIsolated: boolean;
  isElectron: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onSelectTab,
  isIsolated,
  isElectron,
}) => {
  return (
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
          onClick={() => onSelectTab('player')}
        >
          <div className="nav-item-content">
            <PlaySquare size={18} />
            <span>Now Playing</span>
          </div>
        </button>

        <button
          type="button"
          className={`nav-item ${activeTab === 'library' ? 'active' : ''}`}
          onClick={() => onSelectTab('library')}
        >
          <div className="nav-item-content">
            <Library size={18} />
            <span>Library</span>
          </div>
        </button>

        <button
          type="button"
          className={`nav-item ${activeTab === 'playlists' ? 'active' : ''}`}
          onClick={() => onSelectTab('playlists')}
        >
          <div className="nav-item-content">
            <ListMusic size={18} />
            <span>Playlists</span>
          </div>
        </button>

        <button
          type="button"
          className={`nav-item ${activeTab === 'recent' ? 'active' : ''}`}
          onClick={() => onSelectTab('recent')}
        >
          <div className="nav-item-content">
            <History size={18} />
            <span>Recent</span>
          </div>
        </button>

        <span className="nav-label" style={{ marginTop: '12px' }}>System</span>

        <button
          type="button"
          className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => onSelectTab('settings')}
        >
          <div className="nav-item-content">
            <Settings size={18} />
            <span>Settings</span>
          </div>
        </button>
      </nav>

      {/* Security Audit Badge in Sidebar */}
      <div className="sidebar-footer">
        <div className={`security-status-indicator ${isIsolated ? 'secure' : 'warning'}`}>
          <div className="status-indicator-icon">
            {isIsolated ? <ShieldCheck size={16} /> : <AlertCircle size={16} />}
          </div>
          <div className="status-indicator-info">
            <span className="status-title">
              {isIsolated ? 'Protected Sandbox' : 'Sandbox Degraded'}
            </span>
            <span className="status-subtitle">
              {isElectron ? 'Isolated Runtime' : 'Browser Preview'}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
};
