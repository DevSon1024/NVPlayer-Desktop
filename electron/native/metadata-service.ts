import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import {
  getMpvFunctions,
  MpvFunctions,
  safeGetMpvPropertyString,
  MPV_EVENT,
} from './mpv-bindings';
import { MediaDatabase, MediaRecord } from '../database/media-db';

let electronNativeImage: typeof import('electron').nativeImage | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const electron = require('electron');
  if (electron && electron.nativeImage) {
    electronNativeImage = electron.nativeImage;
  }
} catch {
  electronNativeImage = null;
}

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

export interface JpegInspectionResult {
  valid: boolean;
  width: number;
  height: number;
  isBlack: boolean;
}

export function inspectJpegFile(filePath: string): JpegInspectionResult {
  try {
    if (!fs.existsSync(filePath)) {
      return { valid: false, width: 0, height: 0, isBlack: true };
    }
    const buf = fs.readFileSync(filePath);
    if (buf.length < 16 || buf[0] !== 0xff || buf[1] !== 0xd8) {
      return { valid: false, width: 0, height: 0, isBlack: true };
    }

    let offset = 2;
    let width = 0;
    let height = 0;
    while (offset < buf.length - 8) {
      if (buf[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = buf[offset + 1];
      if (marker === 0xff || marker === 0x00) {
        offset++;
        continue;
      }
      if (marker === 0xda || marker === 0xd9) {
        break;
      }
      const length = buf.readUInt16BE(offset + 2);
      if (marker === 0xc0 || marker === 0xc2) {
        height = buf.readUInt16BE(offset + 5);
        width = buf.readUInt16BE(offset + 7);
        break;
      }
      offset += 2 + length;
    }

    if (width <= 0 || height <= 0) {
      return { valid: false, width: 0, height: 0, isBlack: true };
    }

    let isBlack = false;
    if (electronNativeImage) {
      try {
        const img = electronNativeImage.createFromBuffer(buf);
        if (!img.isEmpty()) {
          const raw = img.toBitmap();
          const totalPixels = width * height;
          const step = Math.max(1, Math.floor(totalPixels / 100));
          let maxBrightness = 0;
          for (let i = 0; i < totalPixels; i += step) {
            const idx = i * 4;
            if (idx + 2 < raw.length) {
              const r = raw[idx];
              const g = raw[idx + 1];
              const b = raw[idx + 2];
              const br = (r * 299 + g * 587 + b * 114) / 1000;
              if (br > maxBrightness) {
                maxBrightness = br;
                if (maxBrightness > 25) break;
              }
            }
          }
          isBlack = maxBrightness < 20;
        }
      } catch {
        isBlack = buf.length < 18000 && width >= 640 && height >= 360;
      }
    } else {
      isBlack = buf.length < 18000 && width >= 640 && height >= 360;
    }

    return { valid: true, width, height, isBlack };
  } catch {
    return { valid: false, width: 0, height: 0, isBlack: true };
  }
}

export type MetadataUpdateCallback = (media: MediaRecord) => void;

interface ExtractionJob {
  filePath: string;
  mediaId?: string;
  fileSize: number | null;
  lastModified: number | null;
  cacheKey: string;
  mode: 'smart' | 'first_frame' | 'frame_position' | 'embedded';
  position: number;
  force: boolean;
  priority: number;
  resolves: Array<(result: ExtractedMetadata | null) => void>;
}

export class MetadataService {
  private thumbnailDir: string;
  private mediaDb: MediaDatabase;
  private funcsGetter: () => MpvFunctions;
  private updateCallbacks: MetadataUpdateCallback[] = [];

  // Bounded prioritized worker scheduler
  private readonly maxConcurrency = 2;
  private activeWorkers = 0;
  private queue: ExtractionJob[] = [];
  private inFlightMap = new Map<string, Promise<ExtractedMetadata | null>>();
  private isShuttingDown = false;

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

  public extractForMedia(media: MediaRecord, force = false, priority = 2): Promise<ExtractedMetadata | null> {
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
      // Keep existing stats on failure
    }

    const { mode, position } = this.getThumbnailStrategy();
    const expectedKey = computeMediaThumbnailKey(resolvedPath, currentSize, currentMtime, mode, position);
    const existingThumbPath = path.join(this.thumbnailDir, `${expectedKey}.jpg`);

    const hasFullMetadata =
      media.duration !== null &&
      media.duration !== undefined &&
      media.videoWidth !== null &&
      media.videoWidth !== undefined &&
      media.videoCodec !== null &&
      media.videoCodec !== undefined;

    // Cache hit: If not forced, metadata is already complete, and thumbnail file exists and is valid
    if (!force && hasFullMetadata && media.thumbnailKey === expectedKey) {
      const inspect = inspectJpegFile(existingThumbPath);
      if (inspect.valid && (!inspect.isBlack || (media.duration && media.duration <= 10))) {
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
    }

    return this.queueExtraction(
      resolvedPath,
      media.id,
      currentSize,
      currentMtime,
      expectedKey,
      mode,
      position,
      force,
      priority
    );
  }

  public extractForFile(filePath: string, force = false, priority = 2): Promise<ExtractedMetadata | null> {
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

    return this.queueExtraction(
      resolvedPath,
      existingMedia?.id,
      fileSize,
      lastModified,
      key,
      mode,
      position,
      force,
      priority
    );
  }

  private queueExtraction(
    filePath: string,
    mediaId: string | undefined,
    fileSize: number | null,
    lastModified: number | null,
    cacheKey: string,
    mode: 'smart' | 'first_frame' | 'frame_position' | 'embedded' = 'smart',
    position = 33,
    force = false,
    priority = 2
  ): Promise<ExtractedMetadata | null> {
    if (this.isShuttingDown) {
      return Promise.resolve(null);
    }

    const dedupKey = `${filePath}:${cacheKey}`;

    // 1. In-flight task deduplication
    if (!force && this.inFlightMap.has(dedupKey)) {
      return this.inFlightMap.get(dedupKey)!;
    }

    // 2. Pending queue coalescing & deduplication
    const existingIndex = this.queue.findIndex((job) => job.filePath === filePath);
    if (existingIndex >= 0) {
      const existing = this.queue[existingIndex];
      if (existing.cacheKey === cacheKey && !force) {
        if (priority < existing.priority) {
          existing.priority = priority;
        }
        if (this.inFlightMap.has(dedupKey)) {
          return this.inFlightMap.get(dedupKey)!;
        }
        return new Promise<ExtractedMetadata | null>((resolve) => {
          existing.resolves.push(resolve);
        });
      }

      // Setting or force changed: coalesce pending job in place
      this.inFlightMap.delete(`${existing.filePath}:${existing.cacheKey}`);
      existing.cacheKey = cacheKey;
      existing.mode = mode;
      existing.position = position;
      existing.force = force;
      if (priority < existing.priority) {
        existing.priority = priority;
      }
      let taskResolve!: (result: ExtractedMetadata | null) => void;
      const coalescedPromise = new Promise<ExtractedMetadata | null>((resolve) => {
        taskResolve = resolve;
      });
      existing.resolves.push(taskResolve);
      this.inFlightMap.set(dedupKey, coalescedPromise);
      return coalescedPromise;
    }

    // 3. Enqueue new task
    let taskResolve!: (result: ExtractedMetadata | null) => void;
    const taskPromise = new Promise<ExtractedMetadata | null>((resolve) => {
      taskResolve = resolve;
    });

    this.queue.push({
      filePath,
      mediaId,
      fileSize,
      lastModified,
      cacheKey,
      mode,
      position,
      force,
      priority,
      resolves: [taskResolve],
    });

    this.inFlightMap.set(dedupKey, taskPromise);
    this.schedule();
    return taskPromise;
  }

  private schedule(): void {
    if (this.isShuttingDown) return;

    while (this.activeWorkers < this.maxConcurrency && this.queue.length > 0) {
      // Prioritize lowest priority value (1 = high, 2 = normal)
      this.queue.sort((a, b) => a.priority - b.priority);
      const job = this.queue.shift();
      if (!job) break;

      this.activeWorkers++;
      const dedupKey = `${job.filePath}:${job.cacheKey}`;
      void this.executeJob(job).finally(() => {
        this.activeWorkers--;
        this.inFlightMap.delete(dedupKey);
        // Cooperative yield to event loop
        setImmediate(() => this.schedule());
      });
    }
  }

  private async executeJob(job: ExtractionJob): Promise<ExtractedMetadata | null> {
    let result: ExtractedMetadata | null = null;
    try {
      // Fast cache hit validation if not forced
      if (!job.force) {
        const finalThumbPath = path.join(this.thumbnailDir, `${job.cacheKey}.jpg`);
        const inspect = inspectJpegFile(finalThumbPath);
        if (inspect.valid && !inspect.isBlack) {
          const media = job.mediaId ? this.mediaDb.getMediaById(job.mediaId) : null;
          result = {
            duration: media?.duration ?? null,
            videoWidth: inspect.width,
            videoHeight: inspect.height,
            videoCodec: media?.videoCodec ?? null,
            audioCodec: media?.audioCodec ?? null,
            fps: media?.fps ?? null,
            thumbnailKey: job.cacheKey,
            fileSize: job.fileSize,
            lastModified: job.lastModified,
          };
        }
      }

      if (!result) {
        result = await this.performExtraction(
          job.filePath,
          job.fileSize,
          job.lastModified,
          job.cacheKey,
          job.mode,
          job.position
        );
      }

      if (result && job.mediaId) {
        this.mediaDb.updateMediaMetadata(job.mediaId, {
          duration: result.duration,
          videoWidth: result.videoWidth,
          videoHeight: result.videoHeight,
          videoCodec: result.videoCodec,
          audioCodec: result.audioCodec,
          fps: result.fps,
          thumbnailKey: result.thumbnailKey,
        });
        const updated = this.mediaDb.getMediaById(job.mediaId);
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
    } catch (err) {
      console.error('[MetadataService] Extraction failed for:', job.filePath, err);
    } finally {
      for (const resolve of job.resolves) {
        try {
          resolve(result);
        } catch {
          // Ignore caller handler errors
        }
      }
    }
    return result;
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

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nv-meta-'));
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
      funcs.mpv_set_property_string(ctx, 'hwdec', 'no');
      funcs.mpv_set_property_string(ctx, 'demuxer-max-bytes', '10485760');

      const initCode = funcs.mpv_initialize(ctx);
      if (initCode < 0) {
        throw new Error(`mpv_initialize failed with code ${initCode}`);
      }

      const loadCode = funcs.mpv_command(ctx, ['loadfile', filePath, 'replace', null]);
      if (loadCode < 0) {
        throw new Error(`loadfile command failed with code ${loadCode}`);
      }

      // Process initial load events (wait for FILE_LOADED = 8 or duration available)
      for (let i = 0; i < 30; i++) {
        const ev = funcs.mpv_wait_event(ctx, 0.05);
        if (ev && (ev as { event_id?: number }).event_id === MPV_EVENT.FILE_LOADED) {
          break;
        }
        const dur = safeGetMpvPropertyString(funcs, ctx, 'duration');
        if (dur) break;
      }

      // Discover tracks
      let albumArtTrackId: string | null = null;
      let mainVideoTrackId: string | null = null;
      const countStr = safeGetMpvPropertyString(funcs, ctx, 'track-list/count');
      const count = countStr ? parseInt(countStr, 10) : 0;
      for (let i = 0; i < count; i++) {
        const art = safeGetMpvPropertyString(funcs, ctx, `track-list/${i}/albumart`);
        const img = safeGetMpvPropertyString(funcs, ctx, `track-list/${i}/image`);
        const trackType = safeGetMpvPropertyString(funcs, ctx, `track-list/${i}/type`);
        const trackId = safeGetMpvPropertyString(funcs, ctx, `track-list/${i}/id`);
        if (trackType === 'video') {
          if ((art === 'yes' || img === 'yes') && !albumArtTrackId && trackId) {
            albumArtTrackId = trackId;
          } else if (art !== 'yes' && img !== 'yes' && !mainVideoTrackId && trackId) {
            mainVideoTrackId = trackId;
          }
        }
      }

      const durStr = safeGetMpvPropertyString(funcs, ctx, 'duration');
      const duration = durStr ? parseFloat(durStr) : null;
      const durSec = duration && !isNaN(duration) ? duration : 0;

      let chosenCandidate: string | null = null;

      // 1. Separate embedded artwork extraction
      if ((mode === 'smart' || mode === 'embedded') && albumArtTrackId) {
        funcs.mpv_set_property_string(ctx, 'vid', albumArtTrackId);
        for (let i = 0; i < 15; i++) {
          funcs.mpv_wait_event(ctx, 0.05);
          const files = fs.readdirSync(tempDir).filter((f) => f.toLowerCase().endsWith('.jpg'));
          if (files.length > 0) {
            const cand = path.join(tempDir, files[0]);
            const insp = inspectJpegFile(cand);
            if (insp.valid && !insp.isBlack) {
              chosenCandidate = cand;
              break;
            }
          }
        }
      }

      // 2. Video-frame extraction (for frame strategies or when embedded artwork is absent/unusable)
      if (!chosenCandidate) {
        if (mainVideoTrackId) {
          funcs.mpv_set_property_string(ctx, 'vid', mainVideoTrackId);
        }

        let targetPct = 33;
        if (mode === 'first_frame') {
          targetPct = 0;
        } else if (mode === 'frame_position') {
          targetPct = Math.max(0, Math.min(100, Math.round(position)));
        } else if (mode === 'smart' || mode === 'embedded') {
          targetPct = 33;
        }

        const extractFrameAt = (pct: number): string | null => {
          const before = new Set(fs.readdirSync(tempDir));
          if (pct > 0) {
            funcs.mpv_command(ctx, ['seek', String(pct), 'absolute-percent+exact', null]);
            for (let i = 0; i < 20; i++) {
              const ev = funcs.mpv_wait_event(ctx, 0.05);
              // MPV_EVENT.PLAYBACK_RESTART = 21
              if (ev && (ev as { event_id?: number }).event_id === MPV_EVENT.PLAYBACK_RESTART) {
                break;
              }
            }
          }

          funcs.mpv_command(ctx, ['frame-step', null]);
          for (let i = 0; i < 15; i++) {
            funcs.mpv_wait_event(ctx, 0.05);
            const files = fs.readdirSync(tempDir).filter((f) => f.toLowerCase().endsWith('.jpg'));
            const newFiles = files.filter((f) => !before.has(f));
            if (newFiles.length > 0) {
              return path.join(tempDir, newFiles[newFiles.length - 1]);
            }
          }

          const allFiles = fs.readdirSync(tempDir).filter((f) => f.toLowerCase().endsWith('.jpg'));
          allFiles.sort((a, b) => a.localeCompare(b));
          return allFiles.length > 0 ? path.join(tempDir, allFiles[allFiles.length - 1]) : null;
        };

        const initialFrame = extractFrameAt(targetPct);
        if (initialFrame) {
          const insp = inspectJpegFile(initialFrame);
          if (insp.valid && !insp.isBlack) {
            chosenCandidate = initialFrame;
          } else if (insp.valid && insp.isBlack) {
            // Initial frame is black/blank: attempt bounded forward step
            if (targetPct === 0 && durSec > 5) {
              // First frame mode: try step forward to 2%
              const frame2 = extractFrameAt(2);
              if (frame2) {
                const insp2 = inspectJpegFile(frame2);
                if (insp2.valid && !insp2.isBlack) {
                  chosenCandidate = frame2;
                } else if (durSec > 30) {
                  // If still black, try 5%
                  const frame3 = extractFrameAt(5);
                  if (frame3) {
                    const insp3 = inspectJpegFile(frame3);
                    chosenCandidate = insp3.valid && !insp3.isBlack ? frame3 : frame1Fallback(frame2, initialFrame);
                  } else {
                    chosenCandidate = frame2;
                  }
                } else {
                  chosenCandidate = frame2;
                }
              } else {
                chosenCandidate = initialFrame;
              }
            } else if (targetPct === 33 && durSec > 30) {
              // Smart/embedded fallback: 33% was black, try 50%
              const frameAlt = extractFrameAt(50);
              if (frameAlt && inspectJpegFile(frameAlt).valid && !inspectJpegFile(frameAlt).isBlack) {
                chosenCandidate = frameAlt;
              } else {
                chosenCandidate = initialFrame;
              }
            } else {
              chosenCandidate = initialFrame;
            }
          }
        }
      }

      // 3. Atomically validate and place the final thumbnail
      let hasThumbnail = false;
      if (chosenCandidate && fs.existsSync(chosenCandidate)) {
        const finalInspection = inspectJpegFile(chosenCandidate);
        if (finalInspection.valid) {
          fs.copyFileSync(chosenCandidate, finalThumbPath);
          hasThumbnail = fs.existsSync(finalThumbPath) && fs.statSync(finalThumbPath).size > 0;
        }
      }

      // Extract raw properties
      const wStr =
        safeGetMpvPropertyString(funcs, ctx, 'dwidth') ||
        safeGetMpvPropertyString(funcs, ctx, 'video-params/w');
      const hStr =
        safeGetMpvPropertyString(funcs, ctx, 'dheight') ||
        safeGetMpvPropertyString(funcs, ctx, 'video-params/h');
      const vcodec = safeGetMpvPropertyString(funcs, ctx, 'video-codec');
      const acodec = safeGetMpvPropertyString(funcs, ctx, 'audio-codec');
      const fpsStr = safeGetMpvPropertyString(funcs, ctx, 'container-fps');

      const videoWidth = wStr ? parseInt(wStr, 10) : null;
      const videoHeight = hStr ? parseInt(hStr, 10) : null;
      const fps = fpsStr ? parseFloat(fpsStr) : null;

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
          // Ignore terminate errors
        }
      }
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore rm errors
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

  public shutdown(): void {
    this.isShuttingDown = true;
    for (const job of this.queue) {
      for (const resolve of job.resolves) {
        resolve(null);
      }
    }
    this.queue = [];
    this.inFlightMap.clear();
  }
}

function frame1Fallback(cand: string | null, def: string | null): string | null {
  return cand || def;
}
