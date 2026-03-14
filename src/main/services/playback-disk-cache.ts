import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import type { PlaybackQueueItem } from '../../shared/types';

const CACHE_SCHEMA_VERSION = 2;
const DEFAULT_CACHE_ROOT = path.join(homedir(), '.ai-novel-reader', 'tts-cache');
const DEFAULT_MAX_CACHE_BYTES = 512 * 1024 * 1024;
const DEFAULT_MAX_CACHE_ENTRIES = 2000;

export interface CacheEntryManifest {
  version: number;
  key: string;
  providerId: string;
  voiceId: string;
  speed: number;
  bookId?: string;
  chapterId?: string;
  title: string;
  textHash: string;
  normalizedTextLength: number;
  audioPath: string;
  audioSizeBytes: number;
  extension: string;
  createdAt: string;
  lastAccessedAt: string;
}

interface CacheChapterManifest {
  chapterId: string;
  title: string;
  entryKeys: string[];
  entryCount: number;
  audioBytes: number;
  updatedAt: string;
}

interface CacheBookManifest {
  bookId: string;
  title: string;
  entryKeys: string[];
  entryCount: number;
  audioBytes: number;
  updatedAt: string;
  chapters: CacheChapterManifest[];
}

export interface PlaybackCacheCollectionManifest {
  version: number;
  rootDir: string;
  generatedAt: string;
  maxCacheBytes: number;
  maxEntries: number;
  totalEntries: number;
  totalAudioBytes: number;
  evictedEntries: number;
  books: CacheBookManifest[];
  looseEntries: string[];
}

export interface PlaybackDiskCacheRecord {
  key: string;
  audioPath: string;
  manifestPath: string;
  entry: CacheEntryManifest;
  collection: PlaybackCacheCollectionManifest;
}

export interface PlaybackDiskCacheStats {
  totalEntries: number;
  totalAudioBytes: number;
  maxCacheBytes: number;
  maxEntries: number;
  evictedEntries: number;
}

export interface PlaybackDiskCacheCleanupResult {
  removedEntries: number;
  removedAudioBytes: number;
  collection: PlaybackCacheCollectionManifest;
}

interface PlaybackDiskCacheOptions {
  maxCacheBytes?: number;
  maxEntries?: number;
}

export class PlaybackDiskCache {
  private readonly maxCacheBytes: number;
  private readonly maxEntries: number;

  constructor(
    private readonly rootDir = process.env.AI_NOVEL_TTS_CACHE_DIR ?? DEFAULT_CACHE_ROOT,
    options: PlaybackDiskCacheOptions = {}
  ) {
    this.maxCacheBytes = options.maxCacheBytes ?? getEnvNumber('AI_NOVEL_TTS_CACHE_MAX_BYTES') ?? DEFAULT_MAX_CACHE_BYTES;
    this.maxEntries = options.maxEntries ?? getEnvNumber('AI_NOVEL_TTS_CACHE_MAX_ENTRIES') ?? DEFAULT_MAX_CACHE_ENTRIES;
  }

  async get(item: PlaybackQueueItem): Promise<PlaybackDiskCacheRecord | null> {
    const key = buildPlaybackCacheKey(item);
    const manifestPath = this.getEntryManifestPath(key);

    try {
      const entry = JSON.parse(await readFile(manifestPath, 'utf8')) as CacheEntryManifest;
      if (entry.version !== CACHE_SCHEMA_VERSION) {
        return null;
      }

      const audioStats = await stat(entry.audioPath);
      if (!audioStats.isFile()) {
        return null;
      }

      entry.audioSizeBytes = audioStats.size;
      entry.lastAccessedAt = new Date().toISOString();
      await writeFile(manifestPath, `${JSON.stringify(entry, null, 2)}\n`, 'utf8');
      const collection = await this.refreshCollectionManifest();

      return {
        key,
        audioPath: entry.audioPath,
        manifestPath,
        entry,
        collection
      };
    } catch {
      return null;
    }
  }

  async put(item: PlaybackQueueItem, sourceAudioPath: string, extension?: string): Promise<PlaybackDiskCacheRecord> {
    const key = buildPlaybackCacheKey(item);
    const ext = normalizeExtension(extension ?? (path.extname(sourceAudioPath) || '.bin'));
    const audioPath = this.getAudioPath(key, ext);
    const manifestPath = this.getEntryManifestPath(key);
    await mkdir(path.dirname(audioPath), { recursive: true });
    await mkdir(path.dirname(manifestPath), { recursive: true });
    await copyFile(sourceAudioPath, audioPath);

    const normalizedText = normalizeText(item.text);
    const audioStats = await stat(audioPath);
    const now = new Date().toISOString();
    const entry: CacheEntryManifest = {
      version: CACHE_SCHEMA_VERSION,
      key,
      providerId: item.providerId,
      voiceId: item.voiceId,
      speed: item.speed,
      bookId: item.bookId,
      chapterId: item.chapterId,
      title: item.title,
      textHash: hashText(normalizedText),
      normalizedTextLength: normalizedText.length,
      audioPath,
      audioSizeBytes: audioStats.size,
      extension: ext,
      createdAt: now,
      lastAccessedAt: now
    };

    await writeFile(manifestPath, `${JSON.stringify(entry, null, 2)}\n`, 'utf8');
    const collection = await this.refreshCollectionManifest();
    const trimmed = await this.enforceLimits(collection);
    return {
      key,
      audioPath,
      manifestPath,
      entry,
      collection: trimmed
    };
  }

  async getStats(): Promise<PlaybackDiskCacheStats> {
    const collection = await this.refreshCollectionManifest();
    return {
      totalEntries: collection.totalEntries,
      totalAudioBytes: collection.totalAudioBytes,
      maxCacheBytes: collection.maxCacheBytes,
      maxEntries: collection.maxEntries,
      evictedEntries: collection.evictedEntries
    };
  }

  async removeBook(bookId: string): Promise<PlaybackDiskCacheCleanupResult> {
    const entries = (await this.loadAllEntryManifests()).filter((entry) => entry.bookId === bookId);
    const removedAudioBytes = entries.reduce((sum, entry) => sum + entry.audioSizeBytes, 0);
    await Promise.all(entries.map((entry) => this.removeEntry(entry)));
    const collection = await this.refreshCollectionManifest();
    return {
      removedEntries: entries.length,
      removedAudioBytes,
      collection
    };
  }

  private async enforceLimits(collection: PlaybackCacheCollectionManifest) {
    const entries = await this.loadAllEntryManifests();
    const stale = entries
      .sort(compareEntriesForEviction);

    let totalEntries = stale.length;
    let totalAudioBytes = stale.reduce((sum, entry) => sum + entry.audioSizeBytes, 0);
    let evictedEntries = 0;

    for (const entry of stale) {
      const overBytes = totalAudioBytes > this.maxCacheBytes;
      const overEntries = totalEntries > this.maxEntries;
      if (!overBytes && !overEntries) {
        break;
      }

      await this.removeEntry(entry);
      totalEntries -= 1;
      totalAudioBytes -= entry.audioSizeBytes;
      evictedEntries += 1;
    }

    return this.refreshCollectionManifest(evictedEntries + collection.evictedEntries);
  }

  private async removeEntry(entry: CacheEntryManifest) {
    await Promise.allSettled([
      rm(entry.audioPath, { force: true }),
      rm(this.getEntryManifestPath(entry.key), { force: true })
    ]);
  }

  private async refreshCollectionManifest(evictedEntries = 0) {
    await mkdir(this.rootDir, { recursive: true });
    const entries = await this.loadAllEntryManifests();
    const booksMap = new Map<string, CacheBookManifest>();
    const looseEntries: string[] = [];

    for (const entry of entries) {
      if (!entry.bookId) {
        looseEntries.push(entry.key);
        continue;
      }

      const existingBook = booksMap.get(entry.bookId) ?? {
        bookId: entry.bookId,
        title: entry.title,
        entryKeys: [],
        entryCount: 0,
        audioBytes: 0,
        updatedAt: entry.lastAccessedAt,
        chapters: []
      } satisfies CacheBookManifest;

      existingBook.entryKeys.push(entry.key);
      existingBook.entryCount += 1;
      existingBook.audioBytes += entry.audioSizeBytes;
      existingBook.updatedAt = maxIso(existingBook.updatedAt, entry.lastAccessedAt);
      existingBook.title = existingBook.title || entry.title;

      const chapterKey = entry.chapterId ?? '__book__';
      const chapterTitle = entry.chapterId ? entry.title : '全书级缓存';
      const existingChapter = existingBook.chapters.find((chapter) => chapter.chapterId === chapterKey) ?? {
        chapterId: chapterKey,
        title: chapterTitle,
        entryKeys: [],
        entryCount: 0,
        audioBytes: 0,
        updatedAt: entry.lastAccessedAt
      } satisfies CacheChapterManifest;

      if (!existingBook.chapters.some((chapter) => chapter.chapterId === chapterKey)) {
        existingBook.chapters.push(existingChapter);
      }

      existingChapter.entryKeys.push(entry.key);
      existingChapter.entryCount += 1;
      existingChapter.audioBytes += entry.audioSizeBytes;
      existingChapter.updatedAt = maxIso(existingChapter.updatedAt, entry.lastAccessedAt);
      booksMap.set(entry.bookId, existingBook);
    }

    const currentManifest = await this.readCollectionManifest();
    const manifest: PlaybackCacheCollectionManifest = {
      version: CACHE_SCHEMA_VERSION,
      rootDir: this.rootDir,
      generatedAt: new Date().toISOString(),
      maxCacheBytes: this.maxCacheBytes,
      maxEntries: this.maxEntries,
      totalEntries: entries.length,
      totalAudioBytes: entries.reduce((sum, entry) => sum + entry.audioSizeBytes, 0),
      evictedEntries,
      books: Array.from(booksMap.values())
        .map((book) => ({
          ...book,
          entryKeys: [...new Set(book.entryKeys)].sort(),
          chapters: book.chapters
            .map((chapter) => ({
              ...chapter,
              entryKeys: [...new Set(chapter.entryKeys)].sort()
            }))
            .sort((a, b) => a.chapterId.localeCompare(b.chapterId, 'zh-Hans-CN'))
        }))
        .sort((a, b) => a.updatedAt < b.updatedAt ? 1 : -1),
      looseEntries: [...new Set(looseEntries)].sort()
    };

    if (currentManifest && currentManifest.evictedEntries > manifest.evictedEntries) {
      manifest.evictedEntries = currentManifest.evictedEntries;
    }

    await writeFile(this.getCollectionManifestPath(), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    return manifest;
  }

  private async readCollectionManifest() {
    try {
      return JSON.parse(await readFile(this.getCollectionManifestPath(), 'utf8')) as PlaybackCacheCollectionManifest;
    } catch {
      return null;
    }
  }

  private async loadAllEntryManifests() {
    const entries: CacheEntryManifest[] = [];
    const indexRoot = path.join(this.rootDir, 'index');
    const bucketDirs = await safeReadDir(indexRoot);

    for (const bucket of bucketDirs) {
      if (!bucket.isDirectory()) {
        continue;
      }

      const files = await safeReadDir(path.join(indexRoot, bucket.name));
      for (const file of files) {
        if (!file.isFile() || !file.name.endsWith('.json')) {
          continue;
        }

        const filePath = path.join(indexRoot, bucket.name, file.name);
        try {
          const entry = JSON.parse(await readFile(filePath, 'utf8')) as CacheEntryManifest;
          if (entry.version !== CACHE_SCHEMA_VERSION) {
            continue;
          }
          const audioStats = await stat(entry.audioPath);
          if (!audioStats.isFile()) {
            continue;
          }
          entry.audioSizeBytes = audioStats.size;
          entries.push(entry);
        } catch {
          continue;
        }
      }
    }

    return entries;
  }

  private getAudioPath(key: string, ext: string) {
    return path.join(this.rootDir, 'audio', key.slice(0, 2), `${key}${ext}`);
  }

  private getEntryManifestPath(key: string) {
    return path.join(this.rootDir, 'index', key.slice(0, 2), `${key}.json`);
  }

  private getCollectionManifestPath() {
    return path.join(this.rootDir, 'manifest.json');
  }
}

export function buildPlaybackCacheKey(item: PlaybackQueueItem) {
  const normalizedText = normalizeText(item.text);
  return createHash('sha256').update(JSON.stringify({
    version: CACHE_SCHEMA_VERSION,
    providerId: item.providerId,
    voiceId: item.voiceId,
    speed: Number(item.speed.toFixed(3)),
    bookId: item.bookId ?? '',
    chapterId: item.chapterId ?? '',
    title: item.title,
    text: normalizedText
  })).digest('hex');
}

function normalizeText(text: string) {
  return text.replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim();
}

function hashText(text: string) {
  return createHash('sha256').update(text).digest('hex');
}

function normalizeExtension(extension: string) {
  return extension.startsWith('.') ? extension : `.${extension}`;
}

function compareEntriesForEviction(left: CacheEntryManifest, right: CacheEntryManifest) {
  if (left.lastAccessedAt !== right.lastAccessedAt) {
    return left.lastAccessedAt.localeCompare(right.lastAccessedAt);
  }
  return left.createdAt.localeCompare(right.createdAt);
}

async function safeReadDir(target: string) {
  try {
    const { readdir } = await import('node:fs/promises');
    return readdir(target, { withFileTypes: true });
  } catch {
    return [];
  }
}

function maxIso(left: string, right: string) {
  return left > right ? left : right;
}

function getEnvNumber(name: string) {
  const raw = process.env[name];
  if (!raw) {
    return undefined;
  }
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}
