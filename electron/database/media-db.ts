import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import koffi from 'koffi';

export interface MediaRecord {
  id: string;
  filePath: string;
  fileName: string;
  duration: number | null;
  fileSize: number | null;
  lastModified: number | null;
  firstAdded: number;
  lastOpened: number;
  lastPosition: number | null;
  videoWidth?: number | null;
  videoHeight?: number | null;
  isMissing?: boolean;
  videoCodec?: string | null;
  audioCodec?: string | null;
  fps?: number | null;
  thumbnailKey?: string | null;
}

export interface PlaylistRecord {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  itemCount?: number;
}

export interface PlaylistItemRecord {
  id: string;
  playlistId: string;
  mediaId: string;
  sortOrder: number;
  addedAt: number;
  media?: MediaRecord;
}

export interface SqliteFunctions {
  sqlite3_open: (filename: string, ppDb: unknown[]) => number;
  sqlite3_close: (db: unknown) => number;
  sqlite3_exec: (db: unknown, sql: string, cb: unknown, arg: unknown, errmsg: unknown[]) => number;
  sqlite3_prepare_v2: (db: unknown, sql: string, nByte: number, ppStmt: unknown[], pzTail: unknown) => number;
  sqlite3_step: (stmt: unknown) => number;
  sqlite3_finalize: (stmt: unknown) => number;
  sqlite3_reset: (stmt: unknown) => number;
  sqlite3_bind_text: (stmt: unknown, idx: number, val: string, nByte: number, destructor: number) => number;
  sqlite3_bind_int64: (stmt: unknown, idx: number, val: bigint | number) => number;
  sqlite3_bind_double: (stmt: unknown, idx: number, val: number) => number;
  sqlite3_bind_null: (stmt: unknown, idx: number) => number;
  sqlite3_column_text: (stmt: unknown, iCol: number) => string | null;
  sqlite3_column_int64: (stmt: unknown, iCol: number) => bigint | number;
  sqlite3_column_double: (stmt: unknown, iCol: number) => number;
  sqlite3_column_type: (stmt: unknown, iCol: number) => number;
  sqlite3_errmsg: (db: unknown) => string | null;
}

const SQLITE_OK = 0;
const SQLITE_ROW = 100;
const SQLITE_DONE = 101;
const SQLITE_NULL = 5;
const SQLITE_TRANSIENT = -1;

let cachedSqliteFuncs: SqliteFunctions | null = null;

export function getSqliteFunctions(): SqliteFunctions | null {
  if (process.platform !== 'win32') {
    return null;
  }
  if (cachedSqliteFuncs) {
    return cachedSqliteFuncs;
  }

  try {
    const sqlite = koffi.load('winsqlite3.dll');
    const sqlite3 = koffi.opaque('sqlite3');
    const sqlite3_stmt = koffi.opaque('sqlite3_stmt');

    cachedSqliteFuncs = {
      sqlite3_open: sqlite.func('int sqlite3_open(const char *filename, _Out_ sqlite3 **ppDb)'),
      sqlite3_close: sqlite.func('int sqlite3_close(sqlite3 *db)'),
      sqlite3_exec: sqlite.func('int sqlite3_exec(sqlite3 *db, const char *sql, void *cb, void *arg, _Out_ char **errmsg)'),
      sqlite3_prepare_v2: sqlite.func('int sqlite3_prepare_v2(sqlite3 *db, const char *sql, int nByte, _Out_ sqlite3_stmt **ppStmt, void *pzTail)'),
      sqlite3_step: sqlite.func('int sqlite3_step(sqlite3_stmt *stmt)'),
      sqlite3_finalize: sqlite.func('int sqlite3_finalize(sqlite3_stmt *stmt)'),
      sqlite3_reset: sqlite.func('int sqlite3_reset(sqlite3_stmt *stmt)'),
      sqlite3_bind_text: sqlite.func('int sqlite3_bind_text(sqlite3_stmt *stmt, int idx, const char *val, int nByte, intptr_t destructor)'),
      sqlite3_bind_int64: sqlite.func('int sqlite3_bind_int64(sqlite3_stmt *stmt, int idx, int64_t val)'),
      sqlite3_bind_double: sqlite.func('int sqlite3_bind_double(sqlite3_stmt *stmt, int idx, double val)'),
      sqlite3_bind_null: sqlite.func('int sqlite3_bind_null(sqlite3_stmt *stmt, int idx)'),
      sqlite3_column_text: sqlite.func('const char *sqlite3_column_text(sqlite3_stmt *stmt, int iCol)'),
      sqlite3_column_int64: sqlite.func('int64_t sqlite3_column_int64(sqlite3_stmt *stmt, int iCol)'),
      sqlite3_column_double: sqlite.func('double sqlite3_column_double(sqlite3_stmt *stmt, int iCol)'),
      sqlite3_column_type: sqlite.func('int sqlite3_column_type(sqlite3_stmt *stmt, int iCol)'),
      sqlite3_errmsg: sqlite.func('const char *sqlite3_errmsg(sqlite3 *db)'),
    };
    return cachedSqliteFuncs;
  } catch (err) {
    console.error('[MediaDatabase] Failed to bind winsqlite3.dll:', err);
    return null;
  }
}

export class MediaDatabase {
  private funcs: SqliteFunctions | null;
  private db: unknown | null = null;
  private dbPath: string;
  private isInitialized = false;

  constructor(dbPath: string, customFuncs?: SqliteFunctions | null) {
    this.dbPath = dbPath;
    this.funcs = customFuncs !== undefined ? customFuncs : getSqliteFunctions();
  }

  public init(): boolean {
    if (this.isInitialized && this.db) {
      return true;
    }
    if (!this.funcs) {
      console.warn('[MediaDatabase] SQLite bindings unavailable');
      return false;
    }

    // Ensure directory exists if not an in-memory db
    if (this.dbPath !== ':memory:') {
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    const dbPtr: unknown[] = [null];
    const rc = this.funcs.sqlite3_open(this.dbPath, dbPtr);
    if (rc !== SQLITE_OK || !dbPtr[0]) {
      console.error('[MediaDatabase] Failed to open SQLite database at:', this.dbPath, 'rc:', rc);
      return false;
    }

    this.db = dbPtr[0];
    this.runMigrations();
    this.isInitialized = true;
    return true;
  }

  private runMigrations(): void {
    if (!this.db || !this.funcs) return;

    // Create migrations table
    const createMigrationsTable = `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL
      );
    `;
    this.exec(createMigrationsTable);

    const currentVersion = this.getCurrentMigrationVersion();

    if (currentVersion < 1) {
      const migrationV1 = `
        CREATE TABLE IF NOT EXISTS media (
          id TEXT PRIMARY KEY,
          file_path TEXT UNIQUE NOT NULL,
          file_name TEXT NOT NULL,
          duration REAL,
          file_size INTEGER,
          last_modified INTEGER,
          first_added INTEGER NOT NULL,
          last_opened INTEGER NOT NULL,
          last_position REAL,
          video_width INTEGER,
          video_height INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_media_last_opened ON media(last_opened DESC);
        CREATE INDEX IF NOT EXISTS idx_media_file_path ON media(file_path);
      `;
      this.exec(migrationV1);
      this.recordMigration(1);
    }

    if (currentVersion < 2) {
      // Safely extend media table with additional metadata and thumbnail cache key
      this.exec('ALTER TABLE media ADD COLUMN video_codec TEXT;');
      this.exec('ALTER TABLE media ADD COLUMN audio_codec TEXT;');
      this.exec('ALTER TABLE media ADD COLUMN fps REAL;');
      this.exec('ALTER TABLE media ADD COLUMN thumbnail_key TEXT;');

      const migrationV2 = `
        CREATE TABLE IF NOT EXISTS playlists (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_playlists_updated ON playlists(updated_at DESC);

        CREATE TABLE IF NOT EXISTS playlist_items (
          id TEXT PRIMARY KEY,
          playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
          media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
          sort_order INTEGER NOT NULL,
          added_at INTEGER NOT NULL,
          UNIQUE(playlist_id, media_id)
        );
        CREATE INDEX IF NOT EXISTS idx_playlist_items_order ON playlist_items(playlist_id, sort_order ASC);
      `;
      this.exec(migrationV2);
      this.recordMigration(2);
    }

    if (currentVersion < 3) {
      const migrationV3 = `
        CREATE TABLE IF NOT EXISTS app_settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `;
      this.exec(migrationV3);
      this.recordMigration(3);
    }
  }

  private getCurrentMigrationVersion(): number {
    if (!this.db || !this.funcs) return 0;
    const stmtPtr: unknown[] = [null];
    const rc = this.funcs.sqlite3_prepare_v2(
      this.db,
      'SELECT MAX(version) FROM schema_migrations;',
      -1,
      stmtPtr,
      null
    );
    if (rc !== SQLITE_OK || !stmtPtr[0]) return 0;

    const stmt = stmtPtr[0];
    let version = 0;
    if (this.funcs.sqlite3_step(stmt) === SQLITE_ROW) {
      if (this.funcs.sqlite3_column_type(stmt, 0) !== SQLITE_NULL) {
        version = Number(this.funcs.sqlite3_column_int64(stmt, 0));
      }
    }
    this.funcs.sqlite3_finalize(stmt);
    return version;
  }

  private recordMigration(version: number): void {
    if (!this.db || !this.funcs) return;
    const stmtPtr: unknown[] = [null];
    const rc = this.funcs.sqlite3_prepare_v2(
      this.db,
      'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?);',
      -1,
      stmtPtr,
      null
    );
    if (rc !== SQLITE_OK || !stmtPtr[0]) return;

    const stmt = stmtPtr[0];
    this.funcs.sqlite3_bind_int64(stmt, 1, version);
    this.funcs.sqlite3_bind_int64(stmt, 2, Date.now());
    this.funcs.sqlite3_step(stmt);
    this.funcs.sqlite3_finalize(stmt);
  }

  private exec(sql: string): boolean {
    if (!this.db || !this.funcs) return false;
    const errPtr: unknown[] = [null];
    const rc = this.funcs.sqlite3_exec(this.db, sql, null, null, errPtr);
    if (rc !== SQLITE_OK) {
      const msg = errPtr[0] ? String(errPtr[0]) : 'unknown';
      console.error('[MediaDatabase] Error executing SQL:', msg);
      return false;
    }
    return true;
  }

  public addOrUpdateMedia(
    filePath: string,
    metadata?: {
      duration?: number | null;
      videoWidth?: number | null;
      videoHeight?: number | null;
    }
  ): MediaRecord | null {
    if (!this.db || !this.funcs) return null;

    const normalizedPath = path.resolve(filePath);
    const existing = this.getMediaByPath(normalizedPath);
    const now = Date.now();

    let fileSize: number | null = null;
    let lastModified: number | null = null;
    try {
      if (fs.existsSync(normalizedPath)) {
        const stat = fs.statSync(normalizedPath);
        fileSize = stat.size;
        lastModified = Math.round(stat.mtimeMs);
      }
    } catch {
      // Non-fatal if stats cannot be read
    }

    const fileName = path.basename(normalizedPath);

    if (existing) {
      // Update existing record
      const stmtPtr: unknown[] = [null];
      const sql = `
        UPDATE media
        SET file_name = ?,
            last_opened = ?,
            duration = COALESCE(?, duration),
            file_size = COALESCE(?, file_size),
            last_modified = COALESCE(?, last_modified),
            video_width = COALESCE(?, video_width),
            video_height = COALESCE(?, video_height)
        WHERE id = ?;
      `;
      const rc = this.funcs.sqlite3_prepare_v2(this.db, sql, -1, stmtPtr, null);
      if (rc !== SQLITE_OK || !stmtPtr[0]) return null;

      const stmt = stmtPtr[0];
      this.funcs.sqlite3_bind_text(stmt, 1, fileName, -1, SQLITE_TRANSIENT);
      this.funcs.sqlite3_bind_int64(stmt, 2, now);

      if (metadata?.duration !== undefined && metadata.duration !== null) {
        this.funcs.sqlite3_bind_double(stmt, 3, metadata.duration);
      } else {
        this.funcs.sqlite3_bind_null(stmt, 3);
      }

      if (fileSize !== null) {
        this.funcs.sqlite3_bind_int64(stmt, 4, fileSize);
      } else {
        this.funcs.sqlite3_bind_null(stmt, 4);
      }

      if (lastModified !== null) {
        this.funcs.sqlite3_bind_int64(stmt, 5, lastModified);
      } else {
        this.funcs.sqlite3_bind_null(stmt, 5);
      }

      if (metadata?.videoWidth !== undefined && metadata.videoWidth !== null) {
        this.funcs.sqlite3_bind_int64(stmt, 6, metadata.videoWidth);
      } else {
        this.funcs.sqlite3_bind_null(stmt, 6);
      }

      if (metadata?.videoHeight !== undefined && metadata.videoHeight !== null) {
        this.funcs.sqlite3_bind_int64(stmt, 7, metadata.videoHeight);
      } else {
        this.funcs.sqlite3_bind_null(stmt, 7);
      }

      this.funcs.sqlite3_bind_text(stmt, 8, existing.id, -1, SQLITE_TRANSIENT);
      this.funcs.sqlite3_step(stmt);
      this.funcs.sqlite3_finalize(stmt);

      return this.getMediaByPath(normalizedPath);
    }

    // Insert new record
    const id = crypto.randomUUID();
    const stmtPtr: unknown[] = [null];
    const sql = `
      INSERT INTO media (
        id, file_path, file_name, duration, file_size, last_modified,
        first_added, last_opened, last_position, video_width, video_height
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `;
    const rc = this.funcs.sqlite3_prepare_v2(this.db, sql, -1, stmtPtr, null);
    if (rc !== SQLITE_OK || !stmtPtr[0]) return null;

    const stmt = stmtPtr[0];
    this.funcs.sqlite3_bind_text(stmt, 1, id, -1, SQLITE_TRANSIENT);
    this.funcs.sqlite3_bind_text(stmt, 2, normalizedPath, -1, SQLITE_TRANSIENT);
    this.funcs.sqlite3_bind_text(stmt, 3, fileName, -1, SQLITE_TRANSIENT);

    if (metadata?.duration !== undefined && metadata.duration !== null) {
      this.funcs.sqlite3_bind_double(stmt, 4, metadata.duration);
    } else {
      this.funcs.sqlite3_bind_null(stmt, 4);
    }

    if (fileSize !== null) {
      this.funcs.sqlite3_bind_int64(stmt, 5, fileSize);
    } else {
      this.funcs.sqlite3_bind_null(stmt, 5);
    }

    if (lastModified !== null) {
      this.funcs.sqlite3_bind_int64(stmt, 6, lastModified);
    } else {
      this.funcs.sqlite3_bind_null(stmt, 6);
    }

    this.funcs.sqlite3_bind_int64(stmt, 7, now);
    this.funcs.sqlite3_bind_int64(stmt, 8, now);
    this.funcs.sqlite3_bind_null(stmt, 9); // Initial last_position is null

    if (metadata?.videoWidth !== undefined && metadata.videoWidth !== null) {
      this.funcs.sqlite3_bind_int64(stmt, 10, metadata.videoWidth);
    } else {
      this.funcs.sqlite3_bind_null(stmt, 10);
    }

    if (metadata?.videoHeight !== undefined && metadata.videoHeight !== null) {
      this.funcs.sqlite3_bind_int64(stmt, 11, metadata.videoHeight);
    } else {
      this.funcs.sqlite3_bind_null(stmt, 11);
    }

    this.funcs.sqlite3_step(stmt);
    this.funcs.sqlite3_finalize(stmt);

    return this.getMediaByPath(normalizedPath);
  }

  public getMediaByPath(filePath: string): MediaRecord | null {
    if (!this.db || !this.funcs) return null;
    const normalizedPath = path.resolve(filePath);
    const stmtPtr: unknown[] = [null];
    const sql = `
      SELECT id, file_path, file_name, duration, file_size, last_modified,
             first_added, last_opened, last_position, video_width, video_height,
             video_codec, audio_codec, fps, thumbnail_key
      FROM media
      WHERE file_path = ?;
    `;
    const rc = this.funcs.sqlite3_prepare_v2(this.db, sql, -1, stmtPtr, null);
    if (rc !== SQLITE_OK || !stmtPtr[0]) return null;

    const stmt = stmtPtr[0];
    this.funcs.sqlite3_bind_text(stmt, 1, normalizedPath, -1, SQLITE_TRANSIENT);

    let result: MediaRecord | null = null;
    if (this.funcs.sqlite3_step(stmt) === SQLITE_ROW) {
      result = this.rowToMediaRecord(stmt);
    }
    this.funcs.sqlite3_finalize(stmt);
    return result;
  }

  public getMediaById(id: string): MediaRecord | null {
    if (!this.db || !this.funcs) return null;
    const stmtPtr: unknown[] = [null];
    const sql = `
      SELECT id, file_path, file_name, duration, file_size, last_modified,
             first_added, last_opened, last_position, video_width, video_height,
             video_codec, audio_codec, fps, thumbnail_key
      FROM media
      WHERE id = ?;
    `;
    const rc = this.funcs.sqlite3_prepare_v2(this.db, sql, -1, stmtPtr, null);
    if (rc !== SQLITE_OK || !stmtPtr[0]) return null;

    const stmt = stmtPtr[0];
    this.funcs.sqlite3_bind_text(stmt, 1, id, -1, SQLITE_TRANSIENT);

    let result: MediaRecord | null = null;
    if (this.funcs.sqlite3_step(stmt) === SQLITE_ROW) {
      result = this.rowToMediaRecord(stmt);
    }
    this.funcs.sqlite3_finalize(stmt);
    return result;
  }

  public getAllMedia(): MediaRecord[] {
    if (!this.db || !this.funcs) return [];
    const stmtPtr: unknown[] = [null];
    const sql = `
      SELECT id, file_path, file_name, duration, file_size, last_modified,
             first_added, last_opened, last_position, video_width, video_height,
             video_codec, audio_codec, fps, thumbnail_key
      FROM media
      ORDER BY first_added DESC, rowid DESC;
    `;
    const rc = this.funcs.sqlite3_prepare_v2(this.db, sql, -1, stmtPtr, null);
    if (rc !== SQLITE_OK || !stmtPtr[0]) return [];

    const stmt = stmtPtr[0];
    const list: MediaRecord[] = [];
    while (this.funcs.sqlite3_step(stmt) === SQLITE_ROW) {
      list.push(this.rowToMediaRecord(stmt));
    }
    this.funcs.sqlite3_finalize(stmt);
    return list;
  }

  public getRecentMedia(limit = 20): MediaRecord[] {
    if (!this.db || !this.funcs) return [];
    const stmtPtr: unknown[] = [null];
    const sql = `
      SELECT id, file_path, file_name, duration, file_size, last_modified,
             first_added, last_opened, last_position, video_width, video_height,
             video_codec, audio_codec, fps, thumbnail_key
      FROM media
      ORDER BY last_opened DESC, first_added DESC, rowid DESC
      LIMIT ?;
    `;
    const rc = this.funcs.sqlite3_prepare_v2(this.db, sql, -1, stmtPtr, null);
    if (rc !== SQLITE_OK || !stmtPtr[0]) return [];

    const stmt = stmtPtr[0];
    this.funcs.sqlite3_bind_int64(stmt, 1, Math.max(1, limit));

    const list: MediaRecord[] = [];
    while (this.funcs.sqlite3_step(stmt) === SQLITE_ROW) {
      list.push(this.rowToMediaRecord(stmt));
    }
    this.funcs.sqlite3_finalize(stmt);
    return list;
  }

  public updateMediaMetadata(
    id: string,
    metadata: {
      duration?: number | null;
      videoWidth?: number | null;
      videoHeight?: number | null;
      videoCodec?: string | null;
      audioCodec?: string | null;
      fps?: number | null;
      thumbnailKey?: string | null;
    }
  ): boolean {
    if (!this.db || !this.funcs) return false;
    const stmtPtr: unknown[] = [null];
    const sql = `
      UPDATE media
      SET duration = COALESCE(?, duration),
          video_width = COALESCE(?, video_width),
          video_height = COALESCE(?, video_height),
          video_codec = COALESCE(?, video_codec),
          audio_codec = COALESCE(?, audio_codec),
          fps = COALESCE(?, fps),
          thumbnail_key = COALESCE(?, thumbnail_key)
      WHERE id = ?;
    `;
    const rc = this.funcs.sqlite3_prepare_v2(this.db, sql, -1, stmtPtr, null);
    if (rc !== SQLITE_OK || !stmtPtr[0]) return false;

    const stmt = stmtPtr[0];
    if (metadata.duration !== undefined && metadata.duration !== null) {
      this.funcs.sqlite3_bind_double(stmt, 1, metadata.duration);
    } else {
      this.funcs.sqlite3_bind_null(stmt, 1);
    }

    if (metadata.videoWidth !== undefined && metadata.videoWidth !== null) {
      this.funcs.sqlite3_bind_int64(stmt, 2, metadata.videoWidth);
    } else {
      this.funcs.sqlite3_bind_null(stmt, 2);
    }

    if (metadata.videoHeight !== undefined && metadata.videoHeight !== null) {
      this.funcs.sqlite3_bind_int64(stmt, 3, metadata.videoHeight);
    } else {
      this.funcs.sqlite3_bind_null(stmt, 3);
    }

    if (metadata.videoCodec !== undefined && metadata.videoCodec !== null) {
      this.funcs.sqlite3_bind_text(stmt, 4, metadata.videoCodec, -1, SQLITE_TRANSIENT);
    } else {
      this.funcs.sqlite3_bind_null(stmt, 4);
    }

    if (metadata.audioCodec !== undefined && metadata.audioCodec !== null) {
      this.funcs.sqlite3_bind_text(stmt, 5, metadata.audioCodec, -1, SQLITE_TRANSIENT);
    } else {
      this.funcs.sqlite3_bind_null(stmt, 5);
    }

    if (metadata.fps !== undefined && metadata.fps !== null) {
      this.funcs.sqlite3_bind_double(stmt, 6, metadata.fps);
    } else {
      this.funcs.sqlite3_bind_null(stmt, 6);
    }

    if (metadata.thumbnailKey !== undefined && metadata.thumbnailKey !== null) {
      this.funcs.sqlite3_bind_text(stmt, 7, metadata.thumbnailKey, -1, SQLITE_TRANSIENT);
    } else {
      this.funcs.sqlite3_bind_null(stmt, 7);
    }

    this.funcs.sqlite3_bind_text(stmt, 8, id, -1, SQLITE_TRANSIENT);
    const stepRc = this.funcs.sqlite3_step(stmt);
    this.funcs.sqlite3_finalize(stmt);
    return stepRc === SQLITE_DONE;
  }

  public updateThumbnailKey(filePath: string, thumbnailKey: string): boolean {
    if (!this.db || !this.funcs) return false;
    const normalizedPath = path.resolve(filePath);
    const stmtPtr: unknown[] = [null];
    const sql = `UPDATE media SET thumbnail_key = ? WHERE file_path = ?;`;
    const rc = this.funcs.sqlite3_prepare_v2(this.db, sql, -1, stmtPtr, null);
    if (rc !== SQLITE_OK || !stmtPtr[0]) return false;

    const stmt = stmtPtr[0];
    this.funcs.sqlite3_bind_text(stmt, 1, thumbnailKey, -1, SQLITE_TRANSIENT);
    this.funcs.sqlite3_bind_text(stmt, 2, normalizedPath, -1, SQLITE_TRANSIENT);
    const stepRc = this.funcs.sqlite3_step(stmt);
    this.funcs.sqlite3_finalize(stmt);
    return stepRc === SQLITE_DONE;
  }

  public updatePlaybackPosition(filePath: string, position: number, duration?: number | null): boolean {
    if (!this.db || !this.funcs) return false;
    const normalizedPath = path.resolve(filePath);
    const stmtPtr: unknown[] = [null];
    const sql = `
      UPDATE media
      SET last_position = ?,
          duration = COALESCE(?, duration)
      WHERE file_path = ?;
    `;
    const rc = this.funcs.sqlite3_prepare_v2(this.db, sql, -1, stmtPtr, null);
    if (rc !== SQLITE_OK || !stmtPtr[0]) return false;

    const stmt = stmtPtr[0];
    this.funcs.sqlite3_bind_double(stmt, 1, position);
    if (duration !== undefined && duration !== null) {
      this.funcs.sqlite3_bind_double(stmt, 2, duration);
    } else {
      this.funcs.sqlite3_bind_null(stmt, 2);
    }
    this.funcs.sqlite3_bind_text(stmt, 3, normalizedPath, -1, SQLITE_TRANSIENT);

    const stepRc = this.funcs.sqlite3_step(stmt);
    this.funcs.sqlite3_finalize(stmt);
    return stepRc === SQLITE_DONE;
  }

  public removeMedia(id: string): boolean {
    if (!this.db || !this.funcs) return false;
    // Clean up associated playlist items first
    const stmtPtrDelItems: unknown[] = [null];
    if (this.funcs.sqlite3_prepare_v2(this.db, 'DELETE FROM playlist_items WHERE media_id = ?;', -1, stmtPtrDelItems, null) === SQLITE_OK && stmtPtrDelItems[0]) {
      this.funcs.sqlite3_bind_text(stmtPtrDelItems[0], 1, id, -1, SQLITE_TRANSIENT);
      this.funcs.sqlite3_step(stmtPtrDelItems[0]);
      this.funcs.sqlite3_finalize(stmtPtrDelItems[0]);
    }

    const stmtPtr: unknown[] = [null];
    const sql = 'DELETE FROM media WHERE id = ?;';
    const rc = this.funcs.sqlite3_prepare_v2(this.db, sql, -1, stmtPtr, null);
    if (rc !== SQLITE_OK || !stmtPtr[0]) return false;

    const stmt = stmtPtr[0];
    this.funcs.sqlite3_bind_text(stmt, 1, id, -1, SQLITE_TRANSIENT);
    const stepRc = this.funcs.sqlite3_step(stmt);
    this.funcs.sqlite3_finalize(stmt);
    return stepRc === SQLITE_DONE;
  }

  // --- Playlist Operations (Phase 9) ---

  public createPlaylist(name: string): PlaylistRecord | null {
    if (!this.db || !this.funcs) return null;
    const trimmed = name.trim();
    if (!trimmed) return null;

    const id = crypto.randomUUID();
    const now = Date.now();
    const stmtPtr: unknown[] = [null];
    const sql = `INSERT INTO playlists (id, name, created_at, updated_at) VALUES (?, ?, ?, ?);`;
    const rc = this.funcs.sqlite3_prepare_v2(this.db, sql, -1, stmtPtr, null);
    if (rc !== SQLITE_OK || !stmtPtr[0]) return null;

    const stmt = stmtPtr[0];
    this.funcs.sqlite3_bind_text(stmt, 1, id, -1, SQLITE_TRANSIENT);
    this.funcs.sqlite3_bind_text(stmt, 2, trimmed, -1, SQLITE_TRANSIENT);
    this.funcs.sqlite3_bind_int64(stmt, 3, now);
    this.funcs.sqlite3_bind_int64(stmt, 4, now);

    const stepRc = this.funcs.sqlite3_step(stmt);
    this.funcs.sqlite3_finalize(stmt);
    if (stepRc !== SQLITE_DONE) return null;

    return {
      id,
      name: trimmed,
      createdAt: now,
      updatedAt: now,
      itemCount: 0,
    };
  }

  public renamePlaylist(id: string, name: string): PlaylistRecord | null {
    if (!this.db || !this.funcs) return null;
    const trimmed = name.trim();
    if (!trimmed) return null;

    const now = Date.now();
    const stmtPtr: unknown[] = [null];
    const sql = `UPDATE playlists SET name = ?, updated_at = ? WHERE id = ?;`;
    const rc = this.funcs.sqlite3_prepare_v2(this.db, sql, -1, stmtPtr, null);
    if (rc !== SQLITE_OK || !stmtPtr[0]) return null;

    const stmt = stmtPtr[0];
    this.funcs.sqlite3_bind_text(stmt, 1, trimmed, -1, SQLITE_TRANSIENT);
    this.funcs.sqlite3_bind_int64(stmt, 2, now);
    this.funcs.sqlite3_bind_text(stmt, 3, id, -1, SQLITE_TRANSIENT);

    const stepRc = this.funcs.sqlite3_step(stmt);
    this.funcs.sqlite3_finalize(stmt);
    if (stepRc !== SQLITE_DONE) return null;

    return this.getPlaylistById(id);
  }

  public deletePlaylist(id: string): boolean {
    if (!this.db || !this.funcs) return false;
    // Remove playlist items first
    const stmtPtrItems: unknown[] = [null];
    if (this.funcs.sqlite3_prepare_v2(this.db, 'DELETE FROM playlist_items WHERE playlist_id = ?;', -1, stmtPtrItems, null) === SQLITE_OK && stmtPtrItems[0]) {
      this.funcs.sqlite3_bind_text(stmtPtrItems[0], 1, id, -1, SQLITE_TRANSIENT);
      this.funcs.sqlite3_step(stmtPtrItems[0]);
      this.funcs.sqlite3_finalize(stmtPtrItems[0]);
    }

    const stmtPtr: unknown[] = [null];
    const sql = `DELETE FROM playlists WHERE id = ?;`;
    const rc = this.funcs.sqlite3_prepare_v2(this.db, sql, -1, stmtPtr, null);
    if (rc !== SQLITE_OK || !stmtPtr[0]) return false;

    const stmt = stmtPtr[0];
    this.funcs.sqlite3_bind_text(stmt, 1, id, -1, SQLITE_TRANSIENT);
    const stepRc = this.funcs.sqlite3_step(stmt);
    this.funcs.sqlite3_finalize(stmt);
    return stepRc === SQLITE_DONE;
  }

  public getPlaylistById(id: string): PlaylistRecord | null {
    if (!this.db || !this.funcs) return null;
    const stmtPtr: unknown[] = [null];
    const sql = `
      SELECT p.id, p.name, p.created_at, p.updated_at,
             (SELECT COUNT(*) FROM playlist_items WHERE playlist_id = p.id) as item_count
      FROM playlists p
      WHERE p.id = ?;
    `;
    const rc = this.funcs.sqlite3_prepare_v2(this.db, sql, -1, stmtPtr, null);
    if (rc !== SQLITE_OK || !stmtPtr[0]) return null;

    const stmt = stmtPtr[0];
    this.funcs.sqlite3_bind_text(stmt, 1, id, -1, SQLITE_TRANSIENT);

    let result: PlaylistRecord | null = null;
    if (this.funcs.sqlite3_step(stmt) === SQLITE_ROW) {
      result = {
        id: this.funcs.sqlite3_column_text(stmt, 0) || '',
        name: this.funcs.sqlite3_column_text(stmt, 1) || '',
        createdAt: Number(this.funcs.sqlite3_column_int64(stmt, 2)),
        updatedAt: Number(this.funcs.sqlite3_column_int64(stmt, 3)),
        itemCount: Number(this.funcs.sqlite3_column_int64(stmt, 4)),
      };
    }
    this.funcs.sqlite3_finalize(stmt);
    return result;
  }

  public getPlaylists(): PlaylistRecord[] {
    if (!this.db || !this.funcs) return [];
    const stmtPtr: unknown[] = [null];
    const sql = `
      SELECT p.id, p.name, p.created_at, p.updated_at,
             (SELECT COUNT(*) FROM playlist_items WHERE playlist_id = p.id) as item_count
      FROM playlists p
      ORDER BY p.updated_at DESC, p.created_at DESC;
    `;
    const rc = this.funcs.sqlite3_prepare_v2(this.db, sql, -1, stmtPtr, null);
    if (rc !== SQLITE_OK || !stmtPtr[0]) return [];

    const stmt = stmtPtr[0];
    const list: PlaylistRecord[] = [];
    while (this.funcs.sqlite3_step(stmt) === SQLITE_ROW) {
      list.push({
        id: this.funcs.sqlite3_column_text(stmt, 0) || '',
        name: this.funcs.sqlite3_column_text(stmt, 1) || '',
        createdAt: Number(this.funcs.sqlite3_column_int64(stmt, 2)),
        updatedAt: Number(this.funcs.sqlite3_column_int64(stmt, 3)),
        itemCount: Number(this.funcs.sqlite3_column_int64(stmt, 4)),
      });
    }
    this.funcs.sqlite3_finalize(stmt);
    return list;
  }

  public getPlaylistWithItems(id: string): { playlist: PlaylistRecord; items: PlaylistItemRecord[] } | null {
    if (!this.db || !this.funcs) return null;
    const playlist = this.getPlaylistById(id);
    if (!playlist) return null;

    const stmtPtr: unknown[] = [null];
    const sql = `
      SELECT pi.id, pi.playlist_id, pi.media_id, pi.sort_order, pi.added_at,
             m.file_path, m.file_name, m.duration, m.file_size, m.last_modified,
             m.first_added, m.last_opened, m.last_position, m.video_width, m.video_height,
             m.video_codec, m.audio_codec, m.fps, m.thumbnail_key
      FROM playlist_items pi
      JOIN media m ON pi.media_id = m.id
      WHERE pi.playlist_id = ?
      ORDER BY pi.sort_order ASC, pi.added_at ASC;
    `;
    const rc = this.funcs.sqlite3_prepare_v2(this.db, sql, -1, stmtPtr, null);
    if (rc !== SQLITE_OK || !stmtPtr[0]) return { playlist, items: [] };

    const stmt = stmtPtr[0];
    this.funcs.sqlite3_bind_text(stmt, 1, id, -1, SQLITE_TRANSIENT);

    const items: PlaylistItemRecord[] = [];
    while (this.funcs.sqlite3_step(stmt) === SQLITE_ROW) {
      const itemId = this.funcs.sqlite3_column_text(stmt, 0) || '';
      const playlistId = this.funcs.sqlite3_column_text(stmt, 1) || '';
      const mediaId = this.funcs.sqlite3_column_text(stmt, 2) || '';
      const sortOrder = Number(this.funcs.sqlite3_column_int64(stmt, 3));
      const addedAt = Number(this.funcs.sqlite3_column_int64(stmt, 4));

      const filePath = this.funcs.sqlite3_column_text(stmt, 5) || '';
      const fileName = this.funcs.sqlite3_column_text(stmt, 6) || '';
      const duration = this.funcs.sqlite3_column_type(stmt, 7) !== SQLITE_NULL ? this.funcs.sqlite3_column_double(stmt, 7) : null;
      const fileSize = this.funcs.sqlite3_column_type(stmt, 8) !== SQLITE_NULL ? Number(this.funcs.sqlite3_column_int64(stmt, 8)) : null;
      const lastModified = this.funcs.sqlite3_column_type(stmt, 9) !== SQLITE_NULL ? Number(this.funcs.sqlite3_column_int64(stmt, 9)) : null;
      const firstAdded = Number(this.funcs.sqlite3_column_int64(stmt, 10));
      const lastOpened = Number(this.funcs.sqlite3_column_int64(stmt, 11));
      const lastPosition = this.funcs.sqlite3_column_type(stmt, 12) !== SQLITE_NULL ? this.funcs.sqlite3_column_double(stmt, 12) : null;
      const videoWidth = this.funcs.sqlite3_column_type(stmt, 13) !== SQLITE_NULL ? Number(this.funcs.sqlite3_column_int64(stmt, 13)) : null;
      const videoHeight = this.funcs.sqlite3_column_type(stmt, 14) !== SQLITE_NULL ? Number(this.funcs.sqlite3_column_int64(stmt, 14)) : null;
      const videoCodec = this.funcs.sqlite3_column_type(stmt, 15) !== SQLITE_NULL ? this.funcs.sqlite3_column_text(stmt, 15) : null;
      const audioCodec = this.funcs.sqlite3_column_type(stmt, 16) !== SQLITE_NULL ? this.funcs.sqlite3_column_text(stmt, 16) : null;
      const fps = this.funcs.sqlite3_column_type(stmt, 17) !== SQLITE_NULL ? this.funcs.sqlite3_column_double(stmt, 17) : null;
      const thumbnailKey = this.funcs.sqlite3_column_type(stmt, 18) !== SQLITE_NULL ? this.funcs.sqlite3_column_text(stmt, 18) : null;

      let isMissing = false;
      try {
        isMissing = !fs.existsSync(filePath);
      } catch {
        isMissing = true;
      }

      items.push({
        id: itemId,
        playlistId,
        mediaId,
        sortOrder,
        addedAt,
        media: {
          id: mediaId,
          filePath,
          fileName,
          duration,
          fileSize,
          lastModified,
          firstAdded,
          lastOpened,
          lastPosition,
          videoWidth,
          videoHeight,
          videoCodec,
          audioCodec,
          fps,
          thumbnailKey,
          isMissing,
        },
      });
    }
    this.funcs.sqlite3_finalize(stmt);
    playlist.itemCount = items.length;
    return { playlist, items };
  }

  public addItemsToPlaylist(playlistId: string, mediaIds: string[]): boolean {
    if (!this.db || !this.funcs || mediaIds.length === 0) return false;

    // Get current max sort order
    let maxSort = -1;
    const maxStmtPtr: unknown[] = [null];
    if (this.funcs.sqlite3_prepare_v2(this.db, 'SELECT MAX(sort_order) FROM playlist_items WHERE playlist_id = ?;', -1, maxStmtPtr, null) === SQLITE_OK && maxStmtPtr[0]) {
      this.funcs.sqlite3_bind_text(maxStmtPtr[0], 1, playlistId, -1, SQLITE_TRANSIENT);
      if (this.funcs.sqlite3_step(maxStmtPtr[0]) === SQLITE_ROW) {
        if (this.funcs.sqlite3_column_type(maxStmtPtr[0], 0) !== SQLITE_NULL) {
          maxSort = Number(this.funcs.sqlite3_column_int64(maxStmtPtr[0], 0));
        }
      }
      this.funcs.sqlite3_finalize(maxStmtPtr[0]);
    }

    const now = Date.now();
    for (const mediaId of mediaIds) {
      maxSort++;
      const id = crypto.randomUUID();
      const stmtPtr: unknown[] = [null];
      const sql = `
        INSERT OR IGNORE INTO playlist_items (id, playlist_id, media_id, sort_order, added_at)
        VALUES (?, ?, ?, ?, ?);
      `;
      if (this.funcs.sqlite3_prepare_v2(this.db, sql, -1, stmtPtr, null) === SQLITE_OK && stmtPtr[0]) {
        this.funcs.sqlite3_bind_text(stmtPtr[0], 1, id, -1, SQLITE_TRANSIENT);
        this.funcs.sqlite3_bind_text(stmtPtr[0], 2, playlistId, -1, SQLITE_TRANSIENT);
        this.funcs.sqlite3_bind_text(stmtPtr[0], 3, mediaId, -1, SQLITE_TRANSIENT);
        this.funcs.sqlite3_bind_int64(stmtPtr[0], 4, maxSort);
        this.funcs.sqlite3_bind_int64(stmtPtr[0], 5, now);
        this.funcs.sqlite3_step(stmtPtr[0]);
        this.funcs.sqlite3_finalize(stmtPtr[0]);
      }
    }

    // Touch updated_at on playlist
    const touchStmtPtr: unknown[] = [null];
    if (this.funcs.sqlite3_prepare_v2(this.db, 'UPDATE playlists SET updated_at = ? WHERE id = ?;', -1, touchStmtPtr, null) === SQLITE_OK && touchStmtPtr[0]) {
      this.funcs.sqlite3_bind_int64(touchStmtPtr[0], 1, now);
      this.funcs.sqlite3_bind_text(touchStmtPtr[0], 2, playlistId, -1, SQLITE_TRANSIENT);
      this.funcs.sqlite3_step(touchStmtPtr[0]);
      this.funcs.sqlite3_finalize(touchStmtPtr[0]);
    }

    return true;
  }

  public addFilesToPlaylist(
    playlistId: string,
    filePaths: string[]
  ): { addedCount: number; mediaRecords: MediaRecord[] } {
    if (!this.db || !this.funcs || filePaths.length === 0) {
      return { addedCount: 0, mediaRecords: [] };
    }

    const mediaRecords: MediaRecord[] = [];
    const mediaIds: string[] = [];

    for (const rawPath of filePaths) {
      if (!rawPath || typeof rawPath !== 'string') continue;
      try {
        const resolved = path.resolve(rawPath);
        if (!fs.existsSync(resolved)) continue;
        const stat = fs.statSync(resolved);
        if (!stat.isFile()) continue;

        const record = this.addOrUpdateMedia(resolved);
        if (record) {
          mediaRecords.push(record);
          mediaIds.push(record.id);
        }
      } catch (err) {
        console.warn('[MediaDatabase] Error adding file to playlist:', rawPath, err);
      }
    }

    if (mediaIds.length === 0) {
      return { addedCount: 0, mediaRecords: [] };
    }

    const success = this.addItemsToPlaylist(playlistId, mediaIds);
    return { addedCount: success ? mediaIds.length : 0, mediaRecords };
  }

  public removeItemFromPlaylist(playlistId: string, mediaId: string): boolean {
    if (!this.db || !this.funcs) return false;
    const stmtPtr: unknown[] = [null];
    const sql = `DELETE FROM playlist_items WHERE playlist_id = ? AND media_id = ?;`;
    const rc = this.funcs.sqlite3_prepare_v2(this.db, sql, -1, stmtPtr, null);
    if (rc !== SQLITE_OK || !stmtPtr[0]) return false;

    const stmt = stmtPtr[0];
    this.funcs.sqlite3_bind_text(stmt, 1, playlistId, -1, SQLITE_TRANSIENT);
    this.funcs.sqlite3_bind_text(stmt, 2, mediaId, -1, SQLITE_TRANSIENT);
    const stepRc = this.funcs.sqlite3_step(stmt);
    this.funcs.sqlite3_finalize(stmt);

    const now = Date.now();
    const touchStmtPtr: unknown[] = [null];
    if (this.funcs.sqlite3_prepare_v2(this.db, 'UPDATE playlists SET updated_at = ? WHERE id = ?;', -1, touchStmtPtr, null) === SQLITE_OK && touchStmtPtr[0]) {
      this.funcs.sqlite3_bind_int64(touchStmtPtr[0], 1, now);
      this.funcs.sqlite3_bind_text(touchStmtPtr[0], 2, playlistId, -1, SQLITE_TRANSIENT);
      this.funcs.sqlite3_step(touchStmtPtr[0]);
      this.funcs.sqlite3_finalize(touchStmtPtr[0]);
    }

    return stepRc === SQLITE_DONE;
  }

  public reorderPlaylistItems(playlistId: string, mediaIds: string[]): boolean {
    if (!this.db || !this.funcs) return false;
    const now = Date.now();

    for (let i = 0; i < mediaIds.length; i++) {
      const stmtPtr: unknown[] = [null];
      const sql = `UPDATE playlist_items SET sort_order = ? WHERE playlist_id = ? AND media_id = ?;`;
      if (this.funcs.sqlite3_prepare_v2(this.db, sql, -1, stmtPtr, null) === SQLITE_OK && stmtPtr[0]) {
        this.funcs.sqlite3_bind_int64(stmtPtr[0], 1, i);
        this.funcs.sqlite3_bind_text(stmtPtr[0], 2, playlistId, -1, SQLITE_TRANSIENT);
        this.funcs.sqlite3_bind_text(stmtPtr[0], 3, mediaIds[i], -1, SQLITE_TRANSIENT);
        this.funcs.sqlite3_step(stmtPtr[0]);
        this.funcs.sqlite3_finalize(stmtPtr[0]);
      }
    }

    const touchStmtPtr: unknown[] = [null];
    if (this.funcs.sqlite3_prepare_v2(this.db, 'UPDATE playlists SET updated_at = ? WHERE id = ?;', -1, touchStmtPtr, null) === SQLITE_OK && touchStmtPtr[0]) {
      this.funcs.sqlite3_bind_int64(touchStmtPtr[0], 1, now);
      this.funcs.sqlite3_bind_text(touchStmtPtr[0], 2, playlistId, -1, SQLITE_TRANSIENT);
      this.funcs.sqlite3_step(touchStmtPtr[0]);
      this.funcs.sqlite3_finalize(touchStmtPtr[0]);
    }

    return true;
  }

  private rowToMediaRecord(stmt: unknown): MediaRecord {
    if (!this.funcs) throw new Error('Unreachable: funcs is null');
    const id = this.funcs.sqlite3_column_text(stmt, 0) || '';
    const filePath = this.funcs.sqlite3_column_text(stmt, 1) || '';
    const fileName = this.funcs.sqlite3_column_text(stmt, 2) || '';

    const duration =
      this.funcs.sqlite3_column_type(stmt, 3) !== SQLITE_NULL
        ? this.funcs.sqlite3_column_double(stmt, 3)
        : null;

    const fileSize =
      this.funcs.sqlite3_column_type(stmt, 4) !== SQLITE_NULL
        ? Number(this.funcs.sqlite3_column_int64(stmt, 4))
        : null;

    const lastModified =
      this.funcs.sqlite3_column_type(stmt, 5) !== SQLITE_NULL
        ? Number(this.funcs.sqlite3_column_int64(stmt, 5))
        : null;

    const firstAdded = Number(this.funcs.sqlite3_column_int64(stmt, 6));
    const lastOpened = Number(this.funcs.sqlite3_column_int64(stmt, 7));

    const lastPosition =
      this.funcs.sqlite3_column_type(stmt, 8) !== SQLITE_NULL
        ? this.funcs.sqlite3_column_double(stmt, 8)
        : null;

    const videoWidth =
      this.funcs.sqlite3_column_type(stmt, 9) !== SQLITE_NULL
        ? Number(this.funcs.sqlite3_column_int64(stmt, 9))
        : null;

    const videoHeight =
      this.funcs.sqlite3_column_type(stmt, 10) !== SQLITE_NULL
        ? Number(this.funcs.sqlite3_column_int64(stmt, 10))
        : null;

    const videoCodec =
      this.funcs.sqlite3_column_type(stmt, 11) !== SQLITE_NULL
        ? this.funcs.sqlite3_column_text(stmt, 11)
        : null;

    const audioCodec =
      this.funcs.sqlite3_column_type(stmt, 12) !== SQLITE_NULL
        ? this.funcs.sqlite3_column_text(stmt, 12)
        : null;

    const fps =
      this.funcs.sqlite3_column_type(stmt, 13) !== SQLITE_NULL
        ? this.funcs.sqlite3_column_double(stmt, 13)
        : null;

    const thumbnailKey =
      this.funcs.sqlite3_column_type(stmt, 14) !== SQLITE_NULL
        ? this.funcs.sqlite3_column_text(stmt, 14)
        : null;

    let isMissing = false;
    try {
      isMissing = !fs.existsSync(filePath);
    } catch {
      isMissing = true;
    }

    return {
      id,
      filePath,
      fileName,
      duration,
      fileSize,
      lastModified,
      firstAdded,
      lastOpened,
      lastPosition,
      videoWidth,
      videoHeight,
      videoCodec,
      audioCodec,
      fps,
      thumbnailKey,
      isMissing,
    };
  }

  public getSetting(key: string): string | null {
    if (!this.db || !this.funcs) return null;
    const stmtPtr: unknown[] = [null];
    const rc = this.funcs.sqlite3_prepare_v2(
      this.db,
      'SELECT value FROM app_settings WHERE key = ?;',
      -1,
      stmtPtr,
      null
    );
    if (rc !== SQLITE_OK || !stmtPtr[0]) return null;

    const stmt = stmtPtr[0];
    this.funcs.sqlite3_bind_text(stmt, 1, key, -1, SQLITE_TRANSIENT);

    let val: string | null = null;
    if (this.funcs.sqlite3_step(stmt) === SQLITE_ROW) {
      if (this.funcs.sqlite3_column_type(stmt, 0) !== SQLITE_NULL) {
        val = this.funcs.sqlite3_column_text(stmt, 0);
      }
    }
    this.funcs.sqlite3_finalize(stmt);
    return val;
  }

  public setSetting(key: string, value: string): boolean {
    if (!this.db || !this.funcs) return false;
    const stmtPtr: unknown[] = [null];
    const rc = this.funcs.sqlite3_prepare_v2(
      this.db,
      'INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ' +
      'ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;',
      -1,
      stmtPtr,
      null
    );
    if (rc !== SQLITE_OK || !stmtPtr[0]) return false;

    const stmt = stmtPtr[0];
    this.funcs.sqlite3_bind_text(stmt, 1, key, -1, SQLITE_TRANSIENT);
    this.funcs.sqlite3_bind_text(stmt, 2, value, -1, SQLITE_TRANSIENT);
    this.funcs.sqlite3_bind_int64(stmt, 3, BigInt(Date.now()));

    const stepRc = this.funcs.sqlite3_step(stmt);
    this.funcs.sqlite3_finalize(stmt);
    return stepRc === SQLITE_DONE;
  }

  public getAllSettings(): Record<string, string> {
    const settings: Record<string, string> = {};
    if (!this.db || !this.funcs) return settings;

    const stmtPtr: unknown[] = [null];
    const rc = this.funcs.sqlite3_prepare_v2(
      this.db,
      'SELECT key, value FROM app_settings;',
      -1,
      stmtPtr,
      null
    );
    if (rc !== SQLITE_OK || !stmtPtr[0]) return settings;

    const stmt = stmtPtr[0];
    while (this.funcs.sqlite3_step(stmt) === SQLITE_ROW) {
      const k = this.funcs.sqlite3_column_text(stmt, 0);
      const v = this.funcs.sqlite3_column_text(stmt, 1);
      if (k !== null && v !== null) {
        settings[k] = v;
      }
    }
    this.funcs.sqlite3_finalize(stmt);
    return settings;
  }

  public setAllSettings(settings: Record<string, string>): boolean {
    if (!this.db || !this.funcs) return false;
    this.exec('BEGIN TRANSACTION;');
    try {
      for (const [k, v] of Object.entries(settings)) {
        this.setSetting(k, v);
      }
      this.exec('COMMIT;');
      return true;
    } catch {
      this.exec('ROLLBACK;');
      return false;
    }
  }

  public resetSettings(): boolean {
    if (!this.db || !this.funcs) return false;
    return this.exec('DELETE FROM app_settings;');
  }

  public close(): void {
    if (this.db && this.funcs) {
      try {
        this.funcs.sqlite3_close(this.db);
      } catch (err) {
        console.error('[MediaDatabase] Error closing SQLite database:', err);
      } finally {
        this.db = null;
        this.isInitialized = false;
      }
    }
  }
}
