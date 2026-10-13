import React from 'react';
import {
  Library,
  FolderPlus,
  ListMusic,
  Trash2,
} from 'lucide-react';
import type { MediaItem } from '../types/electron';
import { formatTime, formatBytes, formatDate } from '../utils/formatters';
import { VideoThumbnail } from './VideoThumbnail';

interface LibraryViewProps {
  libraryItems: MediaItem[];
  showThumbnails?: boolean;
  onImportFiles: () => void;
  onOpenMedia: (filePath: string) => void;
  onRemoveMedia: (id: string, e: React.MouseEvent) => void;
  onOpenAddToPlaylist: (item: MediaItem) => void;
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  libraryItems,
  showThumbnails = true,
  onImportFiles,
  onOpenMedia,
  onRemoveMedia,
  onOpenAddToPlaylist,
}) => {
  return (
    <div className="flex-1 min-h-0 h-full overflow-y-auto p-7 flex flex-col gap-6 max-w-[1400px] mx-auto w-full select-none">
      <div className="flex items-center justify-between pb-4 border-b border-border">
        <div className="flex items-center gap-3">
          <Library size={22} className="text-primary" />
          <h2 className="text-xl font-bold text-foreground">Media Library</h2>
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-primary-container text-on-primary-container font-medium">
            {libraryItems.length} videos
          </span>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shadow hover:scale-[1.02] active:scale-[0.98] transition-transform cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary border-none"
          onClick={onImportFiles}
          aria-label="Import video files to library"
        >
          <FolderPlus size={16} />
          <span>Import Media</span>
        </button>
      </div>

      {libraryItems.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-12 text-muted-foreground my-auto">
          <div className="w-16 h-16 rounded-2xl bg-surface-muted border border-border flex items-center justify-center text-primary/60">
            <Library size={36} />
          </div>
          <h3 className="text-lg font-semibold text-foreground">Your Library is Empty</h3>
          <p className="text-sm max-w-sm">Import video files from disk to build your persistent local media collection.</p>
          <button
            type="button"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm shadow hover:scale-[1.02] active:scale-[0.98] transition-transform cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary border-none"
            onClick={onImportFiles}
          >
            <FolderPlus size={18} />
            <span>Import Videos</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-4 max-2xl:grid-cols-3 max-lg:grid-cols-2 max-sm:grid-cols-1 gap-4">
          {libraryItems.map((item) => (
            <div
              key={item.id}
              className={`rounded-xl overflow-hidden bg-surface border border-border hover:border-primary/50 hover:shadow-md transition-all duration-200 cursor-pointer group flex flex-col ${
                item.isMissing ? 'opacity-50' : ''
              }`}
              onClick={() => !item.isMissing && onOpenMedia(item.filePath)}
            >
              <div className="aspect-video w-full relative bg-surface-dim overflow-hidden flex items-center justify-center">
                <VideoThumbnail
                  thumbnailKey={item.thumbnailKey}
                  mediaId={item.id}
                  fileName={item.fileName}
                  showThumbnails={showThumbnails}
                  fallbackIconSize={28}
                  imgClassName="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                {item.duration && (
                  <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/80 backdrop-blur text-[10px] font-mono font-medium text-white">
                    {formatTime(item.duration)}
                  </span>
                )}
                {item.isMissing && (
                  <span className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded bg-destructive text-white text-[10px] font-bold">
                    Missing File
                  </span>
                )}
              </div>
              <div className="p-3.5 flex flex-col gap-1.5 flex-1">
                <div className="text-sm font-semibold text-foreground truncate" title={item.fileName}>
                  {item.fileName}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span>{formatBytes(item.fileSize)}</span>
                  <span>&bull;</span>
                  <span>Added {formatDate(item.firstAdded)}</span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap mt-1">
                  {item.videoHeight && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary-container text-on-primary-container font-mono font-semibold">
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
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-muted text-muted-foreground font-mono" title="Video Codec">
                      {item.videoCodec.split(' ')[0]}
                    </span>
                  )}
                  {item.audioCodec && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-muted text-muted-foreground font-mono" title="Audio Codec">
                      {item.audioCodec.split(' ')[0]}
                    </span>
                  )}
                  {item.fps && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-muted text-muted-foreground font-mono">
                      {Math.round(item.fps)} fps
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-end gap-1 px-3 py-2 border-t border-border bg-surface-muted/50">
                <button
                  type="button"
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-surface-elevated transition-colors cursor-pointer border-none bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenAddToPlaylist(item);
                  }}
                  title="Add to Playlist"
                  aria-label="Add to Playlist"
                >
                  <ListMusic size={15} />
                </button>
                <button
                  type="button"
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer border-none bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-destructive"
                  onClick={(e) => onRemoveMedia(item.id, e)}
                  title="Remove from Library (File remains on disk)"
                  aria-label="Remove from Library"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
