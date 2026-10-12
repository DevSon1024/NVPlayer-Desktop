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
  onOpenMedia: (filePath: string) => void;
  onOpenFile: () => void;
  onNavigateTab: (tab: TabType) => void;
}

export const HomeView: React.FC<HomeViewProps> = ({
  recentItems,
  libraryItems,
  playlists,
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
    <div className="home-view-container">
      {/* Top Welcome & Hero Section */}
      <div className="home-hero-section">
        {lastPlayed ? (
          <div className="continue-watching-hero">
            <div className="hero-content">
              <div className="hero-badge">
                <Clock size={13} />
                <span>CONTINUE WATCHING</span>
              </div>
              <h2 className="hero-title" title={lastPlayed.fileName}>
                {lastPlayed.fileName}
              </h2>

              <div className="hero-meta-row">
                <span className="hero-meta-item">
                  Last played {formatDate(lastPlayed.lastOpened)}
                </span>
                {lastPlayed.duration && (
                  <>
                    <span className="meta-sep">&bull;</span>
                    <span className="hero-meta-item">
                      {formatTime(lastPlayed.lastPosition)} / {formatTime(lastPlayed.duration)}
                    </span>
                  </>
                )}
                {lastPlayed.videoWidth && lastPlayed.videoHeight && (
                  <>
                    <span className="meta-sep">&bull;</span>
                    <span className="resolution-badge">
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
                <div className="hero-progress-wrapper">
                  <div className="hero-progress-track">
                    <div
                      className="hero-progress-fill"
                      style={{ width: `${lastPlayedProgressPercent}%` }}
                    />
                  </div>
                  <span className="hero-progress-text">{lastPlayedProgressPercent}% watched</span>
                </div>
              )}

              <div className="hero-actions">
                <button
                  type="button"
                  className="hero-btn primary"
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
                    className="hero-btn secondary"
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
              className="hero-thumbnail-box"
              onClick={() => onOpenMedia(lastPlayed.filePath)}
              title={`Play ${lastPlayed.fileName}`}
            >
              {lastPlayed.thumbnailKey ? (
                <img
                  src={`nosved-thumb://${lastPlayed.thumbnailKey}/`}
                  alt={lastPlayed.fileName}
                  className="hero-thumb-img"
                  onError={(e) => {
                    (e.currentTarget as HTMLElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="hero-thumb-placeholder">
                  <Film size={48} />
                </div>
              )}
              <div className="hero-thumb-play-overlay">
                <div className="thumb-play-circle">
                  <Play size={24} />
                </div>
              </div>
              {lastPlayed.duration && (
                <span className="hero-thumb-duration">{formatTime(lastPlayed.duration)}</span>
              )}
            </div>
          </div>
        ) : (
          <div className="welcome-hero-card">
            <div className="welcome-hero-main">
              <div className="welcome-badge">
                <Sparkles size={14} />
                <span>NATIVE LIBMPV ENGINE</span>
              </div>
              <h1 className="welcome-title">Nosved Desktop Player</h1>
              <p className="welcome-desc">
                High-performance hardware-accelerated video playback with zero UI lag.
                Browse your media library, resume previous sessions, or open any local video file directly.
              </p>
              <div className="welcome-actions">
                <button type="button" className="hero-btn primary" onClick={onOpenFile}>
                  <FolderOpen size={16} />
                  <span>Open Video File</span>
                </button>
                <button
                  type="button"
                  className="hero-btn secondary"
                  onClick={() => onNavigateTab('library')}
                >
                  <Library size={16} />
                  <span>Explore Library</span>
                </button>
              </div>
            </div>
            <div className="welcome-hero-graphic">
              <MonitorPlay size={64} className="graphic-icon" />
            </div>
          </div>
        )}
      </div>

      {/* Quick Navigation Shortcuts Grid */}
      <div className="home-shortcuts-section">
        <h3 className="section-title">Quick Actions & Shortcuts</h3>
        <div className="shortcuts-grid">
          <div
            className="shortcut-card"
            onClick={onOpenFile}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && onOpenFile()}
          >
            <div className="shortcut-icon-wrapper open-file">
              <FolderOpen size={22} />
            </div>
            <div className="shortcut-info">
              <span className="shortcut-title">Open Video File</span>
              <span className="shortcut-desc">Browse local disk for videos</span>
            </div>
            <span className="shortcut-tag">Instant Play</span>
          </div>

          <div
            className="shortcut-card"
            onClick={() => onNavigateTab('library')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && onNavigateTab('library')}
          >
            <div className="shortcut-icon-wrapper library">
              <Library size={22} />
            </div>
            <div className="shortcut-info">
              <span className="shortcut-title">Media Library</span>
              <span className="shortcut-desc">Scanned files and metadata</span>
            </div>
            <span className="shortcut-tag">{libraryItems.length} videos</span>
          </div>

          <div
            className="shortcut-card"
            onClick={() => onNavigateTab('playlists')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && onNavigateTab('playlists')}
          >
            <div className="shortcut-icon-wrapper playlists">
              <ListMusic size={22} />
            </div>
            <div className="shortcut-info">
              <span className="shortcut-title">Playlists</span>
              <span className="shortcut-desc">Custom video playlists</span>
            </div>
            <span className="shortcut-tag">{playlists.length} playlists</span>
          </div>

          <div
            className="shortcut-card"
            onClick={() => onNavigateTab('recent')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && onNavigateTab('recent')}
          >
            <div className="shortcut-icon-wrapper history">
              <History size={22} />
            </div>
            <div className="shortcut-info">
              <span className="shortcut-title">Watch History</span>
              <span className="shortcut-desc">Past playback and progress</span>
            </div>
            <span className="shortcut-tag">{recentItems.length} recent</span>
          </div>
        </div>
      </div>

      {/* Recent History Highlights */}
      {remainingRecentItems.length > 0 && (
        <div className="home-section">
          <div className="home-section-header">
            <div className="header-left">
              <History size={18} />
              <h3 className="section-title">Recently Played</h3>
            </div>
            <button
              type="button"
              className="view-all-btn"
              onClick={() => onNavigateTab('recent')}
            >
              <span>View All History</span>
              <ChevronRight size={15} />
            </button>
          </div>

          <div className="home-media-grid">
            {remainingRecentItems.map((item) => {
              const progress =
                item.duration && item.lastPosition
                  ? Math.min(100, Math.round((item.lastPosition / item.duration) * 100))
                  : 0;

              return (
                <div
                  key={item.id}
                  className={`home-media-card ${item.isMissing ? 'media-missing' : ''}`}
                  onClick={() => !item.isMissing && onOpenMedia(item.filePath)}
                  title={item.filePath}
                >
                  <div className="home-media-thumb">
                    {item.thumbnailKey ? (
                      <img
                        src={`nosved-thumb://${item.thumbnailKey}/`}
                        alt={item.fileName}
                        onError={(e) => {
                          (e.currentTarget as HTMLElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="home-thumb-placeholder">
                        <Film size={24} />
                      </div>
                    )}
                    {item.duration && (
                      <span className="home-thumb-duration">{formatTime(item.duration)}</span>
                    )}
                    {progress > 0 && (
                      <div className="home-card-progress">
                        <div
                          className="home-card-progress-fill"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    )}
                    <div className="home-thumb-hover-overlay">
                      <div className="hover-play-circle">
                        <Play size={18} />
                      </div>
                    </div>
                  </div>
                  <div className="home-media-info">
                    <span className="home-media-title" title={item.fileName}>
                      {item.fileName}
                    </span>
                    <div className="home-media-sub">
                      <span>{formatDate(item.lastOpened)}</span>
                      {progress > 0 && (
                        <>
                          <span className="meta-sep">&bull;</span>
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
        <div className="home-section">
          <div className="home-section-header">
            <div className="header-left">
              <Library size={18} />
              <h3 className="section-title">Media Library</h3>
            </div>
            <button
              type="button"
              className="view-all-btn"
              onClick={() => onNavigateTab('library')}
            >
              <span>Explore Library</span>
              <ChevronRight size={15} />
            </button>
          </div>

          <div className="home-media-grid">
            {displayLibraryItems.map((item) => (
              <div
                key={item.id}
                className={`home-media-card ${item.isMissing ? 'media-missing' : ''}`}
                onClick={() => !item.isMissing && onOpenMedia(item.filePath)}
                title={item.filePath}
              >
                <div className="home-media-thumb">
                  {item.thumbnailKey ? (
                    <img
                      src={`nosved-thumb://${item.thumbnailKey}/`}
                      alt={item.fileName}
                      onError={(e) => {
                        (e.currentTarget as HTMLElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="home-thumb-placeholder">
                      <Film size={24} />
                    </div>
                  )}
                  {item.duration && (
                    <span className="home-thumb-duration">{formatTime(item.duration)}</span>
                  )}
                  <div className="home-thumb-hover-overlay">
                    <div className="hover-play-circle">
                      <Play size={18} />
                    </div>
                  </div>
                </div>
                <div className="home-media-info">
                  <span className="home-media-title" title={item.fileName}>
                    {item.fileName}
                  </span>
                  <div className="home-media-sub">
                    {item.fileSize && <span>{formatBytes(item.fileSize)}</span>}
                    {item.videoHeight && (
                      <>
                        <span className="meta-sep">&bull;</span>
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
