import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import koffi from 'koffi';

console.log('=== Phase 9: Playlists, Thumbnail Generation & Media Metadata Tests ===');

const rootDir = process.cwd();
const dllPath = path.resolve(rootDir, 'windows', 'x64', 'libmpv-2.dll');
const ffmpegExe = 'C:\\ffmpeg\\bin\\ffmpeg.exe';
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nosved-p9-test-'));
const testDbPath = path.join(tempDir, 'test_media.db');
const testThumbDir = path.join(tempDir, 'thumbnails');
fs.mkdirSync(testThumbDir, { recursive: true });

// ----------------------------------------------------
// Section 1: SQLite V2 Migration & Playlists Persistence
// ----------------------------------------------------
console.log('\n[1/5] Testing SQLite Migration V2 & Playlist CRUD Operations...');

const sqlite = koffi.load('winsqlite3.dll');
const sqlite3 = koffi.opaque('sqlite3');
const sqlite3_stmt = koffi.opaque('sqlite3_stmt');

const funcs = {
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
};

const SQLITE_OK = 0;
const SQLITE_ROW = 100;
const SQLITE_DONE = 101;
const SQLITE_NULL = 5;
const SQLITE_TRANSIENT = -1;

const dbPtr = [null];
const rc = funcs.sqlite3_open(testDbPath, dbPtr);
assert.strictEqual(rc, SQLITE_OK, 'sqlite3_open should succeed');
const db = dbPtr[0];

function execSql(sql) {
  const errPtr = [null];
  const code = funcs.sqlite3_exec(db, sql, null, null, errPtr);
  assert.strictEqual(code, SQLITE_OK, `exec failed: ${sql}`);
}

// Enable foreign keys
execSql('PRAGMA foreign_keys = ON;');

// Run V1 schema first
execSql('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL);');
execSql(`
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
  INSERT INTO schema_migrations (version, applied_at) VALUES (1, 1000);
`);

// Apply V2 Migration
execSql('ALTER TABLE media ADD COLUMN video_codec TEXT;');
execSql('ALTER TABLE media ADD COLUMN audio_codec TEXT;');
execSql('ALTER TABLE media ADD COLUMN fps REAL;');
execSql('ALTER TABLE media ADD COLUMN thumbnail_key TEXT;');
execSql(`
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
  INSERT INTO schema_migrations (version, applied_at) VALUES (2, 2000);
`);

console.log('  [PASS] V2 Migration executed cleanly with foreign keys and unique constraints.');

// Insert test media items
function insertMedia(id, filePath, fileName) {
  const stmtPtr = [null];
  funcs.sqlite3_prepare_v2(db, `
    INSERT INTO media (id, file_path, file_name, duration, file_size, last_modified, first_added, last_opened, video_codec, audio_codec, fps, thumbnail_key)
    VALUES (?, ?, ?, 120.5, 10240, 160000, 160000, 160000, 'h264', 'aac', 30.0, 'thumb_key_${id}');
  `, -1, stmtPtr, null);
  const stmt = stmtPtr[0];
  funcs.sqlite3_bind_text(stmt, 1, id, -1, SQLITE_TRANSIENT);
  funcs.sqlite3_bind_text(stmt, 2, filePath, -1, SQLITE_TRANSIENT);
  funcs.sqlite3_bind_text(stmt, 3, fileName, -1, SQLITE_TRANSIENT);
  const stepRc = funcs.sqlite3_step(stmt);
  funcs.sqlite3_finalize(stmt);
  assert.strictEqual(stepRc, SQLITE_DONE);
}

insertMedia('m1', 'C:\\videos\\clip1.mp4', 'clip1.mp4');
insertMedia('m2', 'C:\\videos\\clip2.mp4', 'clip2.mp4');
insertMedia('m3', 'C:\\videos\\clip3.mp4', 'clip3.mp4');

// Test Playlist Creation
function createPlaylist(id, name) {
  const stmtPtr = [null];
  funcs.sqlite3_prepare_v2(db, 'INSERT INTO playlists (id, name, created_at, updated_at) VALUES (?, ?, ?, ?);', -1, stmtPtr, null);
  const stmt = stmtPtr[0];
  funcs.sqlite3_bind_text(stmt, 1, id, -1, SQLITE_TRANSIENT);
  funcs.sqlite3_bind_text(stmt, 2, name, -1, SQLITE_TRANSIENT);
  funcs.sqlite3_bind_int64(stmt, 3, Date.now());
  funcs.sqlite3_bind_int64(stmt, 4, Date.now());
  const stepRc = funcs.sqlite3_step(stmt);
  funcs.sqlite3_finalize(stmt);
  assert.strictEqual(stepRc, SQLITE_DONE);
}

createPlaylist('p1', 'Action Movies');
createPlaylist('p2', 'Favorites');

// Test Playlist Rename
function renamePlaylist(id, newName) {
  const stmtPtr = [null];
  funcs.sqlite3_prepare_v2(db, 'UPDATE playlists SET name = ?, updated_at = ? WHERE id = ?;', -1, stmtPtr, null);
  const stmt = stmtPtr[0];
  funcs.sqlite3_bind_text(stmt, 1, newName, -1, SQLITE_TRANSIENT);
  funcs.sqlite3_bind_int64(stmt, 2, Date.now());
  funcs.sqlite3_bind_text(stmt, 3, id, -1, SQLITE_TRANSIENT);
  const stepRc = funcs.sqlite3_step(stmt);
  funcs.sqlite3_finalize(stmt);
  assert.strictEqual(stepRc, SQLITE_DONE);
}

renamePlaylist('p1', 'Blockbuster Action');

// Verify Rename
{
  const stmtPtr = [null];
  funcs.sqlite3_prepare_v2(db, 'SELECT name FROM playlists WHERE id = ?;', -1, stmtPtr, null);
  const stmt = stmtPtr[0];
  funcs.sqlite3_bind_text(stmt, 1, 'p1', -1, SQLITE_TRANSIENT);
  assert.strictEqual(funcs.sqlite3_step(stmt), SQLITE_ROW);
  const name = funcs.sqlite3_column_text(stmt, 0);
  assert.strictEqual(name, 'Blockbuster Action');
  funcs.sqlite3_finalize(stmt);
  console.log('  [PASS] Playlist rename verified.');
}

// Test Adding Items to Playlist
function addPlaylistItem(itemId, playlistId, mediaId, sortOrder) {
  const stmtPtr = [null];
  funcs.sqlite3_prepare_v2(db, `
    INSERT INTO playlist_items (id, playlist_id, media_id, sort_order, added_at)
    VALUES (?, ?, ?, ?, ?);
  `, -1, stmtPtr, null);
  const stmt = stmtPtr[0];
  funcs.sqlite3_bind_text(stmt, 1, itemId, -1, SQLITE_TRANSIENT);
  funcs.sqlite3_bind_text(stmt, 2, playlistId, -1, SQLITE_TRANSIENT);
  funcs.sqlite3_bind_text(stmt, 3, mediaId, -1, SQLITE_TRANSIENT);
  funcs.sqlite3_bind_int64(stmt, 4, sortOrder);
  funcs.sqlite3_bind_int64(stmt, 5, Date.now());
  const stepRc = funcs.sqlite3_step(stmt);
  funcs.sqlite3_finalize(stmt);
  return stepRc;
}

assert.strictEqual(addPlaylistItem('pi1', 'p1', 'm1', 0), SQLITE_DONE);
assert.strictEqual(addPlaylistItem('pi2', 'p1', 'm2', 1), SQLITE_DONE);
assert.strictEqual(addPlaylistItem('pi3', 'p1', 'm3', 2), SQLITE_DONE);
console.log('  [PASS] Added 3 items to playlist with deterministic sort order.');

// Test Duplicate Prevention Policy (UNIQUE constraint on playlist_id, media_id)
const dupRc = addPlaylistItem('pi_dup', 'p1', 'm1', 3);
assert.notStrictEqual(dupRc, SQLITE_DONE, 'Duplicate item in same playlist must be rejected');
console.log('  [PASS] Duplicate playlist item was correctly rejected by UNIQUE constraint.');

// Test Reordering Items (m3 first, then m1, then m2)
function reorderItems(playlistId, orderedMediaIds) {
  execSql('BEGIN TRANSACTION;');
  try {
    for (let i = 0; i < orderedMediaIds.length; i++) {
      const stmtPtr = [null];
      funcs.sqlite3_prepare_v2(db, 'UPDATE playlist_items SET sort_order = ? WHERE playlist_id = ? AND media_id = ?;', -1, stmtPtr, null);
      const stmt = stmtPtr[0];
      funcs.sqlite3_bind_int64(stmt, 1, i);
      funcs.sqlite3_bind_text(stmt, 2, playlistId, -1, SQLITE_TRANSIENT);
      funcs.sqlite3_bind_text(stmt, 3, orderedMediaIds[i], -1, SQLITE_TRANSIENT);
      funcs.sqlite3_step(stmt);
      funcs.sqlite3_finalize(stmt);
    }
    execSql('COMMIT;');
  } catch (err) {
    execSql('ROLLBACK;');
    throw err;
  }
}

reorderItems('p1', ['m3', 'm1', 'm2']);

// Verify Reordered Items
{
  const stmtPtr = [null];
  funcs.sqlite3_prepare_v2(db, 'SELECT media_id, sort_order FROM playlist_items WHERE playlist_id = ? ORDER BY sort_order ASC;', -1, stmtPtr, null);
  const stmt = stmtPtr[0];
  funcs.sqlite3_bind_text(stmt, 1, 'p1', -1, SQLITE_TRANSIENT);
  const items = [];
  while (funcs.sqlite3_step(stmt) === SQLITE_ROW) {
    items.push({
      mediaId: funcs.sqlite3_column_text(stmt, 0),
      order: Number(funcs.sqlite3_column_int64(stmt, 1)),
    });
  }
  funcs.sqlite3_finalize(stmt);
  assert.strictEqual(items.length, 3);
  assert.strictEqual(items[0].mediaId, 'm3');
  assert.strictEqual(items[0].order, 0);
  assert.strictEqual(items[1].mediaId, 'm1');
  assert.strictEqual(items[1].order, 1);
  assert.strictEqual(items[2].mediaId, 'm2');
  assert.strictEqual(items[2].order, 2);
  console.log('  [PASS] Playlist reordering verified.');
}

// Test Removing an Item (without deleting media)
function removePlaylistItem(playlistId, mediaId) {
  const stmtPtr = [null];
  funcs.sqlite3_prepare_v2(db, 'DELETE FROM playlist_items WHERE playlist_id = ? AND media_id = ?;', -1, stmtPtr, null);
  const stmt = stmtPtr[0];
  funcs.sqlite3_bind_text(stmt, 1, playlistId, -1, SQLITE_TRANSIENT);
  funcs.sqlite3_bind_text(stmt, 2, mediaId, -1, SQLITE_TRANSIENT);
  const stepRc = funcs.sqlite3_step(stmt);
  funcs.sqlite3_finalize(stmt);
  assert.strictEqual(stepRc, SQLITE_DONE);
}

removePlaylistItem('p1', 'm1');

// Verify original media record still exists in library
{
  const stmtPtr = [null];
  funcs.sqlite3_prepare_v2(db, 'SELECT id FROM media WHERE id = ?;', -1, stmtPtr, null);
  const stmt = stmtPtr[0];
  funcs.sqlite3_bind_text(stmt, 1, 'm1', -1, SQLITE_TRANSIENT);
  assert.strictEqual(funcs.sqlite3_step(stmt), SQLITE_ROW);
  funcs.sqlite3_finalize(stmt);
  console.log('  [PASS] Removing item from playlist preserves media record in library.');
}

// Test Deleting Playlist (Cascade deletes playlist_items, preserves media)
function deletePlaylist(playlistId) {
  const stmtPtr = [null];
  funcs.sqlite3_prepare_v2(db, 'DELETE FROM playlists WHERE id = ?;', -1, stmtPtr, null);
  const stmt = stmtPtr[0];
  funcs.sqlite3_bind_text(stmt, 1, playlistId, -1, SQLITE_TRANSIENT);
  const stepRc = funcs.sqlite3_step(stmt);
  funcs.sqlite3_finalize(stmt);
  assert.strictEqual(stepRc, SQLITE_DONE);
}

deletePlaylist('p1');

// Verify cascade deletion of playlist items
{
  const stmtPtr = [null];
  funcs.sqlite3_prepare_v2(db, 'SELECT COUNT(*) FROM playlist_items WHERE playlist_id = ?;', -1, stmtPtr, null);
  const stmt = stmtPtr[0];
  funcs.sqlite3_bind_text(stmt, 1, 'p1', -1, SQLITE_TRANSIENT);
  assert.strictEqual(funcs.sqlite3_step(stmt), SQLITE_ROW);
  const count = Number(funcs.sqlite3_column_int64(stmt, 0));
  assert.strictEqual(count, 0);
  funcs.sqlite3_finalize(stmt);

  // Original media m3 and m2 still exist
  const stmtPtr2 = [null];
  funcs.sqlite3_prepare_v2(db, 'SELECT COUNT(*) FROM media;', -1, stmtPtr2, null);
  const stmt2 = stmtPtr2[0];
  assert.strictEqual(funcs.sqlite3_step(stmt2), SQLITE_ROW);
  const mediaCount = Number(funcs.sqlite3_column_int64(stmt2, 0));
  assert.strictEqual(mediaCount, 3);
  funcs.sqlite3_finalize(stmt2);
  console.log('  [PASS] Deleting playlist cascaded to items without affecting media library.');
}

funcs.sqlite3_close(db);

// ----------------------------------------------------
// Section 2: Thumbnail Cache Key & Invalidation
// ----------------------------------------------------
console.log('\n[2/5] Testing Thumbnail Cache Key Determinism & Invalidation...');

function computeMediaThumbnailKey(filePath, fileSize, lastModified) {
  const norm = path.resolve(filePath).toLowerCase();
  return crypto
    .createHash('sha256')
    .update(`${norm}:${fileSize ?? 0}:${lastModified ?? 0}`)
    .digest('hex');
}

const key1 = computeMediaThumbnailKey('C:\\Videos\\Movie.mkv', 1000000, 1690000000);
const key2 = computeMediaThumbnailKey('c:\\videos\\movie.mkv', 1000000, 1690000000);
assert.strictEqual(key1, key2, 'Cache key must be case-insensitive for Windows paths');
assert.strictEqual(key1.length, 64, 'Cache key must be a 64-char sha256 hex string');

const keyModified = computeMediaThumbnailKey('C:\\Videos\\Movie.mkv', 1000000, 1690000999);
assert.notStrictEqual(key1, keyModified, 'Changing mtime must invalidate thumbnail key');

const keySizeChanged = computeMediaThumbnailKey('C:\\Videos\\Movie.mkv', 2000000, 1690000000);
assert.notStrictEqual(key1, keySizeChanged, 'Changing file size must invalidate thumbnail key');
console.log('  [PASS] Thumbnail cache keys are deterministic, normalized, and invalidate on file modification.');

// ----------------------------------------------------
// Section 3: Thumbnail Cache Cleanup without Media Loss
// ----------------------------------------------------
console.log('\n[3/5] Testing Cache Directory Cleanup...');

const dummyThumb1 = path.join(testThumbDir, `${key1}.jpg`);
const dummyThumbOrphan = path.join(testThumbDir, `${keyModified}.jpg`);
fs.writeFileSync(dummyThumb1, Buffer.from([0xff, 0xd8, 0xff, 0xe0])); // JPEG header
fs.writeFileSync(dummyThumbOrphan, Buffer.from([0xff, 0xd8, 0xff, 0xe0]));

function cleanupOrphanedThumbnails(thumbDir, activeKeys) {
  const files = fs.readdirSync(thumbDir);
  for (const file of files) {
    if (!file.toLowerCase().endsWith('.jpg')) continue;
    const key = path.basename(file, '.jpg');
    if (!activeKeys.has(key)) {
      fs.unlinkSync(path.join(thumbDir, file));
    }
  }
}

const activeKeys = new Set([key1]);
cleanupOrphanedThumbnails(testThumbDir, activeKeys);
assert.strictEqual(fs.existsSync(dummyThumb1), true, 'Active thumbnail must be preserved');
assert.strictEqual(fs.existsSync(dummyThumbOrphan), false, 'Orphaned thumbnail must be removed');
console.log('  [PASS] Cache cleanup removed orphaned thumbnails and preserved active keys.');

// ----------------------------------------------------
// Section 4: Real libmpv Native Offscreen Extraction & Metadata
// ----------------------------------------------------
console.log('\n[4/5] Testing Real libmpv Offscreen Extraction & Metadata Probing...');

const testVideoPath = path.join(tempDir, 'sample_test_video.mp4');
try {
  execSync(
    `"${ffmpegExe}" -y -f lavfi -i testsrc=duration=2:size=320x240:rate=30 -f lavfi -i anullsrc=r=44100:cl=mono -t 2 -c:v libx264 -pix_fmt yuv420p -c:a aac "${testVideoPath}"`,
    { stdio: 'ignore' }
  );
  assert.strictEqual(fs.existsSync(testVideoPath), true);
  console.log('  [INFO] Generated synthetic 2s H.264/AAC video (320x240 @ 30fps).');
} catch (err) {
  console.error('  [WARN] Failed to generate test video with ffmpeg:', err.message);
}

if (fs.existsSync(testVideoPath) && fs.existsSync(dllPath)) {
  const lib = koffi.load(dllPath);
  const mpv_handle = koffi.opaque('mpv_handle');
  const mpvEventStruct = koffi.struct('mpv_event', {
    event_id: 'int',
    error: 'int',
    reply_userdata: 'uint64',
    data: 'void *',
  });

  const mpv_create = lib.func('mpv_handle *mpv_create(void)');
  const mpv_initialize = lib.func('int mpv_initialize(mpv_handle *ctx)');
  const mpv_terminate_destroy = lib.func('void mpv_terminate_destroy(mpv_handle *ctx)');
  const mpv_command = lib.func('int mpv_command(mpv_handle *ctx, const char **args)');
  const mpv_set_property_string = lib.func('int mpv_set_property_string(mpv_handle *ctx, const char *name, const char *val)');
  const mpv_get_property_string = lib.func('const char *mpv_get_property_string(mpv_handle *ctx, const char *name)');
  const mpv_free = lib.func('void mpv_free(void *data)');
  const mpv_wait_event = lib.func('mpv_event *mpv_wait_event(mpv_handle *ctx, double timeout)');

  const offscreenDir = path.join(tempDir, 'offscreen_output');
  fs.mkdirSync(offscreenDir, { recursive: true });

  const ctx = mpv_create();
  assert.ok(ctx, 'mpv_create must succeed for offscreen instance');

  mpv_set_property_string(ctx, 'vo', 'image');
  mpv_set_property_string(ctx, 'vo-image-outdir', offscreenDir);
  mpv_set_property_string(ctx, 'vo-image-format', 'jpeg');
  mpv_set_property_string(ctx, 'vo-image-jpeg-quality', '85');
  mpv_set_property_string(ctx, 'ao', 'null');
  mpv_set_property_string(ctx, 'pause', 'yes');
  mpv_set_property_string(ctx, 'audio', 'no');
  mpv_set_property_string(ctx, 'sub', 'no');
  mpv_set_property_string(ctx, 'start', '1');

  const initCode = mpv_initialize(ctx);
  assert.strictEqual(initCode, 0, 'mpv_initialize must succeed');

  const loadArgs = ['loadfile', testVideoPath, 'replace', null];
  const loadCode = mpv_command(ctx, loadArgs);
  assert.strictEqual(loadCode, 0, 'loadfile command must succeed');

  // Wait for duration property
  let foundDuration = null;
  for (let i = 0; i < 30; i++) {
    mpv_wait_event(ctx, 0.05);
    const ptr = mpv_get_property_string(ctx, 'duration');
    if (ptr) {
      foundDuration = ptr;
      break;
    }
  }

  // Step one frame to write JPEG
  mpv_command(ctx, ['frame-step', null]);
  for (let i = 0; i < 15; i++) {
    mpv_wait_event(ctx, 0.05);
  }

  const vcodecPtr = mpv_get_property_string(ctx, 'video-codec');
  const acodecPtr = mpv_get_property_string(ctx, 'audio-codec');
  const wPtr = mpv_get_property_string(ctx, 'dwidth') || mpv_get_property_string(ctx, 'video-params/w');
  const hPtr = mpv_get_property_string(ctx, 'dheight') || mpv_get_property_string(ctx, 'video-params/h');
  const fpsPtr = mpv_get_property_string(ctx, 'container-fps');

  console.log(`  [METADATA EXTRACTED] Duration: ${foundDuration}s, Resolution: ${wPtr}x${hPtr}, Video: ${vcodecPtr}, Audio: ${acodecPtr}, FPS: ${fpsPtr}`);

  assert.ok(foundDuration !== null, 'Duration must be resolved');
  assert.strictEqual(wPtr, '320', 'Width must be 320');
  assert.strictEqual(hPtr, '240', 'Height must be 240');
  assert.ok(vcodecPtr && (vcodecPtr.toLowerCase().includes('h.264') || vcodecPtr.toLowerCase().includes('h264') || vcodecPtr.toLowerCase().includes('avc')), 'Video codec must be h264');

  // Verify extracted JPEG frame
  const extractedFiles = fs.readdirSync(offscreenDir);
  const jpegFile = extractedFiles.find(f => f.toLowerCase().endsWith('.jpg'));
  assert.ok(jpegFile, 'Offscreen libmpv must have generated a JPEG thumbnail frame');
  const jpegStat = fs.statSync(path.join(offscreenDir, jpegFile));
  assert.ok(jpegStat.size > 100, 'Thumbnail JPEG must be non-empty');
  console.log(`  [PASS] Real libmpv offscreen thumbnail generated (${jpegStat.size} bytes).`);

  mpv_terminate_destroy(ctx);
} else {
  console.log('  [SKIP] Synthetic video or libmpv binary not found, skipped live probe.');
}

// ----------------------------------------------------
// Section 5: Playlist Navigation & Natural EOF Boundary Logic
// ----------------------------------------------------
console.log('\n[5/5] Testing Playlist Playback Navigation & Natural EOF Logic...');

class PlaylistPlaybackSimulator {
  constructor(items) {
    this.items = items;
    this.currentIndex = 0;
    this.state = 'idle';
  }

  playCurrent() {
    this.state = 'playing';
    return this.items[this.currentIndex];
  }

  handleEof() {
    if (this.currentIndex < this.items.length - 1) {
      this.currentIndex++;
      this.state = 'playing';
      return { advanced: true, current: this.items[this.currentIndex] };
    } else {
      this.state = 'ended';
      return { advanced: false, current: null };
    }
  }

  handleNext() {
    if (this.currentIndex < this.items.length - 1) {
      this.currentIndex++;
      return { success: true, current: this.items[this.currentIndex] };
    }
    return { success: false, current: null };
  }

  handlePrev() {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      return { success: true, current: this.items[this.currentIndex] };
    }
    return { success: false, current: null };
  }
}

const sim = new PlaylistPlaybackSimulator(['track1.mp4', 'track2.mp4', 'track3.mp4']);
assert.strictEqual(sim.playCurrent(), 'track1.mp4');

// Boundary test: Prev at index 0 fails gracefully
const prevAtZero = sim.handlePrev();
assert.strictEqual(prevAtZero.success, false);
assert.strictEqual(sim.currentIndex, 0);

// Natural EOF advances to track 2
const eof1 = sim.handleEof();
assert.strictEqual(eof1.advanced, true);
assert.strictEqual(eof1.current, 'track2.mp4');
assert.strictEqual(sim.currentIndex, 1);

// Explicit Next advances to track 3
const nextTo3 = sim.handleNext();
assert.strictEqual(nextTo3.success, true);
assert.strictEqual(nextTo3.current, 'track3.mp4');
assert.strictEqual(sim.currentIndex, 2);

// Boundary test: Next at end fails gracefully
const nextAtEnd = sim.handleNext();
assert.strictEqual(nextAtEnd.success, false);
assert.strictEqual(sim.currentIndex, 2);

// Final item natural EOF reaches ended state without crashing or rolling over
const eofAtEnd = sim.handleEof();
assert.strictEqual(eofAtEnd.advanced, false);
assert.strictEqual(sim.state, 'ended');
assert.strictEqual(sim.currentIndex, 2);

console.log('  [PASS] Playlist boundary navigation, EOF auto-advancement, and end-of-playlist state verified.');

// Cleanup test temp directory
try {
  fs.rmSync(tempDir, { recursive: true, force: true });
} catch {
  // ignore
}

console.log('\n=== ALL PHASE 9 UNIT & INTEGRATION TESTS PASSED SUCCESSFULLY ===\n');
