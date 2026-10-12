import { useState, useRef, useCallback, useEffect } from 'react';
import type { PlaybackStatus } from '../types/electron';
import type { ResumePromptState } from '../components/PlayerView';

interface UseFullscreenProps {
  activeTab: string;
  setActiveTab: (tab: any) => void;
  playbackStatus: PlaybackStatus;
  isScrubbing: boolean;
  isTrackModalOpen: boolean;
  resumePrompt: ResumePromptState | null;
}

export function useFullscreen({
  activeTab,
  setActiveTab,
  playbackStatus,
  isScrubbing,
  isTrackModalOpen,
  resumePrompt,
}: UseFullscreenProps) {
  const [isAppFullscreen, setIsAppFullscreen] = useState(false);
  const [isPlayerFullscreen, setIsPlayerFullscreen] = useState(false);
  const [showOverlay, setShowOverlay] = useState(true);

  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isInteractingWithControlsRef = useRef(false);
  const isControlsFocusedRef = useRef(false);

  const [videoViewportEl, setVideoViewportEl] = useState<HTMLDivElement | null>(null);
  const videoViewportRef = useCallback((node: HTMLDivElement | null) => {
    setVideoViewportEl(node);
  }, []);

  // Synchronize video viewport dimensions with the native child window
  const updateVideoBounds = useCallback(() => {
    if (!window.nosvedAPI?.setVideoBounds) return;
    const shouldBeVisible = Boolean(
      playbackStatus.currentFile &&
      playbackStatus.mediaState !== 'idle' &&
      playbackStatus.mediaState !== 'error' &&
      (activeTab === 'player' || isPlayerFullscreen) &&
      !isTrackModalOpen
    );

    if (!shouldBeVisible || !videoViewportEl) {
      window.nosvedAPI
        .setVideoBounds({
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          visible: false,
        })
        .catch(console.error);
      return;
    }

    const rect = videoViewportEl.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    window.nosvedAPI
      .setVideoBounds({
        x: Math.round(rect.left * dpr),
        y: Math.round(rect.top * dpr),
        width: Math.max(0, Math.round(rect.width * dpr)),
        height: Math.max(0, Math.round(rect.height * dpr)),
        visible: true,
      })
      .catch(console.error);
  }, [
    playbackStatus.currentFile,
    playbackStatus.mediaState,
    activeTab,
    isPlayerFullscreen,
    videoViewportEl,
    isTrackModalOpen,
  ]);

  useEffect(() => {
    updateVideoBounds();
    const rafId = requestAnimationFrame(() => {
      updateVideoBounds();
    });
    return () => cancelAnimationFrame(rafId);
  }, [updateVideoBounds, isPlayerFullscreen, isAppFullscreen, showOverlay, activeTab, resumePrompt, isTrackModalOpen]);

  useEffect(() => {
    if (!videoViewportEl) {
      updateVideoBounds();
      return;
    }

    const ro = new ResizeObserver(() => {
      updateVideoBounds();
    });
    ro.observe(videoViewportEl);

    const handleResize = () => {
      updateVideoBounds();
    };
    window.addEventListener('resize', handleResize);

    const mediaQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    const handleDprChange = () => {
      updateVideoBounds();
    };
    mediaQuery.addEventListener?.('change', handleDprChange);

    updateVideoBounds();

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', handleResize);
      mediaQuery.removeEventListener?.('change', handleDprChange);
    };
  }, [videoViewportEl, updateVideoBounds]);

  // Fullscreen auto-hide timer management (5-second timeout on inactivity during active playback)
  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
    setShowOverlay(true);

    if (isPlayerFullscreen) {
      // Keep controls visible when paused or when ended
      if (playbackStatus.paused || playbackStatus.mediaState === 'paused' || playbackStatus.mediaState === 'ended') {
        return;
      }
      inactivityTimerRef.current = setTimeout(() => {
        if (!isScrubbing && !isInteractingWithControlsRef.current && !isControlsFocusedRef.current) {
          setShowOverlay(false);
        }
      }, 5000);
    }
  }, [isPlayerFullscreen, isScrubbing, playbackStatus.paused, playbackStatus.mediaState]);

  useEffect(() => {
    if (isPlayerFullscreen) {
      resetInactivityTimer();
    } else {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
      setShowOverlay(true);
    }
    return () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
    };
  }, [isPlayerFullscreen, playbackStatus.paused, playbackStatus.mediaState, resetInactivityTimer]);

  // Player Fullscreen Cinema Mode Toggling
  const handleTogglePlayerFullscreen = useCallback(async () => {
    const next = !isPlayerFullscreen;
    setIsPlayerFullscreen(next);
    if (next) {
      setActiveTab('player');
      if (window.nosvedAPI?.setFullscreen) {
        await window.nosvedAPI.setFullscreen(true).catch(console.error);
      }
    } else {
      if (window.nosvedAPI?.setFullscreen) {
        await window.nosvedAPI.setFullscreen(false).catch(console.error);
      }
    }
  }, [isPlayerFullscreen, setActiveTab]);

  const handleExitPlayerFullscreen = useCallback(async () => {
    setIsPlayerFullscreen(false);
    if (window.nosvedAPI?.setFullscreen) {
      await window.nosvedAPI.setFullscreen(false).catch(console.error);
    }
  }, []);

  const lastFullscreenToggleTimeRef = useRef(0);
  const triggerPlayerFullscreenToggle = useCallback(() => {
    const now = Date.now();
    if (now - lastFullscreenToggleTimeRef.current < 400) {
      return;
    }
    lastFullscreenToggleTimeRef.current = now;
    handleTogglePlayerFullscreen();
  }, [handleTogglePlayerFullscreen]);

  // Whole App Window Fullscreen Toggling (F11)
  const handleToggleAppFullscreen = useCallback(async () => {
    if (!window.nosvedAPI?.toggleFullscreen) return;
    try {
      const next = await window.nosvedAPI.toggleFullscreen();
      setIsAppFullscreen(next);
    } catch (err) {
      console.error('Failed to toggle app window fullscreen:', err);
    }
  }, []);

  const lastTapTimeRef = useRef(0);
  const handleVideoTapOrClick = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      resetInactivityTimer();
      const now = Date.now();
      if (now - lastTapTimeRef.current < 350) {
        e.preventDefault();
        triggerPlayerFullscreenToggle();
        lastTapTimeRef.current = 0;
      } else {
        lastTapTimeRef.current = now;
      }
    },
    [resetInactivityTimer, triggerPlayerFullscreenToggle]
  );

  // Control interaction event handlers
  const handleControlsMouseEnter = useCallback(() => {
    isInteractingWithControlsRef.current = true;
    resetInactivityTimer();
  }, [resetInactivityTimer]);

  const handleControlsMouseLeave = useCallback(() => {
    isInteractingWithControlsRef.current = false;
    resetInactivityTimer();
  }, [resetInactivityTimer]);

  const handleControlsFocus = useCallback(() => {
    isControlsFocusedRef.current = true;
    resetInactivityTimer();
  }, [resetInactivityTimer]);

  const handleControlsBlur = useCallback(() => {
    isControlsFocusedRef.current = false;
    resetInactivityTimer();
  }, [resetInactivityTimer]);

  // Shell IPC Listeners for fullscreen and activity
  useEffect(() => {
    if (!window.nosvedAPI) return;
    const cleanups: Array<() => void> = [];

    if (window.nosvedAPI.onFullscreenChange) {
      cleanups.push(
        window.nosvedAPI.onFullscreenChange((fs) => {
          setIsAppFullscreen(fs);
          if (!fs) {
            setIsPlayerFullscreen(false);
          }
        })
      );
    }

    if (window.nosvedAPI.onUserActive) {
      cleanups.push(
        window.nosvedAPI.onUserActive(() => {
          resetInactivityTimer();
        })
      );
    }

    if (window.nosvedAPI.onWindowRestored) {
      cleanups.push(
        window.nosvedAPI.onWindowRestored(() => {
          updateVideoBounds();
        })
      );
    }

    if (window.nosvedAPI.onVideoDoubleClicked) {
      cleanups.push(
        window.nosvedAPI.onVideoDoubleClicked(() => {
          triggerPlayerFullscreenToggle();
        })
      );
    }

    return () => {
      cleanups.forEach((c) => c());
    };
  }, [resetInactivityTimer, updateVideoBounds, triggerPlayerFullscreenToggle]);

  return {
    isAppFullscreen,
    isPlayerFullscreen,
    setIsPlayerFullscreen,
    showOverlay,
    setShowOverlay,
    videoViewportRef,
    updateVideoBounds,
    resetInactivityTimer,
    triggerPlayerFullscreenToggle,
    handleTogglePlayerFullscreen,
    handleExitPlayerFullscreen,
    handleToggleAppFullscreen,
    handleVideoTapOrClick,
    handleControlsMouseEnter,
    handleControlsMouseLeave,
    handleControlsFocus,
    handleControlsBlur,
  };
}
