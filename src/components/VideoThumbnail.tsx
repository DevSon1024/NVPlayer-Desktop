import React, { useState, useEffect } from 'react';
import { Film } from 'lucide-react';

export interface VideoThumbnailProps {
  thumbnailKey?: string | null;
  mediaId?: string;
  fileName?: string;
  showThumbnails?: boolean;
  fallbackIconSize?: number;
  className?: string;
  imgClassName?: string;
  refreshVersion?: number;
}

export const VideoThumbnail: React.FC<VideoThumbnailProps> = ({
  thumbnailKey,
  mediaId,
  fileName,
  showThumbnails = true,
  fallbackIconSize = 24,
  className = 'w-full h-full flex items-center justify-center',
  imgClassName = 'w-full h-full object-cover',
  refreshVersion,
}) => {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [thumbnailKey, refreshVersion]);

  if (!showThumbnails || !thumbnailKey || hasError) {
    return (
      <div className={`text-muted-foreground ${className}`}>
        <Film size={fallbackIconSize} />
      </div>
    );
  }

  const cleanKey = thumbnailKey.replace(/\/+$/, '');
  const thumbUrl = refreshVersion ? `nosved-thumb://${cleanKey}?v=${refreshVersion}` : `nosved-thumb://${cleanKey}`;

  return (
    <img
      src={thumbUrl}
      alt={fileName || 'Video thumbnail'}
      className={imgClassName}
      onError={() => {
        setHasError(true);
        if (mediaId && window.nosvedAPI?.extractMetadata) {
          window.nosvedAPI.extractMetadata(mediaId).catch(() => {});
        }
      }}
    />
  );
};
