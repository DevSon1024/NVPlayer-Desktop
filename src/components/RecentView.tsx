import React from 'react';
import { History, Film, Play, FolderOpen } from 'lucide-react';
import type { MediaItem } from '../types/electron';
import { formatTime, formatDate } from '../utils/formatters';

interface RecentViewProps {
  recentItems: MediaItem[];
  onOpenMedia: (filePath: string) => void;
  onOpenFile: () => void;
}

export const RecentView: React.FC<RecentViewProps> = ({
  recentItems,
  onOpenMedia,
  onOpenFile,
}) => {
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
      ) : (
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
                <div className="w-10 h-10 rounded-xl bg-primary-container text-primary flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <Film size={20} />
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
                    className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform disabled:opacity-40 disabled:cursor-not-allowed border-none outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer"
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
      )}
    </div>
  );
};
