import { useState, useEffect, useRef, useCallback } from 'react';
import type { PlaybackStatus } from '../types/electron';
import type { ResumePromptState } from '../components/PlayerView';

interface UsePlayerStateProps {
  resumePlaybackPrompt: boolean;
  onNavigateToPlayer: () => void;
}

export function usePlayerState({ resumePlaybackPrompt, onNavigateToPlayer }: UsePlayerStateProps) {
  const [playerStatus, setPlayerStatus] = useState<{
    state: string;
    apiVersion?: { formatted: string };
    error?: string;
  } | null>(null);

  const [playbackStatus, setPlaybackStatus] = useState<PlaybackStatus>({
    mediaState: 'idle',
    currentFile: null,
    position: null,
    duration: null,
    paused: true,
    volume: 100,
    muted: false,
    videoWidth: null,
    videoHeight: null,
  });

  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubPosition, setScrubPosition] = useState<number | null>(null);
  const [isTrackModalOpen, setIsTrackModalOpen] = useState(false);
  const [resumePrompt, setResumePrompt] = useState<ResumePromptState | null>(null);

  const isCommandInFlightRef = useRef(false);

  const notifyBrowserBridgeMissing = useCallback(() => {
    setPlaybackStatus((prev) => ({
      ...prev,
      error: 'Desktop Bridge Unavailable: Native libmpv commands require the Electron desktop application window.',
    }));
  }, []);

  const handleDismissError = useCallback(() => {
    setPlaybackStatus((prev) => ({ ...prev, error: undefined }));
  }, []);

  // Initialize player and listen to status updates
  useEffect(() => {
    if (!window.nosvedAPI) return;

    window.nosvedAPI
      .initializePlayer()
      .then((initRes) => {
        setPlayerStatus(initRes);
      })
      .catch(console.error);

    window.nosvedAPI.getPlaybackStatus().then(setPlaybackStatus).catch(console.error);

    const unsub = window.nosvedAPI.onPlaybackStatus((status) => {
      setPlaybackStatus(status);
    });

    return () => {
      unsub?.();
    };
  }, []);

  // Open media with resume check
  const openMediaWithResumeCheck = useCallback(
    async (filePath: string) => {
      if (!window.nosvedAPI) return;
      try {
        const recent = await window.nosvedAPI.getRecent(100);
        const existing = recent.find((item) => item.filePath.toLowerCase() === filePath.toLowerCase());

        const status = await window.nosvedAPI.loadFile(filePath);
        setPlaybackStatus(status);
        onNavigateToPlayer();

        if (
          resumePlaybackPrompt &&
          existing &&
          existing.lastPosition &&
          existing.lastPosition > 5 &&
          (existing.duration === null || existing.lastPosition < existing.duration * 0.95)
        ) {
          setResumePrompt({
            filePath,
            position: existing.lastPosition,
            duration: existing.duration ?? null,
          });
        } else {
          await window.nosvedAPI.play();
        }
      } catch (err) {
        console.error('Failed to open media:', err);
      }
    },
    [resumePlaybackPrompt, onNavigateToPlayer]
  );

  const handleResumePlayback = useCallback(async () => {
    if (!resumePrompt || !window.nosvedAPI) return;
    const target = resumePrompt.position;
    setResumePrompt(null);
    try {
      await window.nosvedAPI.seek(target);
      await window.nosvedAPI.play();
    } catch (err) {
      console.error('Failed to resume playback:', err);
    }
  }, [resumePrompt]);

  const handleStartFromBeginning = useCallback(async () => {
    setResumePrompt(null);
    if (!window.nosvedAPI) return;
    try {
      await window.nosvedAPI.seek(0);
      await window.nosvedAPI.play();
    } catch (err) {
      console.error('Failed to start from beginning:', err);
    }
  }, []);

  const handleOpenFile = useCallback(async () => {
    if (!window.nosvedAPI) {
      notifyBrowserBridgeMissing();
      return;
    }
    if (isCommandInFlightRef.current) return;
    isCommandInFlightRef.current = true;
    try {
      const res = await window.nosvedAPI.openFileDialog();
      if (!res.canceled && res.filePath) {
        await openMediaWithResumeCheck(res.filePath);
      }
    } catch (err) {
      console.error('Failed to open file dialog:', err);
      setPlaybackStatus((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to open file dialog',
      }));
    } finally {
      isCommandInFlightRef.current = false;
    }
  }, [notifyBrowserBridgeMissing, openMediaWithResumeCheck]);

  const handleTogglePlayPause = useCallback(async () => {
    if (!window.nosvedAPI) {
      notifyBrowserBridgeMissing();
      return;
    }
    if (isCommandInFlightRef.current) return;
    isCommandInFlightRef.current = true;
    try {
      const res = await window.nosvedAPI.togglePause();
      setPlaybackStatus(res);
    } catch (err) {
      console.error('Failed to toggle play/pause:', err);
      setPlaybackStatus((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Play/pause command failed',
      }));
    } finally {
      isCommandInFlightRef.current = false;
    }
  }, [notifyBrowserBridgeMissing]);

  const handleSeekSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const nextVal = parseFloat(e.target.value);
    setScrubPosition(nextVal);
  }, []);

  const handleSeekMouseDown = useCallback(() => {
    setIsScrubbing(true);
    setScrubPosition(playbackStatus.position ?? 0);
  }, [playbackStatus.position]);

  const commitSeek = useCallback(
    async (directVal?: number) => {
      const targetSec = directVal !== undefined ? directVal : scrubPosition;
      setIsScrubbing(false);
      setScrubPosition(null);

      if (targetSec === null || targetSec === undefined || !Number.isFinite(targetSec)) {
        return;
      }

      if (!window.nosvedAPI) {
        notifyBrowserBridgeMissing();
        return;
      }

      try {
        const res = await window.nosvedAPI.seek(targetSec);
        setPlaybackStatus(res);
      } catch (err) {
        console.error('Seek operation failed:', err);
      }
    },
    [scrubPosition, notifyBrowserBridgeMissing]
  );

  const handleVolume = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!window.nosvedAPI) return;
    const newVol = parseFloat(e.target.value);
    setPlaybackStatus((prev) => ({ ...prev, volume: newVol, muted: newVol === 0 ? prev.muted : false }));
    try {
      const res = await window.nosvedAPI.setVolume(newVol);
      setPlaybackStatus(res);
    } catch (err) {
      console.error('Failed to set volume:', err);
    }
  }, []);

  const handleToggleMute = useCallback(async () => {
    if (!window.nosvedAPI) return;
    try {
      const res = await window.nosvedAPI.toggleMute();
      setPlaybackStatus(res);
    } catch (err) {
      console.error('Failed to toggle mute:', err);
    }
  }, []);

  return {
    playerStatus,
    playbackStatus,
    setPlaybackStatus,
    isScrubbing,
    scrubPosition,
    isTrackModalOpen,
    setIsTrackModalOpen,
    resumePrompt,
    setResumePrompt,
    openMediaWithResumeCheck,
    handleResumePlayback,
    handleStartFromBeginning,
    handleOpenFile,
    handleTogglePlayPause,
    handleSeekSliderChange,
    handleSeekMouseDown,
    commitSeek,
    handleVolume,
    handleToggleMute,
    handleDismissError,
  };
}
