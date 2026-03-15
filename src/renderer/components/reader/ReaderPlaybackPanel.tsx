import type { TtsPlaybackState } from '../../../shared/types';

interface ReaderPlaybackPanelProps {
  providerLabel: string;
  voiceLabel: string;
  speedLabel: string;
  chapterTitle: string;
  queueChapterCount: number;
  ttsState: TtsPlaybackState;
  playbackStateSummary: string;
  playbackTimeline: Array<{ key: string; label: string; state: string }>;
  playbackMetrics: {
    chapterProgress: string;
    chunkProgress: string;
    charProgress: string;
    cacheSummary: string;
  };
  onSpeak: () => void | Promise<void>;
  onPause: () => void | Promise<void>;
  onResume: () => void | Promise<void>;
  onStop: () => void | Promise<void>;
  onRefresh: () => void | Promise<void>;
}

export function ReaderPlaybackPanel({
  providerLabel,
  voiceLabel,
  speedLabel,
  chapterTitle,
  queueChapterCount,
  ttsState,
  playbackStateSummary,
  playbackTimeline,
  playbackMetrics,
  onSpeak,
  onPause,
  onResume,
  onStop,
  onRefresh
}: ReaderPlaybackPanelProps) {
  return (
    <aside className="immersive-reader-rail">
      <article className="route-card immersive-quick-panel">
        <div className="library-section-heading">
          <div>
            <p className="route-page-kicker">Current Voice</p>
            <h4>当前朗读配置</h4>
          </div>
        </div>
        <div className="book-summary-grid immersive-summary-grid">
          <div>
            <span className="route-page-kicker">Provider</span>
            <strong>{providerLabel}</strong>
          </div>
          <div>
            <span className="route-page-kicker">Voice</span>
            <strong>{voiceLabel}</strong>
          </div>
          <div>
            <span className="route-page-kicker">Speed</span>
            <strong>{speedLabel}</strong>
          </div>
          <div>
            <span className="route-page-kicker">Current</span>
            <strong>{chapterTitle}</strong>
          </div>
        </div>
      </article>

      <article className={`tts-status immersive-tts-panel status-${ttsState.status}`}>
        <div className="tts-status-header">
          <div>
            <strong>TTS 状态：</strong>
            <span>{playbackStateSummary}</span>
          </div>
          <span className="phase-pill">{ttsState.phaseLabel ?? '空闲'}</span>
        </div>
        {ttsState.message ? <p>{ttsState.message}</p> : null}
        <div className="playback-timeline" aria-label="TTS 进度阶段">
          {playbackTimeline.map((item) => (
            <span key={item.key} className={`timeline-chip ${item.state}`}>
              {item.label}
            </span>
          ))}
        </div>
        <div className="playback-metrics-grid">
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
        <small className="muted provider-note">
          自动续播剩余：{queueChapterCount} 章 / {ttsState.queue.length} 段
          {' · '}当前位置：{ttsState.currentItem?.title ?? '无'}
        </small>
      </article>

      <article className="route-card immersive-control-panel">
        <div className="library-section-heading">
          <div>
            <p className="route-page-kicker">Playback</p>
            <h4>当前章控制</h4>
          </div>
        </div>
        <div className="immersive-control-stack">
          <button type="button" onClick={() => void onSpeak()}>
            开始朗读当前章
          </button>
          <button type="button" className="secondary" onClick={() => void onPause()}>
            暂停
          </button>
          <button type="button" className="secondary" onClick={() => void onResume()}>
            继续
          </button>
          <button type="button" className="secondary" onClick={() => void onStop()}>
            停止
          </button>
          <button type="button" className="secondary" onClick={() => void onRefresh()}>
            刷新状态
          </button>
        </div>
      </article>
    </aside>
  );
}
