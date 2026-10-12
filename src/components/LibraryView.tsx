import React from 'react';
import {
  Library,
  FolderPlus,
  Film,
  ListMusic,
  Trash2,
} from 'lucide-react';
import type { MediaItem } from '../types/electron';
import { formatTime, formatBytes, formatDate } from '../utils/formatters';

interface LibraryViewProps {
  libraryItems: MediaItem[];
  onImportFiles: () => void;
  onOpenMedia: (filePath: string) => void;
  onRemoveMedia: (id: string, e: React.MouseEvent) => void;
  onOpenAddToPlaylist: (item: MediaItem) => void;
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  libraryItems,
  onImportFiles,
  onOpenMedia,
  onRemoveMedia,
  onOpenAddToPlaylist,
}) => {
  return (
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
          onClick={onImportFiles}
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
          <button type="button" className="open-file-btn" onClick={onImportFiles}>
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
              onClick={() => !item.isMissing && onOpenMedia(item.filePath)}
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
                    onOpenAddToPlaylist(item);
                  }}
                  title="Add to Playlist"
                  aria-label="Add to Playlist"
                >
                  <ListMusic size={14} />
                </button>
                <button
                  type="button"
                  className="card-action-btn delete"
                  onClick={(e) => onRemoveMedia(item.id, e)}
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
  );
};
