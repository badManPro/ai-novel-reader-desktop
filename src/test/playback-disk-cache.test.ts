import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { PlaybackDiskCache, buildPlaybackCacheKey } from '../main/services/playback-disk-cache';
import type { PlaybackQueueItem } from '../shared/types';

const baseItem: PlaybackQueueItem = {
  id: 'chunk-1',
  bookId: 'book-1',
  chapterId: 'chapter-1',
  title: '第一章',
  text: '这是需要缓存的测试文本。',
  providerId: 'openai-tts',
  voiceId: 'nova',
  speed: 1,
  order: 0,
  chunkIndex: 0,
  chunkCount: 1
};

test('buildPlaybackCacheKey ignores runtime queue ids and normalizes whitespace', () => {
  const key1 = buildPlaybackCacheKey(baseItem);
  const key2 = buildPlaybackCacheKey({ ...baseItem, id: 'chunk-2', text: '这是需要缓存的测试文本。\n' });
  assert.equal(key1, key2);
});

test('PlaybackDiskCache can persist and reload audio path across instances', async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'playback-disk-cache-'));
  const sourceDir = await mkdtemp(path.join(tmpdir(), 'playback-disk-cache-audio-'));
  const sourceAudioPath = path.join(sourceDir, 'sample.mp3');
  await writeFile(sourceAudioPath, Buffer.from('fake-audio'));

  const cache = new PlaybackDiskCache(rootDir);
  const stored = await cache.put(baseItem, sourceAudioPath, '.mp3');
  assert.ok(stored.audioPath.endsWith('.mp3'));
  assert.equal(stored.collection.totalEntries, 1);

  const reloaded = await new PlaybackDiskCache(rootDir).get({ ...baseItem, id: 'another-runtime-id' });
  assert.ok(reloaded);
  assert.equal(reloaded?.audioPath, stored.audioPath);
  assert.equal(reloaded?.collection.books[0]?.chapters[0]?.entryCount, 1);
});

test('PlaybackDiskCache writes a collection manifest grouped by book and chapter', async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'playback-disk-cache-manifest-'));
  const sourceDir = await mkdtemp(path.join(tmpdir(), 'playback-disk-cache-manifest-audio-'));
  const sourceAudioPath = path.join(sourceDir, 'sample.mp3');
  await writeFile(sourceAudioPath, Buffer.from('manifest-audio-12345'));

  const cache = new PlaybackDiskCache(rootDir);
  await cache.put(baseItem, sourceAudioPath, '.mp3');
  await cache.put({
    ...baseItem,
    id: 'chunk-2',
    chapterId: 'chapter-2',
    title: '第二章',
    text: '第二章的缓存文本。',
    order: 1
  }, sourceAudioPath, '.mp3');

  const manifest = JSON.parse(await readFile(path.join(rootDir, 'manifest.json'), 'utf8')) as {
    totalEntries: number;
    books: Array<{ bookId: string; entryCount: number; chapters: Array<{ chapterId: string; entryCount: number }> }>;
  };

  assert.equal(manifest.totalEntries, 2);
  assert.equal(manifest.books[0]?.bookId, 'book-1');
  assert.equal(manifest.books[0]?.entryCount, 2);
  assert.deepEqual(manifest.books[0]?.chapters.map((chapter) => [chapter.chapterId, chapter.entryCount]), [
    ['chapter-1', 1],
    ['chapter-2', 1]
  ]);
});

test('PlaybackDiskCache evicts least recently used entries when capacity is exceeded', async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'playback-disk-cache-evict-'));
  const sourceDir = await mkdtemp(path.join(tmpdir(), 'playback-disk-cache-evict-audio-'));
  const audioA = path.join(sourceDir, 'a.mp3');
  const audioB = path.join(sourceDir, 'b.mp3');
  const audioC = path.join(sourceDir, 'c.mp3');
  await writeFile(audioA, Buffer.alloc(24, 1));
  await writeFile(audioB, Buffer.alloc(24, 2));
  await writeFile(audioC, Buffer.alloc(24, 3));

  const cache = new PlaybackDiskCache(rootDir, { maxCacheBytes: 60, maxEntries: 2 });
  await cache.put({ ...baseItem, id: 'chunk-a', text: 'A 文本' }, audioA, '.mp3');
  await cache.put({ ...baseItem, id: 'chunk-b', text: 'B 文本', order: 1 }, audioB, '.mp3');
  await cache.get({ ...baseItem, id: 'runtime-b', text: 'B 文本', order: 1 });
  const storedC = await cache.put({ ...baseItem, id: 'chunk-c', text: 'C 文本', order: 2 }, audioC, '.mp3');

  const evictedA = await cache.get({ ...baseItem, id: 'runtime-a', text: 'A 文本' });
  const keptB = await cache.get({ ...baseItem, id: 'runtime-b2', text: 'B 文本', order: 1 });
  const keptC = await cache.get({ ...baseItem, id: 'runtime-c', text: 'C 文本', order: 2 });
  const stats = await cache.getStats();

  assert.equal(evictedA, null);
  assert.ok(keptB);
  assert.equal(keptC?.audioPath, storedC.audioPath);
  assert.equal(stats.totalEntries, 2);
  assert.equal(stats.evictedEntries, 1);
});
