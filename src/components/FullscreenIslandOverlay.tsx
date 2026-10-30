import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { PlaybackStatus, MediaTrackInfo } from '../types/electron';
import type { ActivePlaylistState } from './PlayerView';
import { FullscreenFloatingIsland } from './FullscreenFloatingIsland';

const SPEED_STEPS = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];

export const FullscreenIslandOverlay: React.FC = () => {
  const [playbackStatus, setPlaybackStatus] = useState<PlaybackStatus>({
    mediaState: 'idle',
    currentFile: null,
    position: null,
    duration: null,
    paused: false,
    volume: 100,
    muted: false,
    videoWidth: null,
    videoHeight: null,
    hwdec: null,
    speed: 1,
  });

  const [showOverlay, setShowOverlay] = useState(true);
  const [activePlaylist, setActivePlaylist] = useState<ActivePlaylistState | null>(null);
  const [isLooping, setIsLooping] = useState(false);
  const [selectedAudioTrack, setSelectedAudioTrack] = useState<MediaTrackInfo | null>(null);
  const [selectedSubTrack, setSelectedSubTrack] = useState<MediaTrackInfo | null>(null);
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  const lastActivityReportRef = useRef(0);

  // Initialize playback status and subscribe to native updates
  useEffect(() => {
    if (!window.nosvedAPI) return;

    window.nosvedAPI.getPlaybackStatus().then(setPlaybackStatus).catch(console.error);

    const cleanupStatus = window.nosvedAPI.onPlaybackStatus((status) => {
      setPlaybackStatus(status);
    });

    const cleanupState = window.nosvedAPI.onOverlayStateUpdate((state) => {
      setShowOverlay(state.showOverlay);
      if (state.activePlaylist !== undefined) {
        if (state.activePlaylist) {
          setActivePlaylist({
            playlistId: state.activePlaylist.playlistId,
            playlistName: state.activePlaylist.playlistName,
            items: new Array(state.activePlaylist.itemCount).fill(null) as any,
            currentIndex: state.activePlaylist.currentIndex,
          });
        } else {
          setActivePlaylist(null);
        }
      }
      if (state.isLooping !== undefined) {
        setIsLooping(state.isLooping);
      }
      if (state.selectedAudioTrack !== undefined) {
        setSelectedAudioTrack(
          state.selectedAudioTrack
            ? {
                id: typeof state.selectedAudioTrack.id === 'number' ? state.selectedAudioTrack.id : 0,
                type: 'audio',
                lang: state.selectedAudioTrack.lang,
                title: state.selectedAudioTrack.title,
                selected: true,
              }
            : null
        );
      }
      if (state.selectedSubTrack !== undefined) {
        setSelectedSubTrack(
          state.selectedSubTrack
            ? {
                id: typeof state.selectedSubTrack.id === 'number' ? state.selectedSubTrack.id : 0,
                type: 'sub',
                lang: state.selectedSubTrack.lang,
                title: state.selectedSubTrack.title,
                selected: true,
              }
            : null
        );
      }
    });

    return () => {
      cleanupStatus();
      cleanupState();
    };
  }, []);

  // Close more menu when overlay hides
  useEffect(() => {
    if (!showOverlay) {
      setIsMoreOpen(false);
    }
  }, [showOverlay]);

  // Report mouse activity to the main window to awaken controls
  const handleMouseMove = useCallback(() => {
    const now = Date.now();
    if (now - lastActivityReportRef.current > 150) {
      lastActivityReportRef.current = now;
      if (window.nosvedAPI?.sendOverlayActivity) {
        window.nosvedAPI.sendOverlayActivity().catch(console.error);
      }
    }
  }, []);

  // Interactive island hover events: switch between click-through and interactive modes
  const handleControlsMouseEnter = useCallback(() => {
    if (window.nosvedAPI) {
      window.nosvedAPI.setOverlayIgnoreMouse(false).catch(console.error);
      window.nosvedAPI.notifyOverlayInteraction(true).catch(console.error);
    }
  }, []);

  const handleControlsMouseLeave = useCallback(() => {
    if (window.nosvedAPI) {
      window.nosvedAPI.setOverlayIgnoreMouse(true, true).catch(console.error);
      window.nosvedAPI.notifyOverlayInteraction(false).catch(console.error);
    }
  }, []);

  const handleControlsFocus = useCallback(() => {
    if (window.nosvedAPI) {
      window.nosvedAPI.setOverlayIgnoreMouse(false).catch(console.error);
      window.nosvedAPI.notifyOverlayInteraction(true).catch(console.error);
    }
  }, []);

  const handleControlsBlur = useCallback(() => {
    if (window.nosvedAPI) {
      window.nosvedAPI.setOverlayIgnoreMouse(true, true).catch(console.error);
      window.nosvedAPI.notifyOverlayInteraction(false).catch(console.error);
    }
  }, []);

  const handleCycleSpeed = useCallback(() => {
    const current = playbackStatus.speed ?? 1.0;
    const currentIndex = SPEED_STEPS.findIndex((s) => Math.abs(s - current) < 0.05);
    const nextIndex = currentIndex === -1 || currentIndex >= SPEED_STEPS.length - 1 ? 3 : currentIndex + 1;
    const nextSpeed = SPEED_STEPS[nextIndex] ?? 1.0;
    if (window.nosvedAPI?.setSpeed) {
      window.nosvedAPI.setSpeed(nextSpeed).catch(console.error);
    }
  }, [playbackStatus.speed]);

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseFloat(e.target.value);
    if (!Number.isNaN(vol) && window.nosvedAPI?.setVolume) {
      window.nosvedAPI.setVolume(vol).catch(console.error);
    }
  }, []);

  // Keyboard shortcut passthrough when overlay window is active
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'KeyK') {
        e.preventDefault();
        window.nosvedAPI?.togglePause().catch(console.error);
      } else if (e.code === 'Escape' || e.code === 'KeyF') {
        e.preventDefault();
        window.nosvedAPI?.setFullscreen(false).catch(console.error);
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        const pos = Math.max(0, (playbackStatus.position ?? 0) - 5);
        window.nosvedAPI?.seek(pos).catch(console.error);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        const max = playbackStatus.duration ?? (playbackStatus.position ?? 0) + 5;
        const pos = Math.min(max, (playbackStatus.position ?? 0) + 5);
        window.nosvedAPI?.seek(pos).catch(console.error);
      } else if (e.code === 'ArrowUp') {
        e.preventDefault();
        const vol = Math.min(100, (playbackStatus.volume ?? 100) + 5);
        window.nosvedAPI?.setVolume(vol).catch(console.error);
      } else if (e.code === 'ArrowDown') {
        e.preventDefault();
        const vol = Math.max(0, (playbackStatus.volume ?? 100) - 5);
        window.nosvedAPI?.setVolume(vol).catch(console.error);
      } else if (e.code === 'KeyM') {
        e.preventDefault();
        window.nosvedAPI?.toggleMute().catch(console.error);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [playbackStatus.position, playbackStatus.duration, playbackStatus.volume]);

  return (
    <div
      className="w-full h-full overflow-hidden bg-transparent select-none relative pointer-events-none"
      onMouseMove={handleMouseMove}
    >
      <FullscreenFloatingIsland
        playbackStatus={playbackStatus}
        activePlaylist={activePlaylist}
        currentPos={playbackStatus.position ?? 0}
        currentDuration={playbackStatus.duration ?? 0}
        currentSpeed={playbackStatus.speed ?? 1}
        showOverlay={showOverlay}
        selectedAudioTrack={selectedAudioTrack}
        selectedSubTrack={selectedSubTrack}
        onTogglePlayPause={() => {
          window.nosvedAPI?.togglePause().catch(console.error);
        }}
        onCommitSeek={(seconds) => {
          window.nosvedAPI?.seek(seconds).catch(console.error);
        }}
        onPlayNextPlaylistItem={() => {
          window.nosvedAPI?.sendOverlayAction('next-playlist-item').catch(console.error);
        }}
        onPlayPrevPlaylistItem={() => {
          window.nosvedAPI?.sendOverlayAction('prev-playlist-item').catch(console.error);
        }}
        onCycleSpeed={handleCycleSpeed}
        onOpenTracksModal={(tab) => {
          window.nosvedAPI?.sendOverlayAction('open-tracks-modal', tab).catch(console.error);
        }}
        onTriggerFullscreenToggle={() => {
          window.nosvedAPI?.setFullscreen(false).catch(console.error);
        }}
        onToggleLoop={() => {
          window.nosvedAPI?.sendOverlayAction('toggle-loop').catch(console.error);
        }}
        isLooping={isLooping}
        onVolumeChange={handleVolumeChange}
        onToggleMute={() => {
          window.nosvedAPI?.toggleMute().catch(console.error);
        }}
        onOpenFile={() => {
          window.nosvedAPI?.sendOverlayAction('open-file').catch(console.error);
        }}
        onCaptureFrame={() => {
          window.nosvedAPI?.captureFrame().catch(console.error);
        }}
        onControlsMouseEnter={handleControlsMouseEnter}
        onControlsMouseLeave={handleControlsMouseLeave}
        onControlsFocus={handleControlsFocus}
        onControlsBlur={handleControlsBlur}
        isMoreMenuOpen={isMoreOpen}
        onToggleMoreMenu={() => setIsMoreOpen((prev) => !prev)}
      />
    </div>
  );
};
