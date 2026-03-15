import { useEffect, useMemo, useState } from 'react';
import type { Book, NovelReaderApi, ReaderPersistedState, TtsPlaybackState } from '../../shared/types';
import { subscribePlaybackState } from '../lib/playback-events';
import { getPlaybackMetrics, getPlaybackStateSummary, getPlaybackTimeline } from '../lib/playback-metrics';

declare global {
  interface Window {
    novelReader?: NovelReaderApi;
  }
}

const fallbackState: ReaderPersistedState = {
  bookshelf: [],
  recentBookId: null,
  progress: {},
  readingPositions: {},
  settings: {
    defaultProviderId: 'cosyvoice-local',
    defaultVoiceId: '中文女',
    defaultSpeed: 1,
    fontSize: 18,
    lineHeight: 1.9,
    theme: 'dark'
  },
  playbackDraftQueue: []
};

export function usePlaybackDockState() {
  const api = window.novelReader;
  const [persistedState, setPersistedState] = useState<ReaderPersistedState>(fallbackState);
  const [ttsState, setTtsState] = useState<TtsPlaybackState>({ status: 'idle', queue: [], message: '' });
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (!api) {
      return;
    }

    void api.loadReaderState().then((state) => setPersistedState(state));
    void api.getTtsStatus().then((state) => setTtsState(state));

    return subscribePlaybackState(api, (event) => setTtsState(event.state));
  }, [api]);

  const currentBook = useMemo(() => {
    const currentBookId = ttsState.currentItem?.bookId ?? persistedState.recentBookId;
    return persistedState.bookshelf.find((item) => item.id === currentBookId) ?? null;
  }, [persistedState.bookshelf, persistedState.recentBookId, ttsState.currentItem?.bookId]);

  const currentChapterTitle = ttsState.currentItem?.title
    ?? (currentBook
      ? currentBook.chapters.find((chapter) => chapter.id === persistedState.progress[currentBook.id])?.title ?? currentBook.chapters[0]?.title ?? '未选择章节'
      : '未选择章节');

  const playbackSummary = getPlaybackStateSummary(ttsState.status, ttsState.phase, ttsState.message);
  const playbackTimeline = getPlaybackTimeline(ttsState.phase);
  const playbackMetrics = getPlaybackMetrics(ttsState);
  const queueChapterCount = new Set(ttsState.queue.map((item) => item.chapterId ?? item.id)).size;

  async function syncPlaybackState(task: Promise<TtsPlaybackState>) {
    const state = await task;
    setTtsState(state);
  }

  async function refreshState() {
    if (!api) {
      return;
    }

    const [state, playback] = await Promise.all([
      api.loadReaderState(),
      api.getTtsStatus()
    ]);
    setPersistedState(state);
    setTtsState(playback);
  }

  return {
    api,
    currentBook,
    currentChapterTitle,
    playbackSummary,
    playbackTimeline,
    playbackMetrics,
    queueChapterCount,
    isExpanded,
    setIsExpanded,
    ttsState,
    syncPlaybackState,
    refreshState
  };
}
