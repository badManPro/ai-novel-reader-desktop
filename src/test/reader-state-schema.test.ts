import test from 'node:test';
import assert from 'node:assert/strict';
import { createMigratedReaderState, defaultReaderState, mergeReaderState } from '../main/services/reader-state-schema';

test('createMigratedReaderState fills missing persisted fields', () => {
  const migrated = createMigratedReaderState({
    recentBookId: 'book-7',
    settings: {
      defaultProviderId: 'glm-tts'
    } as never,
    progress: {
      'book-7': 'chapter-3'
    }
  });

  assert.equal(migrated.recentBookId, 'book-7');
  assert.equal(migrated.settings.defaultProviderId, 'glm-tts');
  assert.equal(migrated.settings.fontSize, defaultReaderState.settings.fontSize);
  assert.deepEqual(migrated.progress, { 'book-7': 'chapter-3' });
  assert.deepEqual(migrated.playbackDraftQueue, []);
});

test('mergeReaderState keeps existing nested settings when patch is partial', () => {
  const merged = mergeReaderState({
    settings: {
      theme: 'sepia'
    } as Partial<typeof defaultReaderState.settings> as never
  }, defaultReaderState);

  assert.equal(merged.settings.theme, 'sepia');
  assert.equal(merged.settings.defaultProviderId, 'cosyvoice-local');
  assert.equal(merged.settings.defaultVoiceId, '中文女');
  assert.equal(merged.settings.lineHeight, 1.9);
});
