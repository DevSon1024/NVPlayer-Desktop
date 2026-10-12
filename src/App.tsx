import React, { useEffect, useState } from 'react';
import { Film, ArrowLeft } from 'lucide-react';
import { Navbar, TabType } from './components/Navbar';
import { PlayerView } from './components/PlayerView';
import { HomeView } from './components/HomeView';
import { FloatingIsland } from './components/FloatingIsland';
import { LibraryView } from './components/LibraryView';
import { PlaylistsView } from './components/PlaylistsView';
import { RecentView } from './components/RecentView';
import { SettingsView } from './components/SettingsView';
import {
  NewPlaylistModal,
  RenamePlaylistModal,
  DeletePlaylistModal,
  AddToPlaylistModal,
  AddFromLibraryModal,
} from './components/modals/PlaylistModals';

import { useAppSettings } from './hooks/useAppSettings';
import { useMediaLibrary } from './hooks/useMediaLibrary';
import { usePlayerState } from './hooks/usePlayerState';
import { useFullscreen } from './hooks/useFullscreen';
import { usePlaylists } from './hooks/usePlaylists';

const FULLSCREEN_SHORTCUT_KEY = 'KeyF';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [previousTab, setPreviousTab] = useState<TabType>('home');

  const handleNavigateTab = (tab: TabType) => {
    if (activeTab !== 'player') {
      setPreviousTab(activeTab);
    }
    setActiveTab(tab);
  };

  const {
    appInfo,
    nativePoc,
    settings,
    isIsolated,
    handleUpdateSetting,
    handleResetSettings,
    handleExportSettings,
    handleImportSettings,
  } = useAppSettings();

  const {
    libraryItems,
    recentItems,
    handleImportFiles,
    handleRemoveMedia,
  } = useMediaLibrary(activeTab);

  const {
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
  } = usePlayerState({
    resumePlaybackPrompt: settings.resumePlaybackPrompt,
    onNavigateToPlayer: () => {
      setPreviousTab((prev) => (prev === 'player' ? 'home' : prev));
      setActiveTab('player');
    },
  });

  const {
    isAppFullscreen,
    isPlayerFullscreen,
    setIsPlayerFullscreen,
    showOverlay,
    videoViewportRef,
    resetInactivityTimer,
    triggerPlayerFullscreenToggle,
    handleExitPlayerFullscreen,
    handleToggleAppFullscreen,
    handleVideoTapOrClick,
    handleControlsMouseEnter,
    handleControlsMouseLeave,
    handleControlsFocus,
    handleControlsBlur,
  } = useFullscreen({
    activeTab,
    setActiveTab,
    playbackStatus,
    isScrubbing,
    isTrackModalOpen,
    resumePrompt,
  });

  const {
    playlists,
    selectedPlaylistId,
    setSelectedPlaylistId,
    selectedPlaylistDetails,
    activePlaylist,
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
  } = usePlaylists({
    activeTab,
    playbackStatus,
    onPlayFile: async (filePath) => {
      await openMediaWithResumeCheck(filePath);
    },
  });

  // Auto-redirect to Home if user lands on Player tab without active media
  useEffect(() => {
    if (activeTab === 'player' && (!playbackStatus.currentFile || playbackStatus.mediaState === 'idle')) {
      setActiveTab('home');
    }
  }, [activeTab, playbackStatus.currentFile, playbackStatus.mediaState]);

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
      } else if (e.key === 'Backspace') {
        if (activeTab === 'player') {
          e.preventDefault();
          if (resumePrompt) {
            setResumePrompt(null);
          } else if (isPlayerFullscreen) {
            handleExitPlayerFullscreen();
          } else {
            setActiveTab(previousTab || 'home');
          }
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
    setResumePrompt,
    setIsPlayerFullscreen,
    handleToggleAppFullscreen,
    triggerPlayerFullscreenToggle,
    handleExitPlayerFullscreen,
    handleTogglePlayPause,
    handleToggleMute,
    setPlaybackStatus,
    resetInactivityTimer,
    settings.seekStepSeconds,
  ]);

  const isDesktopBridge = typeof window !== 'undefined' && typeof window.nosvedAPI !== 'undefined';

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
      {/* Navigation Rail / Sidebar: Hidden in Now Playing view and in Player Fullscreen */}
      {!isPlayerFullscreen && activeTab !== 'player' && (
        <Navbar
          activeTab={activeTab}
          onSelectTab={handleNavigateTab}
          isIsolated={isIsolated}
          isElectron={isDesktopBridge}
        />
      )}

      {/* Main Viewport Content */}
      <main className={`flex-1 flex flex-col h-full overflow-hidden bg-background main-viewport ${isPlayerFullscreen ? 'player-fullscreen-mode bg-black border-none' : ''}`}>
        {/* Viewport Top Header: Only shown on Now Playing screen; hidden on all dashboard workspaces */}
        {!isPlayerFullscreen && activeTab === 'player' && (
          <header className="flex items-center justify-between border-b border-border bg-surface/70 backdrop-blur-md sticky top-0 z-10 viewport-header h-11 min-h-11 px-5 transition-all">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setActiveTab(previousTab || 'home')}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface-muted hover:bg-surface-elevated hover:text-primary text-foreground text-xs font-semibold border border-border transition-colors cursor-pointer"
                title="Back to previous screen (Backspace)"
              >
                <ArrowLeft size={15} />
                <span>Back</span>
              </button>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
                <span>Desktop Engine Ready</span>
              </div>
            </div>

            {playbackStatus.currentFile && (
              <div
                className="flex items-center gap-2 px-3 py-1 bg-surface-muted/70 border border-border/80 rounded-full text-foreground text-xs max-w-[520px] shadow-sm"
                title={playbackStatus.currentFile}
              >
                <Film size={13} className="text-primary shrink-0" />
                <span className="max-w-[360px] truncate font-medium">
                  {playbackStatus.currentFile.split(/[/\\]/).pop() || playbackStatus.currentFile}
                </span>
                {playbackStatus.videoWidth && playbackStatus.videoHeight && (
                  <span className="font-mono text-[10px] font-semibold px-1.5 py-0.2 bg-primary/15 border border-primary/30 rounded text-primary shrink-0">
                    {playbackStatus.videoWidth}x{playbackStatus.videoHeight}
                  </span>
                )}
              </div>
            )}

            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-muted-foreground bg-surface-elevated px-2 py-0.5 rounded border border-border">
                {appInfo ? `${appInfo.platform}-${appInfo.arch}` : 'win32-x64'}
              </span>
              <span className="font-mono text-[10px] text-primary bg-surface-elevated px-2 py-0.5 rounded border border-border">
                v{appInfo?.version || '0.1.0'}
              </span>
            </div>
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
              onNavigateTab={handleNavigateTab}
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
              onNavigateBack={() => {
                if (isPlayerFullscreen) {
                  handleExitPlayerFullscreen();
                }
                setActiveTab(previousTab || 'home');
              }}
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
              onControlsMouseEnter={handleControlsMouseEnter}
              onControlsMouseLeave={handleControlsMouseLeave}
              onControlsFocus={handleControlsFocus}
              onControlsBlur={handleControlsBlur}
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
              onNavigateToPlayer={() => {
                setPreviousTab(activeTab);
                setActiveTab('player');
              }}
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
