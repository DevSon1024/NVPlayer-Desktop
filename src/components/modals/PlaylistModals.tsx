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
    <div className="fixed inset-0 bg-black/65 backdrop-blur-sm flex items-center justify-center z-50 p-4 select-none" onClick={onClose}>
      <div className="bg-surface border border-border rounded-2xl p-6 shadow-2xl flex flex-col gap-4 w-full max-w-[420px]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between pb-2 border-b border-border">
          <span className="text-base font-bold text-foreground">New Playlist</span>
          <button type="button" className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-elevated transition-colors cursor-pointer border-none bg-transparent" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="new-playlist-input" className="text-xs font-medium text-muted-foreground">
            Playlist Name
          </label>
          <input
            id="new-playlist-input"
            type="text"
            className="w-full px-3.5 py-2.5 rounded-xl bg-surface-muted border border-border text-foreground text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
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
        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button type="button" className="px-4 py-2 rounded-xl bg-surface-elevated hover:bg-surface-muted text-foreground border border-border text-sm font-medium transition-colors cursor-pointer" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shadow hover:scale-[1.02] active:scale-[0.98] transition-transform cursor-pointer border-none disabled:opacity-40 disabled:cursor-not-allowed"
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
    <div className="fixed inset-0 bg-black/65 backdrop-blur-sm flex items-center justify-center z-50 p-4 select-none" onClick={onClose}>
      <div className="bg-surface border border-border rounded-2xl p-6 shadow-2xl flex flex-col gap-4 w-full max-w-[420px]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between pb-2 border-b border-border">
          <span className="text-base font-bold text-foreground">Rename Playlist</span>
          <button type="button" className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-elevated transition-colors cursor-pointer border-none bg-transparent" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="rename-playlist-input" className="text-xs font-medium text-muted-foreground">
            Playlist Name
          </label>
          <input
            id="rename-playlist-input"
            type="text"
            className="w-full px-3.5 py-2.5 rounded-xl bg-surface-muted border border-border text-foreground text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
            value={playlistName}
            autoFocus
            onChange={(e) => onChangeName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSubmit();
              if (e.key === 'Escape') onClose();
            }}
          />
        </div>
        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button type="button" className="px-4 py-2 rounded-xl bg-surface-elevated hover:bg-surface-muted text-foreground border border-border text-sm font-medium transition-colors cursor-pointer" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shadow hover:scale-[1.02] active:scale-[0.98] transition-transform cursor-pointer border-none disabled:opacity-40 disabled:cursor-not-allowed"
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
    <div className="fixed inset-0 bg-black/65 backdrop-blur-sm flex items-center justify-center z-50 p-4 select-none" onClick={onClose}>
      <div className="bg-surface border border-border rounded-2xl p-6 shadow-2xl flex flex-col gap-4 w-full max-w-[420px]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between pb-2 border-b border-border">
          <span className="text-base font-bold text-foreground">Delete Playlist</span>
          <button type="button" className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-elevated transition-colors cursor-pointer border-none bg-transparent" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-sm text-foreground leading-relaxed">
            Are you sure you want to delete <strong className="text-primary">{playlist.name}</strong>?
          </p>
          <p className="text-xs text-muted-foreground leading-normal">
            This will only delete the playlist container. Your video files on disk and library entries will remain completely safe and untouched.
          </p>
        </div>
        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button type="button" className="px-4 py-2 rounded-xl bg-surface-elevated hover:bg-surface-muted text-foreground border border-border text-sm font-medium transition-colors cursor-pointer" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="px-4 py-2 rounded-xl bg-destructive text-white text-sm font-semibold shadow hover:scale-[1.02] active:scale-[0.98] transition-transform cursor-pointer border-none" onClick={onConfirm}>
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
    <div className="fixed inset-0 bg-black/65 backdrop-blur-sm flex items-center justify-center z-50 p-4 select-none" onClick={onClose}>
      <div className="bg-surface border border-border rounded-2xl p-6 shadow-2xl flex flex-col gap-4 w-full max-w-[420px]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between pb-2 border-b border-border">
          <span className="text-base font-bold text-foreground">Add to Playlist</span>
          <button type="button" className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-elevated transition-colors cursor-pointer border-none bg-transparent" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="flex flex-col gap-3">
          <p className="text-sm font-semibold text-foreground truncate">
            {media.fileName}
          </p>
          {playlists.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No playlists exist yet. Please create a playlist first in the Playlists tab.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Choose Playlist:
              </label>
              <select
                className="w-full px-3.5 py-2.5 rounded-xl bg-surface-muted border border-border text-foreground text-sm outline-none focus:border-primary transition-colors cursor-pointer"
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
        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button type="button" className="px-4 py-2 rounded-xl bg-surface-elevated hover:bg-surface-muted text-foreground border border-border text-sm font-medium transition-colors cursor-pointer" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shadow hover:scale-[1.02] active:scale-[0.98] transition-transform cursor-pointer border-none disabled:opacity-40 disabled:cursor-not-allowed"
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
    <div className="fixed inset-0 bg-black/65 backdrop-blur-sm flex items-center justify-center z-50 p-4 select-none" onClick={onClose}>
      <div
        className="bg-surface border border-border rounded-2xl p-6 shadow-2xl flex flex-col gap-4 w-full max-w-[560px] max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-2 border-b border-border">
          <span className="text-base font-bold text-foreground">
            Add Videos to &ldquo;{playlistName}&rdquo;
          </span>
          <button type="button" className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-elevated transition-colors cursor-pointer border-none bg-transparent" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto max-h-[50vh] flex flex-col gap-2 pr-1">
          {libraryItems.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">
              No media available in Library. Import media files first.
            </p>
          ) : (
            libraryItems.map((libItem) => {
              const isAlreadyInPlaylist = existingMediaIds.includes(libItem.id);
              const isSelected = selectedLibraryIds.includes(libItem.id);
              return (
                <div
                  key={libItem.id}
                  className={`flex items-center gap-3 p-3 rounded-xl transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-primary-container text-on-primary-container border border-primary/40'
                      : 'bg-surface-muted border border-border hover:bg-surface-elevated text-foreground'
                  } ${isAlreadyInPlaylist ? 'opacity-40 cursor-not-allowed' : ''}`}
                  onClick={() => {
                    if (!isAlreadyInPlaylist) onToggleSelect(libItem.id);
                  }}
                >
                  <input
                    type="checkbox"
                    className="accent-primary w-4 h-4 rounded cursor-pointer"
                    checked={isAlreadyInPlaylist || isSelected}
                    disabled={isAlreadyInPlaylist}
                    onChange={() => {}}
                  />
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-sm font-semibold truncate">
                      {libItem.fileName}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatTime(libItem.duration)} &bull; {formatBytes(libItem.fileSize)}
                      {isAlreadyInPlaylist && ' (Already in playlist)'}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-border">
          <button type="button" className="px-4 py-2 rounded-xl bg-surface-elevated hover:bg-surface-muted text-foreground border border-border text-sm font-medium transition-colors cursor-pointer" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shadow hover:scale-[1.02] active:scale-[0.98] transition-transform cursor-pointer border-none disabled:opacity-40 disabled:cursor-not-allowed"
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
