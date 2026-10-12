import React from 'react';
import {
  ListMusic,
  Plus,
  Edit2,
  Trash2,
  Play,
  Video,
  Film,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import type { Playlist, PlaylistItem } from '../types/electron';
import type { ActivePlaylistState } from './PlayerView';
import { formatTime } from '../utils/formatters';

interface PlaylistsViewProps {
  playlists: Playlist[];
  selectedPlaylistId: string | null;
  selectedPlaylistDetails: { playlist: Playlist; items: PlaylistItem[] } | null;
  activePlaylist: ActivePlaylistState | null;
  onSelectPlaylist: (id: string) => void;
  onOpenNewPlaylistModal: () => void;
  onOpenRenamePlaylistModal: (pl: Playlist) => void;
  onOpenDeletePlaylistModal: (pl: Playlist) => void;
  onOpenAddFromLibraryModal: () => void;
  onPlayPlaylistItem: (playlist: Playlist, items: PlaylistItem[], index: number) => void;
  onReorderItem: (playlistId: string, fromIndex: number, toIndex: number) => void;
  onRemovePlaylistItem: (playlistId: string, mediaId: string) => void;
}

export const PlaylistsView: React.FC<PlaylistsViewProps> = ({
  playlists,
  selectedPlaylistId,
  selectedPlaylistDetails,
  activePlaylist,
  onSelectPlaylist,
  onOpenNewPlaylistModal,
  onOpenRenamePlaylistModal,
  onOpenDeletePlaylistModal,
  onOpenAddFromLibraryModal,
  onPlayPlaylistItem,
  onReorderItem,
  onRemovePlaylistItem,
}) => {
  return (
    <div className="flex-1 min-h-0 overflow-hidden flex h-full w-full select-none">
      {/* Playlists Sidebar */}
      <div className="w-[280px] min-w-[280px] bg-surface-muted/50 border-r border-border flex flex-col p-4 gap-4 overflow-y-auto shrink-0 h-full">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Playlists ({playlists.length})
          </span>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-semibold text-xs shadow hover:scale-[1.02] active:scale-[0.98] transition-transform cursor-pointer border-none outline-none focus-visible:ring-2 focus-visible:ring-primary"
            onClick={onOpenNewPlaylistModal}
            aria-label="Create new playlist"
          >
            <Plus size={14} />
            <span>New</span>
          </button>
        </div>

        {playlists.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-6 text-muted-foreground my-auto">
            <ListMusic size={32} className="text-primary/50" />
            <p className="text-xs">No playlists yet. Create your first playlist!</p>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {playlists.map((pl) => (
              <div
                key={pl.id}
                className={`rounded-xl p-3 border transition-all cursor-pointer flex items-center justify-between gap-2 group ${
                  selectedPlaylistId === pl.id
                    ? 'bg-primary-container text-on-primary-container border-primary/30 shadow-sm'
                    : 'bg-surface border-border hover:bg-surface-elevated text-foreground'
                }`}
                onClick={() => onSelectPlaylist(pl.id)}
              >
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-sm font-semibold truncate" title={pl.name}>
                    {pl.name}
                  </span>
                  <span className="text-[11px] opacity-75">
                    {pl.itemCount ?? 0} {pl.itemCount === 1 ? 'video' : 'videos'}
                  </span>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="p-1 rounded text-muted-foreground hover:text-primary hover:bg-surface-muted border-none bg-transparent cursor-pointer"
                    onClick={() => onOpenRenamePlaylistModal(pl)}
                    title="Rename Playlist"
                    aria-label="Rename Playlist"
                  >
                    <Edit2 size={12} />
                  </button>
                  <button
                    type="button"
                    className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 border-none bg-transparent cursor-pointer"
                    onClick={() => onOpenDeletePlaylistModal(pl)}
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
      <div className="flex-1 flex flex-col overflow-y-auto p-7 gap-6 max-w-[1200px]">
        {!selectedPlaylistDetails ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-12 text-muted-foreground my-auto">
            <div className="w-16 h-16 rounded-2xl bg-surface-muted border border-border flex items-center justify-center text-primary/60">
              <ListMusic size={36} />
            </div>
            <h3 className="text-lg font-semibold text-foreground">No Playlist Selected</h3>
            <p className="text-sm max-w-sm">Select a playlist from the sidebar or create a new one to view and manage items.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between pb-4 border-b border-border">
              <div>
                <h3 className="text-2xl font-bold text-foreground">{selectedPlaylistDetails.playlist.name}</h3>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                  <span>{selectedPlaylistDetails.items.length} videos</span>
                  <span>&bull;</span>
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
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-semibold text-sm shadow hover:scale-[1.02] active:scale-[0.98] transition-transform cursor-pointer border-none disabled:opacity-40 disabled:cursor-not-allowed outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  disabled={selectedPlaylistDetails.items.length === 0}
                  onClick={() => {
                    if (selectedPlaylistDetails.items.length > 0) {
                      onPlayPlaylistItem(
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
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-surface-elevated hover:bg-surface-muted text-foreground border border-border font-medium text-sm transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  onClick={onOpenAddFromLibraryModal}
                  aria-label="Add videos from library"
                >
                  <Plus size={14} />
                  <span>Add Videos</span>
                </button>
              </div>
            </div>

            {selectedPlaylistDetails.items.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-12 text-muted-foreground my-auto">
                <div className="w-16 h-16 rounded-2xl bg-surface-muted border border-border flex items-center justify-center text-primary/60">
                  <Video size={36} />
                </div>
                <h3 className="text-lg font-semibold text-foreground">Playlist is Empty</h3>
                <p className="text-sm max-w-sm">Add media items from your library to start building this playlist.</p>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm shadow hover:scale-[1.02] active:scale-[0.98] transition-transform cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary border-none"
                  onClick={onOpenAddFromLibraryModal}
                >
                  <Plus size={16} />
                  <span>Add Videos from Library</span>
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {selectedPlaylistDetails.items.map((item, idx) => {
                  const isCurrentlyPlaying =
                    activePlaylist?.playlistId === selectedPlaylistDetails.playlist.id &&
                    activePlaylist?.currentIndex === idx;
                  return (
                    <div
                      key={item.id}
                      className={`rounded-xl p-3 bg-surface border border-border hover:border-primary/50 transition-all flex items-center gap-3.5 group ${
                        isCurrentlyPlaying ? 'border-primary ring-1 ring-primary/40 bg-primary-container/20' : ''
                      } ${item.media?.isMissing ? 'opacity-50' : ''}`}
                    >
                      <span className="text-xs font-mono text-muted-foreground w-6 text-center">{idx + 1}</span>
                      <div className="w-16 h-10 rounded-lg bg-surface-dim overflow-hidden shrink-0 flex items-center justify-center relative">
                        {item.media?.thumbnailKey ? (
                          <img
                            src={`nosved-thumb://${item.media.thumbnailKey}`}
                            alt={item.media.fileName}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.currentTarget as HTMLElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="text-muted-foreground">
                            <Film size={16} />
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-sm font-medium text-foreground truncate" title={item.media?.fileName}>
                          {item.media?.fileName ?? 'Unknown file'}
                        </span>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{formatTime(item.media?.duration)}</span>
                          {item.media?.videoHeight && (
                            <>
                              <span>&bull;</span>
                              <span>
                                {item.media.videoHeight >= 1080
                                  ? `${item.media.videoHeight}p`
                                  : `${item.media.videoWidth}x${item.media.videoHeight}`}
                              </span>
                            </>
                          )}
                          {item.media?.isMissing && (
                            <span className="text-destructive font-bold text-[10px]">
                              Missing
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          className="p-1 rounded text-muted-foreground hover:text-primary hover:bg-surface-elevated disabled:opacity-20 cursor-pointer border-none bg-transparent"
                          disabled={idx === 0}
                          onClick={() =>
                            onReorderItem(
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
                          className="p-1 rounded text-muted-foreground hover:text-primary hover:bg-surface-elevated disabled:opacity-20 cursor-pointer border-none bg-transparent"
                          disabled={idx === selectedPlaylistDetails.items.length - 1}
                          onClick={() =>
                            onReorderItem(
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
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center cursor-pointer hover:scale-105 transition-transform disabled:opacity-40 border-none outline-none focus-visible:ring-2 focus-visible:ring-primary"
                          disabled={item.media?.isMissing}
                          onClick={() =>
                            onPlayPlaylistItem(
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
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer border-none bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-destructive"
                          onClick={() =>
                            onRemovePlaylistItem(
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
  );
};
