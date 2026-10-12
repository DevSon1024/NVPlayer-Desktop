import React from 'react';
import {
  Film,
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
        <div className="browser-diagnostic-banner" role="alert">
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
          <div className="resume-modal-card">
            <div className="resume-modal-header">
              <Clock size={20} className="resume-modal-icon" />
              <div>
                <h3 className="resume-modal-title">Resume Playback</h3>
                <p className="resume-modal-subtitle">
                  You previously watched this video up to <strong>{formatTime(resumePrompt.position)}</strong>.
                </p>
              </div>
            </div>
            <div className="resume-modal-actions">
              <button
                type="button"
                className="resume-btn primary"
                onClick={onResumePlayback}
                autoFocus
              >
                <Play size={16} />
                <span>Resume from {formatTime(resumePrompt.position)}</span>
              </button>
              <button
                type="button"
                className="resume-btn secondary"
                onClick={onStartFromBeginning}
              >
                <RotateCcw size={16} />
                <span>Start from Beginning</span>
              </button>
              <button
                type="button"
                className="resume-dismiss-btn"
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
          {playbackStatus.currentFile ? (
            <>
              {playbackStatus.mediaState === 'loading' && (
                <div className="player-loading-overlay">
                  <div className="loading-spinner" />
                  <span>Loading Media Stream...</span>
                </div>
              )}
              {playbackStatus.error && (
                <div className="player-error-banner" role="alert">
                  <div className="error-banner-body">
                    <AlertCircle size={16} />
                    <span>{playbackStatus.error}</span>
                  </div>
                  <button
                    type="button"
                    className="error-dismiss-btn"
                    onClick={onDismissError}
                    title="Dismiss error (Esc)"
                    aria-label="Dismiss error"
                  >
                    <X size={14} />
                  </button>
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
                <div className="player-error-banner" role="alert" style={{ marginTop: 12 }}>
                  <div className="error-banner-body">
                    <AlertCircle size={16} />
                    <span>{playbackStatus.error}</span>
                  </div>
                  <button
                    type="button"
                    className="error-dismiss-btn"
                    onClick={onDismissError}
                    title="Dismiss error (Esc)"
                    aria-label="Dismiss error"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
              <button
                type="button"
                className="open-file-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenFile();
                }}
                onTouchEnd={(e) => e.stopPropagation()}
                aria-label="Open video file from disk"
              >
                <FolderOpen size={18} />
                <span>Open Video File</span>
              </button>
            </div>
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
          <div className="controls-left">
            <button
              type="button"
              className="control-btn primary-play-btn"
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
              className="control-btn"
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
                  className="control-btn"
                  onClick={onPlayPrevPlaylistItem}
                  disabled={activePlaylist.currentIndex <= 0}
                  title="Previous in Playlist"
                  aria-label="Previous in Playlist"
                >
                  <SkipBack size={16} />
                </button>
                <button
                  type="button"
                  className="control-btn"
                  onClick={onPlayNextPlaylistItem}
                  disabled={activePlaylist.currentIndex >= activePlaylist.items.length - 1}
                  title="Next in Playlist"
                  aria-label="Next in Playlist"
                >
                  <SkipForward size={16} />
                </button>
                <div className="active-playlist-indicator" title={`Playlist: ${activePlaylist.playlistName}`}>
                  <ListMusic size={12} />
                  <span>{activePlaylist.currentIndex + 1} / {activePlaylist.items.length}</span>
                </div>
              </>
            )}

            <div className="time-display" aria-live="off">
              <span>{formatTime(isScrubbing && scrubPosition !== null ? scrubPosition : playbackStatus.position)}</span>
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

          <div className="controls-right">
            <button
              type="button"
              className="control-btn"
              onClick={onToggleMute}
              title={playbackStatus.muted || playbackStatus.volume === 0 ? 'Unmute (M)' : 'Mute (M)'}
              aria-label={playbackStatus.muted || playbackStatus.volume === 0 ? 'Unmute' : 'Mute'}
            >
              {playbackStatus.muted || playbackStatus.volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>

            <input
              type="range"
              className="volume-slider"
              min={0}
              max={100}
              step={1}
              value={playbackStatus.muted ? 0 : playbackStatus.volume}
              onChange={onVolumeChange}
              title={`Volume: ${playbackStatus.muted ? 0 : Math.round(playbackStatus.volume)}% (Up/Down Arrow)`}
              aria-label="Volume slider"
            />

            <span className="volume-label">
              {playbackStatus.muted ? '0%' : `${Math.round(playbackStatus.volume)}%`}
            </span>

            {playbackStatus.currentFile && (
              <span className={`status-pill status-${playbackStatus.mediaState}`}>
                {playbackStatus.mediaState.toUpperCase()}
              </span>
            )}

            {/* Fullscreen Toggle Button */}
            <button
              type="button"
              className="control-btn fullscreen-btn"
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
