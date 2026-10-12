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
  lastModified: number | null
): string {
  const norm = path.resolve(filePath).toLowerCase();
  return crypto
    .createHash('sha256')
    .update(`${norm}:${fileSize ?? 0}:${lastModified ?? 0}`)
    .digest('hex');
}

export class MetadataService {
  private thumbnailDir: string;
  private mediaDb: MediaDatabase;
  private funcsGetter: () => MpvFunctions;
  private pendingPromises = new Map<string, Promise<ExtractedMetadata | null>>();
  private queue: Array<() => Promise<void>> = [];
  private isProcessingQueue = false;

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

  public async extractForMedia(media: MediaRecord): Promise<ExtractedMetadata | null> {
    const resolvedPath = path.resolve(media.filePath);
    if (!fs.existsSync(resolvedPath)) {
      return null;
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

    const expectedKey = computeMediaThumbnailKey(resolvedPath, currentSize, currentMtime);
    const existingThumbPath = path.join(this.thumbnailDir, `${expectedKey}.jpg`);
    const hasThumb = fs.existsSync(existingThumbPath);

    const hasFullMetadata =
      media.duration !== null &&
      media.duration !== undefined &&
      media.videoWidth !== null &&
      media.videoWidth !== undefined &&
      media.videoCodec !== null &&
      media.videoCodec !== undefined;

    // Cache hit: If metadata is already complete and thumbnail file exists, no need to probe
    if (hasFullMetadata && hasThumb && media.thumbnailKey === expectedKey) {
      return {
        duration: media.duration,
        videoWidth: media.videoWidth ?? null,
        videoHeight: media.videoHeight ?? null,
        videoCodec: media.videoCodec ?? null,
        audioCodec: media.audioCodec ?? null,
        fps: media.fps ?? null,
        thumbnailKey: expectedKey,
        fileSize: currentSize,
        lastModified: currentMtime,
      };
    }

    return this.queueExtraction(resolvedPath, media.id, currentSize, currentMtime, expectedKey);
  }

  public async extractForFile(filePath: string): Promise<ExtractedMetadata | null> {
    const resolvedPath = path.resolve(filePath);
    if (!fs.existsSync(resolvedPath)) {
      return null;
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

    const key = computeMediaThumbnailKey(resolvedPath, fileSize, lastModified);
    const existingMedia = this.mediaDb.getMediaByPath(resolvedPath);

    return this.queueExtraction(resolvedPath, existingMedia?.id, fileSize, lastModified, key);
  }

  private queueExtraction(
    filePath: string,
    mediaId: string | undefined,
    fileSize: number | null,
    lastModified: number | null,
    cacheKey: string
  ): Promise<ExtractedMetadata | null> {
    // Deduplicate in-flight requests for the same file
    if (this.pendingPromises.has(filePath)) {
      return this.pendingPromises.get(filePath)!;
    }

    const extractionPromise = new Promise<ExtractedMetadata | null>((resolve) => {
      this.enqueueTask(async () => {
        try {
          const result = await this.performExtraction(filePath, fileSize, lastModified, cacheKey);
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
          }
          resolve(result);
        } catch (err) {
          console.error('[MetadataService] Extraction failed for:', filePath, err);
          resolve(null);
        } finally {
          this.pendingPromises.delete(filePath);
        }
      });
    });

    this.pendingPromises.set(filePath, extractionPromise);
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
    cacheKey: string
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
      funcs.mpv_set_property_string(ctx, 'start', '1');

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

      // Step one frame to force vo=image output
      funcs.mpv_command(ctx, ['frame-step', null]);
      for (let i = 0; i < 15; i++) {
        funcs.mpv_wait_event(ctx, 0.05);
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
        const files = fs.readdirSync(tempDir);
        const firstJpg = files.find((f) => f.toLowerCase().endsWith('.jpg'));
        if (firstJpg) {
          const srcThumb = path.join(tempDir, firstJpg);
          fs.copyFileSync(srcThumb, finalThumbPath);
          hasThumbnail = true;
        }
      } catch (err) {
        console.warn('[MetadataService] Could not copy generated thumbnail:', err);
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
