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
    <div className="playlists-view-container">
      {/* Playlists Sidebar */}
      <div className="playlists-sidebar">
        <div className="playlists-sidebar-header">
          <span className="playlists-sidebar-title">Playlists ({playlists.length})</span>
          <button
            type="button"
            className="new-playlist-btn"
            onClick={onOpenNewPlaylistModal}
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
                onClick={() => onSelectPlaylist(pl.id)}
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
                    onClick={() => onOpenRenamePlaylistModal(pl)}
                    title="Rename Playlist"
                    aria-label="Rename Playlist"
                  >
                    <Edit2 size={12} />
                  </button>
                  <button
                    type="button"
                    className="playlist-icon-btn delete"
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
                  className="add-videos-btn"
                  onClick={onOpenAddFromLibraryModal}
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
                  onClick={onOpenAddFromLibraryModal}
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
                          className="reorder-btn"
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
                      <div className="playlist-item-actions">
                        <button
                          type="button"
                          className="control-btn"
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
                          className="playlist-icon-btn delete"
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
