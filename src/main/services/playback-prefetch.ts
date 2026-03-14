import type { PlaybackQueueItem } from '../../shared/types';

export const DEFAULT_PREFETCH_AHEAD = 2;
export const MAX_DYNAMIC_PREFETCH_AHEAD = 5;

export interface DynamicPrefetchMetrics {
  averageSynthesisMs?: number;
  averagePlaybackMs?: number;
  readyChunks?: number;
  pendingChunks?: number;
}

export function getPrefetchWindow(queue: PlaybackQueueItem[], currentOrder: number, size = DEFAULT_PREFETCH_AHEAD) {
  if (size <= 0) {
    return [];
  }

  return queue.filter((item) => item.order > currentOrder).slice(0, size);
}

export function getDynamicPrefetchAhead(metrics: DynamicPrefetchMetrics = {}) {
  const readyChunks = Math.max(0, metrics.readyChunks ?? 0);
  const pendingChunks = Math.max(0, metrics.pendingChunks ?? 0);
  const generationMs = metrics.averageSynthesisMs;
  const playbackMs = metrics.averagePlaybackMs;

  if (!generationMs || !playbackMs || generationMs <= 0 || playbackMs <= 0) {
    return clamp(DEFAULT_PREFETCH_AHEAD + Number(readyChunks === 0), 1, MAX_DYNAMIC_PREFETCH_AHEAD);
  }

  const ratio = generationMs / playbackMs;

  if (ratio >= 1.35) {
    return clamp(4 - readyChunks + pendingChunks, DEFAULT_PREFETCH_AHEAD, MAX_DYNAMIC_PREFETCH_AHEAD);
  }

  if (ratio >= 0.9) {
    return clamp(3 - readyChunks + Math.min(1, pendingChunks), DEFAULT_PREFETCH_AHEAD, MAX_DYNAMIC_PREFETCH_AHEAD);
  }

  return clamp(2 - readyChunks + Math.min(1, pendingChunks), 1, 3);
}

export function canPrefetchAudio(providerId: string) {
  return providerId === 'openai-tts'
    || providerId === 'glm-tts'
    || providerId === 'cosyvoice-local'
    || providerId === 'gpt-sovits-local';
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
