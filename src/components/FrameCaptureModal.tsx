import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Camera, ChevronLeft, ChevronRight, X, CheckCircle2, FolderOpen } from 'lucide-react';
import type { PlaybackStatus } from '../types/electron';
import { M3GappedScrubber } from './M3GappedScrubber';

export interface FrameCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  playbackStatus: PlaybackStatus;
  onFrameStep?: () => void;
  onFrameBackStep?: () => void;
  onCaptureFrame?: () => Promise<{ success: boolean; filePath?: string; frameNumber?: number; error?: string } | undefined>;
  onCommitSeek: (seconds: number) => void;
  isFullscreen?: boolean;
}

export const FrameCaptureModal: React.FC<FrameCaptureModalProps> = ({
  isOpen,
  onClose,
  playbackStatus,
  onFrameStep,
  onFrameBackStep,
  onCaptureFrame,
  onCommitSeek,
  isFullscreen = false,
}) => {
  const [activeStepButton, setActiveStepButton] = useState<'prev' | 'next' | null>(null);
  const [isShutterFlashing, setIsShutterFlashing] = useState(false);
  const [captureToast, setCaptureToast] = useState<{ id: number; frameNumber: number; filePath: string } | null>(null);
  const toastTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastStepTimeRef = useRef<number>(0);

  const effectiveFps = playbackStatus.fps && playbackStatus.fps > 0 ? playbackStatus.fps : 24;
  const currentDuration = playbackStatus.duration ?? 0;
  const currentPos = playbackStatus.position ?? 0;
  const currentFrame = Math.max(0, Math.round(currentPos * effectiveFps));
  const totalFrames = Math.max(1, Math.round(currentDuration * effectiveFps));

  const handleStepForward = useCallback(() => {
    setActiveStepButton('next');
    setTimeout(() => setActiveStepButton(null), 120);
    if (onFrameStep) {
      onFrameStep();
    } else if (window.nosvedAPI?.frameStep) {
      window.nosvedAPI.frameStep();
    }
  }, [onFrameStep]);

  const handleStepBack = useCallback(() => {
    setActiveStepButton('prev');
    setTimeout(() => setActiveStepButton(null), 120);
    if (onFrameBackStep) {
      onFrameBackStep();
    } else if (window.nosvedAPI?.frameBackStep) {
      window.nosvedAPI.frameBackStep();
    }
  }, [onFrameBackStep]);

  const handleTriggerCapture = useCallback(async () => {
    setIsShutterFlashing(true);
    setTimeout(() => setIsShutterFlashing(false), 240);

    const frameNumber = Math.max(0, Math.round(currentPos * effectiveFps));

    let res: { success: boolean; filePath?: string; frameNumber?: number; error?: string } | undefined;
    if (onCaptureFrame) {
      res = await onCaptureFrame();
    } else if (window.nosvedAPI?.captureFrame) {
      res = await window.nosvedAPI.captureFrame();
    }

    if (res?.success && res.filePath) {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      const resolvedFrame = res.frameNumber ?? frameNumber;
      setCaptureToast({
        id: Date.now(),
        frameNumber: resolvedFrame,
        filePath: res.filePath,
      });
      toastTimerRef.current = setTimeout(() => {
        setCaptureToast(null);
      }, 4500);
    }
  }, [currentPos, effectiveFps, onCaptureFrame]);

  // Exclusive captured keyboard listener for Frame Capture mode
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDownCapture = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      const isCtrlF = (e.ctrlKey || e.metaKey) && e.code === 'KeyF';

      if (e.code === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        onClose();
        return;
      }

      if (isCtrlF || e.code === 'Enter' || e.code === 'KeyS') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        handleTriggerCapture();
        return;
      }

      if (e.code === 'ArrowLeft') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (e.shiftKey) {
          const targetPos = Math.max(0, currentPos - 10 / effectiveFps);
          onCommitSeek(targetPos);
        } else {
          const now = Date.now();
          if (now - lastStepTimeRef.current >= 40) {
            lastStepTimeRef.current = now;
            handleStepBack();
          }
        }
        return;
      }

      if (e.code === 'ArrowRight') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (e.shiftKey) {
          const maxPos = currentDuration ?? currentPos + 1;
          const targetPos = Math.min(maxPos, currentPos + 10 / effectiveFps);
          onCommitSeek(targetPos);
        } else {
          const now = Date.now();
          if (now - lastStepTimeRef.current >= 40) {
            lastStepTimeRef.current = now;
            handleStepForward();
          }
        }
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDownCapture, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDownCapture, { capture: true });
    };
  }, [
    isOpen,
    onClose,
    handleStepBack,
    handleStepForward,
    handleTriggerCapture,
    currentPos,
    currentDuration,
    effectiveFps,
    onCommitSeek,
  ]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className={
        isFullscreen
          ? 'fixed bottom-4 inset-x-4 z-50 flex justify-center pointer-events-auto animate-scaleUp'
          : 'w-full shrink-0 z-30 animate-fadeIn'
      }
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <div className="bg-surface-elevated/95 backdrop-blur-2xl border border-border rounded-3xl mx-auto max-w-3xl w-full p-4 shadow-2xl flex flex-col gap-3 relative text-foreground">
        {/* Top Header & Integrated Notification Slot (Fixed height prevents any UI jumping or slugginess) */}
        <div className="relative w-full h-9 flex items-center gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-surface-muted hover:bg-surface text-foreground border border-border flex items-center justify-center cursor-pointer transition shadow-sm shrink-0 z-20"
            title="Exit Frame Capture (Ctrl+F or Esc)"
            aria-label="Exit Frame Capture"
          >
            <X size={15} />
          </button>

          {/* Header Content when no toast */}
          <div
            className={`flex-1 flex items-center justify-between min-w-0 transition-opacity duration-150 ${
              captureToast ? 'opacity-0 pointer-events-none' : 'opacity-100 pointer-events-auto'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <span className="px-3 py-0.5 rounded-full bg-primary-container text-on-primary-container border border-primary/40 text-xs font-bold tracking-wider uppercase">
                FRAME CAPTURE
              </span>
              <span className="font-mono text-sm font-semibold text-foreground">
                #{currentFrame.toLocaleString()} / {totalFrames.toLocaleString()}
              </span>
            </div>

            <div className="text-[11px] font-mono text-muted-foreground bg-surface-muted border border-border px-2.5 py-1 rounded-full hidden sm:block">
              ←/→ ±1F • Ctrl+F/Enter/S Capture • Esc Exit
            </div>
          </div>

          {/* Integrated Notification Banner: Sits strictly in top slot next to exit button, zero modal layout shift */}
          {captureToast && (
            <div className="absolute left-10 inset-y-0 right-0 bg-surface border border-primary/40 rounded-2xl px-3 py-1 shadow-md flex items-center justify-between gap-3 text-foreground animate-fadeIn z-10">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-6 h-6 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center shrink-0">
                  <CheckCircle2 size={14} />
                </div>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-semibold text-foreground whitespace-nowrap">
                    Saved Frame #{captureToast.frameNumber.toLocaleString()}
                  </span>
                  <span
                    className="text-[10px] text-muted-foreground truncate max-w-[200px] hidden sm:inline"
                    title={captureToast.filePath}
                  >
                    {captureToast.filePath.split(/[/\\]/).pop()}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-surface-muted hover:bg-surface-elevated text-primary border border-primary/30 text-xs font-semibold transition cursor-pointer"
                  onClick={() => {
                    if (window.nosvedAPI?.showItemInFolder) {
                      window.nosvedAPI.showItemInFolder(captureToast.filePath);
                    }
                  }}
                >
                  <FolderOpen size={13} />
                  <span>Open Folder</span>
                </button>
                <button
                  type="button"
                  className="p-1 rounded-lg text-muted-foreground hover:text-foreground transition cursor-pointer border-none bg-transparent"
                  onClick={() => setCaptureToast(null)}
                  title="Dismiss notification"
                  aria-label="Dismiss toast"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Middle Row: Thick M3 Gapped Frame Scrubber */}
        <M3GappedScrubber
          currentPosition={currentPos}
          duration={currentDuration}
          isThick={true}
          onSeek={(targetSec) => {
            onCommitSeek(targetSec);
          }}
        />

        {/* Bottom Action Row: Centered Controls */}
        <div className="flex items-center justify-center gap-6 pt-0.5">
          <button
            type="button"
            onClick={handleStepBack}
            className={`px-5 py-2.5 rounded-2xl bg-surface-muted hover:bg-surface active:scale-95 border border-border text-foreground font-semibold text-xs flex items-center gap-1.5 cursor-pointer transition-all duration-150 ${
              activeStepButton === 'prev' ? 'ring-2 ring-primary bg-primary-container text-on-primary-container scale-105' : ''
            }`}
            title="Step Backward 1 Frame (ArrowLeft)"
          >
            <ChevronLeft size={16} />
            <span>-1F</span>
          </button>

          <button
            type="button"
            onClick={handleTriggerCapture}
            className={`w-13 h-13 rounded-full bg-primary hover:brightness-110 active:scale-90 border-[3px] border-surface text-primary-foreground shadow-lg flex items-center justify-center cursor-pointer transition-all duration-200 ${
              isShutterFlashing ? 'ring-4 ring-primary scale-110 brightness-125' : ''
            }`}
            title="Capture Exact Frame (Enter, S, or Ctrl+F)"
            aria-label="Capture Frame"
          >
            <Camera size={24} />
          </button>

          <button
            type="button"
            onClick={handleStepForward}
            className={`px-5 py-2.5 rounded-2xl bg-surface-muted hover:bg-surface active:scale-95 border border-border text-foreground font-semibold text-xs flex items-center gap-1.5 cursor-pointer transition-all duration-150 ${
              activeStepButton === 'next' ? 'ring-2 ring-primary bg-primary-container text-on-primary-container scale-105' : ''
            }`}
            title="Step Forward 1 Frame (ArrowRight)"
          >
            <span>+1F</span>
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default FrameCaptureModal;
