import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { TtsPlaybackState } from '../../../shared/types';
import { ReaderChapterDrawer } from '../../components/reader/ReaderChapterDrawer';
import { ReaderContent } from '../../components/reader/ReaderContent';
import { ReaderPlaybackPanel } from '../../components/reader/ReaderPlaybackPanel';
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

        <ReaderPlaybackPanel
          providerLabel={currentProvider?.name ?? settings.defaultProviderId}
          voiceLabel={currentVoice?.name ?? settings.defaultVoiceId}
          speedLabel={`${settings.defaultSpeed}x`}
          chapterTitle={currentChapter?.title ?? '未选择章节'}
          queueChapterCount={queueChapterCount}
          ttsState={ttsState}
          playbackStateSummary={playbackStateSummary}
          playbackTimeline={playbackTimeline}
          playbackMetrics={playbackMetrics}
          onSpeak={handleStartSpeak}
          onPause={() => syncPlaybackState(api?.pauseTts() ?? Promise.resolve({ status: 'idle', queue: [], message: 'API 不可用。' } as TtsPlaybackState))}
          onResume={() => syncPlaybackState(api?.resumeTts() ?? Promise.resolve({ status: 'idle', queue: [], message: 'API 不可用。' } as TtsPlaybackState))}
          onStop={() => syncPlaybackState(api?.stopTts() ?? Promise.resolve({ status: 'idle', queue: [], message: 'API 不可用。' } as TtsPlaybackState))}
          onRefresh={() => syncPlaybackState(api?.getTtsStatus() ?? Promise.resolve({ status: 'idle', queue: [], message: 'API 不可用。' } as TtsPlaybackState))}
        />
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
