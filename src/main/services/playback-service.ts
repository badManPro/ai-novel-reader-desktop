import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import type { PlaybackQueueItem, PlaybackProgressSnapshot, TtsPlaybackState, TtsSpeakRequest, TtsSpeakResult } from '../../shared/types';
import { synthesizeWithGlm } from '../adapters/glm-tts-adapter';
import { synthesizeWithOpenAi } from '../adapters/openai-tts-adapter';
import { buildSystemSayArgs, isMac } from '../adapters/system-tts-adapter';
import { buildPlaybackQueueFromSources, normalizeChapterSequence } from './chapter-playback-queue';
import { canPrefetchAudio, DEFAULT_PREFETCH_AHEAD, getDynamicPrefetchAhead, getPrefetchWindow } from './playback-prefetch';
import { PlaybackDiskCache } from './playback-disk-cache';
import { OfflineTtsService, OfflineTtsServiceError } from './offline-tts-service';
import { PlaybackEventBus } from './playback-event-bus';

const LONG_TEXT_THRESHOLD = 6000;
const LOCAL_MAX_CHUNK_LENGTH = 140;
const LOCAL_FIRST_CHUNK_MAX_LENGTH = 80;

export class PlaybackService {
  private playbackProcess: ChildProcessWithoutNullStreams | null = null;
  private playbackState: TtsPlaybackState = {
    status: 'idle',
    phase: 'idle',
    phaseLabel: '空闲',
    queue: [],
    speed: 1,
    message: '尚未开始朗读。'
  };

  private queueVersion = 0;
  private sourceQueue: PlaybackQueueItem[] = [];
  private readonly offlineTtsService = new OfflineTtsService();
  private readonly diskCache = new PlaybackDiskCache();
  private readonly audioCache = new Map<string, string>();
  private readonly pendingAudio = new Map<string, Promise<string>>();
  private readonly localSynthesisLocks = new Map<string, Promise<void>>();
  private expandingQueueVersion: number | null = null;
  private synthesisDurations: number[] = [];
  private playbackDurations: number[] = [];
  private cacheHits = 0;
  private cacheMisses = 0;
  private cacheEntries = 0;
  private cacheBytes = 0;
  private cacheLimitBytes = 0;
  private cacheEvictedEntries = 0;

  constructor(private readonly eventBus = new PlaybackEventBus()) {}

  getState() {
    return this.toPublicState(this.playbackState);
  }

  async speak(request: TtsSpeakRequest): Promise<TtsSpeakResult> {
    const speed = request.speed ?? 1;
    const baseRequest = { ...request, speed };
    const chapters = normalizeChapterSequence(baseRequest);

    await this.stop(true);
    this.resetSessionTelemetry();
    if (!chapters.length) {
      throw new Error('朗读文本为空，无法开始播放。');
    }

    this.setState({
      status: 'loading',
      phase: 'preparing',
      phaseLabel: '准备朗读',
      mode: request.mode,
      providerId: request.providerId,
      voiceId: request.voiceId,
      effectiveProviderId: request.providerId,
      effectiveVoiceId: request.voiceId,
      fallbackUsed: false,
      fallbackReason: undefined,
      speed,
      queue: [],
      currentItem: undefined,
      progress: {
        chapterId: request.chapterId,
        bookId: request.bookId,
        charIndex: 0,
        charLength: request.text.length,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        totalChunks: 0,
        currentChunkIndex: 0,
        totalChapters: request.chapterSequence?.length ?? 1,
        currentChapterIndex: 1,
        currentChunkChars: request.text.length,
        isLongText: request.text.length >= LONG_TEXT_THRESHOLD,
        longTextHint: this.getLongTextHint(request.text.length),
        readyChunks: 0,
        prefetchedChunks: 0,
        pendingPrefetchChunks: 0,
        dynamicPrefetchAhead: DEFAULT_PREFETCH_AHEAD,
        cacheHits: 0,
        cacheMisses: 0,
        cacheEntries: this.cacheEntries,
        cacheBytes: this.cacheBytes,
        cacheLimitBytes: this.cacheLimitBytes,
        cacheEvictedEntries: this.cacheEvictedEntries,
        playbackMode: canPrefetchAudio(request.providerId) ? 'prefetch' : 'serial'
      },
      message: request.text.length >= LONG_TEXT_THRESHOLD
        ? `正文较长（约 ${request.text.length} 字），正在准备朗读队列，请稍候。`
        : '正在准备朗读任务…'
    });

    const queue = buildPlaybackQueueFromSources(
      chapters.slice(0, 1),
      baseRequest,
      {
        maxChunkLength: this.getQueueMaxChunkLength(request.providerId, request.fallbackProviderId),
        firstChunkMaxLength: canPrefetchAudio(request.providerId) ? LOCAL_FIRST_CHUNK_MAX_LENGTH : undefined
      }
    );
    const currentItem = queue[0];
    if (!currentItem) {
      throw new Error('朗读文本为空，无法开始播放。');
    }

    this.sourceQueue = queue;
    this.audioCache.clear();
    this.pendingAudio.clear();
    this.queueVersion += 1;
    const version = this.queueVersion;
    void this.refreshCacheStats().then(() => {
      if (version === this.queueVersion) {
        this.publishPrefetchState();
      }
    });
    const chapterCount = new Set(queue.map((item) => item.chapterId ?? item.id)).size;
    const totalChars = this.totalChars();
    const playbackMode = canPrefetchAudio(request.providerId) ? 'prefetch' : 'serial';

    this.setState({
      status: 'loading',
      phase: 'chunking',
      phaseLabel: '文本切片完成',
      currentItem,
      queue,
      progress: {
        queueItemId: currentItem.id,
        chapterId: currentItem.chapterId,
        bookId: request.bookId,
        charIndex: 0,
        charLength: totalChars,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        totalChunks: queue.length,
        currentChunkIndex: 1,
        currentChapterChunkIndex: currentItem.chunkIndex + 1,
        currentChapterChunkCount: currentItem.chunkCount,
        totalChapters: chapterCount,
        currentChapterIndex: this.chapterIndexOf(currentItem),
        currentChunkChars: currentItem.text.length,
        isLongText: totalChars >= LONG_TEXT_THRESHOLD,
        longTextHint: this.getLongTextHint(totalChars),
        readyChunks: 0,
        prefetchedChunks: 0,
        pendingPrefetchChunks: 0,
        dynamicPrefetchAhead: DEFAULT_PREFETCH_AHEAD,
        cacheHits: this.cacheHits,
        cacheMisses: this.cacheMisses,
        cacheEntries: this.cacheEntries,
        cacheBytes: this.cacheBytes,
        cacheLimitBytes: this.cacheLimitBytes,
        cacheEvictedEntries: this.cacheEvictedEntries,
        playbackMode
      },
      message: totalChars >= LONG_TEXT_THRESHOLD
        ? `已优先准备当前章节 ${queue.length} 段，将先播首段，剩余章节后台继续补充队列。`
        : `已完成当前章节切片，共 ${chapterCount} 章 / ${queue.length} 段，正在生成首段音频。`
    });

    if (playbackMode === 'prefetch') {
      this.setState({
        phase: 'streaming-first-chunk',
        phaseLabel: '首段预热',
        message: `已进入长文本首段优先模式：先生成第 1 段，再按动态窗口后台预取后续 ${DEFAULT_PREFETCH_AHEAD} 段。`
      });
      void this.getOrCreateAudio(currentItem, this.queueVersion).catch(() => undefined);
    }

    if (chapters.length > 1) {
      this.expandingQueueVersion = version;
      void this.appendRemainingChapters(chapters.slice(1), baseRequest, version);
    } else {
      this.expandingQueueVersion = null;
    }

    void this.playQueue(this.queueVersion);
    return {
      status: this.playbackState.status,
      providerId: request.providerId,
      voiceId: request.voiceId,
      effectiveProviderId: this.playbackState.effectiveProviderId ?? this.playbackState.providerId ?? request.providerId,
      effectiveVoiceId: this.playbackState.effectiveVoiceId ?? this.playbackState.voiceId ?? request.voiceId,
      fallbackUsed: this.playbackState.fallbackUsed,
      message: this.playbackState.message
    };
  }

  async pause() {
    if (!this.playbackProcess) {
      return this.setState({ status: 'idle', phase: 'idle', phaseLabel: '空闲', message: '当前没有可暂停的播放。' });
    }

    this.playbackProcess.kill('SIGSTOP');
    return this.setState({ status: 'paused', phase: 'paused', phaseLabel: '已暂停', message: '朗读已暂停，可继续恢复当前段落播放。' });
  }

  async resume() {
    if (!this.playbackProcess) {
      if (this.playbackState.queue.length > 0) {
        void this.playQueue(this.queueVersion);
        return this.setState({ status: 'loading', phase: 'preparing', phaseLabel: '恢复队列', message: '正在恢复自动续播队列…' });
      }
      return this.setState({ status: 'idle', phase: 'idle', phaseLabel: '空闲', message: '当前没有可恢复的播放。' });
    }

    this.playbackProcess.kill('SIGCONT');
    return this.setState({ status: 'reading', phase: 'playing', phaseLabel: '继续播放', message: '朗读已恢复。' });
  }

  async stop(silent = false) {
    this.queueVersion += 1;
    this.expandingQueueVersion = null;
    const currentProcess = this.playbackProcess;
    this.playbackProcess = null;

    if (currentProcess) {
      currentProcess.kill('SIGTERM');
    }

    this.sourceQueue = [];
    this.audioCache.clear();
    this.pendingAudio.clear();
    return this.setState({
      status: 'idle',
      phase: 'idle',
      phaseLabel: '空闲',
      mode: undefined,
      queue: [],
      currentItem: undefined,
      providerId: undefined,
      voiceId: undefined,
      effectiveProviderId: undefined,
      effectiveVoiceId: undefined,
      fallbackUsed: false,
      fallbackReason: undefined,
      progress: undefined,
      message: silent ? '已清空当前自动续播队列。' : '朗读已停止。'
    });
  }

  private async playQueue(version: number) {
    while (version === this.queueVersion) {
      if (this.playbackState.queue.length === 0) {
        if (this.expandingQueueVersion === version) {
          await new Promise((resolve) => setTimeout(resolve, 120));
          continue;
        }
        break;
      }

      const [currentItem, ...restQueue] = this.playbackState.queue;
      if (!currentItem) {
        break;
      }

      this.setState({
        status: 'loading',
        phase: 'queue-ready',
        phaseLabel: '准备当前片段',
        currentItem,
        queue: [currentItem, ...restQueue],
        progress: this.buildProgress(currentItem, this.completedChars(currentItem.order)),
        message: `正在准备第 ${currentItem.order + 1}/${this.sourceQueue.length} 段（章内 ${currentItem.chunkIndex + 1}/${currentItem.chunkCount}）：${currentItem.title}`
      });

      if (canPrefetchAudio(currentItem.providerId)) {
        this.schedulePrefetch(version, currentItem.order - 1);
      }

      try {
        await this.playSingleItem(currentItem, version);
      } catch (error) {
        if (version !== this.queueVersion) {
          return;
        }
        this.playbackProcess = null;
        this.setState({
          status: 'error',
          phase: 'error',
          phaseLabel: '播放失败',
          message: this.getPlaybackErrorMessage(error)
        });
        return;
      }

      if (version !== this.queueVersion) {
        return;
      }

      const latestQueue = this.playbackState.queue;
      const currentIndex = latestQueue.findIndex((entry) => entry.id === currentItem.id);
      const normalizedRestQueue = currentIndex >= 0
        ? latestQueue.slice(currentIndex + 1)
        : latestQueue.filter((entry) => entry.order > currentItem.order);
      const finishedChars = this.completedChars(currentItem.order + 1);
      const nextItem = normalizedRestQueue[0];
      const chapterChanged = nextItem && nextItem.chapterId !== currentItem.chapterId;
      this.setState({
        status: normalizedRestQueue.length ? 'loading' : 'idle',
        phase: normalizedRestQueue.length ? 'prefetching-audio' : 'completed',
        phaseLabel: normalizedRestQueue.length ? '后台预取中' : '播放完成',
        currentItem: nextItem,
        queue: normalizedRestQueue,
        progress: nextItem
          ? this.buildProgress(nextItem, finishedChars)
          : this.playbackState.progress
            ? {
                ...this.playbackState.progress,
                charIndex: finishedChars,
                charLength: this.totalChars(),
                currentChunkIndex: this.sourceQueue.length,
                currentChapterIndex: this.totalChapters(),
                pendingPrefetchChunks: 0
              }
            : undefined,
        message: normalizedRestQueue.length
          ? chapterChanged
            ? `章节《${currentItem.title}》完成，已切到下一章《${nextItem.title}》，后台继续按动态窗口预取音频。`
            : `第 ${currentItem.chunkIndex + 1}/${currentItem.chunkCount} 段完成，优先消费已缓存音频并继续后台生成。`
          : '自动续播队列已全部完成。'
      });
    }
  }

  private async appendRemainingChapters(
    chapters: ReturnType<typeof normalizeChapterSequence>,
    request: Required<Pick<TtsSpeakRequest, 'providerId' | 'voiceId' | 'speed'>> & Partial<TtsSpeakRequest>,
    version: number
  ) {
    try {
      let nextOrder = this.sourceQueue.length;
      for (const chapter of chapters) {
        if (version !== this.queueVersion) {
          return;
        }

        const items = buildPlaybackQueueFromSources([chapter], request, {
          startOrder: nextOrder,
          maxChunkLength: this.getQueueMaxChunkLength(request.providerId, request.fallbackProviderId)
        });
        nextOrder += items.length;
        this.sourceQueue = [...this.sourceQueue, ...items];

        const currentProgress = this.playbackState.progress;
        this.setState({
          queue: [...this.playbackState.queue, ...items],
          progress: currentProgress
            ? {
                ...currentProgress,
                charLength: this.totalChars(),
                totalChunks: this.sourceQueue.length,
                totalChapters: this.totalChapters(),
                isLongText: this.totalChars() >= LONG_TEXT_THRESHOLD,
                longTextHint: this.getLongTextHint(this.totalChars())
              }
            : undefined,
          message: this.playbackState.status === 'reading'
            ? this.playbackState.message
            : `已加载章节《${chapter.chapterTitle}》到自动续播队列，正在继续准备后续内容。`
        });

        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    } finally {
      if (version === this.queueVersion && this.expandingQueueVersion === version) {
        this.expandingQueueVersion = null;
        if (this.playbackState.progress) {
          this.setState({
            progress: {
              ...this.playbackState.progress,
              totalChunks: this.sourceQueue.length,
              totalChapters: this.totalChapters(),
              charLength: this.totalChars()
            }
          });
        }
      }
    }
  }

  private async playSingleItem(item: PlaybackQueueItem, version: number) {
    this.setState({
      status: 'loading',
      phase: item.order === 0 && canPrefetchAudio(item.providerId) ? 'streaming-first-chunk' : 'generating-audio',
      phaseLabel: item.order === 0 && canPrefetchAudio(item.providerId) ? '首段预热' : '生成音频',
      currentItem: item,
      progress: this.buildProgress(item, this.completedChars(item.order)),
      message: canPrefetchAudio(item.providerId)
        ? item.order === 0
          ? '正在优先生成首段音频，成功后会立即播放并后台预取后续片段…'
          : `正在读取第 ${item.order + 1}/${this.sourceQueue.length} 段音频，优先命中缓存/预取结果…`
        : `正在生成第 ${item.order + 1}/${this.sourceQueue.length} 段音频…`
    });

    const playbackStart = Date.now();
    const child = await this.spawnPlayback(item, version);

    if (version !== this.queueVersion) {
      child.kill('SIGTERM');
      return;
    }

    this.playbackProcess = child;
    const resolvedItem = this.playbackState.queue.find((entry) => entry.id === item.id) ?? item;
    if (canPrefetchAudio(resolvedItem.providerId)) {
      this.schedulePrefetch(version, item.order);
    }

    this.setState({
      status: 'reading',
      phase: 'playing',
      phaseLabel: '播放中',
      providerId: resolvedItem.providerId,
      voiceId: resolvedItem.voiceId,
      effectiveProviderId: resolvedItem.providerId,
      effectiveVoiceId: resolvedItem.voiceId,
      speed: resolvedItem.speed,
      currentItem: resolvedItem,
      progress: this.buildProgress(resolvedItem, this.completedChars(resolvedItem.order)),
      message: canPrefetchAudio(resolvedItem.providerId)
        ? `正在播放第 ${resolvedItem.order + 1}/${this.sourceQueue.length} 段，后台按动态窗口继续预取音频。`
        : `正在播放第 ${resolvedItem.order + 1}/${this.sourceQueue.length} 段（章内 ${resolvedItem.chunkIndex + 1}/${resolvedItem.chunkCount}）：${resolvedItem.title}`
    });

    await new Promise<void>((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => {
        if (version !== this.queueVersion) {
          resolve();
          return;
        }

        if (signal === 'SIGTERM') {
          resolve();
          return;
        }

        if (code === 0) {
          resolve();
          return;
        }

        reject(new Error(`播放进程异常退出：code=${code ?? 'unknown'} signal=${signal ?? 'none'}`));
      });
    });

    this.recordPlaybackDuration(Date.now() - playbackStart, item);

    if (this.playbackProcess === child) {
      this.playbackProcess = null;
    }
  }

  private async spawnPlayback(item: PlaybackQueueItem, version: number) {
    if (canPrefetchAudio(item.providerId)) {
      if (!isMac) {
        throw new Error('当前音频文件播放链路使用 afplay 验证，仅在 macOS 上测试。');
      }
      const audioPath = await this.getOrCreateAudio(item, version);
      return spawn('afplay', [audioPath], { stdio: 'ignore' }) as ChildProcessWithoutNullStreams;
    }

    this.setState({
      status: 'loading',
      phase: 'generating-audio',
      phaseLabel: '启动系统朗读',
      message: `正在调用系统语音播放第 ${item.order + 1}/${this.sourceQueue.length} 段…`
    });

    return spawn('say', buildSystemSayArgs({
      providerId: item.providerId,
      voiceId: item.voiceId,
      speed: item.speed,
      text: item.text,
      chapterId: item.chapterId,
      chapterTitle: item.title,
      bookId: item.bookId
    }), { stdio: 'ignore' }) as ChildProcessWithoutNullStreams;
  }

  private async getOrCreateAudio(item: PlaybackQueueItem, version: number) {
    const cached = this.audioCache.get(item.id);
    if (cached) {
      this.publishPrefetchState();
      return cached;
    }

    const existing = this.pendingAudio.get(item.id);
    if (existing) {
      return existing;
    }

    const task = this.resolveAudioPath(item, version)
      .then((audioPath) => {
        if (version === this.queueVersion) {
          this.audioCache.set(item.id, audioPath);
        }
        return audioPath;
      })
      .finally(() => {
        this.pendingAudio.delete(item.id);
        if (version === this.queueVersion) {
          this.publishPrefetchState();
        }
      });

    this.pendingAudio.set(item.id, task);
    this.publishPrefetchState();
    return task;
  }

  private async resolveAudioPath(item: PlaybackQueueItem, version: number) {
    const diskCached = await this.diskCache.get(item);
    if (diskCached) {
      this.cacheHits += 1;
      this.applyCacheCollectionStats(diskCached.collection);
      this.publishPrefetchState();
      return diskCached.audioPath;
    }

    this.cacheMisses += 1;
    const startedAt = Date.now();
    const synthesized = await this.synthesizeAudioFile(item);
    const duration = Date.now() - startedAt;
    this.recordSynthesisDuration(duration);

    if (version !== this.queueVersion) {
      return synthesized.audioPath;
    }

    const stored = await this.diskCache.put(
      synthesized.cacheItem ?? item,
      synthesized.audioPath,
      synthesized.extension ?? path.extname(synthesized.audioPath)
    );
    this.applyCacheCollectionStats(stored.collection);
    return stored.audioPath;
  }

  private async synthesizeAudioFile(item: PlaybackQueueItem): Promise<{ audioPath: string; extension?: string; cacheItem?: PlaybackQueueItem }> {
    try {
      const result = await this.synthesizeAudioFileForProvider(item);
      return {
        ...result,
        cacheItem: item
      };
    } catch (error) {
      const fallbackItem = this.buildFallbackItem(item);
      if (!fallbackItem) {
        throw error;
      }

      const fallbackReason = this.buildFallbackReason(item, fallbackItem, error);
      this.applyFallbackToQueue(item, fallbackItem, fallbackReason);
      const fallbackResult = await this.synthesizeAudioFileForProvider(fallbackItem);
      return {
        ...fallbackResult,
        cacheItem: fallbackItem
      };
    }
  }

  private async synthesizeAudioFileForProvider(item: PlaybackQueueItem): Promise<{ audioPath: string; extension?: string }> {
    if (item.providerId === 'cosyvoice-local' || item.providerId === 'gpt-sovits-local') {
      const result = await this.runSerializedLocalSynthesis(item.providerId, async () => this.offlineTtsService.synthesize({
        providerId: item.providerId,
        voiceId: item.voiceId,
        speed: item.speed,
        text: item.text,
        chapterId: item.chapterId,
        chapterTitle: item.title,
        bookId: item.bookId
      }));
      return {
        audioPath: result.audioPath,
        extension: path.extname(result.audioPath) || '.wav'
      };
    }

    if (item.providerId === 'openai-tts') {
      return { audioPath: await synthesizeWithOpenAi({
        providerId: item.providerId,
        voiceId: item.voiceId,
        speed: item.speed,
        text: item.text,
        chapterId: item.chapterId,
        chapterTitle: item.title,
        bookId: item.bookId
      }), extension: '.mp3' };
    }

    if (item.providerId === 'glm-tts') {
      return { audioPath: await synthesizeWithGlm({
        providerId: item.providerId,
        voiceId: item.voiceId,
        speed: item.speed,
        text: item.text,
        chapterId: item.chapterId,
        chapterTitle: item.title,
        bookId: item.bookId
      }), extension: '.mp3' };
    }

    throw new Error(`当前 provider 不支持音频预取：${item.providerId}`);
  }

  private getMaxChunkLength(providerId: string) {
    if (providerId === 'cosyvoice-local' || providerId === 'gpt-sovits-local') {
      return LOCAL_MAX_CHUNK_LENGTH;
    }

    return undefined;
  }

  private getQueueMaxChunkLength(providerId: string, fallbackProviderId?: string) {
    const primaryLimit = this.getMaxChunkLength(providerId);
    const fallbackLimit = fallbackProviderId ? this.getMaxChunkLength(fallbackProviderId) : undefined;
    if (primaryLimit && fallbackLimit) {
      return Math.min(primaryLimit, fallbackLimit);
    }
    return primaryLimit ?? fallbackLimit;
  }

  private buildFallbackItem(item: PlaybackQueueItem): PlaybackQueueItem | null {
    if (!item.fallbackProviderId || item.fallbackProviderId === item.providerId) {
      return null;
    }

    return {
      ...item,
      providerId: item.fallbackProviderId,
      voiceId: item.fallbackVoiceId ?? item.voiceId,
      fallbackProviderId: undefined,
      fallbackVoiceId: undefined
    };
  }

  private buildFallbackReason(item: PlaybackQueueItem, fallbackItem: PlaybackQueueItem, error: unknown) {
    const errorText = error instanceof Error ? error.message : '未知错误';
    return `主线路 ${item.providerId} 不可用，已切换到本地兜底 ${fallbackItem.providerId}：${errorText}`;
  }

  private applyFallbackToQueue(currentItem: PlaybackQueueItem, fallbackItem: PlaybackQueueItem, fallbackReason: string) {
    const rewrite = (entry: PlaybackQueueItem) => entry.order < currentItem.order
      ? entry
      : {
          ...entry,
          providerId: fallbackItem.providerId,
          voiceId: fallbackItem.voiceId,
          fallbackProviderId: undefined,
          fallbackVoiceId: undefined
        };

    this.audioCache.clear();
    this.pendingAudio.clear();
    this.sourceQueue = this.sourceQueue.map(rewrite);

    const nextQueue = this.playbackState.queue.map(rewrite);
    const nextCurrentItem = nextQueue.find((entry) => entry.id === currentItem.id) ?? fallbackItem;

    this.setState({
      queue: nextQueue,
      currentItem: nextCurrentItem,
      providerId: fallbackItem.providerId,
      voiceId: fallbackItem.voiceId,
      effectiveProviderId: fallbackItem.providerId,
      effectiveVoiceId: fallbackItem.voiceId,
      fallbackUsed: true,
      fallbackReason,
      phase: 'generating-audio',
      phaseLabel: '切换本地兜底',
      message: fallbackReason
    });
  }

  private async runSerializedLocalSynthesis<T>(providerId: string, task: () => Promise<T>) {
    const previous = this.localSynthesisLocks.get(providerId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const chained = previous.catch(() => undefined).then(() => current);
    this.localSynthesisLocks.set(providerId, chained);

    await previous.catch(() => undefined);
    try {
      return await task();
    } finally {
      release();
      if (this.localSynthesisLocks.get(providerId) === chained) {
        this.localSynthesisLocks.delete(providerId);
      }
    }
  }

  private schedulePrefetch(version: number, currentOrder: number) {
    const dynamicAhead = getDynamicPrefetchAhead({
      averageSynthesisMs: this.average(this.synthesisDurations),
      averagePlaybackMs: this.average(this.playbackDurations),
      readyChunks: this.readyPrefetchCount(currentOrder),
      pendingChunks: this.pendingPrefetchCount(currentOrder)
    });
    const candidates = getPrefetchWindow(this.sourceQueue, currentOrder, dynamicAhead)
      .filter((candidate) => !this.audioCache.has(candidate.id) && !this.pendingAudio.has(candidate.id));

    const currentProgress = this.playbackState.progress;
    if (currentProgress) {
      this.setState({
        phase: this.playbackState.status === 'reading' ? 'playing' : 'prefetching-audio',
        phaseLabel: this.playbackState.status === 'reading' ? '播放中' : '后台预取中',
        progress: {
          ...currentProgress,
          dynamicPrefetchAhead: dynamicAhead,
          pendingPrefetchChunks: this.pendingPrefetchCount(currentOrder),
          readyChunks: this.audioCache.size,
          prefetchedChunks: Math.max(0, this.audioCache.size - 1),
          cacheHits: this.cacheHits,
          cacheMisses: this.cacheMisses,
          cacheEntries: this.cacheEntries,
          cacheBytes: this.cacheBytes,
          cacheLimitBytes: this.cacheLimitBytes,
          cacheEvictedEntries: this.cacheEvictedEntries,
          playbackMode: 'prefetch'
        }
      });
    }

    for (const candidate of candidates) {
      void this.getOrCreateAudio(candidate, version).catch(() => undefined);
    }
  }

  private publishPrefetchState() {
    if (!this.playbackState.progress) {
      return;
    }

    const currentItemOrder = this.playbackState.currentItem?.order ?? -1;
    const currentProgress = this.playbackState.progress;
    if (!currentProgress) {
      return;
    }

    this.setState({
      progress: {
        ...currentProgress,
        readyChunks: this.audioCache.size,
        prefetchedChunks: Math.max(0, this.audioCache.size - 1),
        pendingPrefetchChunks: this.pendingPrefetchCount(currentItemOrder),
        dynamicPrefetchAhead: getDynamicPrefetchAhead({
          averageSynthesisMs: this.average(this.synthesisDurations),
          averagePlaybackMs: this.average(this.playbackDurations),
          readyChunks: this.readyPrefetchCount(currentItemOrder),
          pendingChunks: this.pendingPrefetchCount(currentItemOrder)
        }),
        cacheHits: this.cacheHits,
        cacheMisses: this.cacheMisses,
        cacheEntries: this.cacheEntries,
        cacheBytes: this.cacheBytes,
        cacheLimitBytes: this.cacheLimitBytes,
        cacheEvictedEntries: this.cacheEvictedEntries,
        playbackMode: currentProgress.playbackMode ?? 'prefetch'
      }
    });
  }

  private buildProgress(currentItem: PlaybackQueueItem, charIndex: number): PlaybackProgressSnapshot {
    return {
      queueItemId: currentItem.id,
      chapterId: currentItem.chapterId,
      bookId: currentItem.bookId,
      charIndex,
      charLength: this.totalChars(),
      startedAt: this.playbackState.progress?.startedAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      totalChunks: this.sourceQueue.length,
      currentChunkIndex: currentItem.order + 1,
      currentChapterChunkIndex: currentItem.chunkIndex + 1,
      currentChapterChunkCount: currentItem.chunkCount,
      totalChapters: this.totalChapters(),
      currentChapterIndex: this.chapterIndexOf(currentItem),
      currentChunkChars: currentItem.text.length,
      isLongText: this.totalChars() >= LONG_TEXT_THRESHOLD,
      longTextHint: this.getLongTextHint(this.totalChars()),
      readyChunks: this.audioCache.size,
      prefetchedChunks: Math.max(0, this.audioCache.size - 1),
      pendingPrefetchChunks: this.pendingPrefetchCount(currentItem.order),
      dynamicPrefetchAhead: getDynamicPrefetchAhead({
        averageSynthesisMs: this.average(this.synthesisDurations),
        averagePlaybackMs: this.average(this.playbackDurations),
        readyChunks: this.readyPrefetchCount(currentItem.order),
        pendingChunks: this.pendingPrefetchCount(currentItem.order)
      }),
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      cacheEntries: this.cacheEntries,
      cacheBytes: this.cacheBytes,
      cacheLimitBytes: this.cacheLimitBytes,
      cacheEvictedEntries: this.cacheEvictedEntries,
      playbackMode: canPrefetchAudio(currentItem.providerId) ? 'prefetch' : 'serial'
    };
  }

  private completedChars(chunkCount: number) {
    return this.sourceQueue.filter((item) => item.order < chunkCount).reduce((sum, item) => sum + item.text.length, 0);
  }

  private totalChars() {
    return this.sourceQueue.reduce((sum, item) => sum + item.text.length, 0);
  }

  private totalChapters() {
    return new Set(this.sourceQueue.map((item) => item.chapterId ?? item.id)).size;
  }

  private chapterIndexOf(target: PlaybackQueueItem) {
    const seen = new Set<string>();
    for (const item of this.sourceQueue) {
      const key = item.chapterId ?? item.id;
      if (!seen.has(key)) {
        seen.add(key);
      }
      if (item.id === target.id) {
        return seen.size;
      }
    }
    return seen.size || 1;
  }

  private getLongTextHint(totalChars: number) {
    if (totalChars < LONG_TEXT_THRESHOLD) {
      return undefined;
    }

    if (totalChars >= 20000) {
      return '当前文本较长，已切为首段优先 + 磁盘缓存 + 动态预取模式。';
    }

    return '当前文本偏长，将优先播放首段并根据生成/播放速度动态调整后续预取。';
  }

  private setState(nextPartial: Partial<TtsPlaybackState>) {
    this.playbackState = {
      ...this.playbackState,
      ...nextPartial,
      queue: nextPartial.queue ?? this.playbackState.queue ?? []
    };

    if (this.playbackState.progress) {
      this.playbackState.progress = {
        ...this.playbackState.progress,
        updatedAt: new Date().toISOString()
      };
    }

    this.eventBus.publish(this.toPublicState(this.playbackState));
    return this.playbackState;
  }

  private toPublicState(state: TtsPlaybackState): TtsPlaybackState {
    return {
      ...state,
      currentItem: state.currentItem ? this.toPublicQueueItem(state.currentItem) : undefined,
      queue: state.queue.map((item) => this.toPublicQueueItem(item))
    };
  }

  private toPublicQueueItem(item: PlaybackQueueItem): PlaybackQueueItem {
    return {
      ...item,
      text: ''
    };
  }

  private getPlaybackErrorMessage(error: unknown) {
    if (error instanceof OfflineTtsServiceError) {
      return `${error.message}${error.details ? `：${error.details}` : ''}`;
    }

    return error instanceof Error ? error.message : '播放失败，请检查 Provider 配置。';
  }

  private average(values: number[]) {
    if (!values.length) {
      return undefined;
    }
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  private recordSynthesisDuration(duration: number) {
    this.synthesisDurations.push(duration);
    this.synthesisDurations = this.synthesisDurations.slice(-8);
  }

  private recordPlaybackDuration(duration: number, item: PlaybackQueueItem) {
    const fallbackEstimate = Math.max(1200, Math.round((item.text.length / (4.6 * Math.max(0.6, item.speed))) * 1000));
    const sample = duration > 0 ? duration : fallbackEstimate;
    this.playbackDurations.push(sample);
    this.playbackDurations = this.playbackDurations.slice(-8);
  }

  private readyPrefetchCount(currentOrder: number) {
    if (currentOrder < 0) {
      return this.audioCache.size;
    }
    return this.sourceQueue.filter((item) => item.order > currentOrder && this.audioCache.has(item.id)).length;
  }

  private pendingPrefetchCount(currentOrder: number) {
    if (currentOrder < 0) {
      return this.pendingAudio.size;
    }
    return this.sourceQueue.filter((item) => item.order > currentOrder && this.pendingAudio.has(item.id)).length;
  }

  private resetSessionTelemetry() {
    this.synthesisDurations = [];
    this.playbackDurations = [];
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.cacheEntries = 0;
    this.cacheBytes = 0;
    this.cacheLimitBytes = 0;
    this.cacheEvictedEntries = 0;
  }

  private async refreshCacheStats() {
    try {
      const stats = await this.diskCache.getStats();
      this.cacheEntries = stats.totalEntries;
      this.cacheBytes = stats.totalAudioBytes;
      this.cacheLimitBytes = stats.maxCacheBytes;
      this.cacheEvictedEntries = stats.evictedEntries;
    } catch {
      this.cacheEntries = 0;
      this.cacheBytes = 0;
      this.cacheLimitBytes = 0;
      this.cacheEvictedEntries = 0;
    }
  }

  private applyCacheCollectionStats(collection: { totalEntries: number; totalAudioBytes: number; maxCacheBytes: number; evictedEntries: number }) {
    this.cacheEntries = collection.totalEntries;
    this.cacheBytes = collection.totalAudioBytes;
    this.cacheLimitBytes = collection.maxCacheBytes;
    this.cacheEvictedEntries = collection.evictedEntries;
  }
}
