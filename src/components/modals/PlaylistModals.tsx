import React from 'react';
import { X } from 'lucide-react';
import type { Playlist, MediaItem } from '../../types/electron';
import { formatTime, formatBytes } from '../../utils/formatters';

export interface NewPlaylistModalProps {
  isOpen: boolean;
  playlistName: string;
  onChangeName: (val: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}

export const NewPlaylistModal: React.FC<NewPlaylistModalProps> = ({
  isOpen,
  playlistName,
  onChangeName,
  onClose,
  onSubmit,
}) => {
  if (!isOpen) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">New Playlist</span>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close">
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
            value={playlistName}
            autoFocus
            onChange={(e) => onChangeName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSubmit();
              if (e.key === 'Escape') onClose();
            }}
          />
        </div>
        <div className="modal-footer">
          <button type="button" className="modal-btn secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="modal-btn primary"
            disabled={!playlistName.trim()}
            onClick={onSubmit}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
};

export interface RenamePlaylistModalProps {
  playlist: Playlist | null;
  playlistName: string;
  onChangeName: (val: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}

export const RenamePlaylistModal: React.FC<RenamePlaylistModalProps> = ({
  playlist,
  playlistName,
  onChangeName,
  onClose,
  onSubmit,
}) => {
  if (!playlist) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Rename Playlist</span>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close">
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
            value={playlistName}
            autoFocus
            onChange={(e) => onChangeName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSubmit();
              if (e.key === 'Escape') onClose();
            }}
          />
        </div>
        <div className="modal-footer">
          <button type="button" className="modal-btn secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="modal-btn primary"
            disabled={!playlistName.trim()}
            onClick={onSubmit}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

export interface DeletePlaylistModalProps {
  playlist: Playlist | null;
  onClose: () => void;
  onConfirm: () => void;
}

export const DeletePlaylistModal: React.FC<DeletePlaylistModalProps> = ({
  playlist,
  onClose,
  onConfirm,
}) => {
  if (!playlist) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Delete Playlist</span>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: '14px', lineHeight: '1.5' }}>
            Are you sure you want to delete <strong>{playlist.name}</strong>?
          </p>
          <p style={{ fontSize: '12px', color: 'var(--md-sys-color-on-surface-variant)', lineHeight: '1.4' }}>
            This will only delete the playlist container. Your video files on disk and library entries will remain completely safe and untouched.
          </p>
        </div>
        <div className="modal-footer">
          <button type="button" className="modal-btn secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="modal-btn danger" onClick={onConfirm}>
            Delete Playlist
          </button>
        </div>
      </div>
    </div>
  );
};

export interface AddToPlaylistModalProps {
  media: MediaItem | null;
  playlists: Playlist[];
  targetPlaylistId: string;
  onChangeTargetPlaylist: (val: string) => void;
  onClose: () => void;
  onAdd: (playlistId: string, mediaId: string) => void;
}

export const AddToPlaylistModal: React.FC<AddToPlaylistModalProps> = ({
  media,
  playlists,
  targetPlaylistId,
  onChangeTargetPlaylist,
  onClose,
  onAdd,
}) => {
  if (!media) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Add to Playlist</span>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--md-sys-color-on-surface)' }}>
            {media.fileName}
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
                value={targetPlaylistId || (playlists[0]?.id ?? '')}
                onChange={(e) => onChangeTargetPlaylist(e.target.value)}
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
          <button type="button" className="modal-btn secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="modal-btn primary"
            disabled={playlists.length === 0}
            onClick={() => {
              const plId = targetPlaylistId || playlists[0]?.id;
              if (plId) {
                onAdd(plId, media.id);
              }
            }}
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
};

export interface AddFromLibraryModalProps {
  isOpen: boolean;
  playlistName: string;
  libraryItems: MediaItem[];
  existingMediaIds: string[];
  selectedLibraryIds: string[];
  onToggleSelect: (id: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}

export const AddFromLibraryModal: React.FC<AddFromLibraryModalProps> = ({
  isOpen,
  playlistName,
  libraryItems,
  existingMediaIds,
  selectedLibraryIds,
  onToggleSelect,
  onClose,
  onSubmit,
}) => {
  if (!isOpen) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-container"
        style={{ width: '560px', maxHeight: '80vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <span className="modal-title">
            Add Videos to &ldquo;{playlistName}&rdquo;
          </span>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close">
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
                const isAlreadyInPlaylist = existingMediaIds.includes(libItem.id);
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
                      if (!isAlreadyInPlaylist) onToggleSelect(libItem.id);
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
          <button type="button" className="modal-btn secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="modal-btn primary"
            disabled={selectedLibraryIds.length === 0}
            onClick={onSubmit}
          >
            Add Selected ({selectedLibraryIds.length})
          </button>
        </div>
      </div>
    </div>
  );
};
