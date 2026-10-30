import React, { useState, useRef, useCallback } from 'react';
import {
  Play,
  Pause,
  Repeat,
  Minimize2,
  SkipBack,
  SkipForward,
  MoreHorizontal,
  Volume2,
  VolumeX,
  Camera,
  FolderOpen,
  Headphones,
} from 'lucide-react';
import type { PlaybackStatus, MediaTrackInfo } from '../types/electron';
import type { ActivePlaylistState } from './PlayerView';
import { formatTime, formatCleanTitle } from '../utils/formatters';

export interface FullscreenFloatingIslandProps {
  playbackStatus: PlaybackStatus;
  activePlaylist: ActivePlaylistState | null;
  currentPos: number;
  currentDuration: number;
  currentSpeed: number;
  showOverlay: boolean;
  selectedAudioTrack?: MediaTrackInfo | null;
  selectedSubTrack?: MediaTrackInfo | null;
  onTogglePlayPause: () => void;
  onCommitSeek: (seconds: number) => void;
  onPlayNextPlaylistItem?: () => void;
  onPlayPrevPlaylistItem?: () => void;
  onCycleSpeed: () => void;
  onOpenTracksModal: (tab: 'audio' | 'subtitles') => void;
  onTriggerFullscreenToggle: () => void;
  onToggleLoop?: () => void;
  isLooping?: boolean;
  onVolumeChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onToggleMute: () => void;
  onOpenFile?: () => void;
  onCaptureFrame?: () => void;
  onControlsMouseEnter: () => void;
  onControlsMouseLeave: () => void;
  onControlsFocus: () => void;
  onControlsBlur: () => void;
  isMoreMenuOpen?: boolean;
  onToggleMoreMenu?: () => void;
}

export const FullscreenFloatingIsland: React.FC<FullscreenFloatingIslandProps> = ({
  playbackStatus,
  activePlaylist,
  currentPos,
  currentDuration,
  currentSpeed,
  showOverlay,
  selectedAudioTrack,
  selectedSubTrack,
  onTogglePlayPause,
  onCommitSeek,
  onPlayNextPlaylistItem,
  onPlayPrevPlaylistItem,
  onCycleSpeed,
  onOpenTracksModal,
  onTriggerFullscreenToggle,
  onToggleLoop,
  isLooping = false,
  onVolumeChange,
  onToggleMute,
  onOpenFile,
  onCaptureFrame,
  onControlsMouseEnter,
  onControlsMouseLeave,
  onControlsFocus,
  onControlsBlur,
  isMoreMenuOpen,
  onToggleMoreMenu,
}) => {
  const [internalMoreMenuOpen, setInternalMoreMenuOpen] = useState(false);
  const effectiveMoreOpen = isMoreMenuOpen !== undefined ? isMoreMenuOpen : internalMoreMenuOpen;
  const toggleMoreMenu = () => {
    if (onToggleMoreMenu) {
      onToggleMoreMenu();
    } else {
      setInternalMoreMenuOpen((prev) => !prev);
    }
  };
  const closeMoreMenu = () => {
    if (onToggleMoreMenu && effectiveMoreOpen) {
      onToggleMoreMenu();
    } else {
      setInternalMoreMenuOpen(false);
    }
  };

  const [isHoveringScrubber, setIsHoveringScrubber] = useState(false);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [hoverTime, setHoverTime] = useState(0);

  const scrubberRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  const progressPct =
    currentDuration > 0
      ? Math.max(0, Math.min(100, (currentPos / currentDuration) * 100))
      : 0;

  const calculateSeekTime = useCallback(
    (clientX: number): number => {
      if (!scrubberRef.current || !currentDuration || currentDuration <= 0) return 0;
      const rect = scrubberRef.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return ratio * currentDuration;
    },
    [currentDuration]
  );

  const handleScrubberPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!currentDuration || currentDuration <= 0) return;
    isDraggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    const target = calculateSeekTime(e.clientX);
    onCommitSeek(target);
  };

  const handleScrubberPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!scrubberRef.current || !currentDuration) return;
    const rect = scrubberRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    setHoverX(x);
    setHoverTime((x / rect.width) * currentDuration);

    if (isDraggingRef.current) {
      const target = calculateSeekTime(e.clientX);
      onCommitSeek(target);
    }
  };

  const handleScrubberPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignored
      }
    }
  };

  const handlePrev = () => {
    if (activePlaylist && onPlayPrevPlaylistItem) {
      onPlayPrevPlaylistItem();
    } else {
      onCommitSeek(Math.max(0, currentPos - 10));
    }
  };

  const handleNext = () => {
    if (activePlaylist && onPlayNextPlaylistItem) {
      onPlayNextPlaylistItem();
    } else {
      onCommitSeek(Math.min(currentDuration || currentPos + 10, currentPos + 10));
    }
  };

  return (
    <div
      style={{ zIndex: 70 }}
      className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-[70] w-[540px] max-w-[92vw] rounded-2xl bg-[#1c1b22]/95 backdrop-blur-2xl border border-white/10 shadow-[0_24px_60px_rgba(0,0,0,0.75)] px-5 py-3 flex flex-col gap-2 transition-all duration-300 select-none text-foreground ${
        showOverlay
          ? 'opacity-100 translate-y-0 pointer-events-auto'
          : 'opacity-0 translate-y-6 pointer-events-none'
      }`}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
      onMouseEnter={onControlsMouseEnter}
      onMouseLeave={() => {
        onControlsMouseLeave();
        if (effectiveMoreOpen) {
          toggleMoreMenu();
        }
      }}
      onFocus={onControlsFocus}
      onBlur={onControlsBlur}
      role="region"
      aria-label="Fullscreen media controls"
    >
      {/* Title & Metadata Strip inside Floating Island */}
      {playbackStatus.currentFile && (
        <div className="flex items-center justify-between px-1 text-white/60 text-[11px] font-medium border-b border-white/10 pb-1.5 min-w-0">
          <span className="truncate max-w-[340px] font-semibold text-white/90">
            {formatCleanTitle(playbackStatus.currentFile)}
          </span>
          <div className="flex items-center gap-1.5 shrink-0 font-mono text-[10px]">
            {playbackStatus.videoWidth && playbackStatus.videoHeight && (
              <span className="bg-white/10 px-1.5 py-0.5 rounded text-white/70">
                {playbackStatus.videoWidth}x{playbackStatus.videoHeight}
              </span>
            )}
            {playbackStatus.fps && playbackStatus.fps > 0 && (
              <span className="bg-white/10 px-1.5 py-0.5 rounded text-white/70">
                {Math.round(playbackStatus.fps)} FPS
              </span>
            )}
            <span className="bg-primary/20 text-primary px-1.5 py-0.5 rounded font-bold">
              {playbackStatus.hwdec && playbackStatus.hwdec !== 'no' ? playbackStatus.hwdec.toUpperCase() : 'HW'}
            </span>
          </div>
        </div>
      )}

      {/* Row 1: Actions & Playback Controls */}
      <div className="flex items-center justify-between w-full">
        {/* Left Zone: Loop & Exit Fullscreen */}
        <div className="flex items-center gap-2">
          {onToggleLoop && (
            <button
              type="button"
              onClick={onToggleLoop}
              className={`p-1.5 rounded-full hover:bg-white/10 transition cursor-pointer ${
                isLooping ? 'text-primary' : 'text-white/70 hover:text-white'
              }`}
              title={isLooping ? 'Loop: On' : 'Loop: Off'}
            >
              <Repeat size={16} />
            </button>
          )}

          <button
            type="button"
            onClick={onTriggerFullscreenToggle}
            className="p-1.5 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition cursor-pointer"
            title="Exit Fullscreen (F / Esc)"
          >
            <Minimize2 size={16} />
          </button>
        </div>

        {/* Center Zone: Prev, Play/Pause, Next */}
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={handlePrev}
            className="p-1.5 rounded-full hover:bg-white/10 text-white/80 hover:text-white transition cursor-pointer"
            title={activePlaylist ? 'Previous in Playlist (P)' : 'Rewind 10s (J)'}
          >
            <SkipBack size={19} />
          </button>

          <button
            type="button"
            onClick={onTogglePlayPause}
            disabled={!playbackStatus.currentFile || playbackStatus.mediaState === 'loading'}
            className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 text-white flex items-center justify-center transition shadow-md border border-white/10 cursor-pointer"
            title={playbackStatus.paused ? 'Play (Space)' : 'Pause (Space)'}
          >
            {playbackStatus.paused ? (
              <Play size={20} className="ml-0.5" />
            ) : (
              <Pause size={20} />
            )}
          </button>

          <button
            type="button"
            onClick={handleNext}
            className="p-1.5 rounded-full hover:bg-white/10 text-white/80 hover:text-white transition cursor-pointer"
            title={activePlaylist ? 'Next in Playlist (N)' : 'Forward 10s (L)'}
          >
            <SkipForward size={19} />
          </button>
        </div>

        {/* Right Zone: Subtitles, Speed, More Options */}
        <div className="flex items-center gap-2">
          {/* Subtitles Button */}
          <button
            type="button"
            onClick={() => onOpenTracksModal('subtitles')}
            className={`px-2 py-1 rounded-lg hover:bg-white/10 transition cursor-pointer flex items-center gap-1 border ${
              selectedSubTrack
                ? 'bg-primary-container text-on-primary-container border-primary/40'
                : 'border-white/15 text-white/75 hover:text-white'
            }`}
            title="Subtitles (S)"
          >
            <span className="text-[11px] font-bold font-mono tracking-wider">CC</span>
          </button>

          {/* Speed Button */}
          <button
            type="button"
            onClick={onCycleSpeed}
            className="px-2 py-1 rounded-lg hover:bg-white/10 font-mono text-xs text-white/80 hover:text-white transition cursor-pointer border border-transparent hover:border-white/15"
            title="Playback Speed (Click to cycle)"
          >
            {currentSpeed.toFixed(currentSpeed % 1 === 0 ? 0 : 1)}x
          </button>

          {/* More Options Button */}
          <div className="relative">
            <button
              type="button"
              onClick={toggleMoreMenu}
              className={`p-1.5 rounded-full hover:bg-white/10 transition cursor-pointer ${
                effectiveMoreOpen ? 'bg-white/15 text-white' : 'text-white/80 hover:text-white'
              }`}
              title="More Options"
            >
              <MoreHorizontal size={18} />
            </button>

            {/* More Options Flyout Popover */}
            {effectiveMoreOpen && (
              <div
                className="absolute bottom-full right-0 mb-3 w-64 rounded-xl bg-[#1c1b22]/95 backdrop-blur-2xl border border-white/15 shadow-2xl p-3 flex flex-col gap-2.5 z-50 text-white before:absolute before:-bottom-3 before:left-0 before:right-0 before:h-3 before:content-['']"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Volume Slider */}
                <div className="flex items-center gap-2 px-1">
                  <button
                    type="button"
                    onClick={onToggleMute}
                    className="p-1 rounded hover:bg-white/10 text-white/80 hover:text-white transition cursor-pointer"
                    title={playbackStatus.muted || playbackStatus.volume === 0 ? 'Unmute' : 'Mute'}
                  >
                    {playbackStatus.muted || playbackStatus.volume === 0 ? (
                      <VolumeX size={16} />
                    ) : (
                      <Volume2 size={16} />
                    )}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={playbackStatus.muted ? 0 : playbackStatus.volume}
                    onChange={onVolumeChange}
                    className="flex-1 h-1.5 rounded-lg appearance-none bg-white/20 accent-primary cursor-pointer"
                  />
                  <span className="font-mono text-[11px] text-white/70 w-8 text-right select-none">
                    {playbackStatus.muted ? '0%' : `${Math.round(playbackStatus.volume)}%`}
                  </span>
                </div>

                <div className="h-px bg-white/10 my-0.5" />

                {/* Quick Actions */}
                <button
                  type="button"
                  onClick={() => {
                    closeMoreMenu();
                    onOpenTracksModal('audio');
                  }}
                  className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-white/10 text-xs text-white/90 transition text-left cursor-pointer"
                >
                  <Headphones size={15} className="text-white/70" />
                  <span>Audio Tracks</span>
                  {selectedAudioTrack?.lang && (
                    <span className="ml-auto text-[10px] font-mono uppercase bg-white/10 px-1.5 py-0.5 rounded text-white/70">
                      {selectedAudioTrack.lang}
                    </span>
                  )}
                </button>

                {onCaptureFrame && (
                  <button
                    type="button"
                    onClick={() => {
                      closeMoreMenu();
                      onCaptureFrame();
                    }}
                    className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-white/10 text-xs text-white/90 transition text-left cursor-pointer"
                  >
                    <Camera size={15} className="text-white/70" />
                    <span>Capture Frame</span>
                    <kbd className="ml-auto text-[10px] font-mono bg-white/10 px-1 rounded text-white/50">Ctrl+F</kbd>
                  </button>
                )}

                {onOpenFile && (
                  <button
                    type="button"
                    onClick={() => {
                      closeMoreMenu();
                      onOpenFile();
                    }}
                    className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-white/10 text-xs text-white/90 transition text-left cursor-pointer"
                  >
                    <FolderOpen size={15} className="text-white/70" />
                    <span>Open Video File</span>
                    <kbd className="ml-auto text-[10px] font-mono bg-white/10 px-1 rounded text-white/50">O</kbd>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Row 2: Timeline & Scrubber */}
      <div className="flex items-center gap-3.5 w-full">
        {/* Current Position */}
        <span className="font-mono text-xs text-white/75 font-medium shrink-0 select-none">
          {formatTime(currentPos)}
        </span>

        {/* Custom Smooth Scrubber */}
        <div
          ref={scrubberRef}
          className="relative flex-1 h-6 flex items-center cursor-pointer select-none group"
          onPointerDown={handleScrubberPointerDown}
          onPointerMove={handleScrubberPointerMove}
          onPointerUp={handleScrubberPointerUp}
          onPointerCancel={handleScrubberPointerUp}
          onMouseEnter={() => setIsHoveringScrubber(true)}
          onMouseLeave={() => {
            setIsHoveringScrubber(false);
            setHoverX(null);
          }}
        >
          {/* Floating Hover Time Badge */}
          {isHoveringScrubber && hoverX !== null && currentDuration > 0 && (
            <div
              className="absolute -top-7 -translate-x-1/2 px-2 py-0.5 bg-[#18171f] text-white border border-white/15 rounded-md text-[11px] font-mono pointer-events-none shadow-xl z-50 whitespace-nowrap"
              style={{ left: `${hoverX}px` }}
            >
              {formatTime(hoverTime)}
            </div>
          )}

          {/* Track Container */}
          <div className="w-full h-1 bg-white/20 rounded-full relative overflow-visible flex items-center">
            {/* Progress Fill */}
            <div
              className="h-full bg-[#d0bcff] rounded-full"
              style={{ width: `${progressPct}%` }}
            />
            {/* Circular Thumb Knob */}
            <div
              className="w-3 h-3 bg-white rounded-full shadow-md -ml-1.5 group-hover:scale-125 transition-transform duration-100 shrink-0 pointer-events-none"
            />
          </div>
        </div>

        {/* Total Duration */}
        <span className="font-mono text-xs text-white/75 font-medium shrink-0 select-none">
          {formatTime(currentDuration)}
        </span>
      </div>
    </div>
  );
};

export default FullscreenFloatingIsland;
