import { useEffect, useMemo, useRef, useState } from 'react';
import type { Book, DeleteBookResult, NovelReaderApi, ReaderPersistedState } from '../../shared/types';

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

function getBookTitle(bookId: string, bookshelf: Book[]) {
  return bookshelf.find((item) => item.id === bookId)?.title ?? '已删除书籍';
}

function formatBytes(bytes?: number) {
  if (!bytes || bytes <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / (1024 ** exponent);
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

export function useLibraryState() {
  const api = window.novelReader;
  const [persistedState, setPersistedState] = useState<ReaderPersistedState>(fallbackState);
  const [isLoading, setIsLoading] = useState(Boolean(api));
  const [isImporting, setIsImporting] = useState(false);
  const [deletingBookId, setDeletingBookId] = useState<string | null>(null);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [bookActionMessage, setBookActionMessage] = useState<string | null>(null);
  const stateRef = useRef<ReaderPersistedState>(fallbackState);

  useEffect(() => {
    stateRef.current = persistedState;
  }, [persistedState]);

  useEffect(() => {
    if (!api) {
      setIsLoading(false);
      setImportWarnings(['当前运行环境未注入 novelReader API。']);
      return;
    }

    setIsLoading(true);
    setImportWarnings([]);

    void api.loadReaderState()
      .then((state) => {
        stateRef.current = state;
        setPersistedState(state);
      })
      .catch((error) => {
        setImportWarnings([error instanceof Error ? error.message : '加载书库失败，请重试。']);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [api]);

  const bookshelf = persistedState.bookshelf;
  const recentBook = useMemo(
    () => bookshelf.find((item) => item.id === persistedState.recentBookId) ?? bookshelf[0] ?? null,
    [bookshelf, persistedState.recentBookId]
  );

  function getBookProgressChapter(book: Book) {
    const chapterId = stateRef.current.progress[book.id];
    return book.chapters.find((chapter) => chapter.id === chapterId) ?? book.chapters[0] ?? null;
  }

  async function persistPatch(patch: Partial<ReaderPersistedState>) {
    if (!api) {
      return null;
    }

    const nextState = await api.saveReaderState(patch);
    stateRef.current = nextState;
    setPersistedState(nextState);
    return nextState;
  }

  async function handleImport() {
    if (!api) {
      setImportWarnings(['当前运行环境未注入 novelReader API。']);
      return;
    }

    setIsImporting(true);
    setBookActionMessage(null);

    try {
      const result = await api.importTxtBook();
      if (!result) {
        return;
      }

      const currentState = stateRef.current;
      const nextBookshelf = [result.book, ...currentState.bookshelf.filter((item) => item.id !== result.book.id)].slice(0, 20);
      const nextProgress = {
        ...currentState.progress,
        [result.book.id]: result.book.chapters[0]?.id ?? ''
      };

      setImportWarnings(result.warnings);
      setBookActionMessage(`已导入《${result.book.title}》并写入书架。`);

      await persistPatch({
        bookshelf: nextBookshelf,
        recentBookId: result.book.id,
        progress: nextProgress
      });
    } catch (error) {
      setImportWarnings([error instanceof Error ? error.message : '导入失败，请重试。']);
    } finally {
      setIsImporting(false);
    }
  }

  async function applyDeletedBookState(result: DeleteBookResult) {
    const currentBookshelf = stateRef.current.bookshelf;
    stateRef.current = result.state;
    setPersistedState(result.state);

    const cleanupSummary = [`已删除《${getBookTitle(result.removedBookId, currentBookshelf)}》`];
    cleanupSummary.push(result.removedBookshelfRecord ? '书架记录已移除' : '书架记录未找到');
    if (result.removedProgress) {
      cleanupSummary.push('阅读进度已清理');
    }
    if (result.removedReadingPositions > 0) {
      cleanupSummary.push(`滚动定位 ${result.removedReadingPositions} 条已清理`);
    }
    if (result.removedDraftQueueItems > 0) {
      cleanupSummary.push(`草稿队列 ${result.removedDraftQueueItems} 段已清理`);
    }
    if (result.removedCacheEntries > 0) {
      cleanupSummary.push(`磁盘缓存 ${result.removedCacheEntries} 条（${formatBytes(result.removedCacheBytes)}）已清理`);
    }
    setBookActionMessage(cleanupSummary.join('；'));
  }

  async function handleDeleteBook(targetBook: Book) {
    if (!api) {
      setImportWarnings(['当前运行环境未注入 novelReader API。']);
      return;
    }

    const confirmed = window.confirm([
      `确定删除《${targetBook.title}》吗？`,
      '将移除书架记录、阅读进度、章节滚动定位。',
      '若存在该书的自动续播草稿与磁盘缓存，也会一并清理。'
    ].join('\n'));

    if (!confirmed) {
      return;
    }

    setDeletingBookId(targetBook.id);
    setBookActionMessage(null);
    setImportWarnings([]);

    try {
      const result = await api.deleteBook(targetBook.id);
      await applyDeletedBookState(result);
    } catch (error) {
      setImportWarnings([error instanceof Error ? error.message : '删除失败，请重试。']);
    } finally {
      setDeletingBookId(null);
    }
  }

  return {
    api,
    bookshelf,
    persistedState,
    recentBook,
    isLoading,
    isImporting,
    deletingBookId,
    importWarnings,
    bookActionMessage,
    handleDeleteBook,
    handleImport,
    getBookProgressChapter
  };
}
