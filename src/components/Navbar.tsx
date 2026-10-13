import React from 'react';
import {
  Film,
  Home,
  Library,
  ListMusic,
  History,
  Settings,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';

export type TabType = 'home' | 'player' | 'library' | 'playlists' | 'recent' | 'settings';

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
  const getNavBtnClass = (isActive: boolean) =>
    `w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-[13px] font-medium transition-colors text-left outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer border-none bg-transparent ${
      isActive
        ? 'bg-primary-container text-on-primary-container font-semibold shadow-sm'
        : 'text-muted-foreground hover:bg-surface-elevated hover:text-foreground'
    }`;

  return (
    <aside className="w-[260px] min-w-[260px] max-md:w-[200px] max-md:min-w-[200px] bg-surface border-r border-border flex flex-col p-5 gap-6 select-none shrink-0 h-full">
      <div className="flex items-center gap-3 px-2 py-1">
        <div className="w-10 h-10 rounded-xl bg-primary-container text-primary flex items-center justify-center shadow-md border border-primary/20 shrink-0">
          <Film size={22} />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="brand-title text-base font-semibold tracking-tight text-foreground truncate">Nosved Player</span>
          <span className="text-[11px] font-medium text-primary uppercase tracking-wider truncate">Desktop Core</span>
        </div>
      </div>

      <nav className="flex flex-col gap-1 flex-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-3 pt-2 pb-1">
          Media Workspaces
        </span>

        <button
          type="button"
          className={getNavBtnClass(activeTab === 'home')}
          onClick={() => onSelectTab('home')}
        >
          <div className="flex items-center gap-3">
            <Home size={18} />
            <span>Home</span>
          </div>
        </button>

        <button
          type="button"
          className={getNavBtnClass(activeTab === 'library')}
          onClick={() => onSelectTab('library')}
        >
          <div className="flex items-center gap-3">
            <Library size={18} />
            <span>Library</span>
          </div>
        </button>

        <button
          type="button"
          className={getNavBtnClass(activeTab === 'playlists')}
          onClick={() => onSelectTab('playlists')}
        >
          <div className="flex items-center gap-3">
            <ListMusic size={18} />
            <span>Playlists</span>
          </div>
        </button>

        <button
          type="button"
          className={getNavBtnClass(activeTab === 'recent')}
          onClick={() => onSelectTab('recent')}
        >
          <div className="flex items-center gap-3">
            <History size={18} />
            <span>Recent</span>
          </div>
        </button>

        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-3 pt-4 pb-1">
          System
        </span>

        <button
          type="button"
          className={getNavBtnClass(activeTab === 'settings')}
          onClick={() => onSelectTab('settings')}
        >
          <div className="flex items-center gap-3">
            <Settings size={18} />
            <span>Settings</span>
          </div>
        </button>
      </nav>

      {/* Security Audit Badge in Sidebar */}
      <div className="mt-auto rounded-xl p-3 bg-surface-muted border border-border flex items-center gap-2.5">
        <div className={isIsolated ? 'text-success shrink-0' : 'text-amber-400 shrink-0'}>
          {isIsolated ? <ShieldCheck size={18} /> : <AlertCircle size={18} />}
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-[11px] font-semibold text-foreground truncate">
            {isIsolated ? 'Protected Sandbox' : 'Sandbox Degraded'}
          </span>
          <span className="text-[10px] text-muted-foreground font-mono truncate">
            {isElectron ? 'Isolated Runtime' : 'Browser Preview'}
          </span>
        </div>
      </div>
    </aside>
  );
};
