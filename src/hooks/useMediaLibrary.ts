import { useState, useCallback, useEffect } from 'react';
import type { MediaItem } from '../types/electron';

export function useMediaLibrary(activeTab: string) {
  const [libraryItems, setLibraryItems] = useState<MediaItem[]>([]);
  const [recentItems, setRecentItems] = useState<MediaItem[]>([]);

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

  useEffect(() => {
    refreshLibrary();
    refreshRecent();
  }, [refreshLibrary, refreshRecent]);

  useEffect(() => {
    if (activeTab === 'home') {
      refreshRecent();
      refreshLibrary();
    } else if (activeTab === 'library') {
      refreshLibrary();
    } else if (activeTab === 'recent') {
      refreshRecent();
    }
  }, [activeTab, refreshLibrary, refreshRecent]);

  return {
    libraryItems,
    recentItems,
    setLibraryItems,
    setRecentItems,
    refreshLibrary,
    refreshRecent,
    handleImportFiles,
    handleRemoveMedia,
  };
}
