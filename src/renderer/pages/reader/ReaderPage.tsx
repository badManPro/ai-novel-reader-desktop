import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { TtsPlaybackState } from '../../../shared/types';
import { ReaderChapterDrawer } from '../../components/reader/ReaderChapterDrawer';
import { ReaderContent } from '../../components/reader/ReaderContent';
import { useReaderPageState } from '../../hooks/useReaderPageState';

export function ReaderPage() {
  const navigate = useNavigate();
  const { bookId, chapterId } = useParams();
  const {
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
    currentReadingPosition,
    currentProvider,
    currentVoice,
    handleContentScroll,
    handleSpeak,
    saveBookProgress,
    readingPositionKey
  } = useReaderPageState(bookId, chapterId);

  useEffect(() => {
    if (!book) {
      return;
    }

    if (!currentChapter) {
      navigate(`/reader/${book.id}/${book.chapters[0]?.id ?? 'chapter-1'}`, { replace: true });
      return;
    }

    if (chapterId !== currentChapter.id) {
      navigate(`/reader/${book.id}/${currentChapter.id}`, { replace: true });
    }
  }, [book, chapterId, currentChapter, navigate]);

  async function handleSelectChapter(nextChapterId: string) {
    if (!book) {
      return;
    }

    await saveBookProgress(book.id, nextChapterId);
    setIsChapterDrawerOpen(false);
    navigate(`/reader/${book.id}/${nextChapterId}`);
  }

  async function handleStartSpeak() {
    const ok = await handleSpeak();
    if (ok) {
      setIsChapterDrawerOpen(false);
    }
  }

  if (!book) {
    return (
      <section className="immersive-reader-shell">
        <article className="route-card book-empty-state">
          <p className="route-page-kicker">Reader</p>
          <h4>没有可阅读的书</h4>
          <p>当前路由对应的书籍不存在，或者已经被删除。先返回书库重新选择一本书。</p>
          <Link to="/library" className="route-primary-link">
            返回书库
          </Link>
        </article>
      </section>
    );
  }

  return (
    <section className="immersive-reader-shell">
      <header className="immersive-reader-header">
        <div>
          <p className="route-page-kicker">Reader</p>
          <h1>{book.title}</h1>
          <p className="immersive-reader-caption">
            {currentChapter?.title ?? '未定位章节'} · {book.format.toUpperCase()} · {currentProvider?.name ?? settings.defaultProviderId}
          </p>
        </div>
        <div className="immersive-reader-actions">
          <Link to={`/book/${book.id}`} className="route-secondary-link">
            返回详情页
          </Link>
          <button type="button" className="secondary" onClick={() => setIsChapterDrawerOpen(true)}>
            打开目录
          </button>
          <button type="button" onClick={() => void handleStartSpeak()}>
            开始朗读当前章
          </button>
        </div>
      </header>

      {importWarnings.length > 0 ? (
        <section className="warning-card">
          <strong>阅读页提示</strong>
          <ul>
            {importWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {bookActionMessage ? (
        <section className="info-card">
          <strong>最近操作</strong>
          <p>{bookActionMessage}</p>
        </section>
      ) : null}

      <div className="immersive-reader-layout">
        <section className="immersive-reader-main">
          <div className="immersive-reader-meta-strip">
            <span className="library-feature-chip">{book.chapters.length} 章</span>
            <span className="library-feature-chip">音色：{currentVoice?.name ?? settings.defaultVoiceId}</span>
            <span className="library-feature-chip">滚动键：{readingPositionKey ?? '未定位'}</span>
          </div>

          <ReaderContent
            book={book}
            chapter={currentChapter}
            readingPosition={currentReadingPosition}
            contentRef={contentRef}
            onScroll={handleContentScroll}
          />
        </section>

        <aside className="immersive-reader-rail">
          <article className="route-card immersive-quick-panel">
            <div className="library-section-heading">
              <div>
                <p className="route-page-kicker">Reading Focus</p>
                <h4>当前阅读快照</h4>
              </div>
            </div>
            <div className="book-summary-grid immersive-summary-grid">
              <div>
                <span className="route-page-kicker">Provider</span>
                <strong>{currentProvider?.name ?? settings.defaultProviderId}</strong>
              </div>
              <div>
                <span className="route-page-kicker">Voice</span>
                <strong>{currentVoice?.name ?? settings.defaultVoiceId}</strong>
              </div>
              <div>
                <span className="route-page-kicker">Speed</span>
                <strong>{settings.defaultSpeed}x</strong>
              </div>
              <div>
                <span className="route-page-kicker">Current</span>
                <strong>{currentChapter?.title ?? '未选择章节'}</strong>
              </div>
            </div>
          </article>

          <article className="route-card immersive-control-panel">
            <div className="library-section-heading">
              <div>
                <p className="route-page-kicker">Chapter</p>
                <h4>当前章操作</h4>
              </div>
            </div>
            <div className="immersive-control-stack">
              <button type="button" onClick={() => void handleStartSpeak()}>
                开始朗读当前章
              </button>
              <button type="button" className="secondary" onClick={() => setIsChapterDrawerOpen(true)}>
                打开目录
              </button>
            </div>
            <div className="player-dock-debug-grid reader-inline-metrics">
              <div>
                <span className="muted">章节进度</span>
                <strong>{playbackMetrics.chapterProgress}</strong>
              </div>
              <div>
                <span className="muted">片段进度</span>
                <strong>{playbackMetrics.chunkProgress}</strong>
              </div>
              <div>
                <span className="muted">字数进度</span>
                <strong>{playbackMetrics.charProgress}</strong>
              </div>
              <div>
                <span className="muted">缓存命中</span>
                <strong>{playbackMetrics.cacheSummary}</strong>
              </div>
            </div>
          </article>
        </aside>
      </div>

      <ReaderChapterDrawer
        book={book}
        currentChapterId={currentChapter?.id ?? null}
        open={isChapterDrawerOpen}
        onClose={() => setIsChapterDrawerOpen(false)}
        onSelectChapter={handleSelectChapter}
      />
    </section>
  );
}
