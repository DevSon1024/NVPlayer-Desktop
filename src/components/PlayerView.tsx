import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  Headphones,
  Subtitles,
  Check,
  Sliders,
  FileText,
  ArrowLeft,
  Camera,
} from 'lucide-react';
import type { PlaybackStatus, PlaylistItem, PlayerTracksSnapshot } from '../types/electron';
import { formatTime } from '../utils/formatters';
import { M3GappedScrubber } from './M3GappedScrubber';
import { FrameCaptureModal } from './FrameCaptureModal';

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

export interface PlayerViewProps {
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
  onFrameStep?: () => void;
  onFrameBackStep?: () => void;
  onCaptureFrame?: (customDir?: string) => Promise<{ success: boolean; filePath?: string; frameNumber?: number; error?: string }>;
  onSetSpeed?: (speed: number) => void;
}

const SPEED_STEPS = [0.5, 1.0, 1.25, 1.5, 2.0];

const formatCleanTitle = (filePath: string | null): string => {
  if (!filePath) return '';
  const fileName = filePath.split(/[/\\]/).pop() || filePath;
  const nameWithoutExt = fileName.replace(/\.[^/.]+$/, '');
  return nameWithoutExt.replace(/[._]/g, ' ');
};



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
  onFrameStep,
  onFrameBackStep,
  onCaptureFrame,
  onSetSpeed,
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

  // On-Screen Display (OSD) HUD State & Trigger
  interface OsdState {
    type: 'volume' | 'seek' | 'play' | 'pause' | 'mute' | 'double_tap_left' | 'double_tap_right';
    value?: string | number;
    subValue?: string;
  }
  const [osd, setOsd] = useState<OsdState | null>(null);
  const osdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerOsd = useCallback((state: OsdState, durationMs = 1000) => {
    if (osdTimerRef.current) clearTimeout(osdTimerRef.current);
    setOsd(state);
    osdTimerRef.current = setTimeout(() => {
      setOsd(null);
    }, durationMs);
  }, []);

  // Frame Capture Modal State
  const [isFrameCaptureOpen, setIsFrameCaptureOpen] = useState(false);

  const handleToggleFrameCapture = useCallback(() => {
    setIsFrameCaptureOpen((prev) => {
      const next = !prev;
      if (next && !playbackStatus.paused) {
        onTogglePlayPause();
      }
      return next;
    });
  }, [playbackStatus.paused, onTogglePlayPause]);

  const handleCycleSpeed = useCallback(() => {
    const currentSpeed = playbackStatus.speed ?? 1.0;
    const currentIndex = SPEED_STEPS.findIndex((s) => Math.abs(s - currentSpeed) < 0.05);
    const nextSpeed =
      (currentIndex >= 0 && currentIndex < SPEED_STEPS.length - 1
        ? SPEED_STEPS[currentIndex + 1]
        : SPEED_STEPS[0]) ?? 1.0;
    if (onSetSpeed) {
      onSetSpeed(nextSpeed);
    } else if (window.nosvedAPI?.setSpeed) {
      window.nosvedAPI.setSpeed(nextSpeed);
    }
  }, [playbackStatus.speed, onSetSpeed]);

  // Viewport Mouse Wheel Gesture: Vertical -> Volume, Horizontal / Shift+Wheel -> Seek
  const handleViewportWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (!playbackStatus.currentFile) return;

      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey) {
        const delta = e.shiftKey ? e.deltaY : e.deltaX;
        const step = delta > 0 ? 5 : -5;
        const currentPos = playbackStatus.position ?? 0;
        const maxPos = playbackStatus.duration ?? currentPos + 10;
        const targetPos = Math.max(0, Math.min(maxPos, currentPos + step));
        onCommitSeek(targetPos);
        triggerOsd({
          type: 'seek',
          value: step > 0 ? '+5s' : '-5s',
          subValue: formatTime(targetPos),
        });
      } else {
        const step = e.deltaY < 0 ? 5 : -5;
        const newVol = Math.max(0, Math.min(100, Math.round(playbackStatus.volume + step)));
        if (window.nosvedAPI?.setVolume) {
          window.nosvedAPI.setVolume(newVol).catch(console.error);
        }
        triggerOsd({
          type: 'volume',
          value: newVol,
        });
      }
    },
    [playbackStatus.currentFile, playbackStatus.position, playbackStatus.duration, playbackStatus.volume, onCommitSeek, triggerOsd]
  );

  // Viewport Pointer Drag Gesture (Swipe to seek horizontally, drag vertically for volume)
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; initialPos: number; initialVol: number } | null>(null);
  const [isPointerDragging, setIsPointerDragging] = useState(false);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      initialPos: playbackStatus.position ?? 0,
      initialVol: playbackStatus.volume,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return;
    const deltaX = e.clientX - dragStartRef.current.x;
    const deltaY = dragStartRef.current.y - e.clientY;

    if (!isPointerDragging && (Math.abs(deltaX) > 18 || Math.abs(deltaY) > 18)) {
      setIsPointerDragging(true);
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
      }
    }

    if (isPointerDragging) {
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        const rect = e.currentTarget.getBoundingClientRect();
        const duration = playbackStatus.duration || 100;
        const seekOffset = (deltaX / rect.width) * Math.min(120, duration * 0.25);
        const targetPos = Math.max(0, Math.min(duration, dragStartRef.current.initialPos + seekOffset));
        triggerOsd(
          {
            type: 'seek',
            value: `${seekOffset > 0 ? '+' : ''}${Math.round(seekOffset)}s`,
            subValue: formatTime(targetPos),
          },
          500
        );
      } else {
        const volOffset = Math.round((deltaY / 180) * 100);
        const newVol = Math.max(0, Math.min(100, dragStartRef.current.initialVol + volOffset));
        if (window.nosvedAPI?.setVolume) {
          window.nosvedAPI.setVolume(newVol).catch(console.error);
        }
        triggerOsd(
          {
            type: 'volume',
            value: newVol,
          },
          500
        );
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartRef.current && isPointerDragging) {
      const deltaX = e.clientX - dragStartRef.current.x;
      const deltaY = dragStartRef.current.y - e.clientY;
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        const rect = e.currentTarget.getBoundingClientRect();
        const duration = playbackStatus.duration || 100;
        const seekOffset = (deltaX / rect.width) * Math.min(120, duration * 0.25);
        const targetPos = Math.max(0, Math.min(duration, dragStartRef.current.initialPos + seekOffset));
        onCommitSeek(targetPos);
      }
    }
    dragStartRef.current = null;
    setTimeout(() => setIsPointerDragging(false), 60);
  };

  // Viewport Click & Double-Tap Zones
  const handleViewportClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isPointerDragging) return;

    onVideoTapOrClick(e);

    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;

    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;

      if (ratio < 0.35) {
        const currentPos = playbackStatus.position ?? 0;
        const targetPos = Math.max(0, currentPos - 10);
        onCommitSeek(targetPos);
        triggerOsd({ type: 'double_tap_left', value: '10s' });
      } else if (ratio > 0.65) {
        const currentPos = playbackStatus.position ?? 0;
        const maxPos = playbackStatus.duration ?? currentPos + 10;
        const targetPos = Math.min(maxPos, currentPos + 10);
        onCommitSeek(targetPos);
        triggerOsd({ type: 'double_tap_right', value: '10s' });
      } else {
        onTriggerFullscreenToggle();
      }
    } else {
      clickTimerRef.current = setTimeout(() => {
        clickTimerRef.current = null;
        if (playbackStatus.currentFile && playbackStatus.mediaState !== 'loading') {
          onTogglePlayPause();
          triggerOsd({
            type: playbackStatus.paused ? 'play' : 'pause',
          });
        }
      }, 230);
    }
  };

  // Fetch tracks snapshot from libmpv
  const fetchTracks = useCallback(async () => {
    if (window.nosvedAPI?.getTracks) {
      try {
        const snapshot = await window.nosvedAPI.getTracks();
        setTracks(snapshot);
      } catch (err) {
        console.error('Failed to get tracks snapshot:', err);
      }
    }
  }, []);

  // Keyboard navigation & playback shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      const isCtrlF = (e.ctrlKey || e.metaKey) && e.code === 'KeyF';

      // Toggle Frame Capture mode via Ctrl+F (or Cmd+F)
      if (isCtrlF) {
        e.preventDefault();
        e.stopPropagation();
        handleToggleFrameCapture();
        return;
      }

      // Standard Cinema Fullscreen Toggle via 'F' (without Ctrl/Meta/Shift/Alt)
      if (e.code === 'KeyF' && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        onTriggerFullscreenToggle();
        return;
      }

      if (e.code === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (resumePrompt) {
          onDismissResumePrompt();
          return;
        }
        if (playbackStatus.error) {
          onDismissError();
          return;
        }
        if (isTrackModalOpen) {
          setModalOpen(false);
          return;
        }
        if (isFullscreen) {
          onTriggerFullscreenToggle();
          return;
        }
        if (onNavigateBack) {
          onNavigateBack();
        }
        return;
      }

      if (e.code === 'Space' || e.code === 'KeyK') {
        e.preventDefault();
        e.stopPropagation();
        onTogglePlayPause();
        triggerOsd({
          type: playbackStatus.paused ? 'play' : 'pause',
        });
        return;
      }

      if (e.code === 'KeyJ') {
        e.preventDefault();
        e.stopPropagation();
        if (playbackStatus.position !== null) {
          const newPos = Math.max(0, playbackStatus.position - 10);
          onCommitSeek(newPos);
          triggerOsd({ type: 'double_tap_left', value: '10s' });
        }
        return;
      }

      if (e.code === 'KeyL') {
        e.preventDefault();
        e.stopPropagation();
        if (playbackStatus.position !== null) {
          const max = playbackStatus.duration ?? playbackStatus.position + 10;
          const newPos = Math.min(max, playbackStatus.position + 10);
          onCommitSeek(newPos);
          triggerOsd({ type: 'double_tap_right', value: '10s' });
        }
        return;
      }

      if (e.code === 'ArrowLeft') {
        e.preventDefault();
        e.stopPropagation();
        if (playbackStatus.position !== null) {
          const newPos = Math.max(0, playbackStatus.position - 5);
          onCommitSeek(newPos);
          triggerOsd({ type: 'seek', value: '-5s', subValue: formatTime(newPos) });
        }
        return;
      }

      if (e.code === 'ArrowRight') {
        e.preventDefault();
        e.stopPropagation();
        if (playbackStatus.position !== null) {
          const max = playbackStatus.duration ?? playbackStatus.position + 5;
          const newPos = Math.min(max, playbackStatus.position + 5);
          onCommitSeek(newPos);
          triggerOsd({ type: 'seek', value: '+5s', subValue: formatTime(newPos) });
        }
        return;
      }

      if (e.code === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        const newVol = Math.min(100, Math.round(playbackStatus.volume + 5));
        if (window.nosvedAPI?.setVolume) {
          window.nosvedAPI.setVolume(newVol).catch(console.error);
        }
        triggerOsd({ type: 'volume', value: newVol });
        return;
      }

      if (e.code === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        const newVol = Math.max(0, Math.round(playbackStatus.volume - 5));
        if (window.nosvedAPI?.setVolume) {
          window.nosvedAPI.setVolume(newVol).catch(console.error);
        }
        triggerOsd({ type: 'volume', value: newVol });
        return;
      }

      if (e.code === 'KeyM') {
        e.preventDefault();
        e.stopPropagation();
        onToggleMute();
        triggerOsd({
          type: 'mute',
          value: playbackStatus.muted ? 'Unmuted' : 'Muted',
        });
        return;
      }

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

      if (e.code === 'KeyO') {
        e.preventDefault();
        e.stopPropagation();
        onOpenFile();
        return;
      }

      if (e.code === 'KeyN' && activePlaylist) {
        e.preventDefault();
        e.stopPropagation();
        onPlayNextPlaylistItem();
        return;
      }

      if (e.code === 'KeyP' && activePlaylist) {
        e.preventDefault();
        e.stopPropagation();
        onPlayPrevPlaylistItem();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isFrameCaptureOpen,
    handleToggleFrameCapture,
    playbackStatus.paused,
    playbackStatus.position,
    playbackStatus.duration,
    playbackStatus.volume,
    playbackStatus.muted,
    playbackStatus.error,
    playbackStatus.fps,
    isFullscreen,
    isTrackModalOpen,
    activeTab,
    activePlaylist,
    onOpenFile,
    onPlayNextPlaylistItem,
    onPlayPrevPlaylistItem,
    onCommitSeek,
    onDismissError,
    onNavigateBack,
    onTogglePlayPause,
    onToggleMute,
    onTriggerFullscreenToggle,
    triggerOsd,
    resumePrompt,
    onDismissResumePrompt,
    fetchTracks,
    setModalOpen,
  ]);

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

  const handleAudioDelayChange = async (deltaSeconds: number) => {
    const next = Math.round((audioDelay + deltaSeconds) * 10) / 10;
    setAudioDelay(next);
    if (window.nosvedAPI?.setAudioDelay) {
      await window.nosvedAPI.setAudioDelay(next).catch(console.error);
    }
  };

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

  const currentDuration = playbackStatus.duration ?? 0;
  const currentPos = isScrubbing && scrubPosition !== null ? scrubPosition : (playbackStatus.position ?? 0);
  const remainingSec = Math.max(0, currentDuration - currentPos);
  const currentSpeed = playbackStatus.speed ?? 1.0;

  return (
    <div
      className={
        isFullscreen
          ? `player-fullscreen-active fixed inset-0 z-50 h-screen w-screen p-0 m-0 border-none bg-black overflow-hidden select-none ${
              !showOverlay && !isFrameCaptureOpen ? 'cursor-none' : 'cursor-default'
            }`
          : 'w-full flex-1 min-h-0 h-full flex flex-col p-2 gap-2 overflow-hidden select-none bg-background'
      }
    >
      {/* Fullscreen Floating Top Header Bar (Vanishes completely while watching video) */}
      {isFullscreen && (
        <div
          className={`fixed top-0 inset-x-0 h-14 px-6 flex items-center justify-between z-40 bg-surface/90 backdrop-blur-xl border-b border-border text-foreground transition-all duration-300 ${
            showOverlay && !isFrameCaptureOpen ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 -translate-y-full pointer-events-none'
          }`}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onMouseEnter={onControlsMouseEnter}
          onMouseLeave={onControlsMouseLeave}
          onFocus={onControlsFocus}
          onBlur={onControlsBlur}
        >
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-surface-muted hover:bg-surface-elevated text-foreground border border-border text-xs font-semibold backdrop-blur-md transition cursor-pointer shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                onTriggerFullscreenToggle();
              }}
              title="Exit Fullscreen (F or Esc)"
              aria-label="Exit Fullscreen"
            >
              <ArrowLeft size={15} />
              <span>Exit Fullscreen</span>
            </button>

            {playbackStatus.currentFile && (
              <span className="text-sm font-semibold text-foreground truncate max-w-md">
                {formatCleanTitle(playbackStatus.currentFile)}
              </span>
            )}
          </div>

          {/* Technical Metadata Capsule Group */}
          <div className="flex items-center gap-2 shrink-0">
            {playbackStatus.videoWidth && playbackStatus.videoHeight && (
              <span className="bg-surface-muted text-primary border border-primary/30 rounded-full px-2.5 py-0.5 text-xs font-mono font-medium">
                {playbackStatus.videoWidth}x{playbackStatus.videoHeight}
              </span>
            )}
            {playbackStatus.fps && playbackStatus.fps > 0 && (
              <span className="bg-surface-muted text-primary border border-primary/30 rounded-full px-2.5 py-0.5 text-xs font-mono font-medium">
                {Math.round(playbackStatus.fps)} FPS
              </span>
            )}
            <span className="bg-primary/15 text-primary border border-primary/30 rounded-full px-2.5 py-0.5 text-xs font-bold">
              {playbackStatus.hwdec && playbackStatus.hwdec !== 'no' ? playbackStatus.hwdec.toUpperCase() : 'HW'}
            </span>

            <button
              type="button"
              className="p-1.5 rounded-full bg-surface-muted hover:bg-surface-elevated text-foreground border border-border transition cursor-pointer ml-1"
              onClick={(e) => {
                e.stopPropagation();
                onTriggerFullscreenToggle();
              }}
              title="Exit Fullscreen (F or Esc)"
              aria-label="Exit Fullscreen"
            >
              <Minimize2 size={15} />
            </button>
          </div>
        </div>
      )}

      {!isDesktopBridge && !isFullscreen && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-500 text-xs flex items-center gap-2 shrink-0" role="alert">
          <AlertCircle size={16} />
          <span>
            <strong>Browser Preview Mode:</strong> Native Electron desktop bridge is not available. Playback controls require the desktop window.
          </span>
        </div>
      )}

      {/* Floating Resume Playback Banner */}
      {resumePrompt && (
        <div
          className={
            isFullscreen
              ? 'fixed top-16 left-1/2 -translate-x-1/2 max-w-xl w-[92%] bg-surface-elevated/95 backdrop-blur-xl border border-border px-5 py-3 rounded-2xl z-50 flex items-center justify-between gap-4 text-foreground shadow-2xl animate-fadeIn'
              : 'w-full max-w-2xl mx-auto bg-surface-elevated/95 backdrop-blur-xl border border-border px-5 py-3 rounded-2xl z-30 flex items-center justify-between gap-4 text-foreground shadow-xl shrink-0 animate-fadeIn'
          }
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-full bg-primary-container flex items-center justify-center text-on-primary-container shrink-0">
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

      {/* Native Player Video Screen Container */}
      <div
        className={
          isFullscreen
            ? 'player-container fullscreen-player-container absolute inset-0 w-full h-full bg-black overflow-hidden select-none cursor-pointer'
            : 'player-container w-full flex-1 min-h-0 relative select-none bg-black rounded-xl border border-border/60 overflow-hidden shadow-xl cursor-pointer'
        }
        onClick={handleViewportClick}
        onWheel={handleViewportWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div
          id="nosved-video-viewport"
          className="player-video-viewport absolute inset-0 w-full h-full flex items-center justify-center bg-black overflow-hidden z-10"
          ref={videoViewportRef}
        >
          {playbackStatus.currentFile && (
            <>
              {playbackStatus.mediaState === 'loading' && (
                <div className="absolute inset-0 bg-background/90 flex flex-col items-center justify-center gap-3 text-primary text-xs font-semibold z-20">
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
                    className="p-1 rounded text-destructive-foreground/80 hover:text-destructive-foreground hover:bg-destructive-foreground/15 transition cursor-pointer border-none bg-transparent"
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

        {/* On-Screen Display (OSD) HUD */}
        {osd && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-40 animate-fadeIn">
            {osd.type === 'volume' && (
              <div className="flex flex-col items-center gap-2.5 px-6 py-4 rounded-2xl bg-surface-elevated/90 backdrop-blur-md border border-border text-foreground shadow-2xl min-w-[180px]">
                {Number(osd.value) === 0 ? (
                  <VolumeX size={36} className="text-destructive" />
                ) : (
                  <Volume2 size={36} className="text-primary" />
                )}
                <span className="text-sm font-semibold tracking-wide">Volume {osd.value}%</span>
                <div className="w-full h-1.5 rounded-full bg-surface-muted overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-150"
                    style={{ width: `${osd.value}%` }}
                  />
                </div>
              </div>
            )}

            {osd.type === 'seek' && (
              <div className="flex flex-col items-center gap-2 px-6 py-4 rounded-2xl bg-surface-elevated/90 backdrop-blur-md border border-border text-foreground shadow-2xl">
                <span className="text-primary font-bold text-lg font-mono">{osd.value}</span>
                {osd.subValue && <span className="text-xs font-mono text-muted-foreground">{osd.subValue}</span>}
              </div>
            )}

            {(osd.type === 'play' || osd.type === 'pause') && (
              <div className="w-16 h-16 rounded-full bg-surface-elevated/90 backdrop-blur-md border border-border text-primary shadow-2xl flex items-center justify-center">
                {osd.type === 'play' ? (
                  <Play size={32} className="ml-1" />
                ) : (
                  <Pause size={32} />
                )}
              </div>
            )}

            {osd.type === 'mute' && (
              <div className="flex flex-col items-center gap-2 px-6 py-4 rounded-2xl bg-surface-elevated/90 backdrop-blur-md border border-border text-foreground shadow-2xl">
                <VolumeX size={36} className="text-destructive" />
                <span className="text-xs font-semibold uppercase tracking-wider">{osd.value}</span>
              </div>
            )}
          </div>
        )}

        {/* Double-Tap Gesture Ripples */}
        {osd?.type === 'double_tap_left' && (
          <div className="absolute top-0 bottom-0 left-0 w-1/3 flex items-center justify-center pointer-events-none z-30">
            <div className="flex flex-col items-center gap-1.5 px-5 py-3.5 rounded-2xl bg-surface-elevated/80 backdrop-blur-md border border-border text-foreground shadow-xl">
              <RotateCcw size={28} className="text-primary" />
              <span className="text-xs font-mono font-bold">-10s</span>
            </div>
          </div>
        )}

        {osd?.type === 'double_tap_right' && (
          <div className="absolute top-0 bottom-0 right-0 w-1/3 flex items-center justify-center pointer-events-none z-30">
            <div className="flex flex-col items-center gap-1.5 px-5 py-3.5 rounded-2xl bg-surface-elevated/80 backdrop-blur-md border border-border text-foreground shadow-xl">
              <RotateCcw size={28} className="text-primary -scale-x-100" />
              <span className="text-xs font-mono font-bold">+10s</span>
            </div>
          </div>
        )}
      </div>

      {/* Frame Capture Modal / Overlay: completely separate component, only enabled when we want to */}
      <FrameCaptureModal
        isOpen={isFrameCaptureOpen}
        onClose={() => setIsFrameCaptureOpen(false)}
        playbackStatus={playbackStatus}
        onFrameStep={onFrameStep}
        onFrameBackStep={onFrameBackStep}
        onCaptureFrame={onCaptureFrame}
        onCommitSeek={onCommitSeek}
        isFullscreen={isFullscreen}
      />

      {/* Standard 2-Tier Bottom Control Deck (hidden while Frame Capture is open) */}
      {!isFrameCaptureOpen && (
        <div
          className={
            isFullscreen
              ? `fixed bottom-0 inset-x-0 z-40 bg-surface/90 backdrop-blur-xl border-t border-border p-4 shadow-2xl transition-all duration-300 text-foreground ${
                  showOverlay
                    ? 'opacity-100 translate-y-0 pointer-events-auto'
                    : 'opacity-0 translate-y-full pointer-events-none'
                }`
              : 'w-full bg-surface/90 backdrop-blur-xl border border-border rounded-2xl p-4 shadow-xl shrink-0 z-30 transition-all text-foreground'
          }
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          onMouseEnter={onControlsMouseEnter}
          onMouseLeave={onControlsMouseLeave}
          onFocus={onControlsFocus}
          onBlur={onControlsBlur}
        >
          {/* Standard 2-Tier Bottom Control Deck */}
          <div className="flex flex-col gap-3 w-full">
            {/* Tier 1: Balanced Timestamps + M3 Expressive Gapped Scrubber */}
            <div className="flex items-center gap-4 w-full">
              {/* Left Timestamp Pill */}
              <span className="font-mono text-xs text-foreground bg-surface-muted px-3 py-1 rounded-full border border-border shrink-0">
                {formatTime(currentPos)} / {formatTime(currentDuration)}
              </span>

              {/* M3 Expressive Gapped Scrubber */}
              <div className="flex-1 min-w-[200px]">
                <M3GappedScrubber
                  currentPosition={currentPos}
                  duration={currentDuration}
                  isThick={false}
                  onSeek={(targetSec) => {
                    onCommitSeek(targetSec);
                  }}
                  disabled={!playbackStatus.currentFile || !currentDuration}
                />
              </div>

              {/* Right Timestamp & Speed Pill Group */}
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-mono text-xs text-foreground bg-surface-muted px-3 py-1 rounded-full border border-border">
                  -{formatTime(remainingSec)}
                </span>
                <button
                  type="button"
                  onClick={handleCycleSpeed}
                  className="font-mono text-xs text-foreground bg-surface-muted hover:bg-surface-elevated px-2.5 py-1 rounded-full border border-border transition cursor-pointer"
                  title="Click to cycle speed (0.5x, 1.0x, 1.25x, 1.5x, 2.0x)"
                >
                  {currentSpeed.toFixed(currentSpeed % 1 === 0 ? 1 : 2)}x
                </button>
              </div>
            </div>

            {/* Tier 2: 3-Zone Expressive Capsule Controls */}
            <div className="flex items-center justify-between gap-4 w-full">
              {/* Left Zone: Utility Capsule */}
              <div className="bg-surface-elevated border border-border rounded-full p-1 px-1.5 flex items-center gap-1.5 shrink-0 shadow-sm">
                <button
                  type="button"
                  onClick={onOpenFile}
                  className="p-2 rounded-full hover:bg-surface-muted text-foreground transition cursor-pointer"
                  title="Open Video File (O)"
                >
                  <FolderOpen size={16} />
                </button>

                <button
                  type="button"
                  onClick={handleToggleFrameCapture}
                  className="px-3 py-1.5 rounded-full hover:bg-surface-muted text-foreground hover:text-primary flex items-center gap-1.5 text-xs font-semibold cursor-pointer transition"
                  title="Frame Capture & Surfer Mode (Ctrl+F)"
                >
                  <Camera size={15} className="text-primary" />
                  <span>Frame Capture</span>
                  <kbd className="text-[10px] font-mono bg-surface-muted px-1.5 py-0.5 rounded text-muted-foreground border border-border">Ctrl+F</kbd>
                </button>

                {activePlaylist && (
                  <div className="flex items-center gap-1 pl-1.5 border-l border-border">
                    <button
                      type="button"
                      className="p-1.5 rounded-full hover:bg-surface-muted text-foreground disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                      onClick={onPlayPrevPlaylistItem}
                      disabled={activePlaylist.currentIndex <= 0}
                      title="Previous in Playlist (P)"
                    >
                      <SkipBack size={14} />
                    </button>
                    <span className="font-mono text-xs text-foreground px-1">
                      {activePlaylist.currentIndex + 1}/{activePlaylist.items.length}
                    </span>
                    <button
                      type="button"
                      className="p-1.5 rounded-full hover:bg-surface-muted text-foreground disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                      onClick={onPlayNextPlaylistItem}
                      disabled={activePlaylist.currentIndex >= activePlaylist.items.length - 1}
                      title="Next in Playlist (N)"
                    >
                      <SkipForward size={14} />
                    </button>
                  </div>
                )}
              </div>

              {/* Center Zone: Transport Dock */}
              <div className="bg-surface-elevated border border-border rounded-full px-4 py-1.5 flex items-center gap-3 shadow-lg shrink-0">
                <button
                  type="button"
                  onClick={() => onCommitSeek(Math.max(0, (playbackStatus.position ?? 0) - 30))}
                  className="p-2 rounded-full hover:bg-surface-muted text-foreground transition cursor-pointer"
                  title="Rewind 30s"
                >
                  <SkipBack size={16} />
                </button>

                <button
                  type="button"
                  onClick={() => onCommitSeek(Math.max(0, (playbackStatus.position ?? 0) - 10))}
                  className="px-2.5 py-1.5 rounded-full bg-surface-muted hover:bg-surface text-foreground text-xs font-mono font-semibold transition cursor-pointer flex items-center gap-1"
                  title="Rewind 10s (J)"
                >
                  <RotateCcw size={13} />
                  <span>10s</span>
                </button>

                {/* Hero Morphing Play/Pause Button */}
                <button
                  type="button"
                  onClick={onTogglePlayPause}
                  disabled={!playbackStatus.currentFile || playbackStatus.mediaState === 'loading'}
                  className={`w-11 h-11 bg-primary hover:brightness-105 active:scale-90 text-primary-foreground flex items-center justify-center transition-all duration-200 shadow-md cursor-pointer border-none ${
                    playbackStatus.paused ? 'rounded-full' : 'rounded-2xl'
                  }`}
                  title={playbackStatus.paused ? 'Play (Space)' : 'Pause (Space)'}
                >
                  {playbackStatus.mediaState === 'ended' ? (
                    <RotateCcw size={18} />
                  ) : playbackStatus.paused ? (
                    <Play size={18} className="ml-0.5" />
                  ) : (
                    <Pause size={18} />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const max = currentDuration || (playbackStatus.position ?? 0) + 10;
                    onCommitSeek(Math.min(max, (playbackStatus.position ?? 0) + 10));
                  }}
                  className="px-2.5 py-1.5 rounded-full bg-surface-muted hover:bg-surface text-foreground text-xs font-mono font-semibold transition cursor-pointer flex items-center gap-1"
                  title="Forward 10s (L)"
                >
                  <RotateCcw size={13} className="-scale-x-100" />
                  <span>10s</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const max = currentDuration || (playbackStatus.position ?? 0) + 30;
                    onCommitSeek(Math.min(max, (playbackStatus.position ?? 0) + 30));
                  }}
                  className="p-2 rounded-full hover:bg-surface-muted text-foreground transition cursor-pointer"
                  title="Forward 30s"
                >
                  <SkipForward size={16} />
                </button>
              </div>

              {/* Right Zone: Audio, Subtitles, Volume, Fullscreen Capsule */}
              <div className="bg-surface-elevated border border-border rounded-full px-3.5 py-1.5 flex items-center gap-3 shrink-0 shadow-sm">
                {/* Volume Slider */}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={onToggleMute}
                    className="p-1 rounded-full hover:bg-surface-muted text-foreground transition cursor-pointer"
                    title={playbackStatus.muted || playbackStatus.volume === 0 ? 'Unmute (M)' : 'Mute (M)'}
                  >
                    {playbackStatus.muted || playbackStatus.volume === 0 ? <VolumeX size={15} /> : <Volume2 size={15} />}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={playbackStatus.muted ? 0 : playbackStatus.volume}
                    onChange={onVolumeChange}
                    className="w-16 h-1.5 rounded-lg appearance-none bg-surface-muted accent-primary cursor-pointer"
                    title={`Volume: ${playbackStatus.muted ? 0 : Math.round(playbackStatus.volume)}%`}
                  />
                  <span className="font-mono text-[11px] text-foreground w-7 text-right select-none">
                    {playbackStatus.muted ? '0%' : `${Math.round(playbackStatus.volume)}%`}
                  </span>
                </div>

                {/* Audio Selector */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    fetchTracks();
                    setActiveTab('audio');
                    setModalOpen(true);
                  }}
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer border ${
                    tracks && tracks.audioTracks.length > 1
                      ? 'bg-primary-container text-on-primary-container border-primary/30'
                      : 'bg-surface-muted hover:bg-surface text-foreground border-border'
                  }`}
                  title="Audio Tracks (A)"
                >
                  <Headphones size={13} />
                  {selectedAudioTrack?.lang ? (
                    <span className="uppercase text-[10px] font-mono">{selectedAudioTrack.lang}</span>
                  ) : (
                    <span className="text-[10px]">AUD</span>
                  )}
                </button>

                {/* Subtitle Selector */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    fetchTracks();
                    setActiveTab('subtitles');
                    setModalOpen(true);
                  }}
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer border ${
                    selectedSubTrack
                      ? 'bg-primary-container text-on-primary-container border-primary/30'
                      : 'bg-surface-muted hover:bg-surface text-foreground border-border'
                  }`}
                  title="Subtitle Tracks (S)"
                >
                  <Subtitles size={13} />
                  {selectedSubTrack?.lang ? (
                    <span className="uppercase text-[10px] font-mono">{selectedSubTrack.lang}</span>
                  ) : (
                    <span className="text-[10px]">SUB</span>
                  )}
                </button>

                {/* Fullscreen Toggle */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onTriggerFullscreenToggle();
                  }}
                  className="p-1.5 rounded-full hover:bg-surface-muted text-foreground transition cursor-pointer"
                  title={isFullscreen ? 'Exit Fullscreen (F or Esc)' : 'Enter Fullscreen (F)'}
                >
                  {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Audio & Subtitle Control Modal */}
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
                <div className="w-8 h-8 rounded-xl bg-primary-container flex items-center justify-center text-on-primary-container">
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
                className="w-8 h-8 rounded-xl bg-surface-muted hover:bg-surface text-foreground flex items-center justify-center transition border-none cursor-pointer"
                onClick={() => setModalOpen(false)}
                title="Close (Esc)"
                aria-label="Close dialog"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex items-center px-6 pt-4 gap-2 bg-surface-elevated border-b border-border">
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
                                  ? 'bg-primary-container text-on-primary-container border-primary shadow-sm'
                                  : 'bg-surface border-border hover:bg-surface-muted text-foreground'
                              }`}
                              onClick={() => handleSelectAudioTrack(tr.id)}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div
                                  className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                                    isSelected
                                      ? 'bg-primary text-primary-foreground shadow'
                                      : 'border border-border text-transparent'
                                  }`}
                                >
                                  <Check size={13} />
                                </div>
                                <div className="flex flex-col truncate">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold truncate">
                                      Track {tr.id}: {tr.title || tr.lang || `Audio Stream ${tr.id}`}
                                    </span>
                                    {isSelected && (
                                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-primary text-primary-foreground">
                                        Active
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 mt-0.5 text-[11px] opacity-80 font-mono">
                                    {tr.lang && <span>Language: {tr.lang.toUpperCase()}</span>}
                                    {tr.codec && <span>• Codec: {tr.codec.toUpperCase()}</span>}
                                    {tr.isDefault && <span className="text-primary font-bold">• Default</span>}
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
                        className="px-2.5 py-1.5 rounded-lg bg-surface-muted hover:bg-surface text-foreground text-xs font-semibold transition border-none cursor-pointer"
                        onClick={() => handleAudioDelayChange(-0.5)}
                      >
                        -0.5s
                      </button>
                      <button
                        type="button"
                        className="px-2.5 py-1.5 rounded-lg bg-surface-muted hover:bg-surface text-foreground text-xs font-semibold transition border-none cursor-pointer"
                        onClick={() => handleAudioDelayChange(-0.1)}
                      >
                        -0.1s
                      </button>
                      <button
                        type="button"
                        className="flex-1 py-1.5 rounded-lg bg-surface-muted hover:bg-surface text-foreground text-xs font-semibold transition border-none cursor-pointer"
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
                        className="px-2.5 py-1.5 rounded-lg bg-surface-muted hover:bg-surface text-foreground text-xs font-semibold transition border-none cursor-pointer"
                        onClick={() => handleAudioDelayChange(0.1)}
                      >
                        +0.1s
                      </button>
                      <button
                        type="button"
                        className="px-2.5 py-1.5 rounded-lg bg-surface-muted hover:bg-surface text-foreground text-xs font-semibold transition border-none cursor-pointer"
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
                      <span className="text-[11px] text-muted-foreground">Show or hide rendered on-screen subtitles</span>
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
                        className={`inline-block h-4 w-4 transform rounded-full bg-surface shadow-sm transition-transform ${
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
                            ? 'bg-primary-container text-on-primary-container border-primary shadow-sm'
                            : 'bg-surface border-border hover:bg-surface-muted text-foreground'
                        }`}
                        onClick={() => handleSelectSubtitleTrack('no')}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                              !tracks?.subtitlesVisible || tracks?.selectedSubtitleId === 'no'
                                ? 'bg-primary text-primary-foreground shadow'
                                : 'border border-border text-transparent'
                            }`}
                          >
                            <Check size={13} />
                          </div>
                          <div>
                            <span className="text-xs font-bold">Off (Disable Subtitles)</span>
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
                                  ? 'bg-primary-container text-on-primary-container border-primary shadow-sm'
                                  : 'bg-surface border-border hover:bg-surface-muted text-foreground'
                              }`}
                              onClick={() => handleSelectSubtitleTrack(tr.id)}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div
                                  className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                                    isSelected
                                      ? 'bg-primary text-primary-foreground shadow'
                                      : 'border border-border text-transparent'
                                  }`}
                                >
                                  <Check size={13} />
                                </div>
                                <div className="flex flex-col truncate">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold truncate">
                                      Track {tr.id}: {tr.title || tr.lang || `Subtitle Stream ${tr.id}`}
                                    </span>
                                    {isSelected && (
                                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-primary text-primary-foreground">
                                        Active
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 mt-0.5 text-[11px] opacity-80 font-mono">
                                    {tr.lang && <span>Language: {tr.lang.toUpperCase()}</span>}
                                    {tr.codec && <span>• Format: {tr.codec.toUpperCase()}</span>}
                                    {tr.isDefault && <span className="text-primary font-bold">• Default</span>}
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
                        className="px-2.5 py-1.5 rounded-lg bg-surface-muted hover:bg-surface text-foreground text-xs font-semibold transition border-none cursor-pointer"
                        onClick={() => handleSubtitleDelayChange(-0.5)}
                      >
                        -0.5s
                      </button>
                      <button
                        type="button"
                        className="px-2.5 py-1.5 rounded-lg bg-surface-muted hover:bg-surface text-foreground text-xs font-semibold transition border-none cursor-pointer"
                        onClick={() => handleSubtitleDelayChange(-0.1)}
                      >
                        -0.1s
                      </button>
                      <button
                        type="button"
                        className="flex-1 py-1.5 rounded-lg bg-surface-muted hover:bg-surface text-foreground text-xs font-semibold transition border-none cursor-pointer"
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
                        className="px-2.5 py-1.5 rounded-lg bg-surface-muted hover:bg-surface text-foreground text-xs font-semibold transition border-none cursor-pointer"
                        onClick={() => handleSubtitleDelayChange(0.1)}
                      >
                        +0.1s
                      </button>
                      <button
                        type="button"
                        className="px-2.5 py-1.5 rounded-lg bg-surface-muted hover:bg-surface text-foreground text-xs font-semibold transition border-none cursor-pointer"
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
