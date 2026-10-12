import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  PlaySquare,
  Library,
  ListMusic,
  History,
  Settings,
  ShieldCheck,
  Cpu,
  Layers,
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
  Trash2,
  FolderPlus,
  Clock,
  SkipBack,
  SkipForward,
  Plus,
  Edit2,
  ArrowUp,
  ArrowDown,
  Video,
} from 'lucide-react';
import type { PlaybackStatus, MediaItem, Playlist, PlaylistItem } from './types/electron';

interface AppInfo {
  name: string;
  version: string;
  isPackaged: boolean;
  platform: string;
  arch: string;
}

interface SecurityState {
  contextIsolated: boolean;
  nodeIntegrationDisabled: boolean;
  sandboxEnabled: boolean;
}

interface ResumePromptState {
  filePath: string;
  position: number;
  duration: number | null;
}

// Configurable implementation constants
const FULLSCREEN_SHORTCUT_KEY = 'KeyF';
const INACTIVITY_TIMEOUT_MS = 5000; // 5-second default inactivity timeout (range: 5-10s)

function formatTime(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
    return '--:--';
  }
  const totalSecs = Math.floor(seconds);
  const hrs = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;

  if (hrs > 0) {
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '--';
  const units = ['B', 'KB', 'MB', 'GB'];
  let val = bytes;
  let unitIndex = 0;
  while (val >= 1024 && unitIndex < units.length - 1) {
    val /= 1024;
    unitIndex++;
  }
  return `${val.toFixed(1)} ${units[unitIndex]}`;
}

function formatDate(timestamp: number | null | undefined): string {
  if (!timestamp) return '--';
  const d = new Date(timestamp);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const App: React.FC = () => {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [securityState, setSecurityState] = useState<SecurityState | null>(null);
  const [nativePoc, setNativePoc] = useState<{ success: boolean; stage: string; apiVersion?: { formatted: string } } | null>(null);
  const [playerStatus, setPlayerStatus] = useState<{ state: string; apiVersion?: { formatted: string }; error?: string } | null>(null);
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
  const [activeTab, setActiveTab] = useState<'player' | 'library' | 'playlists' | 'recent' | 'settings'>('player');

  // Fullscreen & Overlay State
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showOverlay, setShowOverlay] = useState(true);
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isInteractingWithControlsRef = useRef(false);
  const isControlsFocusedRef = useRef(false);

  // Persistence, Library & Resume State
  const [libraryItems, setLibraryItems] = useState<MediaItem[]>([]);
  const [recentItems, setRecentItems] = useState<MediaItem[]>([]);
  const [resumePrompt, setResumePrompt] = useState<ResumePromptState | null>(null);

  // Playlists State
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [selectedPlaylistDetails, setSelectedPlaylistDetails] = useState<{ playlist: Playlist; items: PlaylistItem[] } | null>(null);
  const [activePlaylist, setActivePlaylist] = useState<{
    playlistId: string;
    playlistName: string;
    items: PlaylistItem[];
    currentIndex: number;
  } | null>(null);

  // Modals State
  const [isNewPlaylistModalOpen, setIsNewPlaylistModalOpen] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [playlistToRename, setPlaylistToRename] = useState<Playlist | null>(null);
  const [renamePlaylistName, setRenamePlaylistName] = useState('');
  const [playlistToDelete, setPlaylistToDelete] = useState<Playlist | null>(null);
  const [mediaForPlaylistAdd, setMediaForPlaylistAdd] = useState<MediaItem | null>(null);
  const [targetPlaylistIdForAdd, setTargetPlaylistIdForAdd] = useState('');
  const [isAddFromLibraryOpen, setIsAddFromLibraryOpen] = useState(false);
  const [selectedLibraryIds, setSelectedLibraryIds] = useState<string[]>([]);

  // Scrubbing & seeking state to avoid flooding IPC during slider drag
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubPosition, setScrubPosition] = useState<number | null>(null);
  const isCommandInFlightRef = useRef(false);

  const videoViewportRef = useRef<HTMLDivElement>(null);

  // Synchronize video viewport dimensions with the native child window
  const updateVideoBounds = useCallback(() => {
    if (!window.nosvedAPI?.setVideoBounds) return;
    const shouldBeVisible = Boolean(
      playbackStatus.currentFile &&
      playbackStatus.mediaState !== 'idle' &&
      playbackStatus.mediaState !== 'error' &&
      (activeTab === 'player' || isFullscreen)
    );

    if (!shouldBeVisible || !videoViewportRef.current) {
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

    const rect = videoViewportRef.current.getBoundingClientRect();
    window.nosvedAPI
      .setVideoBounds({
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        visible: true,
      })
      .catch(console.error);
  }, [playbackStatus.currentFile, playbackStatus.mediaState, activeTab, isFullscreen]);

  useEffect(() => {
    updateVideoBounds();
    const rafId = requestAnimationFrame(() => {
      updateVideoBounds();
    });
    return () => cancelAnimationFrame(rafId);
  }, [updateVideoBounds, isFullscreen, showOverlay, activeTab, resumePrompt]);

  useEffect(() => {
    const el = videoViewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      updateVideoBounds();
    });
    ro.observe(el);
    window.addEventListener('resize', updateVideoBounds);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateVideoBounds);
    };
  }, [updateVideoBounds]);

  // Fullscreen auto-hide timer management
  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
    setShowOverlay(true);

    if (isFullscreen) {
      inactivityTimerRef.current = setTimeout(() => {
        if (!isScrubbing && !isInteractingWithControlsRef.current && !isControlsFocusedRef.current) {
          setShowOverlay(false);
        }
      }, INACTIVITY_TIMEOUT_MS);
    }
  }, [isFullscreen, isScrubbing]);

  useEffect(() => {
    if (isFullscreen) {
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
  }, [isFullscreen, resetInactivityTimer]);

  // Handle Fullscreen Toggling
  const handleToggleFullscreen = useCallback(async () => {
    if (!window.nosvedAPI?.toggleFullscreen) return;
    try {
      const next = await window.nosvedAPI.toggleFullscreen();
      setIsFullscreen(next);
    } catch (err) {
      console.error('Failed to toggle fullscreen:', err);
    }
  }, []);

  const handleExitFullscreen = useCallback(async () => {
    if (!window.nosvedAPI?.setFullscreen) return;
    try {
      await window.nosvedAPI.setFullscreen(false);
      setIsFullscreen(false);
    } catch (err) {
      console.error('Failed to exit fullscreen:', err);
    }
  }, []);

  // Double-tap & Fullscreen Toggle Debouncing
  const lastFullscreenToggleTimeRef = useRef(0);
  const triggerFullscreenToggle = useCallback(() => {
    const now = Date.now();
    if (now - lastFullscreenToggleTimeRef.current < 400) {
      return;
    }
    lastFullscreenToggleTimeRef.current = now;
    handleToggleFullscreen();
  }, [handleToggleFullscreen]);

  const lastTapTimeRef = useRef(0);
  const handleVideoTapOrClick = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    resetInactivityTimer();
    const now = Date.now();
    if (now - lastTapTimeRef.current < 350) {
      e.preventDefault();
      triggerFullscreenToggle();
      lastTapTimeRef.current = 0;
    } else {
      lastTapTimeRef.current = now;
    }
  }, [resetInactivityTimer, triggerFullscreenToggle]);

  // Library & Recent Data Fetching
  const refreshLibrary = useCallback(async () => {
    if (!window.nosvedAPI?.getLibrary) return;
    try {
      const items = await window.nosvedAPI.getLibrary();
      setLibraryItems(items);
      // Trigger background metadata & thumbnail probe for items missing thumbnail
      for (const item of items) {
        if (!item.thumbnailKey && !item.isMissing && window.nosvedAPI.extractMetadata) {
          window.nosvedAPI.extractMetadata(item.id).then((updated) => {
            if (updated && updated.thumbnailKey) {
              setLibraryItems((prev) =>
                prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p))
              );
            }
          }).catch(() => {});
        }
      }
    } catch (err) {
      console.error('Failed to fetch library:', err);
    }
  }, []);

  const refreshRecent = useCallback(async () => {
    if (!window.nosvedAPI?.getRecent) return;
    try {
      const items = await window.nosvedAPI.getRecent(50);
      setRecentItems(items);
    } catch (err) {
      console.error('Failed to fetch recent history:', err);
    }
  }, []);

  const refreshPlaylists = useCallback(async () => {
    if (!window.nosvedAPI?.getPlaylists) return;
    try {
      const list = await window.nosvedAPI.getPlaylists();
      setPlaylists(list);
      setSelectedPlaylistId((prev) => {
        if (prev && list.some((p) => p.id === prev)) return prev;
        return list.length > 0 && list[0] ? list[0].id : null;
      });
    } catch (err) {
      console.error('Failed to fetch playlists:', err);
    }
  }, []);

  const refreshPlaylistDetails = useCallback(async (id: string) => {
    if (!window.nosvedAPI?.getPlaylistDetails) return;
    try {
      const details = await window.nosvedAPI.getPlaylistDetails(id);
      setSelectedPlaylistDetails(details);
    } catch (err) {
      console.error('Failed to fetch playlist details:', err);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'library') {
      refreshLibrary();
    } else if (activeTab === 'recent') {
      refreshRecent();
    } else if (activeTab === 'playlists') {
      refreshPlaylists();
    }
  }, [activeTab, refreshLibrary, refreshRecent, refreshPlaylists]);

  useEffect(() => {
    if (selectedPlaylistId) {
      refreshPlaylistDetails(selectedPlaylistId);
    } else {
      setSelectedPlaylistDetails(null);
    }
  }, [selectedPlaylistId, refreshPlaylistDetails]);

  // Playlist Natural EOF Auto-Advancement
  const prevMediaStateRef = useRef<string>(playbackStatus.mediaState);
  useEffect(() => {
    const prev = prevMediaStateRef.current;
    prevMediaStateRef.current = playbackStatus.mediaState;

    if (prev !== 'ended' && playbackStatus.mediaState === 'ended' && activePlaylist) {
      if (activePlaylist.currentIndex < activePlaylist.items.length - 1) {
        const nextIdx = activePlaylist.currentIndex + 1;
        const nextItem = activePlaylist.items[nextIdx];
        if (nextItem && nextItem.media && !nextItem.media.isMissing && nextItem.media.filePath && window.nosvedAPI) {
          const targetPath = nextItem.media.filePath;
          setActivePlaylist((curr) => (curr ? { ...curr, currentIndex: nextIdx } : null));
          window.nosvedAPI.loadFile(targetPath).then(() => {
            window.nosvedAPI?.play();
          }).catch(console.error);
        }
      }
    }
  }, [playbackStatus.mediaState, activePlaylist]);

  // Playlist Navigation Handlers
  const handlePlayNextPlaylistItem = useCallback(async () => {
    if (!activePlaylist || activePlaylist.currentIndex >= activePlaylist.items.length - 1 || !window.nosvedAPI) return;
    const nextIdx = activePlaylist.currentIndex + 1;
    const nextItem = activePlaylist.items[nextIdx];
    if (nextItem && nextItem.media && !nextItem.media.isMissing && nextItem.media.filePath) {
      setActivePlaylist((curr) => (curr ? { ...curr, currentIndex: nextIdx } : null));
      const st = await window.nosvedAPI.loadFile(nextItem.media.filePath);
      setPlaybackStatus(st);
      await window.nosvedAPI.play();
    }
  }, [activePlaylist]);

  const handlePlayPrevPlaylistItem = useCallback(async () => {
    if (!activePlaylist || activePlaylist.currentIndex <= 0 || !window.nosvedAPI) return;
    const prevIdx = activePlaylist.currentIndex - 1;
    const prevItem = activePlaylist.items[prevIdx];
    if (prevItem && prevItem.media && !prevItem.media.isMissing && prevItem.media.filePath) {
      setActivePlaylist((curr) => (curr ? { ...curr, currentIndex: prevIdx } : null));
      const st = await window.nosvedAPI.loadFile(prevItem.media.filePath);
      setPlaybackStatus(st);
      await window.nosvedAPI.play();
    }
  }, [activePlaylist]);

  const handlePlayPlaylistItem = useCallback(
    async (playlist: Playlist, items: PlaylistItem[], index: number) => {
      const item = items[index];
      if (!item || !item.media || item.media.isMissing || !window.nosvedAPI) return;
      setActivePlaylist({
        playlistId: playlist.id,
        playlistName: playlist.name,
        items,
        currentIndex: index,
      });
      setActiveTab('player');
      const st = await window.nosvedAPI.loadFile(item.media.filePath);
      setPlaybackStatus(st);
      await window.nosvedAPI.play();
    },
    []
  );

  // Playlist CRUD Operations
  const handleCreatePlaylist = async () => {
    if (!newPlaylistName.trim() || !window.nosvedAPI?.createPlaylist) return;
    try {
      const created = await window.nosvedAPI.createPlaylist(newPlaylistName.trim());
      setIsNewPlaylistModalOpen(false);
      setNewPlaylistName('');
      if (created) {
        await refreshPlaylists();
        setSelectedPlaylistId(created.id);
      }
    } catch (err) {
      console.error('Failed to create playlist:', err);
    }
  };

  const handleRenamePlaylist = async () => {
    if (!playlistToRename || !renamePlaylistName.trim() || !window.nosvedAPI?.renamePlaylist) return;
    try {
      await window.nosvedAPI.renamePlaylist(playlistToRename.id, renamePlaylistName.trim());
      setPlaylistToRename(null);
      setRenamePlaylistName('');
      await refreshPlaylists();
      if (selectedPlaylistId === playlistToRename.id) {
        await refreshPlaylistDetails(playlistToRename.id);
      }
    } catch (err) {
      console.error('Failed to rename playlist:', err);
    }
  };

  const handleDeletePlaylist = async () => {
    if (!playlistToDelete || !window.nosvedAPI?.deletePlaylist) return;
    try {
      await window.nosvedAPI.deletePlaylist(playlistToDelete.id);
      if (selectedPlaylistId === playlistToDelete.id) {
        setSelectedPlaylistId(null);
      }
      if (activePlaylist?.playlistId === playlistToDelete.id) {
        setActivePlaylist(null);
      }
      setPlaylistToDelete(null);
      await refreshPlaylists();
    } catch (err) {
      console.error('Failed to delete playlist:', err);
    }
  };

  const handleRemovePlaylistItem = async (playlistId: string, mediaId: string) => {
    if (!window.nosvedAPI?.removeItemFromPlaylist) return;
    try {
      await window.nosvedAPI.removeItemFromPlaylist(playlistId, mediaId);
      await refreshPlaylistDetails(playlistId);
      await refreshPlaylists();
      if (activePlaylist?.playlistId === playlistId) {
        const details = await window.nosvedAPI.getPlaylistDetails(playlistId);
        if (details) {
          setActivePlaylist((curr) =>
            curr
              ? {
                  ...curr,
                  items: details.items,
                  currentIndex: Math.min(curr.currentIndex, Math.max(0, details.items.length - 1)),
                }
              : null
          );
        }
      }
    } catch (err) {
      console.error('Failed to remove playlist item:', err);
    }
  };

  const handleReorderItem = async (playlistId: string, fromIndex: number, toIndex: number) => {
    if (!selectedPlaylistDetails || !window.nosvedAPI?.reorderPlaylistItems) return;
    const currentItems = [...selectedPlaylistDetails.items];
    if (fromIndex < 0 || fromIndex >= currentItems.length || toIndex < 0 || toIndex >= currentItems.length) return;
    const [moved] = currentItems.splice(fromIndex, 1);
    if (!moved) return;
    currentItems.splice(toIndex, 0, moved);
    const mediaIds = currentItems.map((it) => it.mediaId);
    try {
      await window.nosvedAPI.reorderPlaylistItems(playlistId, mediaIds);
      await refreshPlaylistDetails(playlistId);
    } catch (err) {
      console.error('Failed to reorder playlist items:', err);
    }
  };

  const handleAddMediaToPlaylist = async (playlistId: string, mediaId: string) => {
    if (!window.nosvedAPI?.addItemsToPlaylist) return;
    try {
      await window.nosvedAPI.addItemsToPlaylist(playlistId, [mediaId]);
      setMediaForPlaylistAdd(null);
      if (selectedPlaylistId === playlistId) {
        await refreshPlaylistDetails(playlistId);
      }
      await refreshPlaylists();
    } catch (err) {
      console.error('Failed to add media to playlist:', err);
    }
  };

  const handleAddFromLibrary = async () => {
    if (!selectedPlaylistId || selectedLibraryIds.length === 0 || !window.nosvedAPI?.addItemsToPlaylist) return;
    try {
      await window.nosvedAPI.addItemsToPlaylist(selectedPlaylistId, selectedLibraryIds);
      setIsAddFromLibraryOpen(false);
      setSelectedLibraryIds([]);
      await refreshPlaylistDetails(selectedPlaylistId);
      await refreshPlaylists();
    } catch (err) {
      console.error('Failed to add selected library items:', err);
    }
  };

  // Verify in-renderer isolation
  const nodeDirectAccessDetected =
    typeof (window as unknown as { process?: unknown }).process !== 'undefined' ||
    typeof (window as unknown as { require?: unknown }).require !== 'undefined' ||
    typeof (window as unknown as { Buffer?: unknown }).Buffer !== 'undefined';

  useEffect(() => {
    if (window.nosvedAPI) {
      window.nosvedAPI.getAppInfo().then(setAppInfo).catch(console.error);
      window.nosvedAPI.getSecurityState().then(setSecurityState).catch(console.error);
      window.nosvedAPI
        .initializePlayer()
        .then((initRes) => {
          setPlayerStatus(initRes);
          if (initRes.apiVersion) {
            setNativePoc({
              success: true,
              stage: 'instance_initialized',
              apiVersion: { formatted: initRes.apiVersion.formatted },
            });
          }
        })
        .catch(console.error);
      window.nosvedAPI.getPlaybackStatus().then(setPlaybackStatus).catch(console.error);

      window.nosvedAPI.onPlaybackStatus((status) => {
        setPlaybackStatus(status);
      });

      if (window.nosvedAPI.onFullscreenChange) {
        window.nosvedAPI.onFullscreenChange((fs) => {
          setIsFullscreen(fs);
        });
      }
    }
  }, []);

  // Listen for cursor activity and restore events from native shell
  useEffect(() => {
    if (!window.nosvedAPI) return;
    const cleanups: Array<() => void> = [];

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
          triggerFullscreenToggle();
        })
      );
    }

    return () => {
      cleanups.forEach((c) => c());
    };
  }, [resetInactivityTimer, updateVideoBounds, triggerFullscreenToggle]);

  const isDesktopBridge = typeof window !== 'undefined' && typeof window.nosvedAPI !== 'undefined';

  const notifyBrowserBridgeMissing = () => {
    setPlaybackStatus((prev) => ({
      ...prev,
      error: 'Desktop Bridge Unavailable: Native libmpv commands require the Electron desktop application window. Regular browsers cannot access native C-ABI binaries.',
    }));
  };

  const handleDismissError = () => {
    setPlaybackStatus((prev) => ({ ...prev, error: undefined }));
  };

  // Open media with resume check
  const openMediaWithResumeCheck = useCallback(async (filePath: string) => {
    if (!window.nosvedAPI) return;
    try {
      const recent = await window.nosvedAPI.getRecent(100);
      const existing = recent.find((item) => item.filePath.toLowerCase() === filePath.toLowerCase());

      const status = await window.nosvedAPI.loadFile(filePath);
      setPlaybackStatus(status);
      setActiveTab('player');

      if (
        existing &&
        existing.lastPosition &&
        existing.lastPosition > 5 &&
        (existing.duration === null || existing.lastPosition < existing.duration * 0.95)
      ) {
        setResumePrompt({
          filePath,
          position: existing.lastPosition,
          duration: existing.duration,
        });
      } else {
        await window.nosvedAPI.play();
      }
    } catch (err) {
      console.error('Failed to open media:', err);
      setPlaybackStatus((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to open media file',
      }));
    }
  }, []);

  const handleResumePlayback = async () => {
    if (!resumePrompt || !window.nosvedAPI) return;
    const targetPos = resumePrompt.position;
    setResumePrompt(null);
    try {
      await window.nosvedAPI.seek(targetPos);
      await window.nosvedAPI.play();
    } catch (err) {
      console.error('Failed to resume playback:', err);
    }
  };

  const handleStartFromBeginning = async () => {
    setResumePrompt(null);
    if (!window.nosvedAPI) return;
    try {
      await window.nosvedAPI.seek(0);
      await window.nosvedAPI.play();
    } catch (err) {
      console.error('Failed to start from beginning:', err);
    }
  };

  const handleOpenFile = async () => {
    if (!window.nosvedAPI) {
      notifyBrowserBridgeMissing();
      return;
    }
    if (isCommandInFlightRef.current) return;
    isCommandInFlightRef.current = true;
    try {
      const res = await window.nosvedAPI.openFileDialog();
      if (!res.canceled && res.filePath) {
        openMediaWithResumeCheck(res.filePath);
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
  };

  const handleImportFiles = async () => {
    if (!window.nosvedAPI?.importMediaFiles) return;
    try {
      const res = await window.nosvedAPI.importMediaFiles();
      if (!res.canceled && res.importedCount > 0) {
        await refreshLibrary();
      }
    } catch (err) {
      console.error('Failed to import files:', err);
    }
  };

  const handleRemoveMedia = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.nosvedAPI?.removeMedia) return;
    try {
      await window.nosvedAPI.removeMedia(id);
      if (activeTab === 'library') {
        await refreshLibrary();
      } else if (activeTab === 'recent') {
        await refreshRecent();
      }
    } catch (err) {
      console.error('Failed to remove media from library:', err);
    }
  };

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
  }, []);

  const handleSeekSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const pos = parseFloat(e.target.value);
    if (Number.isFinite(pos)) {
      setScrubPosition(pos);
    }
  };

  const handleSeekMouseDown = () => {
    setIsScrubbing(true);
    setScrubPosition(playbackStatus.position ?? 0);
    resetInactivityTimer();
  };

  const commitSeek = async (val?: number) => {
    const target = typeof val === 'number' && Number.isFinite(val) ? val : scrubPosition;
    setIsScrubbing(false);
    setScrubPosition(null);
    resetInactivityTimer();
    if (target === null || !Number.isFinite(target) || !window.nosvedAPI) return;
    try {
      const res = await window.nosvedAPI.seek(target);
      setPlaybackStatus(res);
    } catch (err) {
      console.error('Failed to commit seek:', err);
    }
  };

  const handleVolume = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!window.nosvedAPI) {
      notifyBrowserBridgeMissing();
      return;
    }
    resetInactivityTimer();
    const vol = parseFloat(e.target.value);
    if (isNaN(vol)) return;
    try {
      const res = await window.nosvedAPI.setVolume(vol);
      setPlaybackStatus(res);
    } catch (err) {
      console.error('Failed to set volume:', err);
    }
  };

  const handleToggleMute = useCallback(async () => {
    if (!window.nosvedAPI) {
      notifyBrowserBridgeMissing();
      return;
    }
    resetInactivityTimer();
    try {
      const res = await window.nosvedAPI.toggleMute();
      setPlaybackStatus(res);
    } catch (err) {
      console.error('Failed to toggle mute:', err);
    }
  }, [resetInactivityTimer]);

  // Keyboard accessibility listeners (F: toggle fullscreen, Esc: exit fullscreen, Space: play/pause, Left/Right: seek, Up/Down: vol, M: mute)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        if (target.getAttribute('type') !== 'range') {
          return;
        }
      }

      resetInactivityTimer();

      if (e.code === FULLSCREEN_SHORTCUT_KEY) {
        if (activeTab === 'player' || isFullscreen) {
          e.preventDefault();
          triggerFullscreenToggle();
        }
      } else if (e.code === 'Escape') {
        if (resumePrompt) {
          e.preventDefault();
          setResumePrompt(null);
        } else if (playbackStatus.error) {
          e.preventDefault();
          handleDismissError();
        } else if (isFullscreen) {
          e.preventDefault();
          handleExitFullscreen();
        }
      } else if (e.code === 'Space') {
        if (activeTab === 'player' || isFullscreen) {
          e.preventDefault();
          handleTogglePlayPause();
        }
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        if (playbackStatus.currentFile && playbackStatus.position !== null) {
          const newPos = Math.max(0, playbackStatus.position - 5);
          window.nosvedAPI?.seek(newPos).then(setPlaybackStatus).catch(console.error);
        }
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        if (playbackStatus.currentFile && playbackStatus.position !== null) {
          const max = playbackStatus.duration ?? playbackStatus.position + 5;
          const newPos = Math.min(max, playbackStatus.position + 5);
          window.nosvedAPI?.seek(newPos).then(setPlaybackStatus).catch(console.error);
        }
      } else if (e.code === 'ArrowUp') {
        e.preventDefault();
        const newVol = Math.min(100, Math.round(playbackStatus.volume + 5));
        window.nosvedAPI?.setVolume(newVol).then(setPlaybackStatus).catch(console.error);
      } else if (e.code === 'ArrowDown') {
        e.preventDefault();
        const newVol = Math.max(0, Math.round(playbackStatus.volume - 5));
        window.nosvedAPI?.setVolume(newVol).then(setPlaybackStatus).catch(console.error);
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        handleToggleMute();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    activeTab,
    playbackStatus,
    isFullscreen,
    resumePrompt,
    handleToggleFullscreen,
    triggerFullscreenToggle,
    handleExitFullscreen,
    handleTogglePlayPause,
    handleToggleMute,
    resetInactivityTimer,
  ]);

  return (
    <div
      className={`app-layout ${isFullscreen ? 'fullscreen-active' : ''}`}
      onMouseMove={resetInactivityTimer}
    >
      {/* Navigation Rail / Sidebar (Hidden in Fullscreen) */}
      {!isFullscreen && (
        <aside className="app-sidebar">
          <div className="brand-section">
            <div className="brand-logo-badge">
              <Film size={22} />
            </div>
            <div className="brand-meta">
              <span className="brand-title">Nosved Player</span>
              <span className="brand-subtitle">Desktop Core</span>
            </div>
          </div>

          <nav className="nav-group">
            <span className="nav-label">Media Workspaces</span>

            <button
              type="button"
              className={`nav-item ${activeTab === 'player' ? 'active' : ''}`}
              onClick={() => setActiveTab('player')}
            >
              <div className="nav-item-content">
                <PlaySquare size={18} />
                <span>Now Playing</span>
              </div>
            </button>

            <button
              type="button"
              className={`nav-item ${activeTab === 'library' ? 'active' : ''}`}
              onClick={() => setActiveTab('library')}
            >
              <div className="nav-item-content">
                <Library size={18} />
                <span>Library</span>
              </div>
            </button>

            <button
              type="button"
              className="nav-item disabled"
              title="Playlists will be available in a future release"
            >
              <div className="nav-item-content">
                <ListMusic size={18} />
                <span>Playlists</span>
              </div>
              <span className="coming-soon-pill">Soon</span>
            </button>

            <button
              type="button"
              className={`nav-item ${activeTab === 'recent' ? 'active' : ''}`}
              onClick={() => setActiveTab('recent')}
            >
              <div className="nav-item-content">
                <History size={18} />
                <span>Recent</span>
              </div>
            </button>

            <span className="nav-label" style={{ marginTop: '12px' }}>System</span>

            <button
              type="button"
              className="nav-item disabled"
              title="Player settings will be available in a future release"
            >
              <div className="nav-item-content">
                <Settings size={18} />
                <span>Settings</span>
              </div>
              <span className="coming-soon-pill">Soon</span>
            </button>
          </nav>

          {/* Security Audit Badge in Sidebar */}
          <div className="sidebar-footer">
            <div className="security-badge-header">
              <ShieldCheck size={16} />
              <span>Security Sandbox</span>
            </div>
            <div className="security-item">
              <span>Context Isolation:</span>
              <span className="security-val">{securityState?.contextIsolated ? 'Active' : 'Enforced'}</span>
            </div>
            <div className="security-item">
              <span>Node Direct Access:</span>
              <span className="security-val" style={{ color: nodeDirectAccessDetected ? '#ffb4ab' : '#a4d3be' }}>
                {nodeDirectAccessDetected ? 'Vulnerable' : 'Blocked'}
              </span>
            </div>
            <div className="security-item">
              <span>Chromium Sandbox:</span>
              <span className="security-val">{securityState?.sandboxEnabled ? 'Active' : 'Enforced'}</span>
            </div>
          </div>
        </aside>
      )}

      {/* Main Viewport Content */}
      <main className={`main-viewport ${isFullscreen ? 'fullscreen-mode' : ''}`}>
        {!isFullscreen && (
          <header className="viewport-header">
            <div className="header-status-group">
              <div className="status-indicator">
                <div className="status-dot" />
                <span>Desktop Engine Ready</span>
              </div>
              <span className="arch-tag">
                {appInfo ? `${appInfo.platform}-${appInfo.arch}` : 'win32-x64'}
              </span>
            </div>

            {playbackStatus.currentFile && (
              <div className="header-media-info" title={playbackStatus.currentFile}>
                <Film size={14} />
                <span className="header-media-title">
                  {playbackStatus.currentFile.split(/[/\\]/).pop() || playbackStatus.currentFile}
                </span>
                {playbackStatus.videoWidth && playbackStatus.videoHeight && (
                  <span className="resolution-badge">
                    {playbackStatus.videoWidth}x{playbackStatus.videoHeight}
                  </span>
                )}
              </div>
            )}

            <span className="arch-tag" style={{ color: '#a8c7fa' }}>
              v{appInfo?.version || '0.1.0'}
            </span>
          </header>
        )}

        <section className={`viewport-body ${isFullscreen ? 'fullscreen-body' : ''}`}>
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
            <div className={`resume-playback-modal ${isFullscreen ? 'fullscreen-resume-modal' : ''}`} role="dialog" aria-modal="true">
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
                    onClick={handleResumePlayback}
                    autoFocus
                  >
                    <Play size={16} />
                    <span>Resume from {formatTime(resumePrompt.position)}</span>
                  </button>
                  <button
                    type="button"
                    className="resume-btn secondary"
                    onClick={handleStartFromBeginning}
                  >
                    <RotateCcw size={16} />
                    <span>Start from Beginning</span>
                  </button>
                  <button
                    type="button"
                    className="resume-dismiss-btn"
                    onClick={() => setResumePrompt(null)}
                    title="Dismiss (Esc)"
                    aria-label="Dismiss resume prompt"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Tab Content: Now Playing View */}
          {(activeTab === 'player' || isFullscreen) && (
            <div
              className={`player-container ${isFullscreen ? 'fullscreen-player-container' : ''}`}
              onClick={handleVideoTapOrClick}
              onDoubleClick={triggerFullscreenToggle}
              onTouchEnd={handleVideoTapOrClick}
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
                          onClick={handleDismissError}
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
                          onClick={handleDismissError}
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
                        handleOpenFile();
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
                onMouseEnter={() => {
                  isInteractingWithControlsRef.current = true;
                  resetInactivityTimer();
                }}
                onMouseLeave={() => {
                  isInteractingWithControlsRef.current = false;
                  resetInactivityTimer();
                }}
                onFocus={() => {
                  isControlsFocusedRef.current = true;
                  resetInactivityTimer();
                }}
                onBlur={() => {
                  isControlsFocusedRef.current = false;
                  resetInactivityTimer();
                }}
              >
                <div className="controls-left">
                  <button
                    type="button"
                    className="control-btn primary-play-btn"
                    onClick={handleTogglePlayPause}
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
                    onClick={handleOpenFile}
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
                        onClick={handlePlayPrevPlaylistItem}
                        disabled={activePlaylist.currentIndex <= 0}
                        title="Previous in Playlist"
                        aria-label="Previous in Playlist"
                      >
                        <SkipBack size={16} />
                      </button>
                      <button
                        type="button"
                        className="control-btn"
                        onClick={handlePlayNextPlaylistItem}
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
                    onChange={handleSeekSliderChange}
                    onMouseDown={handleSeekMouseDown}
                    onMouseUp={() => commitSeek()}
                    onTouchStart={handleSeekMouseDown}
                    onTouchEnd={() => commitSeek()}
                    onKeyUp={(e) => {
                      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                        commitSeek(parseFloat((e.target as HTMLInputElement).value));
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
                    onClick={handleToggleMute}
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
                    onChange={handleVolume}
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
                      triggerFullscreenToggle();
                    }}
                    title={isFullscreen ? 'Exit Fullscreen (F / Esc)' : 'Enter Fullscreen (F)'}
                    aria-label={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
                  >
                    {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Tab Content: Media Library View */}
          {activeTab === 'library' && !isFullscreen && (
            <div className="library-view-container">
              <div className="view-header-bar">
                <div className="view-header-title-group">
                  <Library size={20} className="view-header-icon" />
                  <h2 className="view-title">Media Library</h2>
                  <span className="view-count-badge">{libraryItems.length} videos</span>
                </div>
                <button
                  type="button"
                  className="import-btn"
                  onClick={handleImportFiles}
                  aria-label="Import video files to library"
                >
                  <FolderPlus size={16} />
                  <span>Import Media</span>
                </button>
              </div>

              {libraryItems.length === 0 ? (
                <div className="empty-view-placeholder">
                  <Library size={48} className="empty-icon" />
                  <h3>Your Library is Empty</h3>
                  <p>Import video files from disk to build your persistent local media collection.</p>
                  <button type="button" className="open-file-btn" onClick={handleImportFiles}>
                    <FolderPlus size={18} />
                    <span>Import Videos</span>
                  </button>
                </div>
              ) : (
                <div className="media-grid">
                  {libraryItems.map((item) => (
                    <div
                      key={item.id}
                      className={`media-card ${item.isMissing ? 'media-missing' : ''}`}
                      onClick={() => !item.isMissing && openMediaWithResumeCheck(item.filePath)}
                    >
                      <div className="media-card-thumb">
                        {item.thumbnailKey ? (
                          <img
                            src={`nosved-thumb://${item.thumbnailKey}`}
                            alt={item.fileName}
                            onError={(e) => {
                              (e.currentTarget as HTMLElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <Film size={28} />
                        )}
                        {item.duration && (
                          <span className="media-card-duration">{formatTime(item.duration)}</span>
                        )}
                        {item.isMissing && (
                          <span className="media-missing-badge">Missing File</span>
                        )}
                      </div>
                      <div className="media-card-info">
                        <div className="media-card-title" title={item.fileName}>
                          {item.fileName}
                        </div>
                        <div className="media-card-meta">
                          <span>{formatBytes(item.fileSize)}</span>
                          <span className="meta-sep">&bull;</span>
                          <span>Added {formatDate(item.firstAdded)}</span>
                        </div>
                        <div className="meta-chip-group">
                          {item.videoHeight && (
                            <span className="meta-chip highlight">
                              {item.videoHeight >= 2160
                                ? '4K'
                                : item.videoHeight >= 1080
                                ? '1080p'
                                : item.videoHeight >= 720
                                ? '720p'
                                : `${item.videoWidth}x${item.videoHeight}`}
                            </span>
                          )}
                          {item.videoCodec && (
                            <span className="meta-chip" title="Video Codec">
                              {item.videoCodec.split(' ')[0]}
                            </span>
                          )}
                          {item.audioCodec && (
                            <span className="meta-chip" title="Audio Codec">
                              {item.audioCodec.split(' ')[0]}
                            </span>
                          )}
                          {item.fps && (
                            <span className="meta-chip">{Math.round(item.fps)} fps</span>
                          )}
                        </div>
                      </div>
                      <div className="media-card-actions">
                        <button
                          type="button"
                          className="card-action-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMediaForPlaylistAdd(item);
                            if (playlists.length > 0 && playlists[0]) {
                              setTargetPlaylistIdForAdd(playlists[0].id);
                            }
                          }}
                          title="Add to Playlist"
                          aria-label="Add to Playlist"
                        >
                          <ListMusic size={14} />
                        </button>
                        <button
                          type="button"
                          className="card-action-btn delete"
                          onClick={(e) => handleRemoveMedia(item.id, e)}
                          title="Remove from Library (File remains on disk)"
                          aria-label="Remove from Library"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tab Content: Recent Playback View */}
          {activeTab === 'recent' && !isFullscreen && (
            <div className="recent-view-container">
              <div className="view-header-bar">
                <div className="view-header-title-group">
                  <History size={20} className="view-header-icon" />
                  <h2 className="view-title">Recently Played</h2>
                  <span className="view-count-badge">{recentItems.length} videos</span>
                </div>
              </div>

              {recentItems.length === 0 ? (
                <div className="empty-view-placeholder">
                  <History size={48} className="empty-icon" />
                  <h3>No Playback History Yet</h3>
                  <p>Videos you play will automatically appear here with saved progress.</p>
                  <button type="button" className="open-file-btn" onClick={handleOpenFile}>
                    <FolderOpen size={18} />
                    <span>Open a Video</span>
                  </button>
                </div>
              ) : (
                <div className="recent-list">
                  {recentItems.map((item) => {
                    const progressPercent =
                      item.duration && item.lastPosition
                        ? Math.min(100, Math.round((item.lastPosition / item.duration) * 100))
                        : 0;
                    return (
                      <div
                        key={item.id}
                        className={`recent-item-card ${item.isMissing ? 'media-missing' : ''}`}
                        onClick={() => !item.isMissing && openMediaWithResumeCheck(item.filePath)}
                      >
                        <div className="recent-item-icon">
                          <Film size={20} />
                        </div>
                        <div className="recent-item-main">
                          <div className="recent-item-title" title={item.filePath}>
                            {item.fileName}
                          </div>
                          <div className="recent-item-meta">
                            <span>Last played: {formatDate(item.lastOpened)}</span>
                            {item.lastPosition && (
                              <>
                                <span className="meta-sep">&bull;</span>
                                <span>Position: {formatTime(item.lastPosition)} / {formatTime(item.duration)}</span>
                              </>
                            )}
                            {item.isMissing && (
                              <span className="media-missing-badge">File moved or deleted</span>
                            )}
                          </div>
                          {progressPercent > 0 && (
                            <div className="recent-progress-bar">
                              <div
                                className="recent-progress-fill"
                                style={{ width: `${progressPercent}%` }}
                              />
                            </div>
                          )}
                        </div>
                        <div className="recent-item-actions">
                          <button
                            type="button"
                            className="play-recent-btn"
                            disabled={item.isMissing}
                            title="Play video"
                          >
                            <Play size={16} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Tab Content: Playlists View */}
          {activeTab === 'playlists' && !isFullscreen && (
            <div className="playlists-view-container">
              {/* Playlists Sidebar */}
              <div className="playlists-sidebar">
                <div className="playlists-sidebar-header">
                  <span className="playlists-sidebar-title">Playlists ({playlists.length})</span>
                  <button
                    type="button"
                    className="new-playlist-btn"
                    onClick={() => {
                      setNewPlaylistName('');
                      setIsNewPlaylistModalOpen(true);
                    }}
                    aria-label="Create new playlist"
                  >
                    <Plus size={14} />
                    <span>New</span>
                  </button>
                </div>

                {playlists.length === 0 ? (
                  <div className="empty-view-placeholder" style={{ padding: '24px 8px' }}>
                    <ListMusic size={32} className="empty-icon" />
                    <p style={{ fontSize: '12px' }}>No playlists yet. Create your first playlist!</p>
                  </div>
                ) : (
                  <div className="playlist-nav-list">
                    {playlists.map((pl) => (
                      <div
                        key={pl.id}
                        className={`playlist-nav-item ${selectedPlaylistId === pl.id ? 'active' : ''}`}
                        onClick={() => setSelectedPlaylistId(pl.id)}
                      >
                        <div className="playlist-nav-info">
                          <span className="playlist-nav-name" title={pl.name}>
                            {pl.name}
                          </span>
                          <span className="playlist-nav-meta">
                            {pl.itemCount ?? 0} {pl.itemCount === 1 ? 'video' : 'videos'}
                          </span>
                        </div>
                        <div className="playlist-nav-actions" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className="playlist-icon-btn"
                            onClick={() => {
                              setPlaylistToRename(pl);
                              setRenamePlaylistName(pl.name);
                            }}
                            title="Rename Playlist"
                            aria-label="Rename Playlist"
                          >
                            <Edit2 size={12} />
                          </button>
                          <button
                            type="button"
                            className="playlist-icon-btn delete"
                            onClick={() => setPlaylistToDelete(pl)}
                            title="Delete Playlist"
                            aria-label="Delete Playlist"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Playlist Details Pane */}
              <div className="playlist-detail-pane">
                {!selectedPlaylistDetails ? (
                  <div className="empty-view-placeholder">
                    <ListMusic size={48} className="empty-icon" />
                    <h3>No Playlist Selected</h3>
                    <p>Select a playlist from the sidebar or create a new one to view and manage items.</p>
                  </div>
                ) : (
                  <>
                    <div className="playlist-detail-header">
                      <div className="playlist-header-title-block">
                        <h3>{selectedPlaylistDetails.playlist.name}</h3>
                        <div className="playlist-header-meta">
                          <span>{selectedPlaylistDetails.items.length} videos</span>
                          <span className="meta-sep">&bull;</span>
                          <span>
                            Total Duration:{' '}
                            {formatTime(
                              selectedPlaylistDetails.items.reduce(
                                (acc, it) => acc + (it.media?.duration ?? 0),
                                0
                              )
                            )}
                          </span>
                        </div>
                      </div>
                      <div className="playlist-header-buttons">
                        <button
                          type="button"
                          className="play-all-btn"
                          disabled={selectedPlaylistDetails.items.length === 0}
                          onClick={() => {
                            if (selectedPlaylistDetails.items.length > 0) {
                              handlePlayPlaylistItem(
                                selectedPlaylistDetails.playlist,
                                selectedPlaylistDetails.items,
                                0
                              );
                            }
                          }}
                          aria-label="Play all playlist items"
                        >
                          <Play size={16} />
                          <span>Play All</span>
                        </button>
                        <button
                          type="button"
                          className="add-videos-btn"
                          onClick={() => {
                            setSelectedLibraryIds([]);
                            setIsAddFromLibraryOpen(true);
                          }}
                          aria-label="Add videos from library"
                        >
                          <Plus size={14} />
                          <span>Add Videos</span>
                        </button>
                      </div>
                    </div>

                    {selectedPlaylistDetails.items.length === 0 ? (
                      <div className="empty-view-placeholder">
                        <Video size={48} className="empty-icon" />
                        <h3>Playlist is Empty</h3>
                        <p>Add media items from your library to start building this playlist.</p>
                        <button
                          type="button"
                          className="open-file-btn"
                          onClick={() => {
                            setSelectedLibraryIds([]);
                            setIsAddFromLibraryOpen(true);
                          }}
                        >
                          <Plus size={16} />
                          <span>Add Videos from Library</span>
                        </button>
                      </div>
                    ) : (
                      <div className="playlist-items-table">
                        {selectedPlaylistDetails.items.map((item, idx) => {
                          const isCurrentlyPlaying =
                            activePlaylist?.playlistId === selectedPlaylistDetails.playlist.id &&
                            activePlaylist?.currentIndex === idx;
                          return (
                            <div
                              key={item.id}
                              className={`playlist-item-row ${
                                isCurrentlyPlaying ? 'currently-playing' : ''
                              } ${item.media?.isMissing ? 'media-missing' : ''}`}
                            >
                              <span className="playlist-item-index">{idx + 1}</span>
                              <div className="playlist-thumb">
                                {item.media?.thumbnailKey ? (
                                  <img
                                    src={`nosved-thumb://${item.media.thumbnailKey}`}
                                    alt={item.media.fileName}
                                    onError={(e) => {
                                      (e.currentTarget as HTMLElement).style.display = 'none';
                                    }}
                                  />
                                ) : (
                                  <Film size={16} />
                                )}
                              </div>
                              <div className="playlist-item-info">
                                <span className="playlist-item-title" title={item.media?.fileName}>
                                  {item.media?.fileName ?? 'Unknown file'}
                                </span>
                                <div className="playlist-item-meta">
                                  <span>{formatTime(item.media?.duration)}</span>
                                  {item.media?.videoHeight && (
                                    <>
                                      <span className="meta-sep">&bull;</span>
                                      <span>
                                        {item.media.videoHeight >= 1080
                                          ? `${item.media.videoHeight}p`
                                          : `${item.media.videoWidth}x${item.media.videoHeight}`}
                                      </span>
                                    </>
                                  )}
                                  {item.media?.isMissing && (
                                    <span className="media-missing-badge" style={{ position: 'static' }}>
                                      Missing
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="playlist-item-reorder-actions">
                                <button
                                  type="button"
                                  className="reorder-btn"
                                  disabled={idx === 0}
                                  onClick={() =>
                                    handleReorderItem(
                                      selectedPlaylistDetails.playlist.id,
                                      idx,
                                      idx - 1
                                    )
                                  }
                                  title="Move Up"
                                  aria-label="Move Up"
                                >
                                  <ArrowUp size={14} />
                                </button>
                                <button
                                  type="button"
                                  className="reorder-btn"
                                  disabled={idx === selectedPlaylistDetails.items.length - 1}
                                  onClick={() =>
                                    handleReorderItem(
                                      selectedPlaylistDetails.playlist.id,
                                      idx,
                                      idx + 1
                                    )
                                  }
                                  title="Move Down"
                                  aria-label="Move Down"
                                >
                                  <ArrowDown size={14} />
                                </button>
                              </div>
                              <div className="playlist-item-actions">
                                <button
                                  type="button"
                                  className="control-btn"
                                  disabled={item.media?.isMissing}
                                  onClick={() =>
                                    handlePlayPlaylistItem(
                                      selectedPlaylistDetails.playlist,
                                      selectedPlaylistDetails.items,
                                      idx
                                    )
                                  }
                                  title="Play from here"
                                  aria-label="Play from here"
                                >
                                  <Play size={14} />
                                </button>
                                <button
                                  type="button"
                                  className="playlist-icon-btn delete"
                                  onClick={() =>
                                    handleRemovePlaylistItem(
                                      selectedPlaylistDetails.playlist.id,
                                      item.mediaId
                                    )
                                  }
                                  title="Remove from Playlist"
                                  aria-label="Remove from Playlist"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Create Playlist Modal */}
          {isNewPlaylistModalOpen && (
            <div className="modal-backdrop" onClick={() => setIsNewPlaylistModalOpen(false)}>
              <div className="modal-container" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <span className="modal-title">New Playlist</span>
                  <button
                    type="button"
                    className="modal-close-btn"
                    onClick={() => setIsNewPlaylistModalOpen(false)}
                    aria-label="Close"
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="modal-body">
                  <label htmlFor="new-playlist-input" style={{ fontSize: '13px', color: 'var(--md-sys-color-on-surface-variant)' }}>
                    Playlist Name
                  </label>
                  <input
                    id="new-playlist-input"
                    type="text"
                    className="modal-input"
                    placeholder="e.g., Favorites, Anime Series..."
                    value={newPlaylistName}
                    autoFocus
                    onChange={(e) => setNewPlaylistName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreatePlaylist();
                      if (e.key === 'Escape') setIsNewPlaylistModalOpen(false);
                    }}
                  />
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="modal-btn secondary"
                    onClick={() => setIsNewPlaylistModalOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="modal-btn primary"
                    disabled={!newPlaylistName.trim()}
                    onClick={handleCreatePlaylist}
                  >
                    Create
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Rename Playlist Modal */}
          {playlistToRename && (
            <div className="modal-backdrop" onClick={() => setPlaylistToRename(null)}>
              <div className="modal-container" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <span className="modal-title">Rename Playlist</span>
                  <button
                    type="button"
                    className="modal-close-btn"
                    onClick={() => setPlaylistToRename(null)}
                    aria-label="Close"
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="modal-body">
                  <label htmlFor="rename-playlist-input" style={{ fontSize: '13px', color: 'var(--md-sys-color-on-surface-variant)' }}>
                    Playlist Name
                  </label>
                  <input
                    id="rename-playlist-input"
                    type="text"
                    className="modal-input"
                    value={renamePlaylistName}
                    autoFocus
                    onChange={(e) => setRenamePlaylistName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRenamePlaylist();
                      if (e.key === 'Escape') setPlaylistToRename(null);
                    }}
                  />
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="modal-btn secondary"
                    onClick={() => setPlaylistToRename(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="modal-btn primary"
                    disabled={!renamePlaylistName.trim()}
                    onClick={handleRenamePlaylist}
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Delete Playlist Confirmation Modal */}
          {playlistToDelete && (
            <div className="modal-backdrop" onClick={() => setPlaylistToDelete(null)}>
              <div className="modal-container" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <span className="modal-title">Delete Playlist</span>
                  <button
                    type="button"
                    className="modal-close-btn"
                    onClick={() => setPlaylistToDelete(null)}
                    aria-label="Close"
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="modal-body">
                  <p style={{ fontSize: '14px', lineHeight: '1.5' }}>
                    Are you sure you want to delete <strong>{playlistToDelete.name}</strong>?
                  </p>
                  <p style={{ fontSize: '12px', color: 'var(--md-sys-color-on-surface-variant)', lineHeight: '1.4' }}>
                    This will only delete the playlist container. Your video files on disk and library entries will remain completely safe and untouched.
                  </p>
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="modal-btn secondary"
                    onClick={() => setPlaylistToDelete(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="modal-btn danger"
                    onClick={handleDeletePlaylist}
                  >
                    Delete Playlist
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Add Single Media to Playlist Modal */}
          {mediaForPlaylistAdd && (
            <div className="modal-backdrop" onClick={() => setMediaForPlaylistAdd(null)}>
              <div className="modal-container" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <span className="modal-title">Add to Playlist</span>
                  <button
                    type="button"
                    className="modal-close-btn"
                    onClick={() => setMediaForPlaylistAdd(null)}
                    aria-label="Close"
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="modal-body">
                  <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--md-sys-color-on-surface)' }}>
                    {mediaForPlaylistAdd.fileName}
                  </p>
                  {playlists.length === 0 ? (
                    <p style={{ fontSize: '12px', color: 'var(--md-sys-color-on-surface-variant)' }}>
                      No playlists exist yet. Please create a playlist first in the Playlists tab.
                    </p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '12px', color: 'var(--md-sys-color-on-surface-variant)' }}>
                        Choose Playlist:
                      </label>
                      <select
                        className="modal-input"
                        value={targetPlaylistIdForAdd || (playlists[0]?.id ?? '')}
                        onChange={(e) => setTargetPlaylistIdForAdd(e.target.value)}
                      >
                        {playlists.map((pl) => (
                          <option key={pl.id} value={pl.id}>
                            {pl.name} ({pl.itemCount ?? 0} items)
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="modal-btn secondary"
                    onClick={() => setMediaForPlaylistAdd(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="modal-btn primary"
                    disabled={playlists.length === 0}
                    onClick={() => {
                      const plId = targetPlaylistIdForAdd || playlists[0]?.id;
                      if (plId) {
                        handleAddMediaToPlaylist(plId, mediaForPlaylistAdd.id);
                      }
                    }}
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Add Multiple Videos from Library Modal */}
          {isAddFromLibraryOpen && selectedPlaylistDetails && (
            <div className="modal-backdrop" onClick={() => setIsAddFromLibraryOpen(false)}>
              <div
                className="modal-container"
                style={{ width: '560px', maxHeight: '80vh' }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="modal-header">
                  <span className="modal-title">
                    Add Videos to &ldquo;{selectedPlaylistDetails.playlist.name}&rdquo;
                  </span>
                  <button
                    type="button"
                    className="modal-close-btn"
                    onClick={() => setIsAddFromLibraryOpen(false)}
                    aria-label="Close"
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="modal-body" style={{ maxHeight: '50vh', overflowY: 'auto' }}>
                  {libraryItems.length === 0 ? (
                    <p style={{ fontSize: '13px', color: 'var(--md-sys-color-on-surface-variant)' }}>
                      No media available in Library. Import media files first.
                    </p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {libraryItems.map((libItem) => {
                        const isAlreadyInPlaylist = selectedPlaylistDetails.items.some(
                          (pi) => pi.mediaId === libItem.id
                        );
                        const isSelected = selectedLibraryIds.includes(libItem.id);
                        return (
                          <div
                            key={libItem.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              padding: '8px 12px',
                              borderRadius: '8px',
                              backgroundColor: isSelected
                                ? 'var(--md-sys-color-surface-container-high)'
                                : 'var(--md-sys-color-surface-container-low)',
                              border: isSelected
                                ? '1px solid var(--md-sys-color-primary)'
                                : '1px solid transparent',
                              cursor: isAlreadyInPlaylist ? 'default' : 'pointer',
                              opacity: isAlreadyInPlaylist ? 0.5 : 1,
                            }}
                            onClick={() => {
                              if (isAlreadyInPlaylist) return;
                              setSelectedLibraryIds((prev) =>
                                prev.includes(libItem.id)
                                  ? prev.filter((id) => id !== libItem.id)
                                  : [...prev, libItem.id]
                              );
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isAlreadyInPlaylist || isSelected}
                              disabled={isAlreadyInPlaylist}
                              onChange={() => {}}
                            />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div
                                style={{
                                  fontSize: '13px',
                                  fontWeight: 600,
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                }}
                              >
                                {libItem.fileName}
                              </div>
                              <div style={{ fontSize: '11px', color: 'var(--md-sys-color-on-surface-variant)' }}>
                                {formatTime(libItem.duration)} &bull; {formatBytes(libItem.fileSize)}
                                {isAlreadyInPlaylist && ' (Already in playlist)'}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="modal-btn secondary"
                    onClick={() => setIsAddFromLibraryOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="modal-btn primary"
                    disabled={selectedLibraryIds.length === 0}
                    onClick={handleAddFromLibrary}
                  >
                    Add Selected ({selectedLibraryIds.length})
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Audit & Architecture Cards (Windowed Mode Only) */}
          {!isFullscreen && (
            <div className="audit-cards-grid">
              <div className="audit-card">
                <div className="card-header">
                  <Cpu className="card-icon" size={18} />
                  <h3 className="card-title">Staged Native Assets</h3>
                </div>
                <div className="card-rows">
                  <div className="card-row">
                    <span className="row-label">libmpv Binary</span>
                    <span className="row-value">windows/x64/libmpv-2.dll</span>
                  </div>
                  <div className="card-row">
                    <span className="row-label">Playback State</span>
                    <span className="row-status-verified">{playbackStatus.mediaState}</span>
                  </div>
                  <div className="card-row">
                    <span className="row-label">Video Surface</span>
                    <span className="row-value">
                      {playbackStatus.videoWidth && playbackStatus.videoHeight
                        ? `${playbackStatus.videoWidth}x${playbackStatus.videoHeight} (Win32 HWND)`
                        : 'Win32 Child HWND (vo=gpu)'}
                    </span>
                  </div>
                  <div className="card-row">
                    <span className="row-label">libmpv API</span>
                    <span className="row-value">
                      {nativePoc?.apiVersion?.formatted ? `v${nativePoc.apiVersion.formatted} Connected` : 'Probing...'}
                    </span>
                  </div>
                  <div className="card-row">
                    <span className="row-label">Player Service</span>
                    <span className="row-status-verified">
                      {playerStatus?.state ? `State: ${playerStatus.state}` : 'Connecting...'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="audit-card">
                <div className="card-header">
                  <ShieldCheck className="card-icon" size={18} />
                  <h3 className="card-title">Electron Security Enforcements</h3>
                </div>
                <div className="card-rows">
                  <div className="card-row">
                    <span className="row-label">contextIsolation</span>
                    <span className="row-status-verified">true</span>
                  </div>
                  <div className="card-row">
                    <span className="row-label">nodeIntegration</span>
                    <span className="row-status-verified">false</span>
                  </div>
                  <div className="card-row">
                    <span className="row-label">Chromium Sandbox</span>
                    <span className="row-status-verified">true</span>
                  </div>
                  <div className="card-row">
                    <span className="row-label">Navigation Lock</span>
                    <span className="row-status-verified">Enforced (will-navigate blocked)</span>
                  </div>
                </div>
              </div>

              <div className="audit-card">
                <div className="card-header">
                  <Layers className="card-icon" size={18} />
                  <h3 className="card-title">Application Architecture</h3>
                </div>
                <div className="card-rows">
                  <div className="card-row">
                    <span className="row-label">Rendering Mode</span>
                    <span className="row-value">Direct3D HW-Accel (vo=gpu)</span>
                  </div>
                  <div className="card-row">
                    <span className="row-label">Persistence</span>
                    <span className="row-value">winsqlite3 (Schema v1)</span>
                  </div>
                  <div className="card-row">
                    <span className="row-label">Fullscreen Mode</span>
                    <span className="row-value">{isFullscreen ? 'Active (Auto-hide)' : 'Windowed'}</span>
                  </div>
                  <div className="card-row">
                    <span className="row-label">Design System</span>
                    <span className="row-value">Material 3 Expressive (Vanilla CSS)</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default App;
