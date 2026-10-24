import React, { useState } from 'react';
import { History, Play, FolderOpen, LayoutGrid, List } from 'lucide-react';
import type { MediaItem } from '../types/electron';
import { formatTime, formatDate } from '../utils/formatters';
import { VideoThumbnail } from './VideoThumbnail';

interface RecentViewProps {
  recentItems: MediaItem[];
  showThumbnails?: boolean;
  onOpenMedia: (filePath: string) => void;
  onOpenFile: () => void;
}

export const RecentView: React.FC<RecentViewProps> = ({
  recentItems,
  showThumbnails = true,
  onOpenMedia,
  onOpenFile,
}) => {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    try {
      return (localStorage.getItem('nosved_recent_view_mode') as 'grid' | 'list') || 'list';
    } catch {
      return 'list';
    }
  });

  const handleSetViewMode = (mode: 'grid' | 'list') => {
    setViewMode(mode);
    try {
      localStorage.setItem('nosved_recent_view_mode', mode);
    } catch {}
  };

  return (
    <div className="flex-1 min-h-0 h-full overflow-y-auto p-7 flex flex-col gap-6 max-w-[1400px] mx-auto w-full select-none">
      <div className="flex items-center justify-between pb-4 border-b border-border">
        <div className="flex items-center gap-3">
          <History size={22} className="text-primary" />
          <h2 className="text-xl font-bold text-foreground">Recently Played</h2>
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-primary-container text-on-primary-container font-medium">
            {recentItems.length} videos
          </span>
        </div>
        <div className="flex items-center gap-3">
          {/* View Mode Toggle */}
          <div className="flex items-center bg-surface-elevated border border-border rounded-xl p-0.5 shadow-sm">
            <button
              type="button"
              onClick={() => handleSetViewMode('list')}
              className={`p-1.5 rounded-lg transition cursor-pointer border-none ${
                viewMode === 'list'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground bg-transparent'
              }`}
              title="List View"
              aria-label="List View"
            >
              <List size={15} />
            </button>
            <button
              type="button"
              onClick={() => handleSetViewMode('grid')}
              className={`p-1.5 rounded-lg transition cursor-pointer border-none ${
                viewMode === 'grid'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground bg-transparent'
              }`}
              title="Grid View"
              aria-label="Grid View"
            >
              <LayoutGrid size={15} />
            </button>
          </div>

          <button
            type="button"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-surface-elevated hover:bg-surface-muted text-foreground border border-border text-sm font-semibold shadow-sm hover:scale-[1.02] active:scale-[0.98] transition-transform cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary"
            onClick={onOpenFile}
            aria-label="Open a video"
          >
            <FolderOpen size={16} />
            <span>Open Video</span>
          </button>
        </div>
      </div>

      {recentItems.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-12 text-muted-foreground my-auto">
          <div className="w-16 h-16 rounded-2xl bg-surface-muted border border-border flex items-center justify-center text-primary/60">
            <History size={36} />
          </div>
          <h3 className="text-lg font-semibold text-foreground">No Playback History Yet</h3>
          <p className="text-sm max-w-sm">Videos you play will automatically appear here with saved progress.</p>
          <button
            type="button"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm shadow hover:scale-[1.02] active:scale-[0.98] transition-transform cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary border-none"
            onClick={onOpenFile}
          >
            <FolderOpen size={18} />
            <span>Open a Video</span>
          </button>
        </div>
      ) : viewMode === 'list' ? (
        <div className="flex flex-col gap-2.5">
          {recentItems.map((item) => {
            const progressPercent =
              item.duration && item.lastPosition
                ? Math.min(100, Math.round((item.lastPosition / item.duration) * 100))
                : 0;
            return (
              <div
                key={item.id}
                className={`rounded-xl p-3.5 bg-surface border border-border hover:border-primary/50 hover:bg-surface-elevated transition-all duration-200 cursor-pointer flex items-center gap-4 group ${
                  item.isMissing ? 'opacity-50' : ''
                }`}
                onClick={() => !item.isMissing && onOpenMedia(item.filePath)}
              >
                <div className="w-24 sm:w-28 aspect-video rounded-lg overflow-hidden shrink-0 group-hover:scale-105 transition-transform relative bg-surface-dim flex items-center justify-center">
                  <VideoThumbnail
                    thumbnailKey={item.thumbnailKey}
                    mediaId={item.id}
                    fileName={item.fileName}
                    showThumbnails={showThumbnails}
                    fallbackIconSize={20}
                    imgClassName="w-full h-full object-cover"
                  />
                  {item.duration && (
                    <span className="absolute bottom-1 right-1 px-1.5 py-0.2 rounded bg-black/80 backdrop-blur text-[9px] font-mono font-medium text-white">
                      {formatTime(item.duration)}
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-1 flex-1 min-w-0">
                  <div className="text-sm font-semibold text-foreground truncate" title={item.filePath}>
                    {item.fileName}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                    <span>Last played: {formatDate(item.lastOpened)}</span>
                    {item.lastPosition && (
                      <>
                        <span className="opacity-50">&bull;</span>
                        <span>
                          Position: {formatTime(item.lastPosition)} / {formatTime(item.duration)}
                        </span>
                      </>
                    )}
                    {item.isMissing && (
                      <span className="px-2 py-0.5 rounded bg-destructive text-white font-bold text-[10px]">
                        File moved or deleted
                      </span>
                    )}
                  </div>
                  {progressPercent > 0 && (
                    <div className="w-full max-w-xs h-1 rounded-full bg-surface-muted overflow-hidden mt-1">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  )}
                </div>
                <div className="flex items-center shrink-0">
                  <button
                    type="button"
                    className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform disabled:opacity-40 disabled:cursor-not-allowed border-none outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer shadow"
                    disabled={item.isMissing}
                    title="Play video"
                  >
                    <Play size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Grid Mode View */
        <div className="grid grid-cols-4 max-2xl:grid-cols-3 max-lg:grid-cols-2 max-sm:grid-cols-1 gap-4">
          {recentItems.map((item) => {
            const progressPercent =
              item.duration && item.lastPosition
                ? Math.min(100, Math.round((item.lastPosition / item.duration) * 100))
                : 0;
            return (
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
                  {progressPercent > 0 && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/40">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow">
                      <Play size={20} />
                    </div>
                  </div>
                </div>
                <div className="p-3.5 flex flex-col gap-1.5 flex-1">
                  <div className="text-sm font-semibold text-foreground truncate" title={item.fileName}>
                    {item.fileName}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                    <span>Last played: {formatDate(item.lastOpened)}</span>
                    {item.lastPosition && (
                      <>
                        <span className="opacity-50">&bull;</span>
                        <span className="text-primary font-medium">At {formatTime(item.lastPosition)}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
