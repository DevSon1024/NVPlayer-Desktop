import React from 'react';
import {
  Play,
  Pause,
  FolderOpen,
  Volume2,
  VolumeX,
  AlertCircle,
  RotateCcw,
  X,
  Maximize2,
  Minimize2,
  Clock,
  SkipBack,
  SkipForward,
  ListMusic,
} from 'lucide-react';
import type { PlaybackStatus, PlaylistItem } from '../types/electron';
import { formatTime } from '../utils/formatters';

export interface ActivePlaylistState {
  playlistId: string;
  playlistName: string;
  items: PlaylistItem[];
  currentIndex: number;
}

export interface ResumePromptState {
  filePath: string;
  position: number;
  duration: number | null;
}

interface PlayerViewProps {
  videoViewportRef: React.Ref<HTMLDivElement>;
  playbackStatus: PlaybackStatus;
  activePlaylist: ActivePlaylistState | null;
  resumePrompt: ResumePromptState | null;
  isFullscreen: boolean;
  showOverlay: boolean;
  isDesktopBridge: boolean;
  isScrubbing: boolean;
  scrubPosition: number | null;
  onOpenFile: () => void;
  onTogglePlayPause: () => void;
  onToggleMute: () => void;
  onVolumeChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSeekSliderChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSeekMouseDown: () => void;
  onCommitSeek: (targetSeconds?: number) => void;
  onTriggerFullscreenToggle: () => void;
  onPlayNextPlaylistItem: () => void;
  onPlayPrevPlaylistItem: () => void;
  onResumePlayback: () => void;
  onStartFromBeginning: () => void;
  onDismissResumePrompt: () => void;
  onDismissError: () => void;
  onVideoTapOrClick: (e: React.MouseEvent | React.TouchEvent) => void;
  onControlsMouseEnter: () => void;
  onControlsMouseLeave: () => void;
  onControlsFocus: () => void;
  onControlsBlur: () => void;
}

export const PlayerView: React.FC<PlayerViewProps> = ({
  videoViewportRef,
  playbackStatus,
  activePlaylist,
  resumePrompt,
  isFullscreen,
  showOverlay,
  isDesktopBridge,
  isScrubbing,
  scrubPosition,
  onOpenFile,
  onTogglePlayPause,
  onToggleMute,
  onVolumeChange,
  onSeekSliderChange,
  onSeekMouseDown,
  onCommitSeek,
  onTriggerFullscreenToggle,
  onPlayNextPlaylistItem,
  onPlayPrevPlaylistItem,
  onResumePlayback,
  onStartFromBeginning,
  onDismissResumePrompt,
  onDismissError,
  onVideoTapOrClick,
  onControlsMouseEnter,
  onControlsMouseLeave,
  onControlsFocus,
  onControlsBlur,
}) => {
  return (
    <>
      {!isDesktopBridge && !isFullscreen && (
        <div className="mx-4 mt-2 mb-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-200 text-xs flex items-center gap-2" role="alert">
          <AlertCircle size={16} />
          <span>
            <strong>Browser Preview Mode:</strong> Native Electron desktop bridge (window.nosvedAPI) is not available. Playback controls require the Electron desktop application window.
          </span>
        </div>
      )}

      {/* Resume Playback Prompt Banner */}
      {resumePrompt && (
        <div
          className={`resume-playback-modal ${isFullscreen ? 'fullscreen-resume-modal' : ''}`}
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-surface-elevated/95 backdrop-blur-md border border-border rounded-2xl p-4 shadow-2xl flex flex-wrap items-center justify-between gap-4 text-foreground">
            <div className="flex items-center gap-3">
              <Clock size={20} className="text-primary shrink-0" />
              <div>
                <h3 className="text-sm font-semibold text-foreground">Resume Playback</h3>
                <p className="text-xs text-muted-foreground">
                  You previously watched this video up to <strong className="text-foreground">{formatTime(resumePrompt.position)}</strong>.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-primary text-primary-foreground font-semibold text-xs shadow hover:scale-[1.02] active:scale-[0.98] transition cursor-pointer border-none"
                onClick={onResumePlayback}
                autoFocus
              >
                <Play size={14} />
                <span>Resume from {formatTime(resumePrompt.position)}</span>
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface-muted hover:bg-surface-elevated text-foreground font-medium text-xs border border-border transition cursor-pointer"
                onClick={onStartFromBeginning}
              >
                <RotateCcw size={14} />
                <span>Start from Beginning</span>
              </button>
              <button
                type="button"
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-muted transition cursor-pointer border-none bg-transparent"
                onClick={onDismissResumePrompt}
                title="Dismiss (Esc)"
                aria-label="Dismiss resume prompt"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Native Player Container */}
      <div
        className={`player-container ${isFullscreen ? 'fullscreen-player-container' : ''}`}
        onClick={onVideoTapOrClick}
        onDoubleClick={onTriggerFullscreenToggle}
        onTouchEnd={onVideoTapOrClick}
      >
        {/* Native Video Viewport */}
        <div
          className={`player-video-viewport ${isFullscreen ? 'fullscreen-video-viewport' : ''} ${
            isFullscreen && showOverlay ? 'overlay-visible-clearance' : ''
          } ${isFullscreen && resumePrompt ? 'resume-visible-clearance' : ''}`}
          ref={videoViewportRef}
        >
          {playbackStatus.currentFile && (
            <>
              {playbackStatus.mediaState === 'loading' && (
                <div className="absolute inset-0 bg-background/85 flex flex-col items-center justify-center gap-3 text-primary text-xs font-semibold z-10">
                  <div className="w-8 h-8 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
                  <span>Loading Media Stream...</span>
                </div>
              )}
              {playbackStatus.error && (
                <div className="absolute top-4 left-4 right-4 bg-destructive/90 text-destructive-foreground backdrop-blur-md px-4 py-3 rounded-xl border border-destructive shadow-lg flex items-center justify-between gap-3 text-xs z-20" role="alert">
                  <div className="flex items-center gap-2">
                    <AlertCircle size={16} />
                    <span>{playbackStatus.error}</span>
                  </div>
                  <button
                    type="button"
                    className="p-1 rounded text-destructive-foreground/80 hover:text-destructive-foreground hover:bg-white/10 transition cursor-pointer border-none bg-transparent"
                    onClick={onDismissError}
                    title="Dismiss error (Esc)"
                    aria-label="Dismiss error"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Playback Controls Bar (Windowed or Auto-Hiding Fullscreen Overlay) */}
        <div
          className={`player-controls-bar ${isFullscreen ? 'fullscreen-overlay-bar' : ''} ${
            isFullscreen ? (showOverlay ? 'overlay-show' : 'overlay-hide') : ''
          }`}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          onMouseEnter={onControlsMouseEnter}
          onMouseLeave={onControlsMouseLeave}
          onFocus={onControlsFocus}
          onBlur={onControlsBlur}
        >
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-primary text-primary-foreground hover:scale-105 active:scale-95 transition-transform cursor-pointer border-none shadow-md disabled:opacity-40 disabled:cursor-not-allowed"
              onClick={onTogglePlayPause}
              disabled={!playbackStatus.currentFile || playbackStatus.mediaState === 'loading'}
              title={
                playbackStatus.mediaState === 'ended'
                  ? 'Replay (Space)'
                  : playbackStatus.paused
                  ? 'Play (Space)'
                  : 'Pause (Space)'
              }
              aria-label={
                playbackStatus.mediaState === 'ended'
                  ? 'Replay'
                  : playbackStatus.paused
                  ? 'Play'
                  : 'Pause'
              }
            >
              {playbackStatus.mediaState === 'ended' ? (
                <RotateCcw size={18} />
              ) : playbackStatus.paused ? (
                <Play size={18} />
              ) : (
                <Pause size={18} />
              )}
            </button>

            <button
              type="button"
              className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-surface-muted/60 hover:bg-surface-muted text-foreground hover:text-primary transition cursor-pointer border-none"
              onClick={onOpenFile}
              title="Open Video File"
              aria-label="Open Video File"
            >
              <FolderOpen size={16} />
            </button>

            {activePlaylist && (
              <>
                <button
                  type="button"
                  className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-surface-muted/60 hover:bg-surface-muted text-foreground hover:text-primary transition cursor-pointer border-none disabled:opacity-40 disabled:cursor-not-allowed"
                  onClick={onPlayPrevPlaylistItem}
                  disabled={activePlaylist.currentIndex <= 0}
                  title="Previous in Playlist"
                  aria-label="Previous in Playlist"
                >
                  <SkipBack size={16} />
                </button>
                <button
                  type="button"
                  className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-surface-muted/60 hover:bg-surface-muted text-foreground hover:text-primary transition cursor-pointer border-none disabled:opacity-40 disabled:cursor-not-allowed"
                  onClick={onPlayNextPlaylistItem}
                  disabled={activePlaylist.currentIndex >= activePlaylist.items.length - 1}
                  title="Next in Playlist"
                  aria-label="Next in Playlist"
                >
                  <SkipForward size={16} />
                </button>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-muted/80 text-[11px] font-medium text-muted-foreground border border-border" title={`Playlist: ${activePlaylist.playlistName}`}>
                  <ListMusic size={12} />
                  <span>{activePlaylist.currentIndex + 1} / {activePlaylist.items.length}</span>
                </div>
              </>
            )}

            <div className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground font-medium select-none ml-1" aria-live="off">
              <span>{formatTime(isScrubbing && scrubPosition !== null ? scrubPosition : playbackStatus.position)}</span>
              <span className="opacity-40">/</span>
              <span>{formatTime(playbackStatus.duration)}</span>
            </div>
          </div>

          <div className="flex-1 flex items-center px-4">
            <input
              type="range"
              className="w-full h-1.5 rounded-lg appearance-none bg-surface-muted hover:bg-border transition cursor-pointer accent-primary disabled:opacity-40 seek-slider"
              min={0}
              max={playbackStatus.duration && playbackStatus.duration > 0 ? playbackStatus.duration : 100}
              step={0.1}
              value={isScrubbing && scrubPosition !== null ? scrubPosition : (playbackStatus.position ?? 0)}
              onChange={onSeekSliderChange}
              onMouseDown={onSeekMouseDown}
              onMouseUp={() => onCommitSeek()}
              onTouchStart={onSeekMouseDown}
              onTouchEnd={() => onCommitSeek()}
              onKeyUp={(e) => {
                if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                  onCommitSeek(parseFloat((e.target as HTMLInputElement).value));
                }
              }}
              disabled={!playbackStatus.currentFile || !playbackStatus.duration || playbackStatus.mediaState === 'loading'}
              title="Seek timeline (Left/Right Arrow)"
              aria-label="Seek timeline"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-surface-muted/60 hover:bg-surface-muted text-foreground hover:text-primary transition cursor-pointer border-none"
              onClick={onToggleMute}
              title={playbackStatus.muted || playbackStatus.volume === 0 ? 'Unmute (M)' : 'Mute (M)'}
              aria-label={playbackStatus.muted || playbackStatus.volume === 0 ? 'Unmute' : 'Mute'}
            >
              {playbackStatus.muted || playbackStatus.volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>

            <input
              type="range"
              className="w-20 h-1.5 rounded-lg appearance-none bg-surface-muted hover:bg-border transition cursor-pointer accent-primary volume-slider"
              min={0}
              max={100}
              step={1}
              value={playbackStatus.muted ? 0 : playbackStatus.volume}
              onChange={onVolumeChange}
              title={`Volume: ${playbackStatus.muted ? 0 : Math.round(playbackStatus.volume)}% (Up/Down Arrow)`}
              aria-label="Volume slider"
            />

            <span className="font-mono text-xs text-muted-foreground w-8 text-right select-none">
              {playbackStatus.muted ? '0%' : `${Math.round(playbackStatus.volume)}%`}
            </span>

            {playbackStatus.currentFile && (
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase border ${
                playbackStatus.mediaState === 'playing'
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                  : playbackStatus.mediaState === 'paused'
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                  : playbackStatus.mediaState === 'loading'
                  ? 'bg-primary/15 text-primary border-primary/30'
                  : playbackStatus.mediaState === 'ended'
                  ? 'bg-muted/30 text-muted-foreground border-border'
                  : 'bg-destructive/15 text-destructive border-destructive/30'
              }`}>
                {playbackStatus.mediaState.toUpperCase()}
              </span>
            )}

            {/* Fullscreen Toggle Button */}
            <button
              type="button"
              className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-surface-muted/60 hover:bg-surface-muted text-foreground hover:text-primary transition cursor-pointer border-none"
              onClick={(e) => {
                e.stopPropagation();
                onTriggerFullscreenToggle();
              }}
              title={isFullscreen ? 'Exit Fullscreen (F / Esc)' : 'Enter Fullscreen (F)'}
              aria-label={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            >
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
