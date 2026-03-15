import { app } from 'electron';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import type {
  Book,
  DeleteBookResult,
  PlaybackQueueItem,
  ReaderPersistedState,
  ReaderSettings,
  ReadingPositionMap,
  ReadingProgressMap
} from '../../shared/types';
import { normalizeReaderSettings } from '../../shared/tts-strategy';
import { createMigratedReaderState, defaultReaderState, mergeReaderState } from './reader-state-schema';

const SETTINGS_KEYS = {
  recentBookId: 'recentBookId'
} as const;

export class ReaderStoreService {
  private readonly dbPath = path.join(app.getPath('userData'), 'reader-state.sqlite');
  private readonly legacyJsonPath = path.join(app.getPath('userData'), 'reader-state.json');
  private sqlPromise: Promise<SqlJsStatic> | null = null;
  private dbPromise: Promise<Database> | null = null;
  private cache: ReaderPersistedState | null = null;

  async loadState(): Promise<ReaderPersistedState> {
    if (this.cache) {
      return this.cache;
    }

    const db = await this.getDb();
    this.cache = this.readStateFromDb(db);
    return this.cache;
  }

  async saveState(patch: Partial<ReaderPersistedState>): Promise<ReaderPersistedState> {
    const current = await this.loadState();
    this.cache = mergeReaderState(patch, current);
    const db = await this.getDb();
    this.writeStateToDb(db, this.cache);
    await this.flush(db);
    return this.cache;
  }

  async deleteBook(bookId: string, cleanup?: { removedCacheEntries?: number; removedCacheBytes?: number }): Promise<DeleteBookResult> {
    const current = await this.loadState();
    const nextBookshelf = current.bookshelf.filter((book) => book.id !== bookId);
    const nextProgress = Object.fromEntries(Object.entries(current.progress).filter(([key]) => key !== bookId));
    const nextReadingPositions = Object.fromEntries(
      Object.entries(current.readingPositions).filter(([key]) => !key.startsWith(`${bookId}::`))
    );
    const nextPlaybackDraftQueue = current.playbackDraftQueue.filter((item) => item.bookId !== bookId);
    const nextRecentBookId = current.recentBookId === bookId
      ? nextBookshelf[0]?.id ?? null
      : current.recentBookId;

    this.cache = {
      ...current,
      bookshelf: nextBookshelf,
      recentBookId: nextRecentBookId,
      progress: nextProgress,
      readingPositions: nextReadingPositions,
      playbackDraftQueue: nextPlaybackDraftQueue
    };

    const db = await this.getDb();
    this.writeStateToDb(db, this.cache);
    await this.flush(db);

    return {
      state: this.cache,
      removedBookId: bookId,
      removedBookshelfRecord: nextBookshelf.length !== current.bookshelf.length,
      removedProgress: bookId in current.progress,
      removedReadingPositions: Object.keys(current.readingPositions).length - Object.keys(nextReadingPositions).length,
      removedDraftQueueItems: current.playbackDraftQueue.length - nextPlaybackDraftQueue.length,
      removedCacheEntries: cleanup?.removedCacheEntries ?? 0,
      removedCacheBytes: cleanup?.removedCacheBytes ?? 0
    };
  }

  private async getSql() {
    if (!this.sqlPromise) {
      this.sqlPromise = initSqlJs({
        locateFile: (file: string) => {
          if (file === 'sql-wasm.wasm') {
            return require.resolve('sql.js/dist/sql-wasm.wasm');
          }
          return file;
        }
      });
    }

    return this.sqlPromise;
  }

  private async getDb() {
    if (!this.dbPromise) {
      this.dbPromise = this.openDb();
    }

    return this.dbPromise;
  }

  private async openDb() {
    await mkdir(path.dirname(this.dbPath), { recursive: true });
    const SQL = await this.getSql();

    let db: Database;
    try {
      const buffer = await readFile(this.dbPath);
      db = new SQL.Database(buffer);
    } catch {
      db = new SQL.Database();
    }

    this.prepareSchema(db);
    await this.migrateLegacyJsonIfNeeded(db);
    await this.flush(db);
    return db;
  }

  private prepareSchema(db: Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS reader_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS bookshelf (
        id TEXT PRIMARY KEY,
        sort_order INTEGER NOT NULL,
        payload_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS reading_progress (
        book_id TEXT PRIMARY KEY,
        chapter_id TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS reading_positions (
        scope_key TEXT PRIMARY KEY,
        scroll_top REAL NOT NULL
      );

      CREATE TABLE IF NOT EXISTS playback_queue_drafts (
        id TEXT PRIMARY KEY,
        sort_order INTEGER NOT NULL,
        payload_json TEXT NOT NULL
      );
    `);
  }

  private async migrateLegacyJsonIfNeeded(db: Database) {
    if (this.hasExistingRows(db)) {
      return;
    }

    try {
      const raw = await readFile(this.legacyJsonPath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<ReaderPersistedState>;
      const migrated = createMigratedReaderState(parsed);
      this.writeStateToDb(db, migrated);
      this.cache = migrated;
      await unlink(this.legacyJsonPath).catch(() => undefined);
    } catch {
      this.writeStateToDb(db, defaultReaderState);
      this.cache = defaultReaderState;
    }
  }

  private hasExistingRows(db: Database) {
    const [result] = db.exec(`
      SELECT
        (SELECT COUNT(*) FROM bookshelf) AS bookshelf_count,
        (SELECT COUNT(*) FROM reading_progress) AS progress_count,
        (SELECT COUNT(*) FROM playback_queue_drafts) AS queue_count,
        (SELECT COUNT(*) FROM reader_settings) AS settings_count,
        (SELECT COUNT(*) FROM app_settings) AS app_settings_count,
        (SELECT COUNT(*) FROM reading_positions) AS positions_count
    `);

    if (!result?.values?.[0]) {
      return false;
    }

    return result.values[0].some((value: unknown) => Number(value) > 0);
  }

  private readStateFromDb(db: Database): ReaderPersistedState {
    const bookshelf = this.readBookshelf(db);
    const progress = this.readProgress(db);
    const readingPositions = this.readReadingPositions(db);
    const playbackDraftQueue = this.readPlaybackDraftQueue(db);
    const settings = this.readReaderSettings(db);
    const recentBookId = this.readScalar(db, 'app_settings', SETTINGS_KEYS.recentBookId);

    return {
      bookshelf,
      recentBookId,
      progress,
      readingPositions,
      settings,
      playbackDraftQueue
    };
  }

  private writeStateToDb(db: Database, state: ReaderPersistedState) {
    this.replaceBookshelf(db, state.bookshelf);
    this.replaceProgress(db, state.progress);
    this.replaceReadingPositions(db, state.readingPositions);
    this.replacePlaybackQueueDrafts(db, state.playbackDraftQueue);
    this.replaceReaderSettings(db, state.settings);
    this.upsertScalar(db, 'app_settings', SETTINGS_KEYS.recentBookId, state.recentBookId ?? '');
  }

  private readBookshelf(db: Database): Book[] {
    const [result] = db.exec('SELECT payload_json FROM bookshelf ORDER BY sort_order ASC');
    return (result?.values ?? []).map((row) => JSON.parse(String(row[0])) as Book);
  }

  private replaceBookshelf(db: Database, bookshelf: Book[]) {
    db.exec('DELETE FROM bookshelf');
    const stmt = db.prepare('INSERT INTO bookshelf (id, sort_order, payload_json) VALUES (?, ?, ?)');
    bookshelf.forEach((book, index) => stmt.run([book.id, index, JSON.stringify(book)]));
    stmt.free();
  }

  private readProgress(db: Database): ReadingProgressMap {
    const [result] = db.exec('SELECT book_id, chapter_id FROM reading_progress');
    return Object.fromEntries((result?.values ?? []).map((row) => [String(row[0]), String(row[1])])) as ReadingProgressMap;
  }

  private replaceProgress(db: Database, progress: ReadingProgressMap) {
    db.exec('DELETE FROM reading_progress');
    const stmt = db.prepare('INSERT INTO reading_progress (book_id, chapter_id) VALUES (?, ?)');
    Object.entries(progress).forEach(([bookId, chapterId]) => {
      if (chapterId) {
        stmt.run([bookId, chapterId]);
      }
    });
    stmt.free();
  }

  private readReadingPositions(db: Database): ReadingPositionMap {
    const [result] = db.exec('SELECT scope_key, scroll_top FROM reading_positions');
    return Object.fromEntries((result?.values ?? []).map((row) => [String(row[0]), Number(row[1])])) as ReadingPositionMap;
  }

  private replaceReadingPositions(db: Database, positions: ReadingPositionMap) {
    db.exec('DELETE FROM reading_positions');
    const stmt = db.prepare('INSERT INTO reading_positions (scope_key, scroll_top) VALUES (?, ?)');
    Object.entries(positions).forEach(([scopeKey, scrollTop]) => stmt.run([scopeKey, Number(scrollTop) || 0]));
    stmt.free();
  }

  private readPlaybackDraftQueue(db: Database): PlaybackQueueItem[] {
    const [result] = db.exec('SELECT payload_json FROM playback_queue_drafts ORDER BY sort_order ASC');
    return (result?.values ?? []).map((row) => JSON.parse(String(row[0])) as PlaybackQueueItem);
  }

  private replacePlaybackQueueDrafts(db: Database, items: PlaybackQueueItem[]) {
    db.exec('DELETE FROM playback_queue_drafts');
    const stmt = db.prepare('INSERT INTO playback_queue_drafts (id, sort_order, payload_json) VALUES (?, ?, ?)');
    items.forEach((item, index) => stmt.run([item.id, index, JSON.stringify(item)]));
    stmt.free();
  }

  private readReaderSettings(db: Database): ReaderSettings {
    const rows = this.readScalarMap(db, 'reader_settings');
    return normalizeReaderSettings({
      defaultProviderId: rows.defaultProviderId ?? defaultReaderState.settings.defaultProviderId,
      defaultVoiceId: rows.defaultVoiceId ?? defaultReaderState.settings.defaultVoiceId,
      defaultSpeed: Number(rows.defaultSpeed ?? defaultReaderState.settings.defaultSpeed),
      ttsMode: (rows.ttsMode as ReaderSettings['ttsMode'] | undefined) ?? defaultReaderState.settings.ttsMode,
      standardProviderId: rows.standardProviderId ?? defaultReaderState.settings.standardProviderId,
      standardVoiceId: rows.standardVoiceId ?? defaultReaderState.settings.standardVoiceId,
      privacyProviderId: rows.privacyProviderId ?? defaultReaderState.settings.privacyProviderId,
      privacyVoiceId: rows.privacyVoiceId ?? defaultReaderState.settings.privacyVoiceId,
      characterProviderId: rows.characterProviderId ?? defaultReaderState.settings.characterProviderId,
      characterVoiceId: rows.characterVoiceId ?? defaultReaderState.settings.characterVoiceId,
      fontSize: Number(rows.fontSize ?? defaultReaderState.settings.fontSize),
      lineHeight: Number(rows.lineHeight ?? defaultReaderState.settings.lineHeight),
      theme: (rows.theme as ReaderSettings['theme'] | undefined) ?? defaultReaderState.settings.theme
    });
  }

  private replaceReaderSettings(db: Database, settings: ReaderSettings) {
    db.exec('DELETE FROM reader_settings');
    const stmt = db.prepare('INSERT INTO reader_settings (key, value) VALUES (?, ?)');
    Object.entries(settings).forEach(([key, value]) => stmt.run([key, String(value)]));
    stmt.free();
  }

  private readScalarMap(db: Database, tableName: 'reader_settings' | 'app_settings') {
    const [result] = db.exec(`SELECT key, value FROM ${tableName}`);
    return Object.fromEntries((result?.values ?? []).map((row) => [String(row[0]), String(row[1])]));
  }

  private readScalar(db: Database, tableName: 'reader_settings' | 'app_settings', key: string) {
    const [result] = db.exec(`SELECT value FROM ${tableName} WHERE key = ${this.quote(key)} LIMIT 1`);
    const value = result?.values?.[0]?.[0];
    return value ? String(value) : null;
  }

  private upsertScalar(db: Database, tableName: 'reader_settings' | 'app_settings', key: string, value: string) {
    const stmt = db.prepare(`INSERT INTO ${tableName} (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`);
    stmt.run([key, value]);
    stmt.free();
  }

  private quote(value: string) {
    return `'${value.replace(/'/g, "''")}'`;
  }

  private async flush(db: Database) {
    const data = Buffer.from(db.export());
    await writeFile(this.dbPath, data);
  }
}

export function getDefaultReaderState() {
  return defaultReaderState;
}
