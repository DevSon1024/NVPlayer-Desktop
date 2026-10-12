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
    <div className="recent-view-container">
      <div className="view-header-bar">
        <div className="view-header-title-group">
          <History size={20} className="view-header-icon" />
          <h2 className="view-title">Recently Played</h2>
          <span className="view-count-badge">{recentItems.length} videos</span>
        </div>
      </div>

      {recentItems.length === 0 ? (
        <div className="empty-view-placeholder">
          <History size={48} className="empty-icon" />
          <h3>No Playback History Yet</h3>
          <p>Videos you play will automatically appear here with saved progress.</p>
          <button type="button" className="open-file-btn" onClick={onOpenFile}>
            <FolderOpen size={18} />
            <span>Open a Video</span>
          </button>
        </div>
      ) : (
        <div className="recent-list">
          {recentItems.map((item) => {
            const progressPercent =
              item.duration && item.lastPosition
                ? Math.min(100, Math.round((item.lastPosition / item.duration) * 100))
                : 0;
            return (
              <div
                key={item.id}
                className={`recent-item-card ${item.isMissing ? 'media-missing' : ''}`}
                onClick={() => !item.isMissing && onOpenMedia(item.filePath)}
              >
                <div className="recent-item-icon">
                  <Film size={20} />
                </div>
                <div className="recent-item-main">
                  <div className="recent-item-title" title={item.filePath}>
                    {item.fileName}
                  </div>
                  <div className="recent-item-meta">
                    <span>Last played: {formatDate(item.lastOpened)}</span>
                    {item.lastPosition && (
                      <>
                        <span className="meta-sep">&bull;</span>
                        <span>
                          Position: {formatTime(item.lastPosition)} / {formatTime(item.duration)}
                        </span>
                      </>
                    )}
                    {item.isMissing && (
                      <span className="media-missing-badge">File moved or deleted</span>
                    )}
                  </div>
                  {progressPercent > 0 && (
                    <div className="recent-progress-bar">
                      <div
                        className="recent-progress-fill"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  )}
                </div>
                <div className="recent-item-actions">
                  <button
                    type="button"
                    className="play-recent-btn"
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
