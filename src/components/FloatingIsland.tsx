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
      className="fixed bottom-6 right-6 left-[284px] max-md:left-[216px] max-w-[620px] ml-auto z-50 rounded-2xl bg-surface/90 backdrop-blur-xl border border-border shadow-2xl overflow-hidden cursor-pointer transition-all duration-200 hover:-translate-y-0.5 select-none"
      onClick={onNavigateToPlayer}
      title="Click to expand player view"
      role="region"
      aria-label="Now playing floating controls"
    >
      {/* Top Progress Track */}
      <div className="w-full h-1 bg-surface-muted overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-150"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div className="flex items-center gap-3.5 px-4 py-2.5">
        {/* Miniature Screen Thumbnail Preview */}
        <div className="w-14 h-9 rounded-lg bg-surface-dim border border-border overflow-hidden relative shrink-0 flex items-center justify-center">
          {thumbnailKey ? (
            <img
              src={`nosved-thumb://${thumbnailKey}/`}
              alt={fileName}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="text-muted-foreground">
              <Film size={16} />
            </div>
          )}

          {!playbackStatus.paused && (
            <div
              className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary ring-2 ring-primary/40 animate-pulse"
              title="Playing"
            />
          )}
        </div>

        {/* Media Metadata */}
        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-foreground truncate" title={fileName}>
              {fileName}
            </span>
            {activePlaylist && (
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-primary-container text-on-primary-container font-mono shrink-0">
                {activePlaylist.currentIndex + 1}/{activePlaylist.items.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 text-[11px] font-mono text-muted-foreground mt-0.5">
            <span>{formatTime(playbackStatus.position)}</span>
            <span className="opacity-50">/</span>
            <span>{formatTime(playbackStatus.duration)}</span>
          </div>
        </div>

        {/* Compact Controls */}
        <div
          className="flex items-center gap-1.5 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          {activePlaylist && onPlayPrev && (
            <button
              type="button"
              className="w-7 h-7 rounded-full bg-surface-muted hover:bg-surface-elevated text-foreground border border-border flex items-center justify-center cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
            className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center cursor-pointer hover:scale-105 transition-transform shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
            onClick={onTogglePlayPause}
            title={playbackStatus.paused ? 'Play (Space)' : 'Pause (Space)'}
            aria-label={playbackStatus.paused ? 'Play' : 'Pause'}
          >
            {playbackStatus.paused ? <Play size={16} /> : <Pause size={16} />}
          </button>

          {activePlaylist && onPlayNext && (
            <button
              type="button"
              className="w-7 h-7 rounded-full bg-surface-muted hover:bg-surface-elevated text-foreground border border-border flex items-center justify-center cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
            className="w-7 h-7 rounded-full bg-surface-muted hover:bg-surface-elevated text-foreground border border-border flex items-center justify-center cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary"
            onClick={onToggleMute}
            title={playbackStatus.muted ? 'Unmute (M)' : 'Mute (M)'}
            aria-label={playbackStatus.muted ? 'Unmute' : 'Mute'}
          >
            {playbackStatus.muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </button>

          <button
            type="button"
            className="w-7 h-7 rounded-full bg-transparent hover:bg-primary-container text-muted-foreground hover:text-primary flex items-center justify-center cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
