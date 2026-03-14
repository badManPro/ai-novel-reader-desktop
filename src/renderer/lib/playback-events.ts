import type { Chapter, NovelReaderApi, PlaybackQueueItem, PlaybackStateEvent } from '../../shared/types';

export function subscribePlaybackState(api: NovelReaderApi | undefined, listener: (event: PlaybackStateEvent) => void) {
  if (!api) {
    return () => undefined;
  }

  return api.onPlaybackState(listener);
}

export function buildContinuousChapterSequence(chapters: Chapter[], startChapterId: string | null) {
  if (!chapters.length) {
    return [];
  }

  const startIndex = Math.max(0, chapters.findIndex((chapter) => chapter.id === startChapterId));
  const normalizedStart = startIndex === -1 ? 0 : startIndex;

  return chapters.slice(normalizedStart).map((chapter) => ({
    chapterId: chapter.id,
    chapterTitle: chapter.title,
    text: chapter.content,
    order: chapter.order
  }));
}

export function buildDraftQueueFromPlaybackItems(items: PlaybackQueueItem[]) {
  return items.map((item, index, array) => ({
    ...item,
    order: index,
    chunkCount: array.filter((candidate) => candidate.chapterId === item.chapterId).length
  }));
}
