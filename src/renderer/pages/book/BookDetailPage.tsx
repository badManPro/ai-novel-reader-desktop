import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { ChapterPlaybackSource } from '../../../shared/types';
import { BookChapterList } from '../../components/book/BookChapterList';
import { BookHero } from '../../components/book/BookHero';
import { useLibraryState } from '../../hooks/useLibraryState';

export function BookDetailPage() {
  const navigate = useNavigate();
  const { bookId } = useParams();
  const {
    api,
    bookshelf,
    persistedState,
    deletingBookId,
    importWarnings,
    bookActionMessage,
    clearBookCache,
    handleDeleteBook,
    getBookProgressChapter,
    saveBookProgress
  } = useLibraryState();
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [isClearingCache, setIsClearingCache] = useState(false);

  const book = useMemo(
    () => bookshelf.find((item) => item.id === bookId) ?? null,
    [bookId, bookshelf]
  );
  const progressChapter = book ? getBookProgressChapter(book) : null;

  useEffect(() => {
    if (!book) {
      setSelectedChapterId(null);
      return;
    }

    setSelectedChapterId(persistedState.progress[book.id] ?? book.chapters[0]?.id ?? null);
  }, [book, persistedState.progress]);

  const currentChapter = book?.chapters.find((chapter) => chapter.id === selectedChapterId) ?? progressChapter ?? book?.chapters[0] ?? null;

  async function syncSelection(chapterId: string) {
    if (!book) {
      return;
    }

    setSelectedChapterId(chapterId);
    await saveBookProgress(book.id, chapterId);
  }

  async function handleContinueReading() {
    if (!book || !currentChapter) {
      return;
    }

    await saveBookProgress(book.id, currentChapter.id);
    navigate(`/reader/${book.id}/${currentChapter.id}`);
  }

  async function handleStartReading() {
    if (!api || !book || !currentChapter) {
      return;
    }

    await saveBookProgress(book.id, currentChapter.id);
    const startIndex = book.chapters.findIndex((chapter) => chapter.id === currentChapter.id);
    const chapterSequence: ChapterPlaybackSource[] = book.chapters.slice(startIndex >= 0 ? startIndex : 0).map((chapter) => ({
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      text: chapter.content,
      order: chapter.order
    }));

    await api.speak({
      providerId: persistedState.settings.defaultProviderId,
      voiceId: persistedState.settings.defaultVoiceId,
      speed: persistedState.settings.defaultSpeed,
      text: currentChapter.content,
      chapterId: currentChapter.id,
      chapterTitle: currentChapter.title,
      bookId: book.id,
      chapterSequence
    });

    navigate(`/reader/${book.id}/${currentChapter.id}`);
  }

  async function handleClearCache() {
    if (!book) {
      return;
    }

    setIsClearingCache(true);
    try {
      await clearBookCache(book.id);
    } finally {
      setIsClearingCache(false);
    }
  }

  async function handleDeleteCurrentBook() {
    if (!book) {
      return;
    }

    const result = await handleDeleteBook(book);
    if (result) {
      navigate('/library');
    }
  }

  if (!book) {
    return (
      <section className="route-page">
        <article className="route-card book-empty-state">
          <p className="route-page-kicker">Book Detail</p>
          <h4>没有找到这本书</h4>
          <p>这本书可能已被删除，或者当前路由里的 `bookId` 已失效。先返回书库重新选择。</p>
          <button type="button" onClick={() => navigate('/library')}>
            返回书库
          </button>
        </article>
      </section>
    );
  }

  return (
    <section className="route-page book-detail-page">
      <BookHero
        book={book}
        currentChapter={currentChapter}
        isClearingCache={isClearingCache}
        isDeleting={deletingBookId === book.id}
        onContinueReading={handleContinueReading}
        onStartReading={handleStartReading}
        onClearCache={handleClearCache}
        onDelete={handleDeleteCurrentBook}
      />

      {importWarnings.length > 0 ? (
        <section className="warning-card">
          <strong>详情页提示</strong>
          <ul>
            {importWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {bookActionMessage ? (
        <section className="info-card">
          <strong>书籍操作</strong>
          <p>{bookActionMessage}</p>
        </section>
      ) : null}

      <div className="book-detail-grid">
        <section className="route-card book-summary-card">
          <div className="library-section-heading">
            <div>
              <p className="route-page-kicker">Overview</p>
              <h4>阅读概览</h4>
            </div>
            <span className="library-section-meta">{book.author ?? '未标注作者'}</span>
          </div>

          <div className="book-summary-grid">
            <div>
              <span className="route-page-kicker">Current Chapter</span>
              <strong>{currentChapter?.title ?? '首章'}</strong>
            </div>
            <div>
              <span className="route-page-kicker">Continue Route</span>
              <strong>{`/reader/${book.id}/${currentChapter?.id ?? book.chapters[0]?.id ?? 'chapter-1'}`}</strong>
            </div>
            <div>
              <span className="route-page-kicker">Cloud-first</span>
              <strong>{persistedState.settings.defaultProviderId}</strong>
            </div>
            <div>
              <span className="route-page-kicker">Voice</span>
              <strong>{persistedState.settings.defaultVoiceId}</strong>
            </div>
          </div>

          <p className="book-summary-copy">
            详情页负责选章和决定从哪里开始；阅读页继续承接正文滚动与播放状态，避免再把章节导航挤回全局侧栏。
          </p>
        </section>

        <BookChapterList
          book={book}
          selectedChapterId={currentChapter?.id ?? null}
          onSelectChapter={syncSelection}
        />
      </div>
    </section>
  );
}
