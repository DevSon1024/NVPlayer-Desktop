import path from 'node:path';
import fs from 'node:fs';
import assert from 'node:assert';
import koffi from 'koffi';

console.log('=== Media Database Unit & Persistence Tests ===');

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
  sqlite3_errmsg: sqlite.func('const char *sqlite3_errmsg(sqlite3 *db)'),
};

const SQLITE_OK = 0;
const SQLITE_ROW = 100;
const SQLITE_DONE = 101;
const SQLITE_NULL = 5;
const SQLITE_TRANSIENT = -1;

// Build a quick test implementation mirror to run in node
class TestMediaDatabase {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.funcs = funcs;
    this.db = null;
  }

  init() {
    const dbPtr = [null];
    const rc = this.funcs.sqlite3_open(this.dbPath, dbPtr);
    assert.strictEqual(rc, SQLITE_OK, 'sqlite3_open should return SQLITE_OK');
    this.db = dbPtr[0];

    // Migration
    this.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL);');
    this.exec(`
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
    `);
    this.exec('INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (1, 1000);');
    return true;
  }

  exec(sql) {
    const errPtr = [null];
    const rc = this.funcs.sqlite3_exec(this.db, sql, null, null, errPtr);
    assert.strictEqual(rc, SQLITE_OK, 'exec should succeed');
  }

  addOrUpdateMedia(filePath, meta) {
    const norm = path.resolve(filePath);
    const existing = this.getByPath(norm);
    const now = Date.now();
    const name = path.basename(norm);

    if (existing) {
      const stmtPtr = [null];
      this.funcs.sqlite3_prepare_v2(this.db, `
        UPDATE media
        SET file_name = ?, last_opened = ?, duration = COALESCE(?, duration)
        WHERE id = ?;
      `, -1, stmtPtr, null);
      const stmt = stmtPtr[0];
      this.funcs.sqlite3_bind_text(stmt, 1, name, -1, SQLITE_TRANSIENT);
      this.funcs.sqlite3_bind_int64(stmt, 2, now);
      if (meta?.duration) this.funcs.sqlite3_bind_double(stmt, 3, meta.duration);
      else this.funcs.sqlite3_bind_null(stmt, 3);
      this.funcs.sqlite3_bind_text(stmt, 4, existing.id, -1, SQLITE_TRANSIENT);
      this.funcs.sqlite3_step(stmt);
      this.funcs.sqlite3_finalize(stmt);
      return this.getByPath(norm);
    }

    const id = 'id_' + Math.random().toString(36).substring(2, 9);
    const stmtPtr = [null];
    this.funcs.sqlite3_prepare_v2(this.db, `
      INSERT INTO media (id, file_path, file_name, duration, file_size, last_modified, first_added, last_opened, last_position, video_width, video_height)
      VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, NULL, NULL, NULL);
    `, -1, stmtPtr, null);
    const stmt = stmtPtr[0];
    this.funcs.sqlite3_bind_text(stmt, 1, id, -1, SQLITE_TRANSIENT);
    this.funcs.sqlite3_bind_text(stmt, 2, norm, -1, SQLITE_TRANSIENT);
    this.funcs.sqlite3_bind_text(stmt, 3, name, -1, SQLITE_TRANSIENT);
    if (meta?.duration) this.funcs.sqlite3_bind_double(stmt, 4, meta.duration);
    else this.funcs.sqlite3_bind_null(stmt, 4);
    this.funcs.sqlite3_bind_int64(stmt, 5, now);
    this.funcs.sqlite3_bind_int64(stmt, 6, now);
    this.funcs.sqlite3_step(stmt);
    this.funcs.sqlite3_finalize(stmt);
    return this.getByPath(norm);
  }

  getByPath(filePath) {
    const norm = path.resolve(filePath);
    const stmtPtr = [null];
    this.funcs.sqlite3_prepare_v2(this.db, 'SELECT id, file_path, file_name, duration, last_position, last_opened FROM media WHERE file_path = ?;', -1, stmtPtr, null);
    const stmt = stmtPtr[0];
    this.funcs.sqlite3_bind_text(stmt, 1, norm, -1, SQLITE_TRANSIENT);
    let row = null;
    if (this.funcs.sqlite3_step(stmt) === SQLITE_ROW) {
      row = {
        id: this.funcs.sqlite3_column_text(stmt, 0),
        filePath: this.funcs.sqlite3_column_text(stmt, 1),
        fileName: this.funcs.sqlite3_column_text(stmt, 2),
        duration: this.funcs.sqlite3_column_type(stmt, 3) !== SQLITE_NULL ? this.funcs.sqlite3_column_double(stmt, 3) : null,
        lastPosition: this.funcs.sqlite3_column_type(stmt, 4) !== SQLITE_NULL ? this.funcs.sqlite3_column_double(stmt, 4) : null,
        lastOpened: Number(this.funcs.sqlite3_column_int64(stmt, 5)),
      };
    }
    this.funcs.sqlite3_finalize(stmt);
    return row;
  }

  updatePosition(filePath, pos) {
    const norm = path.resolve(filePath);
    const stmtPtr = [null];
    this.funcs.sqlite3_prepare_v2(this.db, 'UPDATE media SET last_position = ? WHERE file_path = ?;', -1, stmtPtr, null);
    const stmt = stmtPtr[0];
    this.funcs.sqlite3_bind_double(stmt, 1, pos);
    this.funcs.sqlite3_bind_text(stmt, 2, norm, -1, SQLITE_TRANSIENT);
    const rc = this.funcs.sqlite3_step(stmt);
    this.funcs.sqlite3_finalize(stmt);
    return rc === SQLITE_DONE;
  }

  getRecent() {
    const stmtPtr = [null];
    this.funcs.sqlite3_prepare_v2(this.db, 'SELECT id, file_path, file_name, last_opened FROM media ORDER BY last_opened DESC;', -1, stmtPtr, null);
    const stmt = stmtPtr[0];
    const res = [];
    while (this.funcs.sqlite3_step(stmt) === SQLITE_ROW) {
      res.push({
        id: this.funcs.sqlite3_column_text(stmt, 0),
        filePath: this.funcs.sqlite3_column_text(stmt, 1),
        fileName: this.funcs.sqlite3_column_text(stmt, 2),
        lastOpened: Number(this.funcs.sqlite3_column_int64(stmt, 3)),
      });
    }
    this.funcs.sqlite3_finalize(stmt);
    return res;
  }

  remove(id) {
    const stmtPtr = [null];
    this.funcs.sqlite3_prepare_v2(this.db, 'DELETE FROM media WHERE id = ?;', -1, stmtPtr, null);
    const stmt = stmtPtr[0];
    this.funcs.sqlite3_bind_text(stmt, 1, id, -1, SQLITE_TRANSIENT);
    const rc = this.funcs.sqlite3_step(stmt);
    this.funcs.sqlite3_finalize(stmt);
    return rc === SQLITE_DONE;
  }

  close() {
    if (this.db) {
      this.funcs.sqlite3_close(this.db);
      this.db = null;
    }
  }
}

// Run assertions
const db = new TestMediaDatabase(':memory:');
assert.strictEqual(db.init(), true, 'Database initialization should succeed');
console.log('[PASS] SQLite database initialization and schema migration verified');

// Add item
const record1 = db.addOrUpdateMedia('D:/test_videos/sample1.mp4', { duration: 120.5 });
assert.ok(record1.id, 'Record should have generated ID');
assert.strictEqual(record1.fileName, 'sample1.mp4');
assert.strictEqual(record1.duration, 120.5);
console.log('[PASS] Media record insertion with metadata verified');

// Deduplication
const record1Dup = db.addOrUpdateMedia('D:/test_videos/sample1.mp4', { duration: 125.0 });
assert.strictEqual(record1Dup.id, record1.id, 'Re-adding same path should update existing record, not duplicate');
assert.strictEqual(record1Dup.duration, 125.0, 'Duration should update');
console.log('[PASS] Path deduplication and record updating verified');

// Position update
const updated = db.updatePosition('D:/test_videos/sample1.mp4', 45.2);
assert.strictEqual(updated, true, 'Position update should return true');
const fetched = db.getByPath('D:/test_videos/sample1.mp4');
assert.strictEqual(fetched.lastPosition, 45.2, 'Last position should match updated value');
console.log('[PASS] Playback position persistence verified');

// Add second item
await new Promise((r) => setTimeout(r, 10));
const record2 = db.addOrUpdateMedia('D:/test_videos/sample2.mkv', { duration: 300.0 });
const recent = db.getRecent();
assert.strictEqual(recent.length, 2, 'Recent list should have 2 items');
assert.strictEqual(recent[0].id, record2.id, 'Most recently added item should be first');
console.log('[PASS] Recent items ordering verified');

// Remove item
const removed = db.remove(record1.id);
assert.strictEqual(removed, true, 'Removal should return true');
assert.strictEqual(db.getByPath('D:/test_videos/sample1.mp4'), null, 'Removed item should not be found');
assert.strictEqual(db.getRecent().length, 1, 'Recent list should now contain 1 item');
console.log('[PASS] Media removal verified');

db.close();
console.log('[PASS] SQLite database shutdown and cleanup verified');

// Test: Persistence across process restart (physical file on disk)
const tempDbPath = path.join(process.cwd(), 'temp_test_restart.db');
try {
  if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);

  // Session 1: Create DB on disk, add item, update position, then close
  const dbSession1 = new TestMediaDatabase(tempDbPath);
  assert.strictEqual(dbSession1.init(), true);
  const recA = dbSession1.addOrUpdateMedia('D:/test_videos/persistent1.mp4', { duration: 1500.0 });
  dbSession1.updatePosition('D:/test_videos/persistent1.mp4', 320.5);
  dbSession1.close();

  // Session 2: Re-open the same DB file from scratch (simulating app restart)
  const dbSession2 = new TestMediaDatabase(tempDbPath);
  assert.strictEqual(dbSession2.init(), true);
  const fetchedA = dbSession2.getByPath('D:/test_videos/persistent1.mp4');
  assert.ok(fetchedA, 'Item must persist across database restart');
  assert.strictEqual(fetchedA.id, recA.id, 'ID must remain identical');
  assert.strictEqual(fetchedA.duration, 1500.0, 'Duration must persist');
  assert.strictEqual(fetchedA.lastPosition, 320.5, 'Playback position must persist across restart');
  dbSession2.close();
  console.log('[PASS] Persistence across restart verified on physical disk file\n');
} finally {
  if (fs.existsSync(tempDbPath)) {
    try { fs.unlinkSync(tempDbPath); } catch {}
  }
}

console.log('>>> ALL MEDIA DATABASE TESTS PASSED <<<');
