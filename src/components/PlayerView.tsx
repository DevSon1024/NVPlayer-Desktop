import React, { useState, useEffect, useCallback } from 'react';
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
  Headphones,
  Subtitles,
  Check,
  Sliders,
  FileText,
  ArrowLeft,
  Film,
} from 'lucide-react';
import type { PlaybackStatus, PlaylistItem, PlayerTracksSnapshot } from '../types/electron';
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
  isTrackModalOpen?: boolean;
  onTrackModalOpenChange?: (open: boolean) => void;
  onNavigateBack?: () => void;
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
  isTrackModalOpen: externalModalOpen,
  onTrackModalOpenChange,
  onNavigateBack,
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
  const [tracks, setTracks] = useState<PlayerTracksSnapshot | null>(null);
  const [internalModalOpen, setInternalModalOpen] = useState(false);
  const isTrackModalOpen = externalModalOpen !== undefined ? externalModalOpen : internalModalOpen;

  const setModalOpen = useCallback(
    (open: boolean) => {
      if (onTrackModalOpenChange) {
        onTrackModalOpenChange(open);
      } else {
        setInternalModalOpen(open);
      }
    },
    [onTrackModalOpenChange]
  );

  const [activeTab, setActiveTab] = useState<'audio' | 'subtitles'>('audio');
  const [audioDelay, setAudioDelay] = useState(0);
  const [subtitleDelay, setSubtitleDelay] = useState(0);

  // Fetch tracks snapshot from libmpv
  const fetchTracks = useCallback(async () => {
    if (window.nosvedAPI?.getTracks) {
      try {
        const snap = await window.nosvedAPI.getTracks();
        setTracks(snap);
      } catch (err) {
        console.error('Failed to get tracks:', err);
      }
    }
  }, []);

  // Poll tracks on file load and playback start to catch asynchronous demuxing
  useEffect(() => {
    if (playbackStatus.currentFile && playbackStatus.mediaState !== 'idle' && playbackStatus.mediaState !== 'loading') {
      fetchTracks();
      const t1 = setTimeout(fetchTracks, 300);
      const t2 = setTimeout(fetchTracks, 1000);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [playbackStatus.currentFile, playbackStatus.mediaState, fetchTracks]);

  // Comprehensive PlayerView keyboard shortcuts
  useEffect(() => {
    const handlePlayerKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // 'Escape' -> Close track modal
      if (e.key === 'Escape') {
        if (isTrackModalOpen) {
          e.preventDefault();
          e.stopPropagation();
          setModalOpen(false);
          return;
        }
      }

      // 'Backspace' -> Navigate back from PlayerView screen
      if (e.key === 'Backspace') {
        e.preventDefault();
        e.stopPropagation();
        if (isTrackModalOpen) {
          setModalOpen(false);
          return;
        }
        if (resumePrompt) {
          onDismissResumePrompt();
          return;
        }
        if (onNavigateBack) {
          onNavigateBack();
        }
        return;
      }

      // 'A' / 'KeyA' -> Open / toggle Audio tracks
      if (e.code === 'KeyA') {
        e.preventDefault();
        e.stopPropagation();
        if (isTrackModalOpen && activeTab === 'audio') {
          setModalOpen(false);
        } else {
          fetchTracks();
          setActiveTab('audio');
          setModalOpen(true);
        }
        return;
      }

      // 'S' / 'KeyS' -> Open / toggle Subtitle tracks
      if (e.code === 'KeyS') {
        e.preventDefault();
        e.stopPropagation();
        if (isTrackModalOpen && activeTab === 'subtitles') {
          setModalOpen(false);
        } else {
          fetchTracks();
          setActiveTab('subtitles');
          setModalOpen(true);
        }
        return;
      }

      // 'O' / 'KeyO' -> Open media file dialog
      if (e.code === 'KeyO') {
        e.preventDefault();
        e.stopPropagation();
        onOpenFile();
        return;
      }

      // 'N' / 'KeyN' -> Next item in playlist
      if (e.code === 'KeyN' && activePlaylist) {
        e.preventDefault();
        e.stopPropagation();
        onPlayNextPlaylistItem();
        return;
      }

      // 'P' / 'KeyP' -> Previous item in playlist
      if (e.code === 'KeyP' && activePlaylist) {
        e.preventDefault();
        e.stopPropagation();
        onPlayPrevPlaylistItem();
        return;
      }

      // Digit keys 0-9 -> Jump to position percentage (0% to 90%)
      if (e.code >= 'Digit0' && e.code <= 'Digit9' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if (playbackStatus.duration && playbackStatus.duration > 0) {
          e.preventDefault();
          e.stopPropagation();
          const digit = parseInt(e.code.replace('Digit', ''), 10);
          const targetSeconds = (playbackStatus.duration * digit) / 10;
          onCommitSeek(targetSeconds);
          return;
        }
      }
    };

    window.addEventListener('keydown', handlePlayerKeyDown);
    return () => window.removeEventListener('keydown', handlePlayerKeyDown);
  }, [
    isTrackModalOpen,
    activeTab,
    fetchTracks,
    setModalOpen,
    onNavigateBack,
    onOpenFile,
    activePlaylist,
    onPlayNextPlaylistItem,
    onPlayPrevPlaylistItem,
    playbackStatus.duration,
    onCommitSeek,
    resumePrompt,
    onDismissResumePrompt,
  ]);

  // Audio track selection handler
  const handleSelectAudioTrack = async (trackId: number) => {
    if (window.nosvedAPI?.setAudioTrack) {
      try {
        const updated = await window.nosvedAPI.setAudioTrack(trackId);
        setTracks(updated);
      } catch (err) {
        console.error('Failed to set audio track:', err);
      }
    }
  };

  // Subtitle track selection handler
  const handleSelectSubtitleTrack = async (trackId: number | 'no') => {
    if (window.nosvedAPI?.setSubtitleTrack) {
      try {
        const updated = await window.nosvedAPI.setSubtitleTrack(trackId);
        if (trackId !== 'no' && window.nosvedAPI.setSubtitlesVisible) {
          await window.nosvedAPI.setSubtitlesVisible(true);
        }
        setTracks(updated);
      } catch (err) {
        console.error('Failed to set subtitle track:', err);
      }
    }
  };

  // Subtitle visibility toggle handler
  const handleToggleSubtitlesVisible = async (visible: boolean) => {
    if (window.nosvedAPI?.setSubtitlesVisible) {
      try {
        const updated = await window.nosvedAPI.setSubtitlesVisible(visible);
        setTracks(updated);
      } catch (err) {
        console.error('Failed to toggle subtitle visibility:', err);
      }
    }
  };

  // External subtitle file loader
  const handleLoadExternalSubtitle = async () => {
    if (window.nosvedAPI?.selectSubtitleFile) {
      try {
        const res = await window.nosvedAPI.selectSubtitleFile();
        if (res.tracks) {
          setTracks(res.tracks);
        }
      } catch (err) {
        console.error('Failed to load external subtitle:', err);
      }
    }
  };

  // Audio delay changer
  const handleAudioDelayChange = async (deltaSeconds: number) => {
    const next = Math.round((audioDelay + deltaSeconds) * 10) / 10;
    setAudioDelay(next);
    if (window.nosvedAPI?.setAudioDelay) {
      await window.nosvedAPI.setAudioDelay(next).catch(console.error);
    }
  };

  // Subtitle delay changer
  const handleSubtitleDelayChange = async (deltaSeconds: number) => {
    const next = Math.round((subtitleDelay + deltaSeconds) * 10) / 10;
    setSubtitleDelay(next);
    if (window.nosvedAPI?.setSubtitleDelay) {
      await window.nosvedAPI.setSubtitleDelay(next).catch(console.error);
    }
  };

  const selectedAudioTrack = tracks?.audioTracks.find(
    (tr) => String(tr.id) === String(tracks?.selectedAudioId) || (tr.selected && tracks?.selectedAudioId !== 'no')
  );

  const selectedSubTrack = tracks?.subtitlesVisible
    ? tracks?.subtitleTracks.find(
        (tr) => String(tr.id) === String(tracks?.selectedSubtitleId) || (tr.selected && tracks?.selectedSubtitleId !== 'no')
      )
    : null;

  return (
    <div
      className={
        isFullscreen
          ? `player-fullscreen-active fixed inset-0 z-50 h-screen w-screen p-0 m-0 border-0 border-none rounded-none bg-black shadow-none overflow-hidden select-none ${
              !showOverlay ? 'cursor-none' : 'cursor-default'
            }`
          : 'w-full flex-1 min-h-0 h-full flex flex-col p-2 gap-2 overflow-hidden select-none'
      }
    >
      {/* Fullscreen Top Navigation Bar (Revealed with overlay) */}
      {isFullscreen && (
        <div
          className={`fullscreen-top-overlay fixed top-0 inset-x-0 h-12 px-6 flex items-center justify-between z-40 bg-gradient-to-b from-black/85 via-black/40 to-transparent transition-all duration-200 ${
            showOverlay ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-3 pointer-events-none'
          }`}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold backdrop-blur-md border border-white/10 transition cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                onTriggerFullscreenToggle();
              }}
              title="Exit Fullscreen (Esc or F)"
              aria-label="Exit Fullscreen"
            >
              <ArrowLeft size={15} />
              <span>Exit Fullscreen</span>
            </button>

            {playbackStatus.currentFile && (
              <div className="flex items-center gap-2 text-white/90 text-xs font-medium max-w-lg truncate">
                <Film size={14} className="text-primary shrink-0" />
                <span className="truncate">
                  {playbackStatus.currentFile.split(/[/\\]/).pop() || playbackStatus.currentFile}
                </span>
                {playbackStatus.videoWidth && playbackStatus.videoHeight && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/15 text-white/80 shrink-0">
                    {playbackStatus.videoWidth}x{playbackStatus.videoHeight}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white/90 backdrop-blur-md border border-white/10 transition cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                onTriggerFullscreenToggle();
              }}
              title="Exit Fullscreen (Esc)"
              aria-label="Exit Fullscreen"
            >
              <Minimize2 size={16} />
            </button>
          </div>
        </div>
      )}

      {!isDesktopBridge && !isFullscreen && (
        <div className="mb-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-200 text-xs flex items-center gap-2 shrink-0" role="alert">
          <AlertCircle size={16} />
          <span>
            <strong>Browser Preview Mode:</strong> Native Electron desktop bridge is not available. Playback controls require the desktop window.
          </span>
        </div>
      )}

      {/* Floating Resume Playback Banner: Placed OUTSIDE player-container so native Win32 HWND never occludes it */}
      {resumePrompt && (
        <div
          className={
            isFullscreen
              ? 'fixed top-14 left-1/2 -translate-x-1/2 max-w-xl w-[92%] bg-surface-elevated/95 backdrop-blur-xl border border-border/80 px-5 py-3 rounded-2xl z-50 flex items-center justify-between gap-4 text-foreground shadow-2xl animate-fadeIn'
              : 'w-full max-w-2xl mx-auto bg-surface-elevated/95 backdrop-blur-xl border border-border/80 px-5 py-3 rounded-2xl z-30 flex items-center justify-between gap-4 text-foreground shadow-xl shrink-0 animate-fadeIn'
          }
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center text-primary shrink-0">
              <Clock size={16} />
            </div>
            <div className="truncate">
              <h3 className="text-xs font-semibold text-foreground">Resume Playback</h3>
              <p className="text-[11px] text-muted-foreground truncate">
                Continue from <strong className="text-foreground">{formatTime(resumePrompt.position)}</strong>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground font-semibold text-xs shadow hover:scale-[1.02] active:scale-[0.98] transition cursor-pointer border-none"
              onClick={onResumePlayback}
              autoFocus
            >
              <Play size={12} />
              <span>Resume</span>
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-surface-muted hover:bg-surface-elevated text-foreground font-medium text-xs border border-border transition cursor-pointer"
              onClick={onStartFromBeginning}
            >
              <RotateCcw size={12} />
              <span>Restart</span>
            </button>
            <button
              type="button"
              className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-muted transition cursor-pointer border-none bg-transparent"
              onClick={onDismissResumePrompt}
              title="Dismiss (Esc)"
              aria-label="Dismiss resume prompt"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Native Player Viewing Screen Container */}
      <div
        className={
          isFullscreen
            ? 'player-container fullscreen-player-container absolute inset-0 w-full h-full bg-black border-0 border-none rounded-none shadow-none overflow-hidden select-none cursor-pointer'
            : 'player-container w-full flex-1 min-h-0 relative select-none bg-black rounded-xl border border-border/60 overflow-hidden shadow-xl cursor-pointer'
        }
        onClick={onVideoTapOrClick}
        onDoubleClick={onTriggerFullscreenToggle}
        onTouchEnd={onVideoTapOrClick}
      >
        {/* Full-bleed Native Video Viewport: Never resized or squeezed by overlay controls */}
        <div
          id="nosved-video-viewport"
          className="player-video-viewport absolute inset-0 w-full h-full flex items-center justify-center bg-black overflow-hidden z-10"
          ref={videoViewportRef}
        >
          {playbackStatus.currentFile && (
            <>
              {playbackStatus.mediaState === 'loading' && (
                <div className="absolute inset-0 bg-background/85 flex flex-col items-center justify-center gap-3 text-primary text-xs font-semibold z-20">
                  <div className="w-8 h-8 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
                  <span>Loading Media Stream...</span>
                </div>
              )}
              {playbackStatus.error && (
                <div
                  className="absolute top-4 left-4 right-4 bg-destructive/90 text-destructive-foreground backdrop-blur-md px-4 py-3 rounded-xl border border-destructive shadow-lg flex items-center justify-between gap-3 text-xs z-30"
                  role="alert"
                  onClick={(e) => e.stopPropagation()}
                >
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
      </div>

      {/* Playback Controls: Overlay in fullscreen, separate strip below viewing screen in windowed mode */}
      <div
        className={
          isFullscreen
            ? `player-controls-overlay ${showOverlay ? 'overlay-show' : 'overlay-hide'}`
            : 'player-controls-strip'
        }
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
        onMouseEnter={onControlsMouseEnter}
        onMouseLeave={onControlsMouseLeave}
        onFocus={onControlsFocus}
        onBlur={onControlsBlur}
      >
          {/* Left Controls: Play/Pause, Open File, Playlist Prev/Next, Timestamps */}
          <div className="flex items-center gap-2 shrink-0">
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
                <RotateCcw size={16} />
              ) : playbackStatus.paused ? (
                <Play size={16} />
              ) : (
                <Pause size={16} />
              )}
            </button>

            {!isFullscreen && (
              <button
                type="button"
                className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-surface-muted/60 hover:bg-surface-muted text-foreground hover:text-primary transition cursor-pointer border-none"
                onClick={onOpenFile}
                title="Open Video File"
                aria-label="Open Video File"
              >
                <FolderOpen size={15} />
              </button>
            )}

            {activePlaylist && (
              <>
                <button
                  type="button"
                  className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-surface-muted/60 hover:bg-surface-muted text-foreground hover:text-primary transition cursor-pointer border-none disabled:opacity-30 disabled:cursor-not-allowed"
                  onClick={onPlayPrevPlaylistItem}
                  disabled={activePlaylist.currentIndex <= 0}
                  title="Previous in Playlist"
                  aria-label="Previous in Playlist"
                >
                  <SkipBack size={15} />
                </button>
                <button
                  type="button"
                  className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-surface-muted/60 hover:bg-surface-muted text-foreground hover:text-primary transition cursor-pointer border-none disabled:opacity-30 disabled:cursor-not-allowed"
                  onClick={onPlayNextPlaylistItem}
                  disabled={activePlaylist.currentIndex >= activePlaylist.items.length - 1}
                  title="Next in Playlist"
                  aria-label="Next in Playlist"
                >
                  <SkipForward size={15} />
                </button>
                <div
                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-surface-muted/70 text-foreground text-xs font-medium"
                  title={`Playlist: ${activePlaylist.playlistName}`}
                >
                  <ListMusic size={13} className="text-primary" />
                  <span>
                    {activePlaylist.currentIndex + 1}/{activePlaylist.items.length}
                  </span>
                </div>
              </>
            )}

            <div className="flex items-center gap-1 font-mono text-xs text-foreground select-none pl-1">
              <span>{formatTime(isScrubbing && scrubPosition !== null ? scrubPosition : playbackStatus.position)}</span>
              <span className="text-muted-foreground/60">/</span>
              <span className="text-muted-foreground">{formatTime(playbackStatus.duration)}</span>
            </div>
          </div>

          {/* Center Timeline Scrubber */}
          <div className="flex-1 min-w-[120px] flex items-center px-2">
            <input
              type="range"
              className="w-full h-1.5 rounded-lg appearance-none bg-surface-muted hover:bg-border transition cursor-pointer accent-primary"
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

          {/* Right Controls: Volume, Audio Selector, Subtitle Selector, Status, Fullscreen */}
          <div className="flex items-center gap-2.5 shrink-0">
            {/* Volume Control */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-surface-muted/60 hover:bg-surface-muted text-foreground hover:text-primary transition cursor-pointer border-none"
                onClick={onToggleMute}
                title={playbackStatus.muted || playbackStatus.volume === 0 ? 'Unmute (M)' : 'Mute (M)'}
                aria-label={playbackStatus.muted || playbackStatus.volume === 0 ? 'Unmute' : 'Mute'}
              >
                {playbackStatus.muted || playbackStatus.volume === 0 ? <VolumeX size={15} /> : <Volume2 size={15} />}
              </button>

              <input
                type="range"
                className="w-16 h-1.5 rounded-lg appearance-none bg-surface-muted hover:bg-border transition cursor-pointer accent-primary"
                min={0}
                max={100}
                step={1}
                value={playbackStatus.muted ? 0 : playbackStatus.volume}
                onChange={onVolumeChange}
                title={`Volume: ${playbackStatus.muted ? 0 : Math.round(playbackStatus.volume)}% (Up/Down Arrow)`}
                aria-label="Volume slider"
              />

              <span className="font-mono text-[11px] text-muted-foreground w-7 text-right select-none">
                {playbackStatus.muted ? '0%' : `${Math.round(playbackStatus.volume)}%`}
              </span>
            </div>

            {/* Audio Track Selector Button */}
            <button
              type="button"
              className={`inline-flex items-center gap-1.5 px-2.5 h-8 rounded-lg transition cursor-pointer border-none text-xs font-semibold ${
                tracks && tracks.audioTracks.length > 1
                  ? 'bg-primary/20 text-primary hover:bg-primary/30 shadow-sm'
                  : 'bg-surface-muted/60 hover:bg-surface-muted text-foreground hover:text-primary'
              }`}
              onClick={(e) => {
                e.stopPropagation();
                fetchTracks();
                setActiveTab('audio');
                setModalOpen(true);
              }}
              title="Audio Tracks & Sound Settings"
              aria-label="Select Audio Track"
            >
              <Headphones size={15} />
              {selectedAudioTrack?.lang ? (
                <span className="uppercase text-[10px] font-mono tracking-wider">{selectedAudioTrack.lang}</span>
              ) : tracks && tracks.audioTracks.length > 1 ? (
                <span className="text-[10px] font-mono">{tracks.audioTracks.length}</span>
              ) : null}
            </button>

            {/* Subtitle Track Selector Button */}
            <button
              type="button"
              className={`inline-flex items-center gap-1.5 px-2.5 h-8 rounded-lg transition cursor-pointer border-none text-xs font-semibold ${
                selectedSubTrack
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-surface-muted/60 hover:bg-surface-muted text-foreground hover:text-primary'
              }`}
              onClick={(e) => {
                e.stopPropagation();
                fetchTracks();
                setActiveTab('subtitles');
                setModalOpen(true);
              }}
              title="Subtitle Selection & Timing"
              aria-label="Select Subtitle Track"
            >
              <Subtitles size={15} />
              {selectedSubTrack?.lang ? (
                <span className="uppercase text-[10px] font-mono tracking-wider">{selectedSubTrack.lang}</span>
              ) : tracks?.subtitlesVisible && tracks?.selectedSubtitleId !== 'no' ? (
                <span className="text-[10px] uppercase font-mono">ON</span>
              ) : null}
            </button>

            {/* Media State Badge */}
            {playbackStatus.currentFile && (
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase border ${
                  playbackStatus.mediaState === 'playing'
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                    : playbackStatus.mediaState === 'paused'
                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                    : playbackStatus.mediaState === 'loading'
                    ? 'bg-primary/15 text-primary border-primary/30'
                    : playbackStatus.mediaState === 'ended'
                    ? 'bg-muted/30 text-muted-foreground border-border'
                    : 'bg-destructive/15 text-destructive border-destructive/30'
                }`}
              >
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
              title={isFullscreen ? 'Exit Cinema Fullscreen (F / Esc)' : 'Enter Cinema Fullscreen (F)'}
              aria-label={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            >
              {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
          </div>
        </div>

      {/* Dedicated Audio & Subtitle Control Modal (Unobstructed, Airspace-Immune) */}
      {isTrackModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="bg-surface-elevated border border-border rounded-3xl shadow-2xl max-w-lg w-full flex flex-col overflow-hidden text-foreground animate-scaleUp"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="tracks-dialog-title"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-primary/15 flex items-center justify-center text-primary">
                  {activeTab === 'audio' ? <Headphones size={18} /> : <Subtitles size={18} />}
                </div>
                <div>
                  <h3 id="tracks-dialog-title" className="text-base font-bold text-foreground tracking-tight">
                    Audio & Subtitle Settings
                  </h3>
                  <p className="text-[11px] text-muted-foreground">Select streams and adjust synchronization delay</p>
                </div>
              </div>

              <button
                type="button"
                className="w-8 h-8 rounded-xl bg-surface-muted hover:bg-surface-container text-muted-foreground hover:text-foreground flex items-center justify-center transition border-none cursor-pointer"
                onClick={() => setModalOpen(false)}
                title="Close (Esc)"
                aria-label="Close dialog"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex items-center px-6 pt-4 gap-2 bg-surface-elevated border-b border-border/50">
              <button
                type="button"
                className={`flex items-center gap-2 px-4 py-2 rounded-t-xl text-xs font-semibold transition border-none cursor-pointer border-b-2 ${
                  activeTab === 'audio'
                    ? 'border-primary text-primary bg-primary/10'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setActiveTab('audio')}
              >
                <Headphones size={14} />
                <span>Audio Tracks ({tracks?.audioTracks.length || 0})</span>
              </button>

              <button
                type="button"
                className={`flex items-center gap-2 px-4 py-2 rounded-t-xl text-xs font-semibold transition border-none cursor-pointer border-b-2 ${
                  activeTab === 'subtitles'
                    ? 'border-primary text-primary bg-primary/10'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setActiveTab('subtitles')}
              >
                <Subtitles size={14} />
                <span>Subtitles ({tracks?.subtitleTracks.length || 0})</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 flex flex-col gap-5 max-h-[60vh] overflow-y-auto">
              {activeTab === 'audio' && (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      Select Active Audio Stream
                    </span>

                    <div className="flex flex-col gap-2 mt-1">
                      {tracks && tracks.audioTracks.length > 0 ? (
                        tracks.audioTracks.map((tr) => {
                          const isSelected =
                            String(tracks.selectedAudioId) === String(tr.id) ||
                            (tr.selected && tracks.selectedAudioId !== 'no');
                          return (
                            <button
                              key={tr.id}
                              type="button"
                              className={`flex items-center justify-between p-3.5 rounded-2xl cursor-pointer transition border text-left w-full ${
                                isSelected
                                  ? 'bg-primary-container/30 border-primary text-foreground shadow-sm'
                                  : 'bg-surface border-border hover:bg-surface-muted text-foreground'
                              }`}
                              onClick={() => handleSelectAudioTrack(tr.id)}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div
                                  className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                                    isSelected
                                      ? 'bg-primary text-primary-foreground shadow'
                                      : 'border border-muted-foreground/40 text-transparent'
                                  }`}
                                >
                                  <Check size={13} />
                                </div>
                                <div className="flex flex-col truncate">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-foreground truncate">
                                      Track {tr.id}: {tr.title || tr.lang || `Audio Stream ${tr.id}`}
                                    </span>
                                    {isSelected && (
                                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-primary/20 text-primary">
                                        Active
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground font-mono">
                                    {tr.lang && <span>Language: {tr.lang.toUpperCase()}</span>}
                                    {tr.codec && <span>• Codec: {tr.codec.toUpperCase()}</span>}
                                    {tr.isDefault && <span className="text-primary">• Default</span>}
                                  </div>
                                </div>
                              </div>
                            </button>
                          );
                        })
                      ) : (
                        <div className="p-6 text-center text-muted-foreground text-xs bg-surface border border-border rounded-2xl">
                          No multiple audio streams detected for this video file.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Audio Delay Offset Adjuster */}
                  <div className="p-4 bg-surface border border-border rounded-2xl flex flex-col gap-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                        <Sliders size={14} className="text-primary" />
                        <span>Audio Delay (Sync Correction)</span>
                      </div>
                      <span className="font-mono text-xs text-primary font-bold">{audioDelay.toFixed(1)}s</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="px-2.5 py-1.5 rounded-lg bg-surface-muted hover:bg-surface-container text-foreground text-xs font-semibold transition border-none cursor-pointer"
                        onClick={() => handleAudioDelayChange(-0.5)}
                      >
                        -0.5s
                      </button>
                      <button
                        type="button"
                        className="px-2.5 py-1.5 rounded-lg bg-surface-muted hover:bg-surface-container text-foreground text-xs font-semibold transition border-none cursor-pointer"
                        onClick={() => handleAudioDelayChange(-0.1)}
                      >
                        -0.1s
                      </button>
                      <button
                        type="button"
                        className="flex-1 py-1.5 rounded-lg bg-surface-muted hover:bg-surface-container text-foreground text-xs font-semibold transition border-none cursor-pointer"
                        onClick={async () => {
                          setAudioDelay(0);
                          if (window.nosvedAPI?.setAudioDelay) {
                            await window.nosvedAPI.setAudioDelay(0);
                          }
                        }}
                      >
                        Reset (0.0s)
                      </button>
                      <button
                        type="button"
                        className="px-2.5 py-1.5 rounded-lg bg-surface-muted hover:bg-surface-container text-foreground text-xs font-semibold transition border-none cursor-pointer"
                        onClick={() => handleAudioDelayChange(0.1)}
                      >
                        +0.1s
                      </button>
                      <button
                        type="button"
                        className="px-2.5 py-1.5 rounded-lg bg-surface-muted hover:bg-surface-container text-foreground text-xs font-semibold transition border-none cursor-pointer"
                        onClick={() => handleAudioDelayChange(0.5)}
                      >
                        +0.5s
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'subtitles' && (
                <div className="flex flex-col gap-4">
                  {/* Master Subtitles Toggle */}
                  <div className="flex items-center justify-between p-4 bg-surface border border-border rounded-2xl">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-bold text-foreground">Subtitle Display</span>
                      <span className="text-[11px] text-muted-foreground">
                        Show or hide rendered on-screen subtitles
                      </span>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={tracks?.subtitlesVisible}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors border-none cursor-pointer ${
                        tracks?.subtitlesVisible ? 'bg-primary' : 'bg-surface-muted'
                      }`}
                      onClick={() => handleToggleSubtitlesVisible(!tracks?.subtitlesVisible)}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          tracks?.subtitlesVisible ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Subtitle Tracks List */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      Available Subtitle Tracks
                    </span>

                    <div className="flex flex-col gap-2 mt-1">
                      {/* Off Option */}
                      <button
                        type="button"
                        className={`flex items-center justify-between p-3.5 rounded-2xl cursor-pointer transition border text-left w-full ${
                          !tracks?.subtitlesVisible || tracks?.selectedSubtitleId === 'no'
                            ? 'bg-primary-container/30 border-primary text-foreground shadow-sm'
                            : 'bg-surface border-border hover:bg-surface-muted text-foreground'
                        }`}
                        onClick={() => handleSelectSubtitleTrack('no')}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                              !tracks?.subtitlesVisible || tracks?.selectedSubtitleId === 'no'
                                ? 'bg-primary text-primary-foreground shadow'
                                : 'border border-muted-foreground/40 text-transparent'
                            }`}
                          >
                            <Check size={13} />
                          </div>
                          <div>
                            <span className="text-xs font-bold text-foreground">Off (Disable Subtitles)</span>
                            <p className="text-[11px] text-muted-foreground mt-0.5">Do not render any subtitles</p>
                          </div>
                        </div>
                      </button>

                      {tracks && tracks.subtitleTracks.length > 0 ? (
                        tracks.subtitleTracks.map((tr) => {
                          const isSelected =
                            Boolean(tracks.subtitlesVisible) &&
                            (String(tracks.selectedSubtitleId) === String(tr.id) ||
                              (tr.selected && tracks.selectedSubtitleId !== 'no'));
                          return (
                            <button
                              key={tr.id}
                              type="button"
                              className={`flex items-center justify-between p-3.5 rounded-2xl cursor-pointer transition border text-left w-full ${
                                isSelected
                                  ? 'bg-primary-container/30 border-primary text-foreground shadow-sm'
                                  : 'bg-surface border-border hover:bg-surface-muted text-foreground'
                              }`}
                              onClick={() => handleSelectSubtitleTrack(tr.id)}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div
                                  className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                                    isSelected
                                      ? 'bg-primary text-primary-foreground shadow'
                                      : 'border border-muted-foreground/40 text-transparent'
                                  }`}
                                >
                                  <Check size={13} />
                                </div>
                                <div className="flex flex-col truncate">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-foreground truncate">
                                      Track {tr.id}: {tr.title || tr.lang || `Subtitle Stream ${tr.id}`}
                                    </span>
                                    {isSelected && (
                                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-primary/20 text-primary">
                                        Active
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground font-mono">
                                    {tr.lang && <span>Language: {tr.lang.toUpperCase()}</span>}
                                    {tr.codec && <span>• Format: {tr.codec.toUpperCase()}</span>}
                                    {tr.isDefault && <span className="text-primary">• Default</span>}
                                  </div>
                                </div>
                              </div>
                            </button>
                          );
                        })
                      ) : (
                        <div className="p-4 text-center text-muted-foreground text-xs bg-surface border border-border rounded-2xl">
                          No embedded subtitles found inside media container.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Load External Subtitles Button */}
                  <button
                    type="button"
                    className="flex items-center justify-center gap-2 p-3.5 rounded-2xl bg-surface hover:bg-surface-muted text-primary font-bold text-xs border border-primary/30 transition cursor-pointer"
                    onClick={handleLoadExternalSubtitle}
                  >
                    <FileText size={16} />
                    <span>Load External Subtitle File (.srt, .vtt, .ass)...</span>
                  </button>

                  {/* Subtitle Delay Adjuster */}
                  <div className="p-4 bg-surface border border-border rounded-2xl flex flex-col gap-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                        <Sliders size={14} className="text-primary" />
                        <span>Subtitle Delay (Timing Correction)</span>
                      </div>
                      <span className="font-mono text-xs text-primary font-bold">{subtitleDelay.toFixed(1)}s</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="px-2.5 py-1.5 rounded-lg bg-surface-muted hover:bg-surface-container text-foreground text-xs font-semibold transition border-none cursor-pointer"
                        onClick={() => handleSubtitleDelayChange(-0.5)}
                      >
                        -0.5s
                      </button>
                      <button
                        type="button"
                        className="px-2.5 py-1.5 rounded-lg bg-surface-muted hover:bg-surface-container text-foreground text-xs font-semibold transition border-none cursor-pointer"
                        onClick={() => handleSubtitleDelayChange(-0.1)}
                      >
                        -0.1s
                      </button>
                      <button
                        type="button"
                        className="flex-1 py-1.5 rounded-lg bg-surface-muted hover:bg-surface-container text-foreground text-xs font-semibold transition border-none cursor-pointer"
                        onClick={async () => {
                          setSubtitleDelay(0);
                          if (window.nosvedAPI?.setSubtitleDelay) {
                            await window.nosvedAPI.setSubtitleDelay(0);
                          }
                        }}
                      >
                        Reset (0.0s)
                      </button>
                      <button
                        type="button"
                        className="px-2.5 py-1.5 rounded-lg bg-surface-muted hover:bg-surface-container text-foreground text-xs font-semibold transition border-none cursor-pointer"
                        onClick={() => handleSubtitleDelayChange(0.1)}
                      >
                        +0.1s
                      </button>
                      <button
                        type="button"
                        className="px-2.5 py-1.5 rounded-lg bg-surface-muted hover:bg-surface-container text-foreground text-xs font-semibold transition border-none cursor-pointer"
                        onClick={() => handleSubtitleDelayChange(0.5)}
                      >
                        +0.5s
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-border bg-surface flex justify-end">
              <button
                type="button"
                className="px-5 py-2 rounded-xl bg-primary text-primary-foreground font-semibold text-xs shadow hover:scale-[1.02] active:scale-[0.98] transition cursor-pointer border-none"
                onClick={() => setModalOpen(false)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlayerView;
