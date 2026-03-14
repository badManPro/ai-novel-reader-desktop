import type { ReaderPersistedState } from '../../shared/types';

export const defaultReaderState: ReaderPersistedState = {
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

export function createMigratedReaderState(raw?: Partial<ReaderPersistedState> | null): ReaderPersistedState {
  return mergeReaderState(raw ?? {}, defaultReaderState);
}

export function mergeReaderState(
  patch: Partial<ReaderPersistedState>,
  baseState: ReaderPersistedState = defaultReaderState
): ReaderPersistedState {
  return {
    ...baseState,
    ...patch,
    bookshelf: patch.bookshelf ?? baseState.bookshelf,
    progress: patch.progress ? { ...baseState.progress, ...patch.progress } : baseState.progress,
    readingPositions: patch.readingPositions ? { ...baseState.readingPositions, ...patch.readingPositions } : baseState.readingPositions,
    settings: patch.settings ? { ...baseState.settings, ...patch.settings } : baseState.settings,
    playbackDraftQueue: patch.playbackDraftQueue ?? baseState.playbackDraftQueue
  };
}
