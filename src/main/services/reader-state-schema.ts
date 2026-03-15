import type { ReaderPersistedState } from '../../shared/types';
import { normalizeReaderSettings } from '../../shared/tts-strategy';

export const defaultReaderState: ReaderPersistedState = {
  bookshelf: [],
  recentBookId: null,
  progress: {},
  readingPositions: {},
  settings: normalizeReaderSettings({
    ttsMode: 'standard',
    standardProviderId: 'openai-tts',
    standardVoiceId: 'alloy',
    privacyProviderId: 'cosyvoice-local',
    privacyVoiceId: '中文女',
    characterProviderId: 'gpt-sovits-local',
    characterVoiceId: 'gpt-sovits-default',
    defaultProviderId: 'openai-tts',
    defaultVoiceId: 'alloy',
    defaultSpeed: 1,
    fontSize: 18,
    lineHeight: 1.9,
    theme: 'dark'
  }),
  playbackDraftQueue: []
};

export function createMigratedReaderState(raw?: Partial<ReaderPersistedState> | null): ReaderPersistedState {
  return mergeReaderState(raw ?? {}, defaultReaderState);
}

export function mergeReaderState(
  patch: Partial<ReaderPersistedState>,
  baseState: ReaderPersistedState = defaultReaderState
): ReaderPersistedState {
  const nextSettings = patch.settings
    ? normalizeReaderSettings({ ...baseState.settings, ...patch.settings })
    : normalizeReaderSettings(baseState.settings);

  return {
    ...baseState,
    ...patch,
    bookshelf: patch.bookshelf ?? baseState.bookshelf,
    progress: patch.progress ? { ...baseState.progress, ...patch.progress } : baseState.progress,
    readingPositions: patch.readingPositions ? { ...baseState.readingPositions, ...patch.readingPositions } : baseState.readingPositions,
    settings: nextSettings,
    playbackDraftQueue: patch.playbackDraftQueue ?? baseState.playbackDraftQueue
  };
}
