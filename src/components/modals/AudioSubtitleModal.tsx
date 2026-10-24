import React, { useState, useEffect, useRef } from 'react';
import {
  Headphones,
  Subtitles,
  Palette,
  Check,
  FileText,
  Sliders,
  X,
  Minimize2,
  Maximize2,
  Eye,
  EyeOff,
  Sparkles,
  PanelLeft,
  PanelRight,
  GripVertical,
} from 'lucide-react';
import type { PlayerTracksSnapshot } from '../../types/electron';
import type { AppSettings } from '../../types/settings';

export type TrackModalTab = 'audio' | 'subtitles' | 'style';

export interface AudioSubtitleModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: TrackModalTab;
  onTabChange: (tab: TrackModalTab) => void;
  tracks: PlayerTracksSnapshot | null;
  audioDelay: number;
  subtitleDelay: number;
  onSelectAudioTrack: (trackId: number) => void;
  onSelectSubtitleTrack: (trackId: number | 'no') => void;
  onToggleSubtitlesVisible: (visible: boolean) => void;
  onLoadExternalSubtitle: () => void;
  onAudioDelayChange: (delta: number) => void;
  onSubtitleDelayChange: (delta: number) => void;
  onResetAudioDelay: () => void;
  onResetSubtitleDelay: () => void;
  settings?: AppSettings;
  onUpdateSetting?: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<void> | void;
  dockPosition?: 'right' | 'left';
  onToggleDock?: () => void;
  isFullscreen?: boolean;
}

const SUBTITLE_COLOR_PALETTES = [
  { label: 'Crisp White', color: '#FFFFFF' },
  { label: 'Warm Yellow', color: '#FFF275' },
  { label: 'Electric Cyan', color: '#70EEFF' },
  { label: 'Pastel Mint', color: '#98FB98' },
  { label: 'Coral Blossom', color: '#FF99C8' },
  { label: 'Amber Gold', color: '#FFD166' },
];

const FONT_SIZE_PRESETS = [
  { label: 'Small', size: 32 },
  { label: 'Default', size: 42 },
  { label: 'Large', size: 52 },
  { label: 'Cinematic', size: 60 },
];

export const AudioSubtitleModal: React.FC<AudioSubtitleModalProps> = ({
  isOpen,
  onClose,
  activeTab,
  onTabChange,
  tracks,
  audioDelay,
  subtitleDelay,
  onSelectAudioTrack,
  onSelectSubtitleTrack,
  onToggleSubtitlesVisible,
  onLoadExternalSubtitle,
  onAudioDelayChange,
  onSubtitleDelayChange,
  onResetAudioDelay,
  onResetSubtitleDelay,
  settings,
  onUpdateSetting,
  dockPosition = 'right',
  onToggleDock,
  isFullscreen = false,
}) => {
  const [panelWidth, setPanelWidth] = useState<number>(400);
  const [isResizing, setIsResizing] = useState<boolean>(false);
  const [isCompact, setIsCompact] = useState<boolean>(false);
  const [isGlassExtra, setIsGlassExtra] = useState<boolean>(false);

  const resizeStartRef = useRef<{ startX: number; startWidth: number } | null>(null);

  // Resize handler for dragging the edge
  const handleResizeStart = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    resizeStartRef.current = {
      startX: e.clientX,
      startWidth: panelWidth,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleResizeMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isResizing || !resizeStartRef.current) return;
    const deltaX = e.clientX - resizeStartRef.current.startX;
    const newWidth =
      dockPosition === 'right'
        ? resizeStartRef.current.startWidth - deltaX
        : resizeStartRef.current.startWidth + deltaX;

    const minWidth = isCompact ? 260 : 320;
    const maxWidth = Math.max(minWidth, Math.min(600, window.innerWidth - 380));
    setPanelWidth(Math.min(maxWidth, Math.max(minWidth, newWidth)));
  };

  const handleResizeEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isResizing) {
      setIsResizing(false);
      resizeStartRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // no-op
      }
    }
  };

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Subtitle styling handlers
  const currentFontSize = settings?.subtitleFontSize ?? 42;
  const currentFontColor = settings?.subtitleColor ?? '#FFFFFF';

  const handleUpdateFontSize = async (size: number) => {
    if (window.nosvedAPI?.setSubtitleFontSize) {
      await window.nosvedAPI.setSubtitleFontSize(size).catch(console.error);
    }
    if (onUpdateSetting) {
      onUpdateSetting('subtitleFontSize', size);
    }
  };

  const handleUpdateFontColor = async (color: string) => {
    if (window.nosvedAPI?.setSubtitleColor) {
      await window.nosvedAPI.setSubtitleColor(color).catch(console.error);
    }
    if (onUpdateSetting) {
      onUpdateSetting('subtitleColor', color);
    }
  };

  if (!isOpen) return null;

  const effectiveWidth = isCompact ? Math.min(panelWidth, 310) : panelWidth;

  const selectedSubTrack = tracks?.subtitlesVisible
    ? tracks?.subtitleTracks.find(
        (tr) =>
          String(tr.id) === String(tracks?.selectedSubtitleId) ||
          (tr.selected && tracks?.selectedSubtitleId !== 'no')
      )
    : null;

  return (
    <aside
      style={{ width: `${effectiveWidth}px` }}
      className={`relative ${
        isFullscreen ? 'my-16 mx-3 h-[calc(100%-8.5rem)]' : 'h-full'
      } shrink-0 flex flex-col z-30 select-none animate-fadeIn ${
        isGlassExtra
          ? 'bg-surface-elevated/75 backdrop-blur-3xl'
          : 'bg-surface-elevated/95 backdrop-blur-2xl'
      } border border-border rounded-2xl shadow-2xl overflow-hidden text-foreground transition-[width] duration-150`}
      aria-label="Audio and Subtitle Controls Panel"
    >
      {/* Draggable Splitter Handle */}
      <div
        onPointerDown={handleResizeStart}
        onPointerMove={handleResizeMove}
        onPointerUp={handleResizeEnd}
        title="Drag horizontally to adjust panel width"
        className={`absolute top-0 bottom-0 ${
          dockPosition === 'right' ? 'left-0' : 'right-0'
        } w-2 hover:w-3 bg-transparent hover:bg-primary/20 cursor-col-resize z-40 flex items-center justify-center transition-colors group`}
      >
        <div className="w-1 h-8 rounded-full bg-border group-hover:bg-primary transition-colors flex items-center justify-center">
          <GripVertical size={10} className="text-muted-foreground group-hover:text-primary transition-colors" />
        </div>
      </div>

      {/* Top Header Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/70 bg-surface/80 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-primary-container/80 flex items-center justify-center text-on-primary-container shrink-0 shadow-xs">
            {activeTab === 'audio' && <Headphones size={15} />}
            {activeTab === 'subtitles' && <Subtitles size={15} />}
            {activeTab === 'style' && <Palette size={15} />}
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold truncate tracking-tight text-foreground">
                {isCompact
                  ? 'Quick Sync'
                  : activeTab === 'audio'
                  ? 'Audio Settings'
                  : activeTab === 'subtitles'
                  ? 'Subtitle Track & Delay'
                  : 'Subtitle Styling'}
              </span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-surface-muted text-muted-foreground font-mono">
                LIVE
              </span>
            </div>
            {!isCompact && (
              <span className="text-[10px] text-muted-foreground truncate">
                Adjust width or dock • Live video preview
              </span>
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Dock Side Toggle (Left / Right) */}
          {onToggleDock && (
            <button
              type="button"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-muted transition border-none cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                onToggleDock();
              }}
              title={dockPosition === 'right' ? 'Dock to Left side' : 'Dock to Right side'}
              aria-label="Toggle panel docking position"
            >
              {dockPosition === 'right' ? <PanelLeft size={14} /> : <PanelRight size={14} />}
            </button>
          )}

          {/* Opacity / Glass Toggle */}
          <button
            type="button"
            className={`p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-muted transition border-none cursor-pointer ${
              isGlassExtra ? 'text-primary bg-primary/10' : ''
            }`}
            onClick={(e) => {
              e.stopPropagation();
              setIsGlassExtra((prev) => !prev);
            }}
            title={isGlassExtra ? 'High clarity glass' : 'Translucent glass preview'}
            aria-label="Toggle transparency"
          >
            <Sparkles size={14} />
          </button>

          {/* Compact / Expand Toggle */}
          <button
            type="button"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-muted transition border-none cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              setIsCompact((prev) => !prev);
            }}
            title={isCompact ? 'Expand Full View' : 'Collapse Compact View'}
            aria-label={isCompact ? 'Expand panel' : 'Collapse panel'}
          >
            {isCompact ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
          </button>

          {/* Close Button */}
          <button
            type="button"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-muted transition border-none cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            title="Close (Esc)"
            aria-label="Close panel"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* COMPACT MODE VIEW */}
      {isCompact ? (
        <div className="p-3 flex flex-col gap-3 flex-1 overflow-y-auto">
          <div className="flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5 truncate">
              <span className="text-[10.5px] font-bold uppercase text-muted-foreground">Active:</span>
              <span className="font-semibold text-foreground truncate text-[11px]">
                {selectedSubTrack
                  ? `Sub: ${selectedSubTrack.lang || `Track ${selectedSubTrack.id}`}`
                  : 'Subtitles Off'}
              </span>
            </div>

            <button
              type="button"
              className={`p-1 rounded-lg transition border-none cursor-pointer shrink-0 ${
                tracks?.subtitlesVisible
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-surface-muted text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => onToggleSubtitlesVisible(!tracks?.subtitlesVisible)}
              title={tracks?.subtitlesVisible ? 'Hide Subtitles' : 'Show Subtitles'}
            >
              {tracks?.subtitlesVisible ? <Eye size={13} /> : <EyeOff size={13} />}
            </button>
          </div>

          {/* Quick Subtitle Delay Adjuster */}
          <div className="flex flex-col gap-1.5 p-2 rounded-xl bg-surface/70 border border-border/60">
            <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
              <span className="flex items-center gap-1">
                <Sliders size={12} className="text-primary" />
                <span>Sub Delay:</span>
              </span>
              <span className="font-mono text-primary font-bold">{subtitleDelay.toFixed(1)}s</span>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                className="flex-1 py-1 rounded-md bg-surface-muted hover:bg-surface text-foreground text-[10px] font-semibold border-none cursor-pointer"
                onClick={() => onSubtitleDelayChange(-0.1)}
              >
                -0.1s
              </button>
              <button
                type="button"
                className="flex-1 py-1 rounded-md bg-surface-muted hover:bg-surface text-foreground text-[10px] font-semibold border-none cursor-pointer"
                onClick={onResetSubtitleDelay}
              >
                0.0s
              </button>
              <button
                type="button"
                className="flex-1 py-1 rounded-md bg-surface-muted hover:bg-surface text-foreground text-[10px] font-semibold border-none cursor-pointer"
                onClick={() => onSubtitleDelayChange(0.1)}
              >
                +0.1s
              </button>
            </div>
          </div>

          {/* Quick Audio Delay Adjuster */}
          <div className="flex flex-col gap-1.5 p-2 rounded-xl bg-surface/70 border border-border/60">
            <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
              <span className="flex items-center gap-1">
                <Headphones size={12} className="text-primary" />
                <span>Audio Delay:</span>
              </span>
              <span className="font-mono text-primary font-bold">{audioDelay.toFixed(1)}s</span>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                className="flex-1 py-1 rounded-md bg-surface-muted hover:bg-surface text-foreground text-[10px] font-semibold border-none cursor-pointer"
                onClick={() => onAudioDelayChange(-0.1)}
              >
                -0.1s
              </button>
              <button
                type="button"
                className="flex-1 py-1 rounded-md bg-surface-muted hover:bg-surface text-foreground text-[10px] font-semibold border-none cursor-pointer"
                onClick={onResetAudioDelay}
              >
                0.0s
              </button>
              <button
                type="button"
                className="flex-1 py-1 rounded-md bg-surface-muted hover:bg-surface text-foreground text-[10px] font-semibold border-none cursor-pointer"
                onClick={() => onAudioDelayChange(0.1)}
              >
                +0.1s
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* EXPANDED FULL VIEW */
        <>
          {/* Segmented Navigation Tabs */}
          <div className="flex items-center px-3 pt-2.5 gap-1.5 bg-surface/50 border-b border-border/60 shrink-0">
            <button
              type="button"
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-1.5 rounded-xl text-xs font-semibold transition border-none cursor-pointer ${
                activeTab === 'audio'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground hover:bg-surface-muted/60'
              }`}
              onClick={() => onTabChange('audio')}
            >
              <Headphones size={13} />
              <span>Audio ({tracks?.audioTracks.length || 0})</span>
            </button>

            <button
              type="button"
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-1.5 rounded-xl text-xs font-semibold transition border-none cursor-pointer ${
                activeTab === 'subtitles'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground hover:bg-surface-muted/60'
              }`}
              onClick={() => onTabChange('subtitles')}
            >
              <Subtitles size={13} />
              <span>Subtitles ({tracks?.subtitleTracks.length || 0})</span>
            </button>

            <button
              type="button"
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-1.5 rounded-xl text-xs font-semibold transition border-none cursor-pointer ${
                activeTab === 'style'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground hover:bg-surface-muted/60'
              }`}
              onClick={() => onTabChange('style')}
            >
              <Palette size={13} />
              <span>Style</span>
            </button>
          </div>

          {/* Panel Body */}
          <div className="p-3.5 flex flex-col gap-4 flex-1 min-h-0 overflow-y-auto">
            {/* TAB 1: AUDIO */}
            {activeTab === 'audio' && (
              <div className="flex flex-col gap-3.5 animate-fadeIn">
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                    Available Audio Streams
                  </span>

                  <div className="flex flex-col gap-1.5 mt-0.5">
                    {tracks && tracks.audioTracks.length > 0 ? (
                      tracks.audioTracks.map((tr) => {
                        const isSelected =
                          String(tracks.selectedAudioId) === String(tr.id) ||
                          (tr.selected && tracks.selectedAudioId !== 'no');
                        return (
                          <button
                            key={tr.id}
                            type="button"
                            className={`flex items-center justify-between p-3 rounded-2xl cursor-pointer transition border text-left w-full ${
                              isSelected
                                ? 'bg-primary-container text-on-primary-container border-primary shadow-xs'
                                : 'bg-surface/80 border-border hover:bg-surface text-foreground'
                            }`}
                            onClick={() => onSelectAudioTrack(Number(tr.id))}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div
                                className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                                  isSelected
                                    ? 'bg-primary text-primary-foreground shadow-xs'
                                    : 'border border-border text-transparent'
                                }`}
                              >
                                <Check size={11} />
                              </div>
                              <div className="flex flex-col truncate">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold truncate">
                                    Track {tr.id}: {tr.title || tr.lang || `Audio Stream ${tr.id}`}
                                  </span>
                                  {isSelected && (
                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase bg-primary text-primary-foreground">
                                      Active
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 mt-0.5 text-[10.5px] opacity-80 font-mono">
                                  {tr.lang && <span>Lang: {tr.lang.toUpperCase()}</span>}
                                  {tr.codec && <span>• Codec: {tr.codec.toUpperCase()}</span>}
                                  {tr.isDefault && <span className="text-primary font-bold">• Default</span>}
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })
                    ) : (
                      <div className="p-4 text-center text-muted-foreground text-xs bg-surface/70 border border-border rounded-2xl">
                        No multiple audio streams detected for this video file.
                      </div>
                    )}
                  </div>
                </div>

                {/* Audio Delay Offset Adjuster */}
                <div className="p-3.5 bg-surface/80 border border-border rounded-2xl flex flex-col gap-2 shadow-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                      <Sliders size={13} className="text-primary" />
                      <span>Audio Delay (Sync Correction)</span>
                    </div>
                    <span className="font-mono text-xs text-primary font-bold">{audioDelay.toFixed(1)}s</span>
                  </div>

                  <div className="flex items-center gap-1.5 mt-0.5">
                    <button
                      type="button"
                      className="flex-1 py-1.5 rounded-lg bg-surface-muted hover:bg-surface text-foreground text-xs font-semibold transition border-none cursor-pointer"
                      onClick={() => onAudioDelayChange(-0.5)}
                    >
                      -0.5s
                    </button>
                    <button
                      type="button"
                      className="flex-1 py-1.5 rounded-lg bg-surface-muted hover:bg-surface text-foreground text-xs font-semibold transition border-none cursor-pointer"
                      onClick={() => onAudioDelayChange(-0.1)}
                    >
                      -0.1s
                    </button>
                    <button
                      type="button"
                      className="flex-[1.4] py-1.5 rounded-lg bg-surface-muted hover:bg-surface text-foreground text-xs font-semibold transition border-none cursor-pointer"
                      onClick={onResetAudioDelay}
                    >
                      Reset (0.0s)
                    </button>
                    <button
                      type="button"
                      className="flex-1 py-1.5 rounded-lg bg-surface-muted hover:bg-surface text-foreground text-xs font-semibold transition border-none cursor-pointer"
                      onClick={() => onAudioDelayChange(0.1)}
                    >
                      +0.1s
                    </button>
                    <button
                      type="button"
                      className="flex-1 py-1.5 rounded-lg bg-surface-muted hover:bg-surface text-foreground text-xs font-semibold transition border-none cursor-pointer"
                      onClick={() => onAudioDelayChange(0.5)}
                    >
                      +0.5s
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: SUBTITLES */}
            {activeTab === 'subtitles' && (
              <div className="flex flex-col gap-3.5 animate-fadeIn">
                {/* Master Subtitles Toggle */}
                <div className="flex items-center justify-between p-3.5 bg-surface/80 border border-border rounded-2xl shadow-xs">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-bold text-foreground">Subtitle Display</span>
                    <span className="text-[10.5px] text-muted-foreground">Show or hide rendered subtitles</span>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={tracks?.subtitlesVisible}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors border-none cursor-pointer ${
                      tracks?.subtitlesVisible ? 'bg-primary' : 'bg-surface-muted'
                    }`}
                    onClick={() => onToggleSubtitlesVisible(!tracks?.subtitlesVisible)}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-surface shadow-xs transition-transform ${
                        tracks?.subtitlesVisible ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {/* Subtitle Tracks List */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                    Available Subtitle Tracks
                  </span>

                  <div className="flex flex-col gap-1.5 mt-0.5">
                    {/* Off Option */}
                    <button
                      type="button"
                      className={`flex items-center justify-between p-3 rounded-2xl cursor-pointer transition border text-left w-full ${
                        !tracks?.subtitlesVisible || tracks?.selectedSubtitleId === 'no'
                          ? 'bg-primary-container text-on-primary-container border-primary shadow-xs'
                          : 'bg-surface/80 border-border hover:bg-surface text-foreground'
                      }`}
                      onClick={() => onSelectSubtitleTrack('no')}
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                            !tracks?.subtitlesVisible || tracks?.selectedSubtitleId === 'no'
                              ? 'bg-primary text-primary-foreground shadow-xs'
                              : 'border border-border text-transparent'
                          }`}
                        >
                          <Check size={11} />
                        </div>
                        <div>
                          <span className="text-xs font-bold">Off (Disable Subtitles)</span>
                          <p className="text-[10.5px] text-muted-foreground mt-0.5">Do not render any subtitles</p>
                        </div>
                      </div>
                    </button>

                    {tracks && tracks.subtitleTracks.length > 0 ? (
                      tracks.subtitleTracks.map((tr) => {
                        const isSelected =
                          Boolean(tracks.subtitlesVisible) &&
                          (String(tracks.selectedSubtitleId) === String(tr.id) ||
                            (tr.selected && tracks.selectedSubtitleId !== 'no'));
                        return (
                          <button
                            key={tr.id}
                            type="button"
                            className={`flex items-center justify-between p-3 rounded-2xl cursor-pointer transition border text-left w-full ${
                              isSelected
                                ? 'bg-primary-container text-on-primary-container border-primary shadow-xs'
                                : 'bg-surface/80 border-border hover:bg-surface text-foreground'
                            }`}
                            onClick={() => onSelectSubtitleTrack(tr.id)}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div
                                className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                                  isSelected
                                    ? 'bg-primary text-primary-foreground shadow-xs'
                                    : 'border border-border text-transparent'
                                }`}
                              >
                                <Check size={11} />
                              </div>
                              <div className="flex flex-col truncate">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold truncate">
                                    Track {tr.id}: {tr.title || tr.lang || `Subtitle Stream ${tr.id}`}
                                  </span>
                                  {isSelected && (
                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase bg-primary text-primary-foreground">
                                      Active
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 mt-0.5 text-[10.5px] opacity-80 font-mono">
                                  {tr.lang && <span>Lang: {tr.lang.toUpperCase()}</span>}
                                  {tr.codec && <span>• Format: {tr.codec.toUpperCase()}</span>}
                                  {tr.isDefault && <span className="text-primary font-bold">• Default</span>}
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })
                    ) : (
                      <div className="p-3.5 text-center text-muted-foreground text-xs bg-surface/70 border border-border rounded-2xl">
                        No embedded subtitles found inside media container.
                      </div>
                    )}
                  </div>
                </div>

                {/* Load External Subtitles Button */}
                <button
                  type="button"
                  className="flex items-center justify-center gap-2 p-3 rounded-2xl bg-surface/80 hover:bg-surface text-primary font-bold text-xs border border-primary/30 transition cursor-pointer shadow-xs"
                  onClick={onLoadExternalSubtitle}
                >
                  <FileText size={15} />
                  <span>Load External Subtitle File (.srt, .vtt, .ass)...</span>
                </button>

                {/* Subtitle Delay Adjuster */}
                <div className="p-3.5 bg-surface/80 border border-border rounded-2xl flex flex-col gap-2 shadow-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                      <Sliders size={13} className="text-primary" />
                      <span>Subtitle Delay (Timing Correction)</span>
                    </div>
                    <span className="font-mono text-xs text-primary font-bold">{subtitleDelay.toFixed(1)}s</span>
                  </div>

                  <div className="flex items-center gap-1.5 mt-0.5">
                    <button
                      type="button"
                      className="flex-1 py-1.5 rounded-lg bg-surface-muted hover:bg-surface text-foreground text-xs font-semibold transition border-none cursor-pointer"
                      onClick={() => onSubtitleDelayChange(-0.5)}
                    >
                      -0.5s
                    </button>
                    <button
                      type="button"
                      className="flex-1 py-1.5 rounded-lg bg-surface-muted hover:bg-surface text-foreground text-xs font-semibold transition border-none cursor-pointer"
                      onClick={() => onSubtitleDelayChange(-0.1)}
                    >
                      -0.1s
                    </button>
                    <button
                      type="button"
                      className="flex-[1.4] py-1.5 rounded-lg bg-surface-muted hover:bg-surface text-foreground text-xs font-semibold transition border-none cursor-pointer"
                      onClick={onResetSubtitleDelay}
                    >
                      Reset (0.0s)
                    </button>
                    <button
                      type="button"
                      className="flex-1 py-1.5 rounded-lg bg-surface-muted hover:bg-surface text-foreground text-xs font-semibold transition border-none cursor-pointer"
                      onClick={() => onSubtitleDelayChange(0.1)}
                    >
                      +0.1s
                    </button>
                    <button
                      type="button"
                      className="flex-1 py-1.5 rounded-lg bg-surface-muted hover:bg-surface text-foreground text-xs font-semibold transition border-none cursor-pointer"
                      onClick={() => onSubtitleDelayChange(0.5)}
                    >
                      +0.5s
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: STYLE & LIVE PREVIEW */}
            {activeTab === 'style' && (
              <div className="flex flex-col gap-4 animate-fadeIn">
                {/* Live Simulation Preview Box */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                    Live Subtitle Preview
                  </span>

                  <div className="relative w-full h-24 rounded-2xl overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-black border border-border/80 flex items-center justify-center p-3 shadow-inner">
                    <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:16px_16px]" />

                    <div
                      className="z-10 text-center font-bold px-3 py-1 rounded select-none transition-all duration-150"
                      style={{
                        fontSize: `${Math.min(Math.max(14, Math.round(currentFontSize * 0.42)), 24)}px`,
                        color: currentFontColor,
                        textShadow:
                          '0 2px 4px rgba(0,0,0,0.9), 0 0 2px #000, 1px 1px 1px #000, -1px -1px 1px #000',
                        lineHeight: 1.25,
                      }}
                    >
                      The quick brown fox jumps over the lazy dog.
                    </div>

                    <div className="absolute bottom-1 right-2 text-[9px] font-mono text-white/40">
                      {currentFontSize}px • {currentFontColor}
                    </div>
                  </div>
                </div>

                {/* Subtitle Font Size Slider & Presets */}
                <div className="p-3.5 bg-surface/80 border border-border rounded-2xl flex flex-col gap-2.5 shadow-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-foreground">Subtitle Font Size</span>
                      <span className="text-[10.5px] text-muted-foreground">Adjust on-screen subtitle scale</span>
                    </div>
                    <span className="font-mono text-xs text-primary font-bold px-2 py-0.5 rounded-md bg-primary-container text-on-primary-container">
                      {currentFontSize}px
                    </span>
                  </div>

                  <input
                    type="range"
                    min={24}
                    max={64}
                    step={2}
                    className="w-full h-1.5 rounded-lg appearance-none bg-surface-muted hover:bg-border transition cursor-pointer accent-primary"
                    value={currentFontSize}
                    onChange={(e) => handleUpdateFontSize(Number(e.target.value))}
                  />

                  {/* Quick Preset Buttons */}
                  <div className="grid grid-cols-4 gap-1.5 mt-1">
                    {FONT_SIZE_PRESETS.map((preset) => {
                      const isCurrent = currentFontSize === preset.size;
                      return (
                        <button
                          key={preset.size}
                          type="button"
                          className={`py-1 px-1.5 rounded-xl text-[11px] font-semibold border transition cursor-pointer text-center ${
                            isCurrent
                              ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                              : 'bg-surface-muted/60 text-muted-foreground border-transparent hover:text-foreground hover:bg-surface-muted'
                          }`}
                          onClick={() => handleUpdateFontSize(preset.size)}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Subtitle Text Color Swatches */}
                <div className="p-3.5 bg-surface/80 border border-border rounded-2xl flex flex-col gap-2.5 shadow-xs">
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-foreground">Subtitle Text Color</span>
                    <span className="text-[10.5px] text-muted-foreground">Choose typography tint for video preview</span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-1">
                    {SUBTITLE_COLOR_PALETTES.map((preset) => {
                      const isSelected = currentFontColor.toUpperCase() === preset.color.toUpperCase();
                      return (
                        <button
                          key={preset.color}
                          type="button"
                          className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-xs font-medium transition cursor-pointer ${
                            isSelected
                              ? 'bg-primary/10 border-primary text-foreground shadow-xs font-bold'
                              : 'bg-surface border-border text-muted-foreground hover:text-foreground hover:bg-surface-muted'
                          }`}
                          onClick={() => handleUpdateFontColor(preset.color)}
                        >
                          <span
                            className="w-3.5 h-3.5 rounded-full border border-black/30 shrink-0 shadow-xs"
                            style={{ backgroundColor: preset.color }}
                          />
                          <span className="text-[11px] truncate">{preset.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Modal Footer */}
          <div className="px-4 py-3 border-t border-border/70 bg-surface/60 flex items-center justify-between shrink-0">
            <span className="text-[10.5px] text-muted-foreground flex items-center gap-1.5">
              <span>Preview live on video</span>
            </span>

            <button
              type="button"
              className="px-4 py-1.5 rounded-xl bg-primary text-primary-foreground font-semibold text-xs shadow-xs hover:scale-[1.02] active:scale-[0.98] transition cursor-pointer border-none"
              onClick={onClose}
            >
              Done
            </button>
          </div>
        </>
      )}
    </aside>
  );
};

export default AudioSubtitleModal;
