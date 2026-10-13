import React from 'react';
import {
  Play,
  RotateCcw,
  FolderOpen,
  Library,
  ListMusic,
  History,
  Film,
  Sparkles,
  ChevronRight,
  Clock,
  MonitorPlay,
} from 'lucide-react';
import type { MediaItem, Playlist } from '../types/electron';
import { formatTime, formatBytes, formatDate } from '../utils/formatters';
import type { TabType } from './Navbar';

interface HomeViewProps {
  recentItems: MediaItem[];
  libraryItems: MediaItem[];
  playlists: Playlist[];
  showThumbnails?: boolean;
  onOpenMedia: (filePath: string) => void;
  onOpenFile: () => void;
  onNavigateTab: (tab: TabType) => void;
}

export const HomeView: React.FC<HomeViewProps> = ({
  recentItems,
  libraryItems,
  playlists,
  showThumbnails = true,
  onOpenMedia,
  onOpenFile,
  onNavigateTab,
}) => {
  const lastPlayed = recentItems.length > 0 ? recentItems[0] : null;

  const lastPlayedProgressPercent =
    lastPlayed && lastPlayed.duration && lastPlayed.lastPosition
      ? Math.min(100, Math.max(0, Math.round((lastPlayed.lastPosition / lastPlayed.duration) * 100)))
      : 0;

  // Filter out the primary hero item from the recent items list for the highlights section
  const remainingRecentItems = recentItems.slice(1, 7);
  const displayLibraryItems = libraryItems.slice(0, 6);

  return (
    <div className="flex-1 min-h-0 h-full overflow-y-auto p-7 flex flex-col gap-7 max-w-[1400px] mx-auto w-full select-none">
      {/* Top Welcome & Hero Section */}
      <div>
        {lastPlayed ? (
          <div className="rounded-2xl p-6 bg-surface-container border border-border flex max-lg:flex-col-reverse items-center justify-between gap-6 relative overflow-hidden shadow-lg">
            <div className="flex flex-col gap-3.5 z-10 flex-1 min-w-0">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-primary-container text-on-primary-container tracking-wider uppercase w-fit">
                <Clock size={13} />
                <span>CONTINUE WATCHING</span>
              </div>
              <h2 className="text-2xl font-bold text-foreground truncate" title={lastPlayed.fileName}>
                {lastPlayed.fileName}
              </h2>

              <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                <span>
                  Last played {formatDate(lastPlayed.lastOpened)}
                </span>
                {lastPlayed.duration && (
                  <>
                    <span className="opacity-50">&bull;</span>
                    <span>
                      {formatTime(lastPlayed.lastPosition)} / {formatTime(lastPlayed.duration)}
                    </span>
                  </>
                )}
                {lastPlayed.videoWidth && lastPlayed.videoHeight && (
                  <>
                    <span className="opacity-50">&bull;</span>
                    <span className="font-mono text-[10px] font-semibold px-1.5 py-0.5 bg-primary-container text-on-primary-container rounded border border-primary/20">
                      {lastPlayed.videoHeight >= 2160
                        ? '4K UHD'
                        : lastPlayed.videoHeight >= 1080
                        ? '1080p FHD'
                        : `${lastPlayed.videoWidth}x${lastPlayed.videoHeight}`}
                    </span>
                  </>
                )}
              </div>

              {lastPlayedProgressPercent > 0 && (
                <div className="flex items-center gap-3 w-full max-w-[420px]">
                  <div className="flex-1 h-1.5 rounded-full bg-surface-muted overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-300"
                      style={{ width: `${lastPlayedProgressPercent}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono text-primary font-medium">{lastPlayedProgressPercent}% watched</span>
                </div>
              )}

              <div className="flex items-center gap-3 mt-1">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm shadow hover:scale-[1.02] active:scale-[0.98] transition-transform cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary border-none"
                  onClick={() => onOpenMedia(lastPlayed.filePath)}
                >
                  <Play size={16} />
                  <span>
                    {lastPlayed.lastPosition && lastPlayed.lastPosition > 5
                      ? `Resume at ${formatTime(lastPlayed.lastPosition)}`
                      : 'Play Video'}
                  </span>
                </button>

                {lastPlayed.lastPosition && lastPlayed.lastPosition > 10 && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-surface-elevated hover:bg-surface-muted text-foreground border border-border font-medium text-sm transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    onClick={() => onOpenMedia(lastPlayed.filePath)}
                    title="Play from start"
                  >
                    <RotateCcw size={15} />
                    <span>Play From Start</span>
                  </button>
                )}
              </div>
            </div>

            {/* Hero Thumbnail Preview */}
            <div
              className="w-[340px] max-lg:w-full h-[190px] rounded-xl overflow-hidden relative cursor-pointer group bg-surface-dim border border-border shrink-0 shadow-md flex items-center justify-center"
              onClick={() => onOpenMedia(lastPlayed.filePath)}
              title={`Play ${lastPlayed.fileName}`}
            >
              {showThumbnails && lastPlayed.thumbnailKey ? (
                <img
                  src={`nosved-thumb://${lastPlayed.thumbnailKey}/`}
                  alt={lastPlayed.fileName}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  onError={(e) => {
                    (e.currentTarget as HTMLElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="text-muted-foreground">
                  <Film size={48} />
                </div>
              )}
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg">
                  <Play size={24} />
                </div>
              </div>
              {lastPlayed.duration && (
                <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/75 backdrop-blur text-[11px] font-mono font-medium text-white">
                  {formatTime(lastPlayed.duration)}
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl p-8 bg-surface-container border border-border flex items-center justify-between gap-6 shadow-lg">
            <div className="flex flex-col gap-3 max-w-[600px]">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-primary-container text-on-primary-container tracking-wider uppercase w-fit">
                <Sparkles size={14} />
                <span>NATIVE LIBMPV ENGINE</span>
              </div>
              <h1 className="text-2xl font-bold text-foreground">Nosved Desktop Player</h1>
              <p className="text-sm text-muted-foreground leading-relaxed">
                High-performance hardware-accelerated video playback with zero UI lag.
                Browse your media library, resume previous sessions, or open any local video file directly.
              </p>
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm shadow hover:scale-[1.02] active:scale-[0.98] transition-transform cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary border-none"
                  onClick={onOpenFile}
                >
                  <FolderOpen size={16} />
                  <span>Open Video File</span>
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-surface-elevated hover:bg-surface-muted text-foreground border border-border font-medium text-sm transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  onClick={() => onNavigateTab('library')}
                >
                  <Library size={16} />
                  <span>Explore Library</span>
                </button>
              </div>
            </div>
            <div className="text-primary/30 max-md:hidden">
              <MonitorPlay size={64} />
            </div>
          </div>
        )}
      </div>

      {/* Quick Navigation Shortcuts Grid */}
      <div className="flex flex-col gap-3">
        <h3 className="text-base font-semibold text-foreground tracking-tight">Quick Actions & Shortcuts</h3>
        <div className="grid grid-cols-4 max-xl:grid-cols-2 max-sm:grid-cols-1 gap-3.5">
          <div
            className="rounded-xl p-4 bg-surface border border-border hover:border-primary/50 hover:bg-surface-elevated transition-all duration-200 cursor-pointer flex items-center gap-3.5 group shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
            onClick={onOpenFile}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && onOpenFile()}
          >
            <div className="w-11 h-11 rounded-xl bg-primary-container text-primary flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <FolderOpen size={22} />
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-sm font-semibold text-foreground truncate">Open Video File</span>
              <span className="text-xs text-muted-foreground truncate">Browse local disk for videos</span>
            </div>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-surface-muted border border-border text-muted-foreground">Instant Play</span>
          </div>

          <div
            className="rounded-xl p-4 bg-surface border border-border hover:border-primary/50 hover:bg-surface-elevated transition-all duration-200 cursor-pointer flex items-center gap-3.5 group shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
            onClick={() => onNavigateTab('library')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && onNavigateTab('library')}
          >
            <div className="w-11 h-11 rounded-xl bg-primary-container text-primary flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <Library size={22} />
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-sm font-semibold text-foreground truncate">Media Library</span>
              <span className="text-xs text-muted-foreground truncate">Scanned files and metadata</span>
            </div>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-surface-muted border border-border text-muted-foreground">{libraryItems.length} videos</span>
          </div>

          <div
            className="rounded-xl p-4 bg-surface border border-border hover:border-primary/50 hover:bg-surface-elevated transition-all duration-200 cursor-pointer flex items-center gap-3.5 group shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
            onClick={() => onNavigateTab('playlists')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && onNavigateTab('playlists')}
          >
            <div className="w-11 h-11 rounded-xl bg-primary-container text-primary flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <ListMusic size={22} />
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-sm font-semibold text-foreground truncate">Playlists</span>
              <span className="text-xs text-muted-foreground truncate">Custom video playlists</span>
            </div>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-surface-muted border border-border text-muted-foreground">{playlists.length} playlists</span>
          </div>

          <div
            className="rounded-xl p-4 bg-surface border border-border hover:border-primary/50 hover:bg-surface-elevated transition-all duration-200 cursor-pointer flex items-center gap-3.5 group shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
            onClick={() => onNavigateTab('recent')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && onNavigateTab('recent')}
          >
            <div className="w-11 h-11 rounded-xl bg-primary-container text-primary flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <History size={22} />
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-sm font-semibold text-foreground truncate">Watch History</span>
              <span className="text-xs text-muted-foreground truncate">Past playback and progress</span>
            </div>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-surface-muted border border-border text-muted-foreground">{recentItems.length} recent</span>
          </div>
        </div>
      </div>

      {/* Recent History Highlights */}
      {remainingRecentItems.length > 0 && (
        <div className="flex flex-col gap-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-foreground font-semibold text-base">
              <History size={18} className="text-primary" />
              <h3>Recently Played</h3>
            </div>
            <button
              type="button"
              className="flex items-center gap-1 text-xs font-medium text-primary hover:underline cursor-pointer bg-transparent border-none"
              onClick={() => onNavigateTab('recent')}
            >
              <span>View All History</span>
              <ChevronRight size={15} />
            </button>
          </div>

          <div className="grid grid-cols-6 max-2xl:grid-cols-4 max-xl:grid-cols-3 max-md:grid-cols-2 max-sm:grid-cols-1 gap-4">
            {remainingRecentItems.map((item) => {
              const progress =
                item.duration && item.lastPosition
                  ? Math.min(100, Math.round((item.lastPosition / item.duration) * 100))
                  : 0;

              return (
                <div
                  key={item.id}
                  className={`rounded-xl overflow-hidden bg-surface border border-border hover:border-primary/50 hover:shadow-md transition-all duration-200 cursor-pointer group flex flex-col ${
                    item.isMissing ? 'opacity-50' : ''
                  }`}
                  onClick={() => !item.isMissing && onOpenMedia(item.filePath)}
                  title={item.filePath}
                >
                  <div className="aspect-video w-full relative bg-surface-dim overflow-hidden flex items-center justify-center">
                    {showThumbnails && item.thumbnailKey ? (
                      <img
                        src={`nosved-thumb://${item.thumbnailKey}/`}
                        alt={item.fileName}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        onError={(e) => {
                          (e.currentTarget as HTMLElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="text-muted-foreground">
                        <Film size={24} />
                      </div>
                    )}
                    {item.duration && (
                      <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/80 backdrop-blur text-[10px] font-mono font-medium text-white">
                        {formatTime(item.duration)}
                      </span>
                    )}
                    {progress > 0 && (
                      <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/40">
                        <div
                          className="h-full bg-primary transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow">
                        <Play size={18} />
                      </div>
                    </div>
                  </div>
                  <div className="p-3 flex flex-col gap-1">
                    <span className="text-xs font-semibold text-foreground truncate" title={item.fileName}>
                      {item.fileName}
                    </span>
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span>{formatDate(item.lastOpened)}</span>
                      {progress > 0 && (
                        <>
                          <span className="opacity-50">&bull;</span>
                          <span>{progress}%</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Library Highlights */}
      {displayLibraryItems.length > 0 && (
        <div className="flex flex-col gap-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-foreground font-semibold text-base">
              <Library size={18} className="text-primary" />
              <h3>Media Library</h3>
            </div>
            <button
              type="button"
              className="flex items-center gap-1 text-xs font-medium text-primary hover:underline cursor-pointer bg-transparent border-none"
              onClick={() => onNavigateTab('library')}
            >
              <span>Explore Library</span>
              <ChevronRight size={15} />
            </button>
          </div>

          <div className="grid grid-cols-6 max-2xl:grid-cols-4 max-xl:grid-cols-3 max-md:grid-cols-2 max-sm:grid-cols-1 gap-4">
            {displayLibraryItems.map((item) => (
              <div
                key={item.id}
                className={`rounded-xl overflow-hidden bg-surface border border-border hover:border-primary/50 hover:shadow-md transition-all duration-200 cursor-pointer group flex flex-col ${
                  item.isMissing ? 'opacity-50' : ''
                }`}
                onClick={() => !item.isMissing && onOpenMedia(item.filePath)}
                title={item.filePath}
              >
                <div className="aspect-video w-full relative bg-surface-dim overflow-hidden flex items-center justify-center">
                  {showThumbnails && item.thumbnailKey ? (
                    <img
                      src={`nosved-thumb://${item.thumbnailKey}/`}
                      alt={item.fileName}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      onError={(e) => {
                        (e.currentTarget as HTMLElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="text-muted-foreground">
                      <Film size={24} />
                    </div>
                  )}
                  {item.duration && (
                    <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/80 backdrop-blur text-[10px] font-mono font-medium text-white">
                      {formatTime(item.duration)}
                    </span>
                  )}
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow">
                      <Play size={18} />
                    </div>
                  </div>
                </div>
                <div className="p-3 flex flex-col gap-1">
                  <span className="text-xs font-semibold text-foreground truncate" title={item.fileName}>
                    {item.fileName}
                  </span>
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    {item.fileSize && <span>{formatBytes(item.fileSize)}</span>}
                    {item.videoHeight && (
                      <>
                        <span className="opacity-50">&bull;</span>
                        <span>{item.videoHeight}p</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
