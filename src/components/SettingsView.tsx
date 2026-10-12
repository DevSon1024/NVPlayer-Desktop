import React from 'react';
import { Cpu, ShieldCheck, Layers } from 'lucide-react';
import type { PlaybackStatus } from '../types/electron';

interface SettingsViewProps {
  playbackStatus: PlaybackStatus;
  nativePoc: { success: boolean; stage: string; apiVersion?: { formatted: string } } | null;
  playerStatus: { state: string; apiVersion?: { formatted: string }; error?: string } | null;
  isFullscreen: boolean;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  playbackStatus,
  nativePoc,
  playerStatus,
  isFullscreen,
}) => {
  return (
    <div className="audit-cards-grid">
      <div className="audit-card">
        <div className="card-header">
          <Cpu className="card-icon" size={18} />
          <h3 className="card-title">Staged Native Assets</h3>
        </div>
        <div className="card-rows">
          <div className="card-row">
            <span className="row-label">libmpv Binary</span>
            <span className="row-value">windows/x64/libmpv-2.dll</span>
          </div>
          <div className="card-row">
            <span className="row-label">Playback State</span>
            <span className="row-status-verified">{playbackStatus.mediaState}</span>
          </div>
          <div className="card-row">
            <span className="row-label">Video Surface</span>
            <span className="row-value">
              {playbackStatus.videoWidth && playbackStatus.videoHeight
                ? `${playbackStatus.videoWidth}x${playbackStatus.videoHeight} (Win32 HWND)`
                : 'Win32 Child HWND (vo=gpu)'}
            </span>
          </div>
          <div className="card-row">
            <span className="row-label">libmpv API</span>
            <span className="row-value">
              {nativePoc?.apiVersion?.formatted ? `v${nativePoc.apiVersion.formatted} Connected` : 'Probing...'}
            </span>
          </div>
          <div className="card-row">
            <span className="row-label">Player Service</span>
            <span className="row-status-verified">
              {playerStatus?.state ? `State: ${playerStatus.state}` : 'Connecting...'}
            </span>
          </div>
        </div>
      </div>

      <div className="audit-card">
        <div className="card-header">
          <ShieldCheck className="card-icon" size={18} />
          <h3 className="card-title">Electron Security Enforcements</h3>
        </div>
        <div className="card-rows">
          <div className="card-row">
            <span className="row-label">contextIsolation</span>
            <span className="row-status-verified">true</span>
          </div>
          <div className="card-row">
            <span className="row-label">nodeIntegration</span>
            <span className="row-status-verified">false</span>
          </div>
          <div className="card-row">
            <span className="row-label">Chromium Sandbox</span>
            <span className="row-status-verified">true</span>
          </div>
          <div className="card-row">
            <span className="row-label">Navigation Lock</span>
            <span className="row-status-verified">Enforced (will-navigate blocked)</span>
          </div>
        </div>
      </div>

      <div className="audit-card">
        <div className="card-header">
          <Layers className="card-icon" size={18} />
          <h3 className="card-title">Application Architecture</h3>
        </div>
        <div className="card-rows">
          <div className="card-row">
            <span className="row-label">Rendering Mode</span>
            <span className="row-value">Direct3D HW-Accel (vo=gpu)</span>
          </div>
          <div className="card-row">
            <span className="row-label">Persistence</span>
            <span className="row-value">winsqlite3 (Schema v2)</span>
          </div>
          <div className="card-row">
            <span className="row-label">Fullscreen Mode</span>
            <span className="row-value">{isFullscreen ? 'Active (Auto-hide)' : 'Windowed'}</span>
          </div>
          <div className="card-row">
            <span className="row-label">Design System</span>
            <span className="row-value">Material 3 Expressive (Vanilla CSS)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
