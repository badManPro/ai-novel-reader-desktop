import { contextBridge, ipcRenderer } from 'electron';
import type {
  DeleteBookResult,
  ImportBookResult,
  ModelProvider,
  NovelReaderApi,
  OfflineEngineActionResult,
  OfflineEngineConsoleSnapshot,
  OfflineEngineHealth,
  OfflineModelAssetManifest,
  OfflineModelTaskAction,
  OfflineModelTaskCreateResult,
  OfflineModelTaskSnapshot,
  OfflineServiceStatus,
  PlaybackStateEvent,
  ReaderPersistedState,
  TtsPlaybackState,
  TtsSpeakRequest,
  TtsSpeakResult,
  VoiceOption
} from '../shared/types';

const PLAYBACK_EVENT_CHANNEL = 'tts:playback-event';

const api: NovelReaderApi = {
  appName: 'AI Novel Reader',
  version: '0.8.0',
  capabilities: {
    formats: ['txt', 'epub', 'pdf', 'md'],
    providers: ['cosyvoice-local', 'gpt-sovits-local', 'system-say', 'openai-tts', 'glm-tts']
  },
  importTxtBook: () => ipcRenderer.invoke('books:import-txt') as Promise<ImportBookResult | null>,
  loadReaderState: () => ipcRenderer.invoke('reader-state:load') as Promise<ReaderPersistedState>,
  saveReaderState: (patch) => ipcRenderer.invoke('reader-state:save', patch) as Promise<ReaderPersistedState>,
  deleteBook: (bookId: string) => ipcRenderer.invoke('books:delete', bookId) as Promise<DeleteBookResult>,
  getTtsProviders: () => ipcRenderer.invoke('tts:list-providers') as Promise<ModelProvider[]>,
  getVoices: (providerId: string) => ipcRenderer.invoke('tts:list-voices', providerId) as Promise<VoiceOption[]>,
  getOfflineEngineHealth: () => ipcRenderer.invoke('tts:offline-health') as Promise<OfflineEngineHealth[]>,
  getOfflineServiceStatus: () => ipcRenderer.invoke('tts:offline-service-status') as Promise<OfflineServiceStatus[]>,
  getOfflineEngineConsole: () => ipcRenderer.invoke('tts:offline-console') as Promise<OfflineEngineConsoleSnapshot[]>,
  getOfflineModelAssetManifests: () => ipcRenderer.invoke('tts:offline-model-asset-manifests') as Promise<OfflineModelAssetManifest[]>,
  checkOfflineEngineEnv: (providerId) => ipcRenderer.invoke('tts:offline-check-env', providerId) as Promise<OfflineEngineActionResult>,
  startOfflineEngine: (providerId) => ipcRenderer.invoke('tts:offline-start', providerId) as Promise<OfflineEngineActionResult>,
  listOfflineModelTasks: () => ipcRenderer.invoke('tts:offline-model-tasks') as Promise<OfflineModelTaskSnapshot[]>,
  createOfflineModelTask: (providerId: 'cosyvoice-local' | 'gpt-sovits-local', action: OfflineModelTaskAction) => ipcRenderer.invoke('tts:offline-model-task-create', providerId, action) as Promise<OfflineModelTaskCreateResult>,
  retryOfflineModelTask: (taskId: string) => ipcRenderer.invoke('tts:offline-model-task-retry', taskId) as Promise<OfflineModelTaskCreateResult>,
  speak: (request: TtsSpeakRequest) => ipcRenderer.invoke('tts:speak', request) as Promise<TtsSpeakResult>,
  pauseTts: () => ipcRenderer.invoke('tts:pause') as Promise<TtsPlaybackState>,
  resumeTts: () => ipcRenderer.invoke('tts:resume') as Promise<TtsPlaybackState>,
  stopTts: () => ipcRenderer.invoke('tts:stop') as Promise<TtsPlaybackState>,
  getTtsStatus: () => ipcRenderer.invoke('tts:status') as Promise<TtsPlaybackState>,
  onPlaybackState: (listener: (event: PlaybackStateEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: PlaybackStateEvent) => listener(payload);
    ipcRenderer.on(PLAYBACK_EVENT_CHANNEL, handler);
    return () => ipcRenderer.removeListener(PLAYBACK_EVENT_CHANNEL, handler);
  }
};

contextBridge.exposeInMainWorld('novelReader', api);
