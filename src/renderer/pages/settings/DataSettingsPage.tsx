import { useSettingsOutlet } from './useSettingsOutlet';

export function DataSettingsPage() {
  const {
    persistedState,
    recentBook,
    playbackMetrics,
    ttsState,
    clearBookCache
  } = useSettingsOutlet();

  return (
    <section className="settings-page-stack">
      <article className="route-card settings-route-card">
        <p className="route-page-kicker">Data</p>
        <h4>缓存与草稿队列</h4>
        <p>删除书籍时会联动清理残留缓存；这里提供集中查看和按书清理入口。</p>

        <div className="settings-metric-grid">
          <div className="settings-metric-card">
            <span className="route-page-kicker">Disk Cache</span>
            <strong>{playbackMetrics.diskCacheUsage}</strong>
            <p>当前缓存占用 / 限额 / 条目数</p>
          </div>
          <div className="settings-metric-card">
            <span className="route-page-kicker">Hit Ratio</span>
            <strong>{playbackMetrics.cacheSummary}</strong>
            <p>当前会话缓存命中 / 未命中</p>
          </div>
          <div className="settings-metric-card">
            <span className="route-page-kicker">Draft Queue</span>
            <strong>{persistedState.playbackDraftQueue.length} 段</strong>
            <p>自动续播草稿队列数量</p>
          </div>
          <div className="settings-metric-card">
            <span className="route-page-kicker">Current Chunk</span>
            <strong>{playbackMetrics.currentChunkChars}</strong>
            <p>当前播放片段字数</p>
          </div>
        </div>

        {ttsState.progress?.isLongText && ttsState.progress.longTextHint ? (
          <div className="long-text-hint">
            <strong>长文本提示</strong>
            <span>{ttsState.progress.longTextHint}</span>
          </div>
        ) : null}
      </article>

      <article className="route-card settings-route-card">
        <p className="route-page-kicker">Cleanup</p>
        <h4>按书清理缓存</h4>
        <div className="settings-cleanup-list">
          {persistedState.bookshelf.map((book) => (
            <div key={book.id} className="settings-cleanup-item">
              <div>
                <strong>{book.title}</strong>
                <p>{book.chapters.length} 章 · {book.id === recentBook?.id ? '最近阅读' : '已入库'}</p>
              </div>
              <button type="button" className="secondary" onClick={() => void clearBookCache(book.id)}>
                清理此书缓存
              </button>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}
