import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Film } from 'lucide-react';
import type { PlaybackStatus, MediaItem, Playlist, PlaylistItem } from './types/electron';

import { Navbar, TabType } from './components/Navbar';
import { PlayerView, ActivePlaylistState, ResumePromptState } from './components/PlayerView';
import { HomeView } from './components/HomeView';
import { FloatingIsland } from './components/FloatingIsland';
import { LibraryView } from './components/LibraryView';
import { PlaylistsView } from './components/PlaylistsView';
import { RecentView } from './components/RecentView';
import { SettingsView } from './components/SettingsView';
import {
  AppSettings,
  DEFAULT_SETTINGS,
  parseSettingsFromRaw,
  serializeSettingsToRaw,
  applyThemeToDom,
} from './types/settings';
import {
  NewPlaylistModal,
  RenamePlaylistModal,
  DeletePlaylistModal,
  AddToPlaylistModal,
  AddFromLibraryModal,
} from './components/modals/PlaylistModals';

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

const FULLSCREEN_SHORTCUT_KEY = 'KeyF';

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
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  // Fullscreen & Overlay State
  const [isAppFullscreen, setIsAppFullscreen] = useState(false);
  const [isPlayerFullscreen, setIsPlayerFullscreen] = useState(false);
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
  const [activePlaylist, setActivePlaylist] = useState<ActivePlaylistState | null>(null);

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

  // Scrubbing & seeking state
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubPosition, setScrubPosition] = useState<number | null>(null);
  const [isTrackModalOpen, setIsTrackModalOpen] = useState(false);
  const isCommandInFlightRef = useRef(false);

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
  }, [playbackStatus.currentFile, playbackStatus.mediaState, activeTab, isPlayerFullscreen, videoViewportEl, isTrackModalOpen]);

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

  // Fullscreen auto-hide timer management (10-second timeout on inactivity)
  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
    setShowOverlay(true);

    if (isPlayerFullscreen) {
      inactivityTimerRef.current = setTimeout(() => {
        if (!isScrubbing && !isInteractingWithControlsRef.current && !isControlsFocusedRef.current) {
          setShowOverlay(false);
        }
      }, 10000); // 10 seconds auto-hide
    }
  }, [isPlayerFullscreen, isScrubbing]);

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
  }, [isPlayerFullscreen, resetInactivityTimer]);

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
  }, [isPlayerFullscreen]);

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
  const handleVideoTapOrClick = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    resetInactivityTimer();
    const now = Date.now();
    if (now - lastTapTimeRef.current < 350) {
      e.preventDefault();
      triggerPlayerFullscreenToggle();
      lastTapTimeRef.current = 0;
    } else {
      lastTapTimeRef.current = now;
    }
  }, [resetInactivityTimer, triggerPlayerFullscreenToggle]);

  // Library & Recent Data Fetching
  const refreshLibrary = useCallback(async () => {
    if (!window.nosvedAPI?.getLibrary) return;
    try {
      const items = await window.nosvedAPI.getLibrary();
      setLibraryItems(items);
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

  // Auto-redirect to Home if user lands on Player tab without active media
  useEffect(() => {
    if (activeTab === 'player' && (!playbackStatus.currentFile || playbackStatus.mediaState === 'idle')) {
      setActiveTab('home');
    }
  }, [activeTab, playbackStatus.currentFile, playbackStatus.mediaState]);

  // Initial fetch on application launch
  useEffect(() => {
    refreshLibrary();
    refreshRecent();
    refreshPlaylists();
  }, [refreshLibrary, refreshRecent, refreshPlaylists]);

  useEffect(() => {
    if (activeTab === 'home') {
      refreshRecent();
      refreshLibrary();
      refreshPlaylists();
    } else if (activeTab === 'library') {
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
      const success = await window.nosvedAPI.renamePlaylist(playlistToRename.id, renamePlaylistName.trim());
      setPlaylistToRename(null);
      setRenamePlaylistName('');
      if (success) {
        await refreshPlaylists();
        if (selectedPlaylistId === playlistToRename.id) {
          await refreshPlaylistDetails(playlistToRename.id);
        }
      }
    } catch (err) {
      console.error('Failed to rename playlist:', err);
    }
  };

  const handleDeletePlaylist = async () => {
    if (!playlistToDelete || !window.nosvedAPI?.deletePlaylist) return;
    try {
      const idToDelete = playlistToDelete.id;
      const success = await window.nosvedAPI.deletePlaylist(idToDelete);
      setPlaylistToDelete(null);
      if (success) {
        if (activePlaylist?.playlistId === idToDelete) {
          setActivePlaylist(null);
        }
        await refreshPlaylists();
      }
    } catch (err) {
      console.error('Failed to delete playlist:', err);
    }
  };

  const handleAddMediaToPlaylist = async (playlistId: string, mediaId: string) => {
    if (!window.nosvedAPI?.addItemsToPlaylist) return;
    try {
      const success = await window.nosvedAPI.addItemsToPlaylist(playlistId, [mediaId]);
      setMediaForPlaylistAdd(null);
      if (success) {
        await refreshPlaylists();
        if (selectedPlaylistId === playlistId) {
          await refreshPlaylistDetails(playlistId);
        }
      }
    } catch (err) {
      console.error('Failed to add item to playlist:', err);
    }
  };

  const handleAddFromLibrary = async () => {
    if (!selectedPlaylistDetails || selectedLibraryIds.length === 0 || !window.nosvedAPI?.addItemsToPlaylist) return;
    try {
      const plId = selectedPlaylistDetails.playlist.id;
      const success = await window.nosvedAPI.addItemsToPlaylist(plId, selectedLibraryIds);
      setIsAddFromLibraryOpen(false);
      setSelectedLibraryIds([]);
      if (success) {
        await refreshPlaylists();
        await refreshPlaylistDetails(plId);
      }
    } catch (err) {
      console.error('Failed to add library items to playlist:', err);
    }
  };

  const handleRemovePlaylistItem = async (playlistId: string, mediaId: string) => {
    if (!window.nosvedAPI?.removeItemFromPlaylist) return;
    try {
      const success = await window.nosvedAPI.removeItemFromPlaylist(playlistId, mediaId);
      if (success) {
        await refreshPlaylists();
        await refreshPlaylistDetails(playlistId);
        if (activePlaylist?.playlistId === playlistId) {
          setActivePlaylist((curr) => {
            if (!curr) return null;
            const updatedItems = curr.items.filter((it) => it.mediaId !== mediaId);
            return {
              ...curr,
              items: updatedItems,
              currentIndex: Math.min(curr.currentIndex, Math.max(0, updatedItems.length - 1)),
            };
          });
        }
      }
    } catch (err) {
      console.error('Failed to remove playlist item:', err);
    }
  };

  const handleReorderItem = async (playlistId: string, fromIndex: number, toIndex: number) => {
    if (!selectedPlaylistDetails || !window.nosvedAPI?.reorderPlaylistItems) return;
    const items = [...selectedPlaylistDetails.items];
    if (fromIndex < 0 || fromIndex >= items.length || toIndex < 0 || toIndex >= items.length) return;

    const [moved] = items.splice(fromIndex, 1);
    if (!moved) return;
    items.splice(toIndex, 0, moved);

    const orderedMediaIds = items.map((it) => it.mediaId);
    try {
      const success = await window.nosvedAPI.reorderPlaylistItems(playlistId, orderedMediaIds);
      if (success) {
        await refreshPlaylistDetails(playlistId);
        if (activePlaylist?.playlistId === playlistId) {
          setActivePlaylist((curr) => (curr ? { ...curr, items } : null));
        }
      }
    } catch (err) {
      console.error('Failed to reorder playlist items:', err);
    }
  };

  const isIsolated =
    securityState?.contextIsolated === true &&
    securityState?.nodeIntegrationDisabled === true &&
    typeof (window as unknown as { process?: unknown }).process === 'undefined' &&
    typeof (window as unknown as { require?: unknown }).require === 'undefined' &&
    typeof (window as unknown as { Buffer?: unknown }).Buffer === 'undefined';

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
          setIsAppFullscreen(fs);
          if (!fs) {
            setIsPlayerFullscreen(false);
          }
        });
      }

      if (window.nosvedAPI.getSettings) {
        window.nosvedAPI
          .getSettings()
          .then((raw) => {
            const parsed = parseSettingsFromRaw(raw);
            setSettings(parsed);
            applyThemeToDom(
              parsed.themeMode,
              parsed.accentPalette,
              parsed.highContrast,
              parsed.compactUi
            );
          })
          .catch(console.error);
      }
    }
  }, []);

  // Dynamic OS color-scheme listener for System mode
  useEffect(() => {
    if (settings.themeMode !== 'system') return;
    if (typeof window === 'undefined' || !window.matchMedia) return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemThemeChange = () => {
      applyThemeToDom(
        'system',
        settings.accentPalette,
        settings.highContrast,
        settings.compactUi
      );
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleSystemThemeChange);
      return () => mediaQuery.removeEventListener('change', handleSystemThemeChange);
    } else if (mediaQuery.addListener) {
      mediaQuery.addListener(handleSystemThemeChange);
      return () => mediaQuery.removeListener(handleSystemThemeChange);
    }
  }, [settings.themeMode, settings.accentPalette, settings.highContrast, settings.compactUi]);

  // Settings Actions
  const handleUpdateSetting = useCallback(
    async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
      setSettings((prev) => {
        const next = { ...prev, [key]: value };
        applyThemeToDom(
          next.themeMode,
          next.accentPalette,
          next.highContrast,
          next.compactUi
        );
        return next;
      });
      if (window.nosvedAPI?.setSetting) {
        await window.nosvedAPI.setSetting(String(key), String(value)).catch(console.error);
      }
    },
    []
  );

  const handleResetSettings = useCallback(async () => {
    setSettings(DEFAULT_SETTINGS);
    applyThemeToDom(
      DEFAULT_SETTINGS.themeMode,
      DEFAULT_SETTINGS.accentPalette,
      DEFAULT_SETTINGS.highContrast,
      DEFAULT_SETTINGS.compactUi
    );
    if (window.nosvedAPI?.resetSettings) {
      await window.nosvedAPI.resetSettings().catch(console.error);
    }
  }, []);

  const handleExportSettings = useCallback(async () => {
    if (!window.nosvedAPI?.exportSettingsFile) return;
    const payload = JSON.stringify(
      {
        app: 'Nosved Player Desktop',
        version: appInfo?.version || '0.1.0',
        exportedAt: new Date().toISOString(),
        settings,
      },
      null,
      2
    );
    const res = await window.nosvedAPI.exportSettingsFile(payload);
    if (res.error) throw new Error(res.error);
  }, [appInfo?.version, settings]);

  const handleImportSettings = useCallback(async () => {
    if (!window.nosvedAPI?.importSettingsFile) return;
    const res = await window.nosvedAPI.importSettingsFile();
    if (res.canceled) return;
    if (res.error || !res.data) throw new Error(res.error || 'Failed to read settings file');
    const parsedJson = JSON.parse(res.data);
    const raw = (parsedJson.settings as Record<string, string>) || (parsedJson as Record<string, string>);
    const newSettings = parseSettingsFromRaw(raw);
    setSettings(newSettings);
    applyThemeToDom(
      newSettings.themeMode,
      newSettings.accentPalette,
      newSettings.highContrast,
      newSettings.compactUi
    );
    if (window.nosvedAPI.setAllSettings) {
      await window.nosvedAPI.setAllSettings(serializeSettingsToRaw(newSettings));
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
          triggerPlayerFullscreenToggle();
        })
      );
    }

    return () => {
      cleanups.forEach((c) => c());
    };
  }, [resetInactivityTimer, updateVideoBounds, triggerPlayerFullscreenToggle]);

  const isDesktopBridge = typeof window !== 'undefined' && typeof window.nosvedAPI !== 'undefined';

  const notifyBrowserBridgeMissing = () => {
    setPlaybackStatus((prev) => ({
      ...prev,
      error: 'Desktop Bridge Unavailable: Native libmpv commands require the Electron desktop application window.',
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
        settings.resumePlaybackPrompt &&
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
  }, [settings.resumePlaybackPrompt]);

  const handleResumePlayback = async () => {
    if (!resumePrompt || !window.nosvedAPI) return;
    const target = resumePrompt.position;
    setResumePrompt(null);
    try {
      await window.nosvedAPI.seek(target);
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
      if (activeTab === 'library' || activeTab === 'home') {
        await refreshLibrary();
      }
      if (activeTab === 'recent' || activeTab === 'home') {
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
    const nextVal = parseFloat(e.target.value);
    setScrubPosition(nextVal);
  };

  const handleSeekMouseDown = () => {
    setIsScrubbing(true);
    setScrubPosition(playbackStatus.position ?? 0);
  };

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
    [scrubPosition]
  );

  const handleVolume = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!window.nosvedAPI) return;
    const newVol = parseFloat(e.target.value);
    setPlaybackStatus((prev) => ({ ...prev, volume: newVol, muted: newVol === 0 ? prev.muted : false }));
    try {
      const res = await window.nosvedAPI.setVolume(newVol);
      setPlaybackStatus(res);
    } catch (err) {
      console.error('Failed to set volume:', err);
    }
  };

  const handleToggleMute = useCallback(async () => {
    if (!window.nosvedAPI) return;
    try {
      const res = await window.nosvedAPI.toggleMute();
      setPlaybackStatus(res);
    } catch (err) {
      console.error('Failed to toggle mute:', err);
    }
  }, []);

  // Global Keyboard Navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      resetInactivityTimer();

      if (e.key === 'F11') {
        e.preventDefault();
        if (isPlayerFullscreen) {
          setIsPlayerFullscreen(false);
        }
        handleToggleAppFullscreen();
      } else if (e.code === FULLSCREEN_SHORTCUT_KEY) {
        if (activeTab === 'player' || isPlayerFullscreen || Boolean(playbackStatus.currentFile && playbackStatus.mediaState !== 'idle')) {
          e.preventDefault();
          triggerPlayerFullscreenToggle();
        }
      } else if (e.key === 'Escape') {
        if (resumePrompt) {
          e.preventDefault();
          setResumePrompt(null);
        } else if (isPlayerFullscreen) {
          e.preventDefault();
          handleExitPlayerFullscreen();
        } else if (isAppFullscreen) {
          e.preventDefault();
          window.nosvedAPI?.setFullscreen?.(false);
        }
      } else if (e.code === 'Space') {
        if (activeTab === 'player' || isPlayerFullscreen) {
          e.preventDefault();
          handleTogglePlayPause();
        }
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        if (playbackStatus.currentFile && playbackStatus.position !== null) {
          const step = settings.seekStepSeconds || 10;
          const newPos = Math.max(0, playbackStatus.position - step);
          window.nosvedAPI?.seek(newPos).then(setPlaybackStatus).catch(console.error);
        }
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        if (playbackStatus.currentFile && playbackStatus.position !== null) {
          const step = settings.seekStepSeconds || 10;
          const max = playbackStatus.duration ?? playbackStatus.position + step;
          const newPos = Math.min(max, playbackStatus.position + step);
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
    isAppFullscreen,
    isPlayerFullscreen,
    resumePrompt,
    handleToggleAppFullscreen,
    triggerPlayerFullscreenToggle,
    handleExitPlayerFullscreen,
    handleTogglePlayPause,
    handleToggleMute,
    resetInactivityTimer,
    settings.seekStepSeconds,
  ]);

  const currentPlayingItem =
    recentItems.find((it) => it.filePath === playbackStatus.currentFile) ||
    libraryItems.find((it) => it.filePath === playbackStatus.currentFile) ||
    (activePlaylist && activePlaylist.items[activePlaylist.currentIndex]?.media?.filePath === playbackStatus.currentFile
      ? activePlaylist.items[activePlaylist.currentIndex]?.media
      : undefined);
  const currentThumbnailKey = currentPlayingItem?.thumbnailKey;

  return (
    <div
      className={`flex h-full w-full bg-background select-none app-layout ${isPlayerFullscreen ? 'player-fullscreen-active bg-black border-none' : ''}`}
      onMouseMove={resetInactivityTimer}
    >
      {/* Navigation Rail / Sidebar (Hidden in Player Fullscreen) */}
      {!isPlayerFullscreen && (
        <Navbar
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          isIsolated={isIsolated}
          isElectron={isDesktopBridge}
          hasActiveMedia={Boolean(playbackStatus.currentFile && playbackStatus.mediaState !== 'idle')}
        />
      )}

      {/* Main Viewport Content */}
      <main className={`flex-1 flex flex-col h-full overflow-hidden bg-background main-viewport ${isPlayerFullscreen ? 'player-fullscreen-mode bg-black border-none' : ''}`}>
        {!isPlayerFullscreen && (
          <header className="h-16 min-h-16 flex items-center justify-between px-8 border-b border-border bg-surface/70 backdrop-blur-md sticky top-0 z-10 viewport-header">
            <div className="flex items-center gap-3">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
                <span>Desktop Engine Ready</span>
              </div>
              <span className="font-mono text-[11px] text-muted-foreground bg-surface-elevated px-2 py-1 rounded-lg border border-border">
                {appInfo ? `${appInfo.platform}-${appInfo.arch}` : 'win32-x64'}
              </span>
            </div>

            {playbackStatus.currentFile && (
              <div className="flex items-center gap-2 px-3 py-1 bg-surface border border-border rounded-full text-primary text-xs max-w-[440px]" title={playbackStatus.currentFile}>
                <Film size={14} />
                <span className="max-w-[280px] truncate font-medium text-foreground">
                  {playbackStatus.currentFile.split(/[/\\]/).pop() || playbackStatus.currentFile}
                </span>
                {playbackStatus.videoWidth && playbackStatus.videoHeight && (
                  <span className="font-mono text-[10px] font-semibold px-1.5 py-0.5 bg-primary/15 border border-primary/30 rounded text-primary">
                    {playbackStatus.videoWidth}x{playbackStatus.videoHeight}
                  </span>
                )}
              </div>
            )}

            <span className="font-mono text-[11px] text-primary bg-surface-elevated px-2 py-1 rounded-lg border border-border">
              v{appInfo?.version || '0.1.0'}
            </span>
          </header>
        )}

        <section className={`viewport-body flex-1 min-h-0 w-full flex flex-col overflow-hidden relative ${isPlayerFullscreen ? 'p-0 m-0 max-w-none bg-black border-none' : ''}`}>
          {/* Tab Content: Home Landing View */}
          {activeTab === 'home' && !isPlayerFullscreen && (
            <HomeView
              recentItems={recentItems}
              libraryItems={libraryItems}
              playlists={playlists}
              onOpenMedia={openMediaWithResumeCheck}
              onOpenFile={handleOpenFile}
              onNavigateTab={setActiveTab}
            />
          )}

          {/* Tab Content: Now Playing View */}
          {((activeTab === 'player' && Boolean(playbackStatus.currentFile && playbackStatus.mediaState !== 'idle')) || isPlayerFullscreen) && (
            <PlayerView
              videoViewportRef={videoViewportRef}
              playbackStatus={playbackStatus}
              activePlaylist={activePlaylist}
              resumePrompt={resumePrompt}
              isFullscreen={isPlayerFullscreen}
              showOverlay={showOverlay}
              isDesktopBridge={isDesktopBridge}
              isScrubbing={isScrubbing}
              scrubPosition={scrubPosition}
              isTrackModalOpen={isTrackModalOpen}
              onTrackModalOpenChange={setIsTrackModalOpen}
              onOpenFile={handleOpenFile}
              onTogglePlayPause={handleTogglePlayPause}
              onToggleMute={handleToggleMute}
              onVolumeChange={handleVolume}
              onSeekSliderChange={handleSeekSliderChange}
              onSeekMouseDown={handleSeekMouseDown}
              onCommitSeek={commitSeek}
              onTriggerFullscreenToggle={triggerPlayerFullscreenToggle}
              onPlayNextPlaylistItem={handlePlayNextPlaylistItem}
              onPlayPrevPlaylistItem={handlePlayPrevPlaylistItem}
              onResumePlayback={handleResumePlayback}
              onStartFromBeginning={handleStartFromBeginning}
              onDismissResumePrompt={() => setResumePrompt(null)}
              onDismissError={handleDismissError}
              onVideoTapOrClick={handleVideoTapOrClick}
              onControlsMouseEnter={() => {
                isInteractingWithControlsRef.current = true;
                resetInactivityTimer();
              }}
              onControlsMouseLeave={() => {
                isInteractingWithControlsRef.current = false;
                resetInactivityTimer();
              }}
              onControlsFocus={() => {
                isControlsFocusedRef.current = true;
                resetInactivityTimer();
              }}
              onControlsBlur={() => {
                isControlsFocusedRef.current = false;
                resetInactivityTimer();
              }}
            />
          )}

          {/* Tab Content: Media Library View */}
          {activeTab === 'library' && !isPlayerFullscreen && (
            <LibraryView
              libraryItems={libraryItems}
              onImportFiles={handleImportFiles}
              onOpenMedia={openMediaWithResumeCheck}
              onRemoveMedia={handleRemoveMedia}
              onOpenAddToPlaylist={(item) => {
                setMediaForPlaylistAdd(item);
                if (playlists.length > 0 && playlists[0]) {
                  setTargetPlaylistIdForAdd(playlists[0].id);
                }
              }}
            />
          )}

          {/* Tab Content: Playlists View */}
          {activeTab === 'playlists' && !isPlayerFullscreen && (
            <PlaylistsView
              playlists={playlists}
              selectedPlaylistId={selectedPlaylistId}
              selectedPlaylistDetails={selectedPlaylistDetails}
              activePlaylist={activePlaylist}
              onSelectPlaylist={setSelectedPlaylistId}
              onOpenNewPlaylistModal={() => {
                setNewPlaylistName('');
                setIsNewPlaylistModalOpen(true);
              }}
              onOpenRenamePlaylistModal={(pl) => {
                setPlaylistToRename(pl);
                setRenamePlaylistName(pl.name);
              }}
              onOpenDeletePlaylistModal={setPlaylistToDelete}
              onOpenAddFromLibraryModal={() => {
                setSelectedLibraryIds([]);
                setIsAddFromLibraryOpen(true);
              }}
              onPlayPlaylistItem={handlePlayPlaylistItem}
              onReorderItem={handleReorderItem}
              onRemovePlaylistItem={handleRemovePlaylistItem}
            />
          )}

          {/* Tab Content: Recent Playback View */}
          {activeTab === 'recent' && !isPlayerFullscreen && (
            <RecentView
              recentItems={recentItems}
              onOpenMedia={openMediaWithResumeCheck}
              onOpenFile={handleOpenFile}
            />
          )}

          {/* Tab Content: System Settings / Diagnostics View */}
          {activeTab === 'settings' && !isPlayerFullscreen && (
            <SettingsView
              settings={settings}
              onUpdateSetting={handleUpdateSetting}
              onResetSettings={handleResetSettings}
              onExportSettings={handleExportSettings}
              onImportSettings={handleImportSettings}
              playbackStatus={playbackStatus}
              nativePoc={nativePoc}
              playerStatus={playerStatus}
              isFullscreen={isAppFullscreen || isPlayerFullscreen}
            />
          )}

          {/* Modals */}
          <NewPlaylistModal
            isOpen={isNewPlaylistModalOpen}
            playlistName={newPlaylistName}
            onChangeName={setNewPlaylistName}
            onClose={() => setIsNewPlaylistModalOpen(false)}
            onSubmit={handleCreatePlaylist}
          />

          <RenamePlaylistModal
            playlist={playlistToRename}
            playlistName={renamePlaylistName}
            onChangeName={setRenamePlaylistName}
            onClose={() => setPlaylistToRename(null)}
            onSubmit={handleRenamePlaylist}
          />

          <DeletePlaylistModal
            playlist={playlistToDelete}
            onClose={() => setPlaylistToDelete(null)}
            onConfirm={handleDeletePlaylist}
          />

          <AddToPlaylistModal
            media={mediaForPlaylistAdd}
            playlists={playlists}
            targetPlaylistId={targetPlaylistIdForAdd}
            onChangeTargetPlaylist={setTargetPlaylistIdForAdd}
            onClose={() => setMediaForPlaylistAdd(null)}
            onAdd={handleAddMediaToPlaylist}
          />

          <AddFromLibraryModal
            isOpen={isAddFromLibraryOpen && selectedPlaylistDetails !== null}
            playlistName={selectedPlaylistDetails?.playlist.name ?? ''}
            libraryItems={libraryItems}
            existingMediaIds={selectedPlaylistDetails?.items.map((pi) => pi.mediaId) ?? []}
            selectedLibraryIds={selectedLibraryIds}
            onToggleSelect={(id) => {
              setSelectedLibraryIds((prev) =>
                prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
              );
            }}
            onClose={() => setIsAddFromLibraryOpen(false)}
            onSubmit={handleAddFromLibrary}
          />
        </section>

        {/* Hovering Playback Island (Bottom Mini Player Pill) */}
        {settings.showHoverIsland &&
          activeTab !== 'player' &&
          !isPlayerFullscreen &&
          Boolean(playbackStatus.currentFile && playbackStatus.mediaState !== 'idle') && (
            <FloatingIsland
              playbackStatus={playbackStatus}
              activePlaylist={activePlaylist}
              thumbnailKey={currentThumbnailKey}
              onNavigateToPlayer={() => setActiveTab('player')}
              onTogglePlayPause={handleTogglePlayPause}
              onToggleMute={handleToggleMute}
              onPlayNext={activePlaylist ? handlePlayNextPlaylistItem : undefined}
              onPlayPrev={activePlaylist ? handlePlayPrevPlaylistItem : undefined}
            />
          )}
      </main>
    </div>
  );
};

export default App;
