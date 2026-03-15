import type { TtsPlaybackPhase, TtsPlaybackState, TtsPlaybackStatus } from '../../shared/types';

export function getPlaybackStateSummary(status: TtsPlaybackStatus, phase: TtsPlaybackPhase | undefined, message: string) {
  if (message) {
    const base = {
      idle: '空闲',
      loading: '准备中',
      reading: '朗读中',
      paused: '已暂停',
      error: '出错'
    }[status];

    if (phase === 'completed') {
      return '已完成';
    }

    return base;
  }

  return '空闲';
}

export function getPlaybackTimeline(phase: TtsPlaybackPhase | undefined) {
  const steps: Array<{ key: TtsPlaybackPhase; label: string }> = [
    { key: 'preparing', label: '准备朗读' },
    { key: 'chunking', label: '文本切片' },
    { key: 'streaming-first-chunk', label: '首段预热' },
    { key: 'prefetching-audio', label: '后台预取' },
    { key: 'playing', label: '播放中' }
  ];
  const phaseOrder: TtsPlaybackPhase[] = ['preparing', 'chunking', 'queue-ready', 'streaming-first-chunk', 'generating-audio', 'prefetching-audio', 'playing', 'completed'];
  const currentIndex = phase ? phaseOrder.indexOf(phase) : -1;

  return steps.map((step) => {
    const stepIndex = phaseOrder.indexOf(step.key);
    if (phase === 'error') {
      return { ...step, state: step.key === 'playing' ? 'current' : 'done' };
    }
    if (phase === 'paused' && step.key === 'playing') {
      return { ...step, state: 'current' };
    }
    if (
      phase === step.key
      || (phase === 'queue-ready' && step.key === 'chunking')
      || (phase === 'generating-audio' && step.key === 'streaming-first-chunk')
      || (phase === 'playing' && step.key === 'prefetching-audio')
    ) {
      return { ...step, state: 'current' };
    }
    if (currentIndex > stepIndex) {
      return { ...step, state: 'done' };
    }
    return { ...step, state: 'pending' };
  });
}

export function getPlaybackMetrics(ttsState: TtsPlaybackState) {
  const progress = ttsState.progress;
  if (!progress) {
    return {
      chapterProgress: '0 / 0',
      chunkProgress: '0 / 0',
      charProgress: '0 / 0',
      currentChunkChars: '0 字',
      readyChunks: '0 段',
      pendingPrefetchChunks: '0 段',
      dynamicPrefetchAhead: '0 段',
      cacheSummary: '0 / 0',
      diskCacheUsage: '0 B / 0 B · 0 条',
      cacheEvictedEntries: '0 条'
    };
  }

  return {
    chapterProgress: `${progress.currentChapterIndex ?? 0} / ${progress.totalChapters ?? 0}`,
    chunkProgress: `${progress.currentChunkIndex ?? 0} / ${progress.totalChunks ?? 0}`,
    charProgress: `${progress.charIndex} / ${progress.charLength}`,
    currentChunkChars: `${progress.currentChunkChars ?? 0} 字`,
    readyChunks: `${progress.readyChunks ?? 0} 段`,
    pendingPrefetchChunks: `${progress.pendingPrefetchChunks ?? 0} 段`,
    dynamicPrefetchAhead: `${progress.dynamicPrefetchAhead ?? 0} 段`,
    cacheSummary: `${progress.cacheHits ?? 0} / ${progress.cacheMisses ?? 0}`,
    diskCacheUsage: `${formatBytes(progress.cacheBytes ?? 0)} / ${formatBytes(progress.cacheLimitBytes ?? 0)} · ${progress.cacheEntries ?? 0} 条`,
    cacheEvictedEntries: `${progress.cacheEvictedEntries ?? 0} 条`
  };
}

export function formatBytes(bytes: number) {
  if (bytes <= 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}
