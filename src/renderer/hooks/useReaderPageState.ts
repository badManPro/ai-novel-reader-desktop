import { useEffect, useMemo, useRef, useState } from 'react';
import type { Book, Chapter, ModelProvider, NovelReaderApi, TtsPlaybackState, VoiceOption } from '../../shared/types';
import { subscribePlaybackState, buildContinuousChapterSequence } from '../lib/playback-events';
import { getPlaybackMetrics, getPlaybackStateSummary, getPlaybackTimeline } from '../lib/playback-metrics';
import { useLibraryState } from './useLibraryState';

declare global {
  interface Window {
    novelReader?: NovelReaderApi;
  }
}

export function useReaderPageState(bookId: string | undefined, chapterId: string | undefined) {
  const api = window.novelReader;
  const contentRef = useRef<HTMLElement>(null!);
  const scrollSaveTimer = useRef<number | null>(null);
  const {
    bookshelf,
    persistedState,
    importWarnings,
    bookActionMessage,
    persistPatch,
    saveBookProgress
  } = useLibraryState();
  const [ttsState, setTtsState] = useState<TtsPlaybackState>({ status: 'idle', queue: [], message: '' });
  const [providers, setProviders] = useState<ModelProvider[]>([]);
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [isChapterDrawerOpen, setIsChapterDrawerOpen] = useState(false);

  const settings = persistedState.settings;
  const book = useMemo(
    () => bookshelf.find((item) => item.id === bookId) ?? null,
    [bookId, bookshelf]
  );

  const fallbackChapterId = useMemo(
    () => (book ? persistedState.progress[book.id] ?? book.chapters[0]?.id ?? null : null),
    [book, persistedState.progress]
  );

  const currentChapter = useMemo(() => {
    if (!book) {
      return null;
    }
    return book.chapters.find((chapter) => chapter.id === chapterId)
      ?? book.chapters.find((chapter) => chapter.id === fallbackChapterId)
      ?? book.chapters[0]
      ?? null;
  }, [book, chapterId, fallbackChapterId]);

  const currentProvider = providers.find((provider) => provider.id === settings.defaultProviderId);
  const currentVoice = voices.find((voice) => voice.id === settings.defaultVoiceId);
  const readingPositionKey = book && currentChapter ? `${book.id}::${currentChapter.id}` : null;
  const playbackStateSummary = getPlaybackStateSummary(ttsState.status, ttsState.phase, ttsState.message);
  const playbackTimeline = getPlaybackTimeline(ttsState.phase);
  const playbackMetrics = getPlaybackMetrics(ttsState);
  const queueChapterCount = new Set(ttsState.queue.map((item) => item.chapterId ?? item.id)).size;
  const currentReadingPosition = readingPositionKey ? (persistedState.readingPositions[readingPositionKey] ?? 0) : 0;

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
    root.style.setProperty('--reader-font-size', `${settings.fontSize}px`);
    root.style.setProperty('--reader-line-height', String(settings.lineHeight));
  }, [settings.fontSize, settings.lineHeight, settings.theme]);

  useEffect(() => {
    if (!api) {
      return;
    }

    void api.getTtsProviders().then((providerList) => setProviders(providerList));
    void api.getTtsStatus().then((state) => setTtsState(state));

    return subscribePlaybackState(api, (event) => setTtsState(event.state));
  }, [api]);

  useEffect(() => {
    if (!api || !settings.defaultProviderId) {
      return;
    }

    void api.getVoices(settings.defaultProviderId).then((voiceList) => setVoices(voiceList));
  }, [api, settings.defaultProviderId]);

  useEffect(() => {
    if (!contentRef.current || !readingPositionKey) {
      return;
    }

    const nextScrollTop = persistedState.readingPositions[readingPositionKey] ?? 0;
    window.requestAnimationFrame(() => {
      if (contentRef.current) {
        contentRef.current.scrollTop = nextScrollTop;
      }
    });
  }, [currentChapter?.id, persistedState.readingPositions, readingPositionKey]);

  async function syncPlaybackState(task: Promise<TtsPlaybackState>) {
    const state = await task;
    setTtsState(state);
  }

  async function handleSpeak(chapter?: Chapter | null) {
    if (!api || !book) {
      return false;
    }

    const targetChapter = chapter ?? currentChapter;
    if (!targetChapter || !settings.defaultVoiceId) {
      return false;
    }

    setTtsState({
      status: 'loading',
      phase: 'preparing',
      phaseLabel: '准备朗读',
      queue: [],
      message: '正在整理章节并生成连续朗读队列…'
    });

    try {
      await saveBookProgress(book.id, targetChapter.id);
      const result = await api.speak({
        providerId: settings.defaultProviderId,
        voiceId: settings.defaultVoiceId,
        speed: settings.defaultSpeed,
        bookId: book.id,
        chapterId: targetChapter.id,
        chapterTitle: targetChapter.title,
        text: targetChapter.content,
        chapterSequence: buildContinuousChapterSequence(book.chapters, targetChapter.id)
      });
      setTtsState((current) => ({ ...current, status: result.status, message: result.message }));
      return true;
    } catch (error) {
      setTtsState({
        status: 'error',
        phase: 'error',
        phaseLabel: '启动失败',
        queue: [],
        message: error instanceof Error ? error.message : 'TTS 启动失败。'
      });
      return false;
    }
  }

  async function saveReadingPosition(scrollTop: number) {
    if (!readingPositionKey) {
      return;
    }

    await persistPatch({
      readingPositions: {
        ...persistedState.readingPositions,
        [readingPositionKey]: scrollTop
      }
    });
  }

  function handleContentScroll() {
    if (!readingPositionKey || !contentRef.current) {
      return;
    }

    if (scrollSaveTimer.current) {
      window.clearTimeout(scrollSaveTimer.current);
    }

    const scrollTop = contentRef.current.scrollTop;
    scrollSaveTimer.current = window.setTimeout(() => {
      void saveReadingPosition(scrollTop);
    }, 150);
  }

  return {
    api,
    book,
    currentChapter,
    settings,
    contentRef,
    importWarnings,
    bookActionMessage,
    isChapterDrawerOpen,
    setIsChapterDrawerOpen,
    playbackMetrics,
    playbackStateSummary,
    playbackTimeline,
    queueChapterCount,
    currentReadingPosition,
    readingPositionKey,
    ttsState,
    currentProvider,
    currentVoice,
    handleContentScroll,
    handleSpeak,
    saveBookProgress,
    syncPlaybackState
  };
}
