import test from 'node:test';
import assert from 'node:assert/strict';
import { canPrefetchAudio, getDynamicPrefetchAhead, getPrefetchWindow } from '../main/services/playback-prefetch';
import type { PlaybackQueueItem } from '../shared/types';

const queue: PlaybackQueueItem[] = [0, 1, 2, 3].map((order) => ({
  id: `chunk-${order}`,
  title: `第${order + 1}段`,
  text: `内容-${order}`,
  providerId: 'openai-tts',
  voiceId: 'nova',
  speed: 1,
  order,
  chunkIndex: order,
  chunkCount: 4
}));

test('getPrefetchWindow returns the next chunks within the prefetch window', () => {
  const window = getPrefetchWindow(queue, 0, 2);
  assert.deepEqual(window.map((item) => item.id), ['chunk-1', 'chunk-2']);
});

test('getPrefetchWindow skips current chunk and handles tail of queue', () => {
  const window = getPrefetchWindow(queue, 2, 3);
  assert.deepEqual(window.map((item) => item.id), ['chunk-3']);
});

test('getDynamicPrefetchAhead expands window when synthesis is slower than playback', () => {
  assert.equal(getDynamicPrefetchAhead({ averageSynthesisMs: 5400, averagePlaybackMs: 3000, readyChunks: 0, pendingChunks: 0 }), 4);
});

test('getDynamicPrefetchAhead shrinks window when backlog is already healthy', () => {
  assert.equal(getDynamicPrefetchAhead({ averageSynthesisMs: 1400, averagePlaybackMs: 4200, readyChunks: 2, pendingChunks: 0 }), 1);
});

test('canPrefetchAudio only enables file-based providers', () => {
  assert.equal(canPrefetchAudio('openai-tts'), true);
  assert.equal(canPrefetchAudio('glm-tts'), true);
  assert.equal(canPrefetchAudio('cosyvoice-local'), true);
  assert.equal(canPrefetchAudio('gpt-sovits-local'), true);
  assert.equal(canPrefetchAudio('system-say'), false);
});
