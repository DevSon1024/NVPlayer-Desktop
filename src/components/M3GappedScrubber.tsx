import React, { useRef, useState, useCallback } from 'react';
import { formatTime } from '../utils/formatters';

export interface M3GappedScrubberProps {
  currentPosition: number;
  duration: number;
  isThick?: boolean;
  onSeek: (seconds: number) => void;
  disabled?: boolean;
}

export const M3GappedScrubber: React.FC<M3GappedScrubberProps> = ({
  currentPosition,
  duration,
  isThick = false,
  onSeek,
  disabled = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isHovering, setIsHovering] = useState(false);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [hoverTime, setHoverTime] = useState<number>(0);
  const isDraggingRef = useRef(false);

  const clampedPct = duration > 0 ? Math.max(0, Math.min(100, (currentPosition / duration) * 100)) : 0;

  const calculateAndSeek = useCallback(
    (clientX: number) => {
      if (!containerRef.current || !duration || duration <= 0) return;
      const rect = containerRef.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      onSeek(ratio * duration);
    },
    [duration, onSeek]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || !duration || duration <= 0) return;
    isDraggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    calculateAndSeek(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!containerRef.current || !duration) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    setHoverX(x);
    setHoverTime((x / rect.width) * duration);

    if (isDraggingRef.current) {
      calculateAndSeek(e.clientX);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignored
      }
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full ${isThick ? 'h-9' : 'h-7'} flex items-center cursor-pointer select-none group`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => {
        setIsHovering(false);
        setHoverX(null);
      }}
    >
      {/* Floating Hover Timestamp Pill */}
      {isHovering && hoverX !== null && !disabled && (
        <div
          className="absolute -top-7 -translate-x-1/2 px-2.5 py-0.5 bg-surface-elevated text-foreground border border-border rounded-md text-[11px] font-mono pointer-events-none shadow-xl z-40 whitespace-nowrap"
          style={{ left: `${hoverX}px` }}
        >
          {formatTime(hoverTime)}
        </div>
      )}

      {/* Track Container with Signature M3 Gap Thumb */}
      <div className="w-full flex items-center">
        {/* Left Active Track */}
        <div
          className={`${
            isThick ? 'h-3.5' : 'h-2 group-hover:h-3'
          } bg-primary rounded-full transition-[height] duration-150`}
          style={{ width: `calc(${clampedPct}% - 6px)` }}
        />

        {/* Vertical M3 Gap Thumb */}
        <div
          className={`${
            isThick ? 'w-1.5 h-7' : 'w-1.5 h-5 group-hover:h-6'
          } bg-foreground rounded-full mx-1.5 shadow-md shrink-0 transition-[height] duration-150`}
        />

        {/* Right Inactive Track with End-Cap Dot */}
        <div
          className={`${
            isThick ? 'h-3.5' : 'h-2 group-hover:h-3'
          } bg-surface-muted rounded-full flex-1 transition-[height] duration-150 flex items-center justify-end pr-0.5`}
        >
          <div className="w-1.5 h-1.5 rounded-full bg-outline/60" />
        </div>
      </div>
    </div>
  );
};

export default M3GappedScrubber;
