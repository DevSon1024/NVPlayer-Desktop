import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import {
  getMpvFunctions,
  MpvFunctions,
  safeGetMpvPropertyString,
} from './mpv-bindings';
import { MediaDatabase, MediaRecord } from '../database/media-db';

export interface ExtractedMetadata {
  duration: number | null;
  videoWidth: number | null;
  videoHeight: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  fps: number | null;
  thumbnailKey: string | null;
  fileSize: number | null;
  lastModified: number | null;
}

export function computeMediaThumbnailKey(
  filePath: string,
  fileSize: number | null,
  lastModified: number | null,
  strategy = 'smart',
  position = 33
): string {
  const norm = path.resolve(filePath).toLowerCase();
  const stratKey = strategy === 'frame_position' ? `frame_pos_${Math.round(position)}` : strategy;
  return crypto
    .createHash('sha256')
    .update(`${norm}:${fileSize ?? 0}:${lastModified ?? 0}:${stratKey}`)
    .digest('hex');
}

export type MetadataUpdateCallback = (media: MediaRecord) => void;

export class MetadataService {
  private thumbnailDir: string;
  private mediaDb: MediaDatabase;
  private funcsGetter: () => MpvFunctions;
  private pendingPromises = new Map<string, Promise<ExtractedMetadata | null>>();
  private queue: Array<() => Promise<void>> = [];
  private isProcessingQueue = false;
  private updateCallbacks: MetadataUpdateCallback[] = [];

  public onMetadataUpdated(callback: MetadataUpdateCallback): () => void {
    this.updateCallbacks.push(callback);
    return () => {
      this.updateCallbacks = this.updateCallbacks.filter((cb) => cb !== callback);
    };
  }

  constructor(
    thumbnailDir: string,
    mediaDb: MediaDatabase,
    funcsGetter?: () => MpvFunctions
  ) {
    this.thumbnailDir = thumbnailDir;
    this.mediaDb = mediaDb;
    this.funcsGetter = funcsGetter ?? (() => getMpvFunctions());

    if (!fs.existsSync(this.thumbnailDir)) {
      try {
        fs.mkdirSync(this.thumbnailDir, { recursive: true });
      } catch (err) {
        console.error('[MetadataService] Failed to create thumbnail directory:', err);
      }
    }
  }

  public getThumbnailDir(): string {
    return this.thumbnailDir;
  }

  public getThumbnailPath(thumbnailKey: string): string | null {
    if (!thumbnailKey || !/^[a-f0-9]{64}$/i.test(thumbnailKey)) {
      return null;
    }
    const candidate = path.join(this.thumbnailDir, `${thumbnailKey}.jpg`);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    return null;
  }

  public getThumbnailStrategy(): { mode: 'smart' | 'first_frame' | 'frame_position' | 'embedded'; position: number } {
    const rawMode = this.mediaDb.getSetting('thumbnailMode') as 'smart' | 'first_frame' | 'frame_position' | 'embedded' | null;
    const mode = (rawMode && ['smart', 'first_frame', 'frame_position', 'embedded'].includes(rawMode))
      ? rawMode
      : 'smart';
    const rawPos = this.mediaDb.getSetting('thumbnailFramePosition');
    const position = rawPos !== null ? Math.max(0, Math.min(100, Number(rawPos))) : 33;
    return { mode, position: isNaN(position) ? 33 : position };
  }

  public extractForMedia(media: MediaRecord, force = false): Promise<ExtractedMetadata | null> {
    const resolvedPath = path.resolve(media.filePath);
    if (!fs.existsSync(resolvedPath)) {
      return Promise.resolve(null);
    }

    let currentSize = media.fileSize;
    let currentMtime = media.lastModified;
    try {
      const stat = fs.statSync(resolvedPath);
      currentSize = stat.size;
      currentMtime = Math.round(stat.mtimeMs);
    } catch {
      // Keep existing if stat fails
    }

    const { mode, position } = this.getThumbnailStrategy();
    const expectedKey = computeMediaThumbnailKey(resolvedPath, currentSize, currentMtime, mode, position);
    const existingThumbPath = path.join(this.thumbnailDir, `${expectedKey}.jpg`);
    const hasThumb = fs.existsSync(existingThumbPath);

    const hasFullMetadata =
      media.duration !== null &&
      media.duration !== undefined &&
      media.videoWidth !== null &&
      media.videoWidth !== undefined &&
      media.videoCodec !== null &&
      media.videoCodec !== undefined;

    // Cache hit: If not forced, metadata is already complete, thumbnail file exists, and not a black frame
    if (!force && hasFullMetadata && hasThumb && media.thumbnailKey === expectedKey) {
      try {
        const thumbStat = fs.statSync(existingThumbPath);
        // If thumb file is suspiciously small (black frame ~15KB) and duration > 10s, re-extract properly
        if (thumbStat.size > 20000 || (media.duration && media.duration <= 10)) {
          return Promise.resolve({
            duration: media.duration,
            videoWidth: media.videoWidth ?? null,
            videoHeight: media.videoHeight ?? null,
            videoCodec: media.videoCodec ?? null,
            audioCodec: media.audioCodec ?? null,
            fps: media.fps ?? null,
            thumbnailKey: expectedKey,
            fileSize: currentSize,
            lastModified: currentMtime,
          });
        }
      } catch {
        // Continue to queue extraction
      }
    }

    return this.queueExtraction(resolvedPath, media.id, currentSize, currentMtime, expectedKey, mode, position, force);
  }

  public extractForFile(filePath: string, force = false): Promise<ExtractedMetadata | null> {
    const resolvedPath = path.resolve(filePath);
    if (!fs.existsSync(resolvedPath)) {
      return Promise.resolve(null);
    }

    let fileSize: number | null = null;
    let lastModified: number | null = null;
    try {
      const stat = fs.statSync(resolvedPath);
      fileSize = stat.size;
      lastModified = Math.round(stat.mtimeMs);
    } catch {
      // Inaccessible stats
    }

    const { mode, position } = this.getThumbnailStrategy();
    const key = computeMediaThumbnailKey(resolvedPath, fileSize, lastModified, mode, position);
    const existingMedia = this.mediaDb.getMediaByPath(resolvedPath);

    return this.queueExtraction(resolvedPath, existingMedia?.id, fileSize, lastModified, key, mode, position, force);
  }

  private queueExtraction(
    filePath: string,
    mediaId: string | undefined,
    fileSize: number | null,
    lastModified: number | null,
    cacheKey: string,
    mode: 'smart' | 'first_frame' | 'frame_position' | 'embedded' = 'smart',
    position = 33,
    force = false
  ): Promise<ExtractedMetadata | null> {
    const queueKey = force ? `${filePath}:${cacheKey}:${Date.now()}` : `${filePath}:${cacheKey}`;
    // Deduplicate in-flight requests for the exact same file & cache key
    if (!force && this.pendingPromises.has(queueKey)) {
      return this.pendingPromises.get(queueKey)!;
    }

    const extractionPromise = new Promise<ExtractedMetadata | null>((resolve) => {
      this.enqueueTask(async () => {
        try {
          const result = await this.performExtraction(filePath, fileSize, lastModified, cacheKey, mode, position);
          if (result && mediaId) {
            this.mediaDb.updateMediaMetadata(mediaId, {
              duration: result.duration,
              videoWidth: result.videoWidth,
              videoHeight: result.videoHeight,
              videoCodec: result.videoCodec,
              audioCodec: result.audioCodec,
              fps: result.fps,
              thumbnailKey: result.thumbnailKey,
            });
            const updated = this.mediaDb.getMediaById(mediaId);
            if (updated) {
              for (const cb of this.updateCallbacks) {
                try {
                  cb(updated);
                } catch (cbErr) {
                  console.error('[MetadataService] Error in update callback:', cbErr);
                }
              }
            }
          }
          resolve(result);
        } catch (err) {
          console.error('[MetadataService] Extraction failed for:', filePath, err);
          resolve(null);
        } finally {
          this.pendingPromises.delete(queueKey);
        }
      });
    });

    this.pendingPromises.set(queueKey, extractionPromise);
    return extractionPromise;
  }

  private enqueueTask(task: () => Promise<void>): void {
    this.queue.push(task);
    this.processQueue();
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;

    while (this.queue.length > 0) {
      const nextTask = this.queue.shift();
      if (nextTask) {
        try {
          await nextTask();
        } catch (err) {
          console.error('[MetadataService] Error processing queue task:', err);
        }
      }
    }

    this.isProcessingQueue = false;
  }

  private async performExtraction(
    filePath: string,
    fileSize: number | null,
    lastModified: number | null,
    cacheKey: string,
    mode: 'smart' | 'first_frame' | 'frame_position' | 'embedded' = 'smart',
    position = 33
  ): Promise<ExtractedMetadata | null> {
    const finalThumbPath = path.join(this.thumbnailDir, `${cacheKey}.jpg`);

    let funcs: MpvFunctions;
    try {
      funcs = this.funcsGetter();
    } catch (err) {
      console.warn('[MetadataService] Native libmpv unavailable for extraction:', err);
      return null;
    }

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nosved-meta-'));

    let ctx: unknown | null = null;
    try {
      ctx = funcs.mpv_create();
      if (!ctx) {
        throw new Error('mpv_create returned NULL');
      }

      // Configure offscreen instance with image output
      funcs.mpv_set_property_string(ctx, 'vo', 'image');
      funcs.mpv_set_property_string(ctx, 'vo-image-outdir', tempDir);
      funcs.mpv_set_property_string(ctx, 'vo-image-format', 'jpeg');
      funcs.mpv_set_property_string(ctx, 'vo-image-jpeg-quality', '85');
      funcs.mpv_set_property_string(ctx, 'ao', 'null');
      funcs.mpv_set_property_string(ctx, 'pause', 'yes');
      funcs.mpv_set_property_string(ctx, 'audio', 'no');
      funcs.mpv_set_property_string(ctx, 'sub', 'no');

      let targetPct = 0;
      if (mode === 'smart') {
        targetPct = 33;
      } else if (mode === 'first_frame') {
        targetPct = 0;
      } else if (mode === 'frame_position') {
        targetPct = Math.max(0, Math.min(100, Math.round(position)));
      }

      // Pre-seed start position in mpv to avoid decoding 0s intro black frames
      if (targetPct > 0) {
        funcs.mpv_set_property_string(ctx, 'start', `${targetPct}%`);
      }

      const initCode = funcs.mpv_initialize(ctx);
      if (initCode < 0) {
        throw new Error(`mpv_initialize failed with code ${initCode}`);
      }

      const loadCode = funcs.mpv_command(ctx, ['loadfile', filePath, 'replace', null]);
      if (loadCode < 0) {
        throw new Error(`loadfile command failed with code ${loadCode}`);
      }

      // Process initial load events (up to ~1.5s timeout)
      for (let i = 0; i < 30; i++) {
        funcs.mpv_wait_event(ctx, 0.05);
        const dur = safeGetMpvPropertyString(funcs, ctx, 'duration');
        if (dur) break;
      }

      // Execute strategic frame seeking & albumart detection
      let albumArtTrackId: string | null = null;
      let mainVideoTrackId: string | null = null;
      const countStr = safeGetMpvPropertyString(funcs, ctx, 'track-list/count');
      const count = countStr ? parseInt(countStr, 10) : 0;
      for (let i = 0; i < count; i++) {
        const art = safeGetMpvPropertyString(funcs, ctx, `track-list/${i}/albumart`);
        const trackType = safeGetMpvPropertyString(funcs, ctx, `track-list/${i}/type`);
        const trackId = safeGetMpvPropertyString(funcs, ctx, `track-list/${i}/id`);
        if (trackType === 'video') {
          if (art === 'yes' && !albumArtTrackId && trackId) {
            albumArtTrackId = trackId;
          } else if (art !== 'yes' && !mainVideoTrackId && trackId) {
            mainVideoTrackId = trackId;
          }
        }
      }

      let isAlbumArt = false;
      if ((mode === 'smart' || mode === 'embedded') && albumArtTrackId) {
        isAlbumArt = true;
        funcs.mpv_set_property_string(ctx, 'vid', albumArtTrackId);
        // Wait for offscreen image output without stepping past the single still frame
        for (let i = 0; i < 15; i++) {
          funcs.mpv_wait_event(ctx, 0.05);
          const files = fs.readdirSync(tempDir).filter((f) => f.toLowerCase().endsWith('.jpg'));
          if (files.length > 0) break;
        }
      } else if (mode === 'embedded') {
        // Explicitly requested embedded thumbnail, but no album art track was present in file
      } else {
        if (mainVideoTrackId) {
          funcs.mpv_set_property_string(ctx, 'vid', mainVideoTrackId);
        }

        if (targetPct > 0) {
          funcs.mpv_command(ctx, ['seek', String(targetPct), 'absolute-percent+exact', null]);
          for (let i = 0; i < 20; i++) {
            const ev = funcs.mpv_wait_event(ctx, 0.05);
            // MPV_EVENT_PLAYBACK_RESTART = 22
            if (ev && (ev as { event_id?: number }).event_id === 22) {
              break;
            }
          }
        }

        // Step one frame to force vo=image output at the desired frame
        funcs.mpv_command(ctx, ['frame-step', null]);
        for (let i = 0; i < 15; i++) {
          funcs.mpv_wait_event(ctx, 0.05);
          const files = fs.readdirSync(tempDir).filter((f) => f.toLowerCase().endsWith('.jpg'));
          if (files.length > 0) break;
        }
      }

      // Extract raw properties
      const durStr = safeGetMpvPropertyString(funcs, ctx, 'duration');
      const wStr =
        safeGetMpvPropertyString(funcs, ctx, 'dwidth') ||
        safeGetMpvPropertyString(funcs, ctx, 'video-params/w');
      const hStr =
        safeGetMpvPropertyString(funcs, ctx, 'dheight') ||
        safeGetMpvPropertyString(funcs, ctx, 'video-params/h');
      const vcodec = safeGetMpvPropertyString(funcs, ctx, 'video-codec');
      const acodec = safeGetMpvPropertyString(funcs, ctx, 'audio-codec');
      const fpsStr = safeGetMpvPropertyString(funcs, ctx, 'container-fps');

      const duration = durStr ? parseFloat(durStr) : null;
      const videoWidth = wStr ? parseInt(wStr, 10) : null;
      const videoHeight = hStr ? parseInt(hStr, 10) : null;
      const fps = fpsStr ? parseFloat(fpsStr) : null;

      // Check generated thumbnail frame in temp directory
      let hasThumbnail = false;
      try {
        const files = fs
          .readdirSync(tempDir)
          .filter((f) => f.toLowerCase().endsWith('.jpg'))
          .map((f) => {
            const full = path.join(tempDir, f);
            try {
              return { name: f, size: fs.statSync(full).size, full };
            } catch {
              return { name: f, size: 0, full };
            }
          })
          .filter((f) => f.size > 0);

        files.sort((a, b) => a.name.localeCompare(b.name));

        if (files.length > 0) {
          // If seeking video frame, the latest file in sequence is the desired frame; if embedded album art, files[0] is the still art
          const targetJpg = isAlbumArt ? files[0] : files[files.length - 1];
          fs.copyFileSync(targetJpg.full, finalThumbPath);
          hasThumbnail = true;
        }
      } catch (err) {
        console.warn('[MetadataService] Could not copy generated thumbnail:', err);
      }

      if (!hasThumbnail && duration === null && videoWidth === null && (!vcodec || vcodec.trim().length === 0)) {
        return null;
      }

      return {
        duration: isNaN(duration as number) ? null : duration,
        videoWidth: isNaN(videoWidth as number) ? null : videoWidth,
        videoHeight: isNaN(videoHeight as number) ? null : videoHeight,
        videoCodec: vcodec && vcodec.trim().length > 0 ? vcodec : null,
        audioCodec: acodec && acodec.trim().length > 0 ? acodec : null,
        fps: isNaN(fps as number) ? null : fps,
        thumbnailKey: hasThumbnail ? cacheKey : null,
        fileSize,
        lastModified,
      };
    } catch (err) {
      console.warn('[MetadataService] Extraction attempt failed for:', filePath, err);
      return null;
    } finally {
      if (ctx) {
        try {
          funcs.mpv_terminate_destroy(ctx);
        } catch {
          // Ignore cleanup errors
        }
      }
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore temp cleanup errors
      }
    }
  }

  public clearAllThumbnails(): void {
    if (!fs.existsSync(this.thumbnailDir)) return;
    try {
      const files = fs.readdirSync(this.thumbnailDir);
      for (const file of files) {
        if (file.toLowerCase().endsWith('.jpg')) {
          try {
            fs.unlinkSync(path.join(this.thumbnailDir, file));
          } catch {
            // Ignore single file unlink error
          }
        }
      }
    } catch (err) {
      console.error('[MetadataService] Error during thumbnail wipe:', err);
    }
  }

  public cleanupOrphanedThumbnails(activeKeys: Set<string>): void {
    if (!fs.existsSync(this.thumbnailDir)) return;
    try {
      const files = fs.readdirSync(this.thumbnailDir);
      for (const file of files) {
        if (!file.toLowerCase().endsWith('.jpg')) continue;
        const key = path.basename(file, '.jpg');
        if (!activeKeys.has(key)) {
          try {
            fs.unlinkSync(path.join(this.thumbnailDir, file));
          } catch {
            // Ignore single file unlink error
          }
        }
      }
    } catch (err) {
      console.error('[MetadataService] Error during thumbnail cleanup:', err);
    }
  }

}
