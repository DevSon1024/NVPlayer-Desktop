import React from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  SkipBack,
  SkipForward,
  Maximize2,
  Film,
} from 'lucide-react';
import type { PlaybackStatus } from '../types/electron';
import type { ActivePlaylistState } from './PlayerView';
import { formatTime } from '../utils/formatters';

interface FloatingIslandProps {
  playbackStatus: PlaybackStatus;
  activePlaylist: ActivePlaylistState | null;
  thumbnailKey?: string | null;
  onNavigateToPlayer: () => void;
  onTogglePlayPause: () => void;
  onToggleMute: () => void;
  onPlayNext?: () => void;
  onPlayPrev?: () => void;
}

export const FloatingIsland: React.FC<FloatingIslandProps> = ({
  playbackStatus,
  activePlaylist,
  thumbnailKey,
  onNavigateToPlayer,
  onTogglePlayPause,
  onToggleMute,
  onPlayNext,
  onPlayPrev,
}) => {
  if (!playbackStatus.currentFile || playbackStatus.mediaState === 'idle') {
    return null;
  }

  const fileName =
    playbackStatus.currentFile.split(/[/\\]/).pop() || playbackStatus.currentFile;
  const progressPercent =
    playbackStatus.duration && playbackStatus.duration > 0 && playbackStatus.position !== null
      ? Math.min(100, Math.max(0, (playbackStatus.position / playbackStatus.duration) * 100))
      : 0;

  return (
    <aside
      className="floating-playback-island"
      onClick={onNavigateToPlayer}
      title="Click to expand player view"
      role="region"
      aria-label="Now playing floating controls"
    >
      {/* Top Progress Track */}
      <div className="floating-island-progress-track">
        <div
          className="floating-island-progress-fill"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div className="floating-island-content">
        {/* Miniature Screen Thumbnail Preview */}
        <div className="floating-mini-screen">
          {thumbnailKey ? (
            <img
              src={`nosved-thumb://${thumbnailKey}/`}
              alt={fileName}
              className="floating-mini-thumb"
              loading="lazy"
            />
          ) : (
            <div className="floating-mini-placeholder">
              <Film size={16} />
            </div>
          )}

          {!playbackStatus.paused && (
            <div className="mini-screen-playing-pulse" title="Playing" />
          )}
        </div>

        {/* Media Metadata */}
        <div className="floating-media-meta">
          <div className="floating-media-title-row">
            <span className="floating-media-title" title={fileName}>
              {fileName}
            </span>
            {activePlaylist && (
              <span className="floating-playlist-badge">
                {activePlaylist.currentIndex + 1}/{activePlaylist.items.length}
              </span>
            )}
          </div>
          <div className="floating-media-time">
            <span>{formatTime(playbackStatus.position)}</span>
            <span className="time-sep">/</span>
            <span>{formatTime(playbackStatus.duration)}</span>
          </div>
        </div>

        {/* Compact Controls */}
        <div
          className="floating-island-controls"
          onClick={(e) => e.stopPropagation()}
        >
          {activePlaylist && onPlayPrev && (
            <button
              type="button"
              className="island-control-btn"
              onClick={onPlayPrev}
              disabled={activePlaylist.currentIndex <= 0}
              title="Previous playlist item"
              aria-label="Previous"
            >
              <SkipBack size={15} />
            </button>
          )}

          <button
            type="button"
            className="island-control-btn primary"
            onClick={onTogglePlayPause}
            title={playbackStatus.paused ? 'Play (Space)' : 'Pause (Space)'}
            aria-label={playbackStatus.paused ? 'Play' : 'Pause'}
          >
            {playbackStatus.paused ? <Play size={16} /> : <Pause size={16} />}
          </button>

          {activePlaylist && onPlayNext && (
            <button
              type="button"
              className="island-control-btn"
              onClick={onPlayNext}
              disabled={activePlaylist.currentIndex >= activePlaylist.items.length - 1}
              title="Next playlist item"
              aria-label="Next"
            >
              <SkipForward size={15} />
            </button>
          )}

          <button
            type="button"
            className="island-control-btn"
            onClick={onToggleMute}
            title={playbackStatus.muted ? 'Unmute (M)' : 'Mute (M)'}
            aria-label={playbackStatus.muted ? 'Unmute' : 'Mute'}
          >
            {playbackStatus.muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </button>

          <button
            type="button"
            className="island-control-btn expand-btn"
            onClick={(e) => {
              e.stopPropagation();
              onNavigateToPlayer();
            }}
            title="Expand to Full Player"
            aria-label="Expand player"
          >
            <Maximize2 size={15} />
          </button>
        </div>
      </div>
    </aside>
  );
};
