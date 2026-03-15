import { useEffect, useMemo, useState } from 'react';
import type {
  ModelProvider,
  NovelReaderApi,
  OfflineEngineActionResult,
  OfflineEngineConsoleSnapshot,
  OfflineEngineHealth,
  OfflineManualImportResult,
  OfflineModelAssetManifest,
  OfflineModelTaskAction,
  OfflineModelTaskSnapshot,
  OfflineServiceStatus,
  ReaderPersistedState,
  ReaderSettings,
  ReaderTheme,
  TtsMode,
  TtsPlaybackState,
  VoiceOption
} from '../../shared/types';
import { buildTtsSpeakRequest, normalizeReaderSettings, resolveTtsStrategySettings } from '../../shared/tts-strategy';
import { subscribePlaybackState } from '../lib/playback-events';
import { formatBytes, getPlaybackMetrics } from '../lib/playback-metrics';

declare global {
  interface Window {
    novelReader?: NovelReaderApi;
  }
}

const fallbackState: ReaderPersistedState = {
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

export const speedOptions = [0.8, 1, 1.2, 1.5];
export const fontSizeOptions = [16, 18, 20, 22, 24];
export const lineHeightOptions = [1.7, 1.9, 2.1, 2.3];
export const themeOptions: ReaderTheme[] = ['dark', 'sepia', 'light'];

function getProvidersForMode(mode: TtsMode, providers: ModelProvider[]) {
  if (mode === 'standard') {
    return providers.filter((provider) => provider.kind === 'remote');
  }

  if (mode === 'privacy') {
    return providers.filter((provider) => provider.kind === 'local' || provider.kind === 'system');
  }

  return providers.filter((provider) => provider.kind === 'local');
}

function buildSettingsFromDrafts(
  baseSettings: ReaderSettings,
  mode: TtsMode,
  drafts: Record<TtsMode, { providerId: string; voiceId: string }>,
  speed: number
) {
  return normalizeReaderSettings({
    ...baseSettings,
    ttsMode: mode,
    defaultSpeed: speed,
    standardProviderId: drafts.standard.providerId,
    standardVoiceId: drafts.standard.voiceId,
    privacyProviderId: drafts.privacy.providerId,
    privacyVoiceId: drafts.privacy.voiceId,
    characterProviderId: drafts.character.providerId,
    characterVoiceId: drafts.character.voiceId
  });
}

export function useSettingsState() {
  const api = window.novelReader;
  const [persistedState, setPersistedState] = useState<ReaderPersistedState>(fallbackState);
  const [providers, setProviders] = useState<ModelProvider[]>([]);
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [selectedMode, setSelectedMode] = useState<TtsMode>(fallbackState.settings.ttsMode ?? 'standard');
  const [draftProfiles, setDraftProfiles] = useState<Record<TtsMode, { providerId: string; voiceId: string }>>({
    standard: {
      providerId: fallbackState.settings.standardProviderId ?? 'openai-tts',
      voiceId: fallbackState.settings.standardVoiceId ?? 'alloy'
    },
    privacy: {
      providerId: fallbackState.settings.privacyProviderId ?? 'cosyvoice-local',
      voiceId: fallbackState.settings.privacyVoiceId ?? '中文女'
    },
    character: {
      providerId: fallbackState.settings.characterProviderId ?? 'gpt-sovits-local',
      voiceId: fallbackState.settings.characterVoiceId ?? 'gpt-sovits-default'
    }
  });
  const [selectedSpeed, setSelectedSpeed] = useState<number>(fallbackState.settings.defaultSpeed);
  const [offlineHealth, setOfflineHealth] = useState<OfflineEngineHealth[]>([]);
  const [offlineServiceStatus, setOfflineServiceStatus] = useState<OfflineServiceStatus[]>([]);
  const [offlineConsole, setOfflineConsole] = useState<OfflineEngineConsoleSnapshot[]>([]);
  const [offlineModelManifests, setOfflineModelManifests] = useState<OfflineModelAssetManifest[]>([]);
  const [offlineTasks, setOfflineTasks] = useState<OfflineModelTaskSnapshot[]>([]);
  const [offlineActionState, setOfflineActionState] = useState<Partial<Record<string, 'checking' | 'starting' | 'prepare' | 'download' | 'install'>>>({});
  const [offlineActionResults, setOfflineActionResults] = useState<Partial<Record<string, OfflineEngineActionResult>>>({});
  const [offlineManualImportResults, setOfflineManualImportResults] = useState<Partial<Record<string, OfflineManualImportResult>>>({});
  const [ttsState, setTtsState] = useState<TtsPlaybackState>({ status: 'idle', queue: [], message: '' });
  const [notices, setNotices] = useState<string[]>([]);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const settings = persistedState.settings;
  const resolvedStrategy = useMemo(() => resolveTtsStrategySettings(settings), [settings]);
  const playbackMetrics = getPlaybackMetrics(ttsState);
  const recentBook = useMemo(
    () => persistedState.bookshelf.find((item) => item.id === persistedState.recentBookId) ?? persistedState.bookshelf[0] ?? null,
    [persistedState.bookshelf, persistedState.recentBookId]
  );
  const selectedProfile = draftProfiles[selectedMode];
  const selectedProviderId = selectedProfile?.providerId ?? resolvedStrategy.active.providerId;
  const selectedVoiceId = selectedProfile?.voiceId ?? resolvedStrategy.active.voiceId;
  const draftStrategy = useMemo(
    () => resolveTtsStrategySettings(buildSettingsFromDrafts(settings, selectedMode, draftProfiles, selectedSpeed)),
    [draftProfiles, selectedMode, selectedSpeed, settings]
  );
  const modeProviders = useMemo(() => getProvidersForMode(selectedMode, providers), [providers, selectedMode]);
  const currentProvider = providers.find((provider) => provider.id === selectedProviderId);

  useEffect(() => {
    if (!api) {
      setNotices(['当前运行环境未注入 novelReader API。']);
      return;
    }

    void api.loadReaderState().then((state) => {
      setPersistedState(state);
      setSelectedSpeed(state.settings.defaultSpeed);
    });
    void api.getTtsProviders().then((providerList) => setProviders(providerList));
    void refreshOfflineStatus();
    void api.getTtsStatus().then((state) => setTtsState(state));

    return subscribePlaybackState(api, (event) => setTtsState(event.state));
  }, [api]);

  useEffect(() => {
    const strategy = resolveTtsStrategySettings(settings);
    setSelectedMode(strategy.mode);
    setDraftProfiles({
      standard: strategy.standard,
      privacy: strategy.privacy,
      character: strategy.character
    });
  }, [
    settings.ttsMode,
    settings.standardProviderId,
    settings.standardVoiceId,
    settings.privacyProviderId,
    settings.privacyVoiceId,
    settings.characterProviderId,
    settings.characterVoiceId,
    settings.defaultProviderId,
    settings.defaultVoiceId
  ]);

  useEffect(() => {
    if (!modeProviders.length) {
      return;
    }

    if (modeProviders.some((provider) => provider.id === selectedProviderId)) {
      return;
    }

    const nextProviderId = modeProviders[0]?.id;
    if (!nextProviderId) {
      return;
    }

    setDraftProfiles((current) => ({
      ...current,
      [selectedMode]: {
        ...current[selectedMode],
        providerId: nextProviderId
      }
    }));
  }, [modeProviders, selectedMode, selectedProviderId]);

  useEffect(() => {
    if (!api || !selectedProviderId) {
      return;
    }

    void api.getVoices(selectedProviderId).then((voiceList) => {
      setVoices(voiceList);
      const fallbackVoiceId = voiceList[0]?.id ?? '';
      setDraftProfiles((current) => {
        const nextProfile = current[selectedMode];
        if (!nextProfile || nextProfile.providerId !== selectedProviderId) {
          return current;
        }

        const nextVoiceId = voiceList.some((voice) => voice.id === nextProfile.voiceId)
          ? nextProfile.voiceId
          : fallbackVoiceId;
        if (nextVoiceId === nextProfile.voiceId) {
          return current;
        }

        return {
          ...current,
          [selectedMode]: {
            ...nextProfile,
            voiceId: nextVoiceId
          }
        };
      });
    });
  }, [api, selectedMode, selectedProviderId]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
    root.style.setProperty('--reader-font-size', `${settings.fontSize}px`);
    root.style.setProperty('--reader-line-height', String(settings.lineHeight));
  }, [settings.fontSize, settings.lineHeight, settings.theme]);

  async function persistPatch(patch: Partial<ReaderPersistedState>) {
    if (!api) {
      return null;
    }

    const nextState = await api.saveReaderState(patch);
    setPersistedState(nextState);
    return nextState;
  }

  async function persistSettingsPatch(settingsPatch: Partial<ReaderPersistedState['settings']>) {
    return persistPatch({
      settings: normalizeReaderSettings({
        ...persistedState.settings,
        ...settingsPatch
      })
    });
  }

  function selectMode(mode: TtsMode) {
    setSelectedMode(mode);
  }

  function selectProvider(providerId: string) {
    setDraftProfiles((current) => ({
      ...current,
      [selectedMode]: {
        ...current[selectedMode],
        providerId
      }
    }));
  }

  function selectVoice(voiceId: string) {
    setDraftProfiles((current) => ({
      ...current,
      [selectedMode]: {
        ...current[selectedMode],
        voiceId
      }
    }));
  }

  async function saveTtsDefaults() {
    const nextSettings = buildSettingsFromDrafts(persistedState.settings, selectedMode, draftProfiles, selectedSpeed);
    await persistPatch({
      settings: nextSettings
    });
    setActionMessage('默认朗读策略已保存。');
  }

  async function previewTts() {
    if (!api || !selectedVoiceId) {
      return;
    }

    try {
      const draftSettings = buildSettingsFromDrafts(persistedState.settings, selectedMode, draftProfiles, selectedSpeed);
      const result = await api.speak(buildTtsSpeakRequest({
        text: '这是一段用于设置页试听的示例文本，用来确认当前音色和语速是否符合预期。'
      }, draftSettings));
      setTtsState((current) => ({
        ...current,
        status: result.status,
        mode: draftSettings.ttsMode,
        providerId: result.providerId,
        voiceId: result.voiceId,
        effectiveProviderId: result.effectiveProviderId ?? result.providerId,
        effectiveVoiceId: result.effectiveVoiceId ?? result.voiceId,
        fallbackUsed: result.fallbackUsed,
        message: result.message
      }));
      setActionMessage('已触发当前配置试听，可通过底部 Player Dock 查看播放状态。');
    } catch (error) {
      setNotices([error instanceof Error ? error.message : '试听失败，请重试。']);
    }
  }

  async function refreshOfflineStatus() {
    if (!api) {
      return;
    }

    const [healthList, statusList, consoleList, manifestList, taskList] = await Promise.all([
      api.getOfflineEngineHealth(),
      api.getOfflineServiceStatus(),
      api.getOfflineEngineConsole(),
      api.getOfflineModelAssetManifests(),
      api.listOfflineModelTasks()
    ]);
    setOfflineHealth(healthList);
    setOfflineServiceStatus(statusList);
    setOfflineConsole(consoleList);
    setOfflineModelManifests(manifestList);
    setOfflineTasks(taskList);
  }

  async function runOfflineAction(providerId: 'cosyvoice-local' | 'gpt-sovits-local', action: 'checking' | 'starting') {
    if (!api) {
      return;
    }

    setOfflineActionState((current) => ({ ...current, [providerId]: action }));
    try {
      const result = action === 'checking'
        ? await api.checkOfflineEngineEnv(providerId)
        : await api.startOfflineEngine(providerId);
      setOfflineActionResults((current) => ({ ...current, [providerId]: result }));
      await refreshOfflineStatus();
    } finally {
      setOfflineActionState((current) => ({ ...current, [providerId]: undefined }));
    }
  }

  async function createOfflineTask(providerId: 'cosyvoice-local' | 'gpt-sovits-local', action: OfflineModelTaskAction) {
    if (!api) {
      return;
    }

    setOfflineActionState((current) => ({ ...current, [providerId]: action }));
    try {
      const result = await api.createOfflineModelTask(providerId, action);
      setOfflineActionResults((current) => ({
        ...current,
        [providerId]: {
          providerId,
          ok: result.ok,
          action: 'check-env',
          summary: result.message,
          detail: result.task ? `任务ID：${result.task.taskId}\n阶段：${result.task.stageLabel}\n状态：${result.task.status}` : undefined,
          checkedAt: new Date().toISOString()
        }
      }));
      await refreshOfflineStatus();
      window.setTimeout(() => {
        void refreshOfflineStatus();
      }, 1200);
    } finally {
      setOfflineActionState((current) => ({ ...current, [providerId]: undefined }));
    }
  }

  async function retryOfflineTask(taskId: string, providerId: 'cosyvoice-local' | 'gpt-sovits-local') {
    if (!api) {
      return;
    }

    setOfflineActionState((current) => ({ ...current, [providerId]: 'install' }));
    try {
      const result = await api.retryOfflineModelTask(taskId);
      setOfflineActionResults((current) => ({
        ...current,
        [providerId]: {
          providerId,
          ok: result.ok,
          action: 'check-env',
          summary: result.message,
          detail: result.task ? `任务ID：${result.task.taskId}\n重试来源：${taskId}\n阶段：${result.task.stageLabel}\n状态：${result.task.status}` : `原任务：${taskId}`,
          checkedAt: new Date().toISOString()
        }
      }));
      await refreshOfflineStatus();
      window.setTimeout(() => {
        void refreshOfflineStatus();
      }, 1200);
    } finally {
      setOfflineActionState((current) => ({ ...current, [providerId]: undefined }));
    }
  }

  async function chooseOfflineManualImport(providerId: 'cosyvoice-local' | 'gpt-sovits-local', target: 'repo-dir' | 'weights-dir') {
    if (!api) {
      return;
    }

    const result = await api.chooseOfflineManualImport(providerId, target);
    setOfflineManualImportResults((current) => ({ ...current, [providerId]: result }));
    await refreshOfflineStatus();
  }

  async function clearBookCache(bookId: string) {
    if (!api) {
      return;
    }

    const result = await api.clearBookCache(bookId);
    setActionMessage(result.removedEntries > 0
      ? `已清理 ${result.removedEntries} 条缓存（${formatBytes(result.removedAudioBytes)}）。`
      : '当前书籍没有可清理的缓存。');
    return result;
  }

  return {
    api,
    providers,
    modeProviders,
    voices,
    selectedMode,
    selectedProviderId,
    selectedVoiceId,
    selectedSpeed,
    setSelectedMode: selectMode,
    setSelectedProviderId: selectProvider,
    setSelectedVoiceId: selectVoice,
    setSelectedSpeed,
    settings,
    resolvedStrategy,
    draftStrategy,
    draftProfiles,
    persistedState,
    recentBook,
    currentProvider,
    notices,
    setNotices,
    actionMessage,
    setActionMessage,
    saveTtsDefaults,
    previewTts,
    persistSettingsPatch,
    speedOptions,
    fontSizeOptions,
    lineHeightOptions,
    themeOptions,
    offlineHealth,
    offlineServiceStatus,
    offlineConsole,
    offlineModelManifests,
    offlineTasks,
    offlineActionState,
    offlineActionResults,
    offlineManualImportResults,
    refreshOfflineStatus,
    runOfflineAction,
    createOfflineTask,
    retryOfflineTask,
    chooseOfflineManualImport,
    ttsState,
    playbackMetrics,
    clearBookCache
  };
}
