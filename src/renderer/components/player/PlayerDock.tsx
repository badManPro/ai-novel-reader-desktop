import { Link } from 'react-router-dom';
import type { TtsPlaybackState } from '../../../shared/types';
import { usePlaybackDockState } from '../../hooks/usePlaybackDockState';

const fallbackPlaybackState = { status: 'idle', queue: [], message: 'API 不可用。' } as TtsPlaybackState;

export function PlayerDock() {
  const {
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
  } = usePlaybackDockState();

  return (
    <section className={`player-dock ${ttsState.status !== 'idle' ? 'active' : ''}`}>
      <div className="player-dock-main">
        <div className="player-dock-primary">
          <div>
            <p className="route-page-kicker">Player Dock</p>
            <h3>{currentBook?.title ?? '当前没有播放中的书'}</h3>
            <p className="player-dock-caption">
              {currentChapterTitle} · {playbackSummary}
              {ttsState.currentItem?.bookId && ttsState.currentItem?.chapterId ? (
                <>
                  {' · '}
                  <Link to={`/reader/${ttsState.currentItem.bookId}/${ttsState.currentItem.chapterId}`} className="route-inline-link">
                    打开当前阅读
                  </Link>
                </>
              ) : null}
            </p>
          </div>
          <div className="player-dock-actions">
            <button type="button" className="secondary" onClick={() => void syncPlaybackState(api?.pauseTts() ?? Promise.resolve(fallbackPlaybackState))}>
              暂停
            </button>
            <button type="button" className="secondary" onClick={() => void syncPlaybackState(api?.resumeTts() ?? Promise.resolve(fallbackPlaybackState))}>
              继续
            </button>
            <button type="button" className="secondary" onClick={() => void syncPlaybackState(api?.stopTts() ?? Promise.resolve(fallbackPlaybackState))}>
              停止
            </button>
            <button type="button" className="secondary" onClick={() => void refreshState()}>
              刷新
            </button>
            <button type="button" onClick={() => setIsExpanded((current) => !current)}>
              {isExpanded ? '收起详情' : '展开详情'}
            </button>
          </div>
        </div>

        <div className="player-dock-metrics">
          <div>
            <span className="route-page-kicker">Queue</span>
            <strong>{queueChapterCount} 章 / {ttsState.queue.length} 段</strong>
          </div>
          <div>
            <span className="route-page-kicker">Chapter</span>
            <strong>{playbackMetrics.chapterProgress}</strong>
          </div>
          <div>
            <span className="route-page-kicker">Chunk</span>
            <strong>{playbackMetrics.chunkProgress}</strong>
          </div>
          <div>
            <span className="route-page-kicker">Cache</span>
            <strong>{playbackMetrics.cacheSummary}</strong>
          </div>
        </div>
      </div>

      {isExpanded ? (
        <div className="player-dock-expanded">
          <div className="playback-timeline" aria-label="全局播放器进度阶段">
            {playbackTimeline.map((item) => (
              <span key={item.key} className={`timeline-chip ${item.state}`}>
                {item.label}
              </span>
            ))}
          </div>
          <div className="player-dock-debug-grid">
            <div>
              <span className="muted">字数进度</span>
              <strong>{playbackMetrics.charProgress}</strong>
            </div>
            <div>
              <span className="muted">当前片段</span>
              <strong>{playbackMetrics.currentChunkChars}</strong>
            </div>
            <div>
              <span className="muted">磁盘缓存</span>
              <strong>{playbackMetrics.diskCacheUsage}</strong>
            </div>
            <div>
              <span className="muted">累计清理</span>
              <strong>{playbackMetrics.cacheEvictedEntries}</strong>
            </div>
          </div>
          {ttsState.message ? <p className="player-dock-message">{ttsState.message}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
