import { useState, useCallback, useEffect, useRef } from 'react';
import type { Playlist, PlaylistItem, MediaItem, PlaybackStatus } from '../types/electron';
import type { ActivePlaylistState } from '../components/PlayerView';

interface UsePlaylistsProps {
  activeTab: string;
  playbackStatus: PlaybackStatus;
  onPlayFile: (filePath: string) => Promise<void> | void;
}

export function usePlaylists({ activeTab, playbackStatus, onPlayFile }: UsePlaylistsProps) {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [selectedPlaylistDetails, setSelectedPlaylistDetails] = useState<{
    playlist: Playlist;
    items: PlaylistItem[];
  } | null>(null);
  const [activePlaylist, setActivePlaylist] = useState<ActivePlaylistState | null>(null);

  // Modals state
  const [isNewPlaylistModalOpen, setIsNewPlaylistModalOpen] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [playlistToRename, setPlaylistToRename] = useState<Playlist | null>(null);
  const [renamePlaylistName, setRenamePlaylistName] = useState('');
  const [playlistToDelete, setPlaylistToDelete] = useState<Playlist | null>(null);
  const [mediaForPlaylistAdd, setMediaForPlaylistAdd] = useState<MediaItem | null>(null);
  const [targetPlaylistIdForAdd, setTargetPlaylistIdForAdd] = useState('');
  const [isAddFromLibraryOpen, setIsAddFromLibraryOpen] = useState(false);
  const [selectedLibraryIds, setSelectedLibraryIds] = useState<string[]>([]);

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
    refreshPlaylists();
  }, [refreshPlaylists]);

  useEffect(() => {
    if (activeTab === 'playlists' || activeTab === 'home') {
      refreshPlaylists();
    }
  }, [activeTab, refreshPlaylists]);

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
          window.nosvedAPI
            .loadFile(targetPath)
            .then(() => {
              window.nosvedAPI?.play();
            })
            .catch(console.error);
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
      await onPlayFile(nextItem.media.filePath);
    }
  }, [activePlaylist, onPlayFile]);

  const handlePlayPrevPlaylistItem = useCallback(async () => {
    if (!activePlaylist || activePlaylist.currentIndex <= 0 || !window.nosvedAPI) return;
    const prevIdx = activePlaylist.currentIndex - 1;
    const prevItem = activePlaylist.items[prevIdx];
    if (prevItem && prevItem.media && !prevItem.media.isMissing && prevItem.media.filePath) {
      setActivePlaylist((curr) => (curr ? { ...curr, currentIndex: prevIdx } : null));
      await onPlayFile(prevItem.media.filePath);
    }
  }, [activePlaylist, onPlayFile]);

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
      await onPlayFile(item.media.filePath);
    },
    [onPlayFile]
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

  return {
    playlists,
    selectedPlaylistId,
    setSelectedPlaylistId,
    selectedPlaylistDetails,
    activePlaylist,
    setActivePlaylist,
    isNewPlaylistModalOpen,
    setIsNewPlaylistModalOpen,
    newPlaylistName,
    setNewPlaylistName,
    playlistToRename,
    setPlaylistToRename,
    renamePlaylistName,
    setRenamePlaylistName,
    playlistToDelete,
    setPlaylistToDelete,
    mediaForPlaylistAdd,
    setMediaForPlaylistAdd,
    targetPlaylistIdForAdd,
    setTargetPlaylistIdForAdd,
    isAddFromLibraryOpen,
    setIsAddFromLibraryOpen,
    selectedLibraryIds,
    setSelectedLibraryIds,
    refreshPlaylists,
    refreshPlaylistDetails,
    handleCreatePlaylist,
    handleRenamePlaylist,
    handleDeletePlaylist,
    handleAddMediaToPlaylist,
    handleAddFromLibrary,
    handleRemovePlaylistItem,
    handleReorderItem,
    handlePlayPlaylistItem,
    handlePlayNextPlaylistItem,
    handlePlayPrevPlaylistItem,
  };
}
