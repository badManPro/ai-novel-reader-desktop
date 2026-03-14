export type BookFormat = 'txt' | 'epub' | 'pdf' | 'md';
export type SupportedEncoding = 'utf-8' | 'utf-8-bom' | 'utf-16le' | 'utf-16be' | 'gb18030' | 'unknown';
export type TtsPlaybackStatus = 'idle' | 'loading' | 'reading' | 'paused' | 'error';
export type TtsPlaybackPhase =
  | 'idle'
  | 'preparing'
  | 'chunking'
  | 'queue-ready'
  | 'streaming-first-chunk'
  | 'prefetching-audio'
  | 'generating-audio'
  | 'playing'
  | 'paused'
  | 'completed'
  | 'error';
export type TtsProviderKind = 'system' | 'local' | 'remote';
export type ReaderTheme = 'dark' | 'sepia' | 'light';
export type OfflineEngineId = 'cosyvoice-local' | 'gpt-sovits-local';
export type OfflineEngineHealthStatus = 'healthy' | 'degraded' | 'unreachable' | 'disabled';
export type OfflineEngineTransport = 'json-audio-path' | 'binary-audio';
export type OfflineProtocolId = 'cosyvoice-v1' | 'gpt-sovits-v1';
export type OfflineServiceStartupMode = 'manual' | 'spawn';
export type OfflineServiceManagerStatus = 'idle' | 'starting' | 'running' | 'manual' | 'error';
export type OfflineModelTaskAction = 'prepare' | 'download' | 'install';
export type OfflineModelTaskStatus = 'queued' | 'running' | 'succeeded' | 'failed';
export type OfflineModelTaskStage = 'queued' | 'preparing' | 'downloading' | 'installing' | 'verifying' | 'completed' | 'failed';
export type OfflineModelAssetSourceType = 'git' | 'huggingface' | 'modelscope' | 'http' | 'local-file';
export type OfflineModelAssetCategory = 'repository' | 'entry' | 'weights' | 'config' | 'reference-audio';

export interface Chapter {
  id: string;
  title: string;
  content: string;
  order: number;
}

export interface Book {
  id: string;
  title: string;
  author?: string;
  format: BookFormat;
  path?: string;
  encoding?: SupportedEncoding;
  size?: number;
  chapters: Chapter[];
}

export interface ModelProvider {
  id: string;
  name: string;
  category: 'llm' | 'tts';
  kind?: TtsProviderKind;
  requiresApiKey?: boolean;
  configured?: boolean;
  description?: string;
  isPrimary?: boolean;
}

export interface VoiceOption {
  id: string;
  name: string;
  providerId: string;
  language?: string;
  gender?: 'male' | 'female' | 'neutral';
  description?: string;
}

export interface ImportBookResult {
  book: Book;
  warnings: string[];
}

export interface ReaderCapabilities {
  formats: string[];
  providers: string[];
}

export interface AppMetadata {
  appName: string;
  version: string;
  capabilities: ReaderCapabilities;
}

export interface ChapterPlaybackSource {
  chapterId: string;
  chapterTitle: string;
  text: string;
  order: number;
}

export interface TtsSpeakRequest {
  providerId: string;
  text: string;
  voiceId: string;
  speed?: number;
  chapterId?: string;
  chapterTitle?: string;
  bookId?: string;
  chapterSequence?: ChapterPlaybackSource[];
}

export interface TtsSpeakResult {
  status: TtsPlaybackStatus;
  providerId: string;
  voiceId: string;
  message: string;
}

export interface PlaybackQueueItem {
  id: string;
  bookId?: string;
  chapterId?: string;
  title: string;
  text: string;
  providerId: string;
  voiceId: string;
  speed: number;
  order: number;
  chunkIndex: number;
  chunkCount: number;
}

export interface PlaybackProgressSnapshot {
  queueItemId?: string;
  chapterId?: string;
  bookId?: string;
  charIndex: number;
  charLength: number;
  startedAt?: string;
  updatedAt?: string;
  totalChunks?: number;
  currentChunkIndex?: number;
  currentChapterChunkIndex?: number;
  currentChapterChunkCount?: number;
  totalChapters?: number;
  currentChapterIndex?: number;
  currentChunkChars?: number;
  isLongText?: boolean;
  longTextHint?: string;
  readyChunks?: number;
  prefetchedChunks?: number;
  pendingPrefetchChunks?: number;
  dynamicPrefetchAhead?: number;
  cacheHits?: number;
  cacheMisses?: number;
  cacheEntries?: number;
  cacheBytes?: number;
  cacheLimitBytes?: number;
  cacheEvictedEntries?: number;
  playbackMode?: 'serial' | 'prefetch';
}

export interface TtsPlaybackState {
  status: TtsPlaybackStatus;
  phase?: TtsPlaybackPhase;
  phaseLabel?: string;
  providerId?: string;
  voiceId?: string;
  speed?: number;
  queue: PlaybackQueueItem[];
  currentItem?: PlaybackQueueItem;
  progress?: PlaybackProgressSnapshot;
  message: string;
}

export interface PlaybackStateEvent {
  type: 'playback-state';
  state: TtsPlaybackState;
  emittedAt: string;
}

export interface ProviderSecretRecord {
  providerId: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  updatedAt: string;
  source: 'file' | 'environment' | 'system-keychain-placeholder';
}

export interface SecureConfigSnapshot {
  providers: ProviderSecretRecord[];
  storageMode: 'file-fallback';
  keychainReady: boolean;
  configPath: string;
}

export interface OfflineEngineStartupConfig {
  mode: OfflineServiceStartupMode;
  command?: string;
  args?: string[];
  cwd?: string;
  envFile?: string;
  readyTimeoutMs?: number;
  notes?: string;
}

export interface OfflineEngineConfig {
  id: OfflineEngineId;
  providerId: OfflineEngineId;
  name: string;
  protocol: OfflineProtocolId;
  baseUrl: string;
  healthPath: string;
  synthesizePath: string;
  voicesPath?: string;
  timeoutMs: number;
  enabled: boolean;
  transport: OfflineEngineTransport;
  audioFormat: 'wav' | 'mp3';
  isPrimary: boolean;
  description: string;
  startup: OfflineEngineStartupConfig;
}

export interface OfflineEngineHealth {
  engineId: OfflineEngineId;
  providerId: OfflineEngineId;
  status: OfflineEngineHealthStatus;
  checkedAt: string;
  endpoint: string;
  message: string;
  latencyMs?: number;
}

export interface OfflineSynthesisResult {
  providerId: OfflineEngineId;
  audioPath: string;
  contentType: string;
}

export interface OfflineServiceStatus {
  providerId: OfflineEngineId;
  status: OfflineServiceManagerStatus;
  pid?: number;
  endpoint: string;
  startupMode: OfflineServiceStartupMode;
  message: string;
  command?: string;
  args?: string[];
  cwd?: string;
  envFile?: string;
  updatedAt: string;
}

export interface OfflineEngineEnvCheckResult {
  providerId: OfflineEngineId;
  ok: boolean;
  summary: string;
  checkedAt: string;
  details: string[];
}

export interface OfflineEngineActionResult {
  providerId: OfflineEngineId;
  ok: boolean;
  action: 'check-env' | 'start';
  summary: string;
  detail?: string;
  checkedAt: string;
}

export interface OfflineEngineConsoleSnapshot {
  providerId: OfflineEngineId;
  name: string;
  description: string;
  isPrimary: boolean;
  baseUrl: string;
  healthPath: string;
  synthesizePath: string;
  voicesPath?: string;
  startupMode: OfflineServiceStartupMode;
  startupCommand?: string;
  startupArgs: string[];
  cwd?: string;
  envFile?: string;
  config: OfflineEngineConfig;
  health: OfflineEngineHealth;
  serviceStatus?: OfflineServiceStatus;
  envCheck?: OfflineEngineEnvCheckResult;
}

export type OfflineModelAssetVerificationStatus = 'pending' | 'missing' | 'exists-unverified' | 'checksum-passed' | 'checksum-failed' | 'not-applicable';

export interface OfflineModelAssetSource {
  type: OfflineModelAssetSourceType;
  url: string;
  note?: string;
  checksumSha256?: string;
}

export interface OfflineModelAssetFileCheck {
  id: string;
  label: string;
  path: string;
  required: boolean;
  checksumSha256?: string;
  downloadUrl?: string;
  downloadUrlEnvKey?: string;
  expectedSizeBytes?: number;
  note?: string;
}

export interface OfflineModelAssetItem {
  id: string;
  name: string;
  purpose: string;
  category: OfflineModelAssetCategory;
  required: boolean;
  targetPath: string;
  envKey?: string;
  installHint?: string;
  sources: OfflineModelAssetSource[];
  fileChecks?: OfflineModelAssetFileCheck[];
}

export interface OfflineModelAssetVerificationItem {
  assetId: string;
  assetName: string;
  required: boolean;
  targetPath: string;
  verifiableFileCount: number;
  checksumProvidedCount: number;
  missingFileCount: number;
  verifiedFileCount: number;
  checksumFailedCount: number;
  status: OfflineModelAssetVerificationStatus;
  detailLines: string[];
}

export interface OfflineModelAssetManifest {
  manifestId: string;
  providerId: OfflineEngineId;
  engineName: string;
  version: string;
  summary: string;
  assets: OfflineModelAssetItem[];
}

export interface OfflineModelTaskTemplate {
  templateId: string;
  providerId: OfflineEngineId;
  action: OfflineModelTaskAction;
  title: string;
  summary: string;
  stageLabels: Partial<Record<OfflineModelTaskStage, string>>;
}

export interface OfflineModelTaskRecord {
  taskId: string;
  providerId: OfflineEngineId;
  engineName: string;
  action: OfflineModelTaskAction;
  templateId?: string;
  manifestId?: string;
  title: string;
  summary: string;
  status: OfflineModelTaskStatus;
  stage: OfflineModelTaskStage;
  stageLabel: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
  pid?: number;
  logLines: string[];
  errorMessage?: string;
  commandPreview?: string;
  resourceCount?: number;
  requiredResourceCount?: number;
  resourceSummary?: string[];
  verifiableAssetCount?: number;
  checksumReadyAssetCount?: number;
  missingAssetCount?: number;
  verifiedAssetCount?: number;
  assetVerificationSummary?: string[];
  assetDetails?: OfflineModelAssetVerificationItem[];
  retryCount?: number;
  retryOfTaskId?: string;
}

export interface OfflineModelTaskSnapshot extends Omit<OfflineModelTaskRecord, 'logLines'> {
  logTail: string[];
}

export interface OfflineModelTaskCreateResult {
  ok: boolean;
  message: string;
  task?: OfflineModelTaskSnapshot;
}

export interface ReaderSettings {
  defaultProviderId: string;
  defaultVoiceId: string;
  defaultSpeed: number;
  fontSize: number;
  lineHeight: number;
  theme: ReaderTheme;
}

export type ReadingProgressMap = Record<string, string>;
export type ReadingPositionMap = Record<string, number>;

export interface ReaderPersistedState {
  bookshelf: Book[];
  recentBookId: string | null;
  progress: ReadingProgressMap;
  readingPositions: ReadingPositionMap;
  settings: ReaderSettings;
  playbackDraftQueue: PlaybackQueueItem[];
}

export interface DeleteBookResult {
  state: ReaderPersistedState;
  removedBookId: string;
  removedBookshelfRecord: boolean;
  removedProgress: boolean;
  removedReadingPositions: number;
  removedDraftQueueItems: number;
  removedCacheEntries: number;
  removedCacheBytes: number;
}

export interface NovelReaderApi extends AppMetadata {
  importTxtBook: () => Promise<ImportBookResult | null>;
  loadReaderState: () => Promise<ReaderPersistedState>;
  saveReaderState: (patch: Partial<ReaderPersistedState>) => Promise<ReaderPersistedState>;
  deleteBook: (bookId: string) => Promise<DeleteBookResult>;
  getTtsProviders: () => Promise<ModelProvider[]>;
  getVoices: (providerId: string) => Promise<VoiceOption[]>;
  getOfflineEngineHealth: () => Promise<OfflineEngineHealth[]>;
  getOfflineServiceStatus: () => Promise<OfflineServiceStatus[]>;
  getOfflineEngineConsole: () => Promise<OfflineEngineConsoleSnapshot[]>;
  getOfflineModelAssetManifests: () => Promise<OfflineModelAssetManifest[]>;
  checkOfflineEngineEnv: (providerId: OfflineEngineId) => Promise<OfflineEngineActionResult>;
  startOfflineEngine: (providerId: OfflineEngineId) => Promise<OfflineEngineActionResult>;
  listOfflineModelTasks: () => Promise<OfflineModelTaskSnapshot[]>;
  createOfflineModelTask: (providerId: OfflineEngineId, action: OfflineModelTaskAction) => Promise<OfflineModelTaskCreateResult>;
  retryOfflineModelTask: (taskId: string) => Promise<OfflineModelTaskCreateResult>;
  speak: (request: TtsSpeakRequest) => Promise<TtsSpeakResult>;
  pauseTts: () => Promise<TtsPlaybackState>;
  resumeTts: () => Promise<TtsPlaybackState>;
  stopTts: () => Promise<TtsPlaybackState>;
  getTtsStatus: () => Promise<TtsPlaybackState>;
  onPlaybackState: (listener: (event: PlaybackStateEvent) => void) => () => void;
}
