import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlaybackQueue, buildPlaybackQueueFromSources } from '../main/services/chapter-playback-queue';

test('buildPlaybackQueue builds a continuous multi-chapter queue', () => {
  const queue = buildPlaybackQueue({
    providerId: 'system-say',
    voiceId: 'Ting-Ting',
    speed: 1,
    bookId: 'book-1',
    chapterId: 'chapter-1',
    text: '第一章正文',
    chapterSequence: [
      { chapterId: 'chapter-1', chapterTitle: '第一章', text: '第一章第一句。第一章第二句。', order: 1 },
      { chapterId: 'chapter-2', chapterTitle: '第二章', text: '第二章第一句。第二章第二句。', order: 2 }
    ]
  }, { maxChunkLength: 8 });

  assert.equal(queue[0]?.chapterId, 'chapter-1');
  assert.equal(queue.at(-1)?.chapterId, 'chapter-2');
  assert.ok(queue.length >= 4);
  assert.deepEqual([...new Set(queue.map((item) => item.chapterId))], ['chapter-1', 'chapter-2']);
  assert.equal(queue[0]?.order, 0);
  assert.equal(queue[1]?.order, 1);
});

test('buildPlaybackQueueFromSources supports a shorter first chunk and custom order offset', () => {
  const queue = buildPlaybackQueueFromSources([{
    chapterId: 'chapter-1',
    chapterTitle: '第一章',
    text: '第一句很长很长很长。第二句也很长很长很长。第三句继续补充内容。',
    order: 1
  }], {
    providerId: 'cosyvoice-local',
    voiceId: '中文女',
    speed: 1,
    bookId: 'book-1'
  }, {
    maxChunkLength: 14,
    firstChunkMaxLength: 8,
    startOrder: 5
  });

  assert.equal(queue[0]?.order, 5);
  assert.ok(queue[0]?.text.length <= 8);
  assert.ok(queue[1]?.text.length <= 14);
});
