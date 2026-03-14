import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  Book,
  DeleteBookResult,
  ModelProvider,
  NovelReaderApi,
  OfflineEngineActionResult,
  OfflineEngineConsoleSnapshot,
  OfflineEngineHealth,
  OfflineModelAssetManifest,
  OfflineModelTaskAction,
  OfflineModelTaskSnapshot,
  OfflineServiceStatus,
  ReaderPersistedState,
  ReaderSettings,
  ReaderTheme,
  TtsPlaybackPhase,
  TtsPlaybackState,
  TtsPlaybackStatus,
  VoiceOption
} from '../../shared/types';
import { buildContinuousChapterSequence, subscribePlaybackState } from '../lib/playback-events';
import { ModelManagementPanel } from './ModelManagementPanel';

declare global {
  interface Window {
    novelReader?: NovelReaderApi;
  }
}

type AppView = 'reader' | 'settings';

const placeholderParagraphs = [
  '点击“导入 TXT”后，应用会通过 Electron 主进程打开系统文件选择器，并尝试识别常见文本编码。',
  '第七阶段已切入离线语音架构重构：CosyVoice 3.0 负责默认朗读，GPT-SoVITS 负责角色声线与克隆。'
];

const fallbackState: ReaderPersistedState = {
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

const speedOptions = [0.8, 1, 1.2, 1.5];
const fontSizeOptions = [16, 18, 20, 22, 24];
const lineHeightOptions = [1.7, 1.9, 2.1, 2.3];
const themeOptions: ReaderTheme[] = ['dark', 'sepia', 'light'];

export function ReaderShell() {
  const api = window.novelReader;
  const capabilities = api?.capabilities;
  const contentRef = useRef<HTMLElement | null>(null);
  const scrollSaveTimer = useRef<number | null>(null);

  const [activeView, setActiveView] = useState<AppView>('reader');
  const [persistedState, setPersistedState] = useState<ReaderPersistedState>(fallbackState);
  const [book, setBook] = useState<Book | null>(null);
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [bookActionMessage, setBookActionMessage] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [deletingBookId, setDeletingBookId] = useState<string | null>(null);
  const [providers, setProviders] = useState<ModelProvider[]>([]);
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [offlineHealth, setOfflineHealth] = useState<OfflineEngineHealth[]>([]);
  const [offlineServiceStatus, setOfflineServiceStatus] = useState<OfflineServiceStatus[]>([]);
  const [offlineConsole, setOfflineConsole] = useState<OfflineEngineConsoleSnapshot[]>([]);
  const [offlineModelManifests, setOfflineModelManifests] = useState<OfflineModelAssetManifest[]>([]);
  const [offlineTasks, setOfflineTasks] = useState<OfflineModelTaskSnapshot[]>([]);
  const [offlineActionState, setOfflineActionState] = useState<Partial<Record<string, 'checking' | 'starting' | 'prepare' | 'download' | 'install'>>>({});
  const [offlineActionResults, setOfflineActionResults] = useState<Partial<Record<string, OfflineEngineActionResult>>>({});
  const [selectedProviderId, setSelectedProviderId] = useState<string>(fallbackState.settings.defaultProviderId);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>(fallbackState.settings.defaultVoiceId);
  const [selectedSpeed, setSelectedSpeed] = useState<number>(fallbackState.settings.defaultSpeed);
  const [ttsState, setTtsState] = useState<TtsPlaybackState>({ status: 'idle', queue: [], message: '' });

  const settings: ReaderSettings = persistedState.settings;
  const bookshelf = persistedState.bookshelf;

  useEffect(() => {
    if (!api) {
      return;
    }

    void api.loadReaderState().then((state) => {
      setPersistedState(state);
      setSelectedProviderId(state.settings.defaultProviderId);
      setSelectedVoiceId(state.settings.defaultVoiceId);
      setSelectedSpeed(state.settings.defaultSpeed);

      if (!state.bookshelf.length) {
        return;
      }

      const nextBook = state.bookshelf.find((item) => item.id === state.recentBookId) ?? state.bookshelf[0];
      const nextChapterId = state.progress[nextBook.id] ?? nextBook.chapters[0]?.id ?? null;
      setBook(nextBook);
      setSelectedChapterId(nextChapterId);
    });

    void api.getTtsProviders().then((providerList) => setProviders(providerList));
    void refreshOfflineStatus();
    void api.getTtsStatus().then((state) => setTtsState(state));

    return subscribePlaybackState(api, (event) => setTtsState(event.state));
  }, [api]);

  useEffect(() => {
    if (!api || !selectedProviderId) {
      return;
    }

    void api.getVoices(selectedProviderId).then((voiceList) => {
      setVoices(voiceList);
      const fallbackVoiceId = voiceList[0]?.id ?? '';
      setSelectedVoiceId((current) => voiceList.some((voice) => voice.id === current)
        ? current
        : settings.defaultProviderId === selectedProviderId && settings.defaultVoiceId
          ? settings.defaultVoiceId
          : fallbackVoiceId);
    });
  }, [api, selectedProviderId, settings.defaultProviderId, settings.defaultVoiceId]);

  const currentChapter = useMemo(() => {
    if (!book) {
      return null;
    }
    return book.chapters.find((chapter) => chapter.id === selectedChapterId) ?? book.chapters[0] ?? null;
  }, [book, selectedChapterId]);

  const currentProvider = providers.find((provider) => provider.id === selectedProviderId);
  const currentOfflineHealth = offlineHealth.find((item) => item.providerId === selectedProviderId);
  const currentVoice = voices.find((voice) => voice.id === selectedVoiceId);
  const readingPositionKey = book && currentChapter ? `${book.id}::${currentChapter.id}` : null;
  const playbackStateSummary = getPlaybackStateSummary(ttsState.status, ttsState.phase, ttsState.message);
  const queueChapterCount = new Set(ttsState.queue.map((item) => item.chapterId ?? item.id)).size;
  const playbackMetrics = getPlaybackMetrics(ttsState);
  const playbackTimeline = getPlaybackTimeline(ttsState.phase);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
    root.style.setProperty('--reader-font-size', `${settings.fontSize}px`);
    root.style.setProperty('--reader-line-height', String(settings.lineHeight));
  }, [settings.fontSize, settings.lineHeight, settings.theme]);

  useEffect(() => {
    const element = contentRef.current;
    if (!element || !readingPositionKey) {
      return;
    }

    const nextScrollTop = persistedState.readingPositions[readingPositionKey] ?? 0;
    window.requestAnimationFrame(() => {
      if (contentRef.current) {
        contentRef.current.scrollTop = nextScrollTop;
      }
    });
  }, [currentChapter?.id, persistedState.readingPositions, readingPositionKey]);

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

  async function persistPatch(patch: Partial<ReaderPersistedState>) {
    if (!api) {
      return;
    }

    const nextState = await api.saveReaderState(patch);
    setPersistedState(nextState);
  }

  async function persistSettingsPatch(settingsPatch: Partial<ReaderSettings>) {
    await persistPatch({
      settings: {
        ...persistedState.settings,
        ...settingsPatch
      }
    });
  }

  async function selectBook(nextBook: Book) {
    setBook(nextBook);
    const nextChapterId = persistedState.progress[nextBook.id] ?? nextBook.chapters[0]?.id ?? null;
    setSelectedChapterId(nextChapterId);
    await persistPatch({ recentBookId: nextBook.id });
  }

  async function selectChapter(chapterId: string) {
    if (!book) {
      return;
    }

    setSelectedChapterId(chapterId);
    await persistPatch({
      progress: {
        ...persistedState.progress,
        [book.id]: chapterId
      }
    });
  }

  async function applyDeletedBookState(result: DeleteBookResult) {
    setPersistedState(result.state);

    const nextBook = result.state.bookshelf.find((item) => item.id === result.state.recentBookId)
      ?? result.state.bookshelf[0]
      ?? null;
    const nextChapterId = nextBook
      ? result.state.progress[nextBook.id] ?? nextBook.chapters[0]?.id ?? null
      : null;

    setBook(nextBook);
    setSelectedChapterId(nextChapterId);
    setTtsState((current) => ({
      ...current,
      status: 'idle',
      phase: 'idle',
      phaseLabel: '空闲',
      queue: [],
      currentItem: undefined,
      progress: undefined,
      message: nextBook ? '已删除目标书籍，朗读队列已重置。' : '已删除书籍，当前无可播放内容。'
    }));

    const cleanupSummary = [`已删除《${getBookTitle(result.removedBookId, bookshelf)}》`];
    cleanupSummary.push(result.removedBookshelfRecord ? '书架记录已移除' : '书架记录未找到');
    if (result.removedProgress) {
      cleanupSummary.push('阅读进度已清理');
    }
    if (result.removedReadingPositions > 0) {
      cleanupSummary.push(`滚动定位 ${result.removedReadingPositions} 条已清理`);
    }
    if (result.removedDraftQueueItems > 0) {
      cleanupSummary.push(`草稿队列 ${result.removedDraftQueueItems} 段已清理`);
    }
    if (result.removedCacheEntries > 0) {
      cleanupSummary.push(`磁盘缓存 ${result.removedCacheEntries} 条（${formatBytes(result.removedCacheBytes)}）已清理`);
    }
    setBookActionMessage(cleanupSummary.join('；'));
  }

  async function handleDeleteBook(targetBook: Book) {
    if (!api) {
      setImportWarnings(['当前运行环境未注入 novelReader API。']);
      return;
    }

    const confirmed = window.confirm([
      `确定删除《${targetBook.title}》吗？`,
      '将移除书架记录、阅读进度、章节滚动定位。',
      '若存在该书的自动续播草稿与磁盘缓存，也会一并清理。'
    ].join('\n'));

    if (!confirmed) {
      return;
    }

    setDeletingBookId(targetBook.id);
    setBookActionMessage(null);
    setImportWarnings([]);

    try {
      const result = await api.deleteBook(targetBook.id);
      await applyDeletedBookState(result);
    } catch (error) {
      setImportWarnings([error instanceof Error ? error.message : '删除失败，请重试。']);
    } finally {
      setDeletingBookId(null);
    }
  }

  async function handleImport() {
    if (!api) {
      setImportWarnings(['当前运行环境未注入 novelReader API。']);
      return;
    }

    setIsImporting(true);
    setTtsState({ status: 'idle', phase: 'idle', phaseLabel: '空闲', queue: [], message: '' });

    try {
      const result = await api.importTxtBook();
      if (!result) {
        return;
      }

      const nextBookshelf = [result.book, ...persistedState.bookshelf.filter((item) => item.id !== result.book.id)].slice(0, 20);
      const nextProgress = {
        ...persistedState.progress,
        [result.book.id]: result.book.chapters[0]?.id ?? ''
      };

      setBook(result.book);
      setSelectedChapterId(result.book.chapters[0]?.id ?? null);
      setImportWarnings(result.warnings);
      setBookActionMessage(`已导入《${result.book.title}》并写入书架。`);

      await persistPatch({
        bookshelf: nextBookshelf,
        recentBookId: result.book.id,
        progress: nextProgress
      });
    } catch (error) {
      setImportWarnings([error instanceof Error ? error.message : '导入失败，请重试。']);
    } finally {
      setIsImporting(false);
    }
  }

  async function saveCurrentDefaults() {
    const draftQueue = currentChapter && book
      ? buildContinuousChapterSequence(book.chapters, currentChapter.id).flatMap((chapter, chapterIndex) => {
          const chunks = splitTextIntoDrafts(chapter.text);
          return chunks.map((text, chunkIndex) => ({
            id: `draft-${chapter.chapterId}-${chunkIndex}`,
            bookId: book.id,
            chapterId: chapter.chapterId,
            title: chapter.chapterTitle,
            text,
            providerId: selectedProviderId,
            voiceId: selectedVoiceId,
            speed: selectedSpeed,
            order: chapterIndex * 1000 + chunkIndex,
            chunkIndex,
            chunkCount: chunks.length
          }));
        })
      : persistedState.playbackDraftQueue;

    await persistPatch({
      settings: {
        ...persistedState.settings,
        defaultProviderId: selectedProviderId,
        defaultVoiceId: selectedVoiceId,
        defaultSpeed: selectedSpeed
      },
      playbackDraftQueue: draftQueue
    });
  }

  async function syncPlaybackState(task: Promise<TtsPlaybackState>) {
    const state = await task;
    setTtsState(state);
  }

  async function handleSpeak() {
    if (!api || !currentChapter || !selectedVoiceId || !book) {
      return;
    }

    const chapterSequence = buildContinuousChapterSequence(book.chapters, currentChapter.id);
    setTtsState({
      status: 'loading',
      phase: 'preparing',
      phaseLabel: '准备朗读',
      queue: [],
      message: '正在整理章节并生成自动续播队列…'
    });

    try {
      const result = await api.speak({
        providerId: selectedProviderId,
        voiceId: selectedVoiceId,
        speed: selectedSpeed,
        bookId: book.id,
        chapterId: currentChapter.id,
        chapterTitle: currentChapter.title,
        text: currentChapter.content,
        chapterSequence
      });
      setTtsState((current) => ({ ...current, status: result.status, message: result.message }));
      await saveCurrentDefaults();
      await refreshOfflineStatus();
    } catch (error) {
      setTtsState({
        status: 'error',
        phase: 'error',
        phaseLabel: '启动失败',
        queue: [],
        message: error instanceof Error ? error.message : 'TTS 启动失败。'
      });
    }
  }

  async function handleContentScroll() {
    if (!readingPositionKey || !contentRef.current) {
      return;
    }

    if (scrollSaveTimer.current) {
      window.clearTimeout(scrollSaveTimer.current);
    }

    const scrollTop = contentRef.current.scrollTop;
    scrollSaveTimer.current = window.setTimeout(() => {
      void persistPatch({
        readingPositions: {
          ...persistedState.readingPositions,
          [readingPositionKey]: scrollTop
        }
      });
    }, 150);
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">书籍目录</p>
          <h1>AI Novel Reader</h1>
          <p className="muted">阶段七：离线语音架构重构启动，云端 Provider 退居可选扩展</p>
        </div>

        <div className="panel view-switcher-panel">
          <div className="view-switcher" role="tablist" aria-label="主界面导航">
            <button
              type="button"
              className={`secondary nav-button ${activeView === 'reader' ? 'active' : ''}`}
              onClick={() => setActiveView('reader')}
            >
              阅读主界面
            </button>
            <button
              type="button"
              className={`secondary nav-button ${activeView === 'settings' ? 'active' : ''}`}
              onClick={() => setActiveView('settings')}
            >
              设置中心
            </button>
          </div>
          <small className="muted">语音引擎、默认音色、倍速、缓存与离线服务入口已集中到设置中心。</small>
        </div>

        <div className="panel compact-summary-panel">
          <div className="panel-header">
            <strong>当前朗读默认</strong>
            <span className="muted">已集中管理</span>
          </div>
          <div className="summary-list">
            <div>
              <span className="muted">引擎</span>
              <strong>{currentProvider?.name ?? selectedProviderId}</strong>
            </div>
            <div>
              <span className="muted">音色</span>
              <strong>{currentVoice?.name ?? (selectedVoiceId || '未选择')}</strong>
            </div>
            <div>
              <span className="muted">倍速</span>
              <strong>{selectedSpeed}x</strong>
            </div>
          </div>
        </div>

        <div className="panel">
          <strong>支持格式</strong>
          <ul>
            {(capabilities?.formats ?? []).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        <div className="panel chapter-list-panel">
          <div className="panel-header">
            <strong>书架</strong>
            <span className="muted">{bookshelf.length} 本</span>
          </div>
          {bookshelf.length ? (
            <div className="chapter-list">
              {bookshelf.map((item) => (
                <div key={item.id} className={`book-shelf-item ${item.id === book?.id ? 'active' : ''}`}>
                  <button
                    type="button"
                    className={`chapter-item ${item.id === book?.id ? 'active' : ''}`}
                    onClick={() => void selectBook(item)}
                  >
                    <span>{item.title}</span>
                    <small>{item.chapters.length} 章</small>
                  </button>
                  <button
                    type="button"
                    className="secondary danger-button shelf-delete-button"
                    onClick={() => void handleDeleteBook(item)}
                    disabled={deletingBookId === item.id}
                  >
                    {deletingBookId === item.id ? '删除中…' : '删除'}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">导入后会自动加入 SQLite 书架。</p>
          )}
        </div>

        <div className="panel chapter-list-panel">
          <div className="panel-header">
            <strong>章节列表</strong>
            <span className="muted">{book ? `${book.chapters.length} 章` : '未导入'}</span>
          </div>
          {book ? (
            <div className="chapter-list">
              {book.chapters.map((chapter) => (
                <button
                  key={chapter.id}
                  type="button"
                  className={`chapter-item ${chapter.id === currentChapter?.id ? 'active' : ''}`}
                  onClick={() => void selectChapter(chapter.id)}
                >
                  <span>{chapter.title}</span>
                  <small>第 {chapter.order} 章</small>
                </button>
              ))}
            </div>
          ) : (
            <p className="muted">导入后会在这里显示章节导航。</p>
          )}
        </div>
      </aside>

      <main className="reader">
        <header className="reader-header">
          <div>
            <p className="eyebrow">{activeView === 'reader' ? '当前书籍' : '设置中心'}</p>
            <h2>{activeView === 'reader' ? (book?.title ?? '尚未导入小说') : '朗读与阅读设置'}</h2>
            <p className="muted metadata-line">
              {activeView === 'reader'
                ? (book
                  ? `格式：${book.format.toUpperCase()} · 编码：${book.encoding ?? 'unknown'} · ${book.size ?? 0} bytes`
                  : '请先导入本地 TXT 文件')
                : '将散落在阅读页的配置项收拢到这里，阅读主链路保留为导入、阅读、播放。'}
            </p>
          </div>
          <div className="actions">
            <button type="button" onClick={() => void handleImport()} disabled={isImporting}>
              {isImporting ? '导入中…' : '导入 TXT'}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => setActiveView(activeView === 'reader' ? 'settings' : 'reader')}
            >
              {activeView === 'reader' ? '打开设置中心' : '返回阅读界面'}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => void handleSpeak()}
              disabled={!currentChapter || !selectedVoiceId}
            >
              {ttsState.status === 'reading' ? '重新播放' : '开始自动续播'}
            </button>
            <button
              type="button"
              className="secondary danger-button"
              onClick={() => book && void handleDeleteBook(book)}
              disabled={!book || deletingBookId === book.id}
            >
              {book && deletingBookId === book.id ? '删除中…' : '删除当前书籍'}
            </button>
          </div>
        </header>

        {activeView === 'reader' ? (
          <div className="reader-workspace">
            <section className="reader-main-column">
              {importWarnings.length > 0 ? (
                <section className="warning-card">
                  <strong>导入提示</strong>
                  <ul>
                    {importWarnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {bookActionMessage ? (
                <section className="info-card">
                  <strong>书架操作</strong>
                  <p>{bookActionMessage}</p>
                </section>
              ) : null}

              <section className="content-frame">
                <div className="content-frame-header">
                  <div>
                    <p className="eyebrow">阅读主区</p>
                    <h3>{currentChapter?.title ?? '导入后开始阅读'}</h3>
                  </div>
                  {readingPositionKey ? (
                    <span className="muted">滚动定位：{Math.round(persistedState.readingPositions[readingPositionKey] ?? 0)}px</span>
                  ) : null}
                </div>
                <section ref={contentRef} className="content-card" onScroll={() => void handleContentScroll()}>
                  <div className="content-meta">
                    <p className="chapter-tag">{currentChapter?.title ?? '导入后开始阅读'}</p>
                    <span className="muted">{book ? `${book.chapters.length} 章 · ${book.format.toUpperCase()}` : '请先导入本地 TXT 文件'}</span>
                  </div>
                  {(currentChapter?.content ?? placeholderParagraphs.join('\n\n'))
                    .split('\n\n')
                    .filter(Boolean)
                    .map((paragraph, index) => (
                      <p key={`${index}-${paragraph.slice(0, 12)}`}>{paragraph}</p>
                    ))}
                </section>
              </section>

              <footer className="player-bar">
                <div>
                  <strong>当前音色：</strong>
                  {currentVoice?.name ?? '未选择'}
                </div>
                <div className="muted footer-meta">
                  <span>{book?.path ?? '尚未导入文件'}</span>
                  <span>最近阅读：{book?.title ?? '无'}</span>
                </div>
              </footer>
            </section>

            <aside className="reader-side-rail">
              <section className="reader-overview-grid">
                <article className="panel quick-settings-card">
                  <div className="panel-header">
                    <strong>朗读配置速览</strong>
                    <button type="button" className="secondary" onClick={() => setActiveView('settings')}>
                      去设置中心
                    </button>
                  </div>
                  <div className="summary-list compact">
                    <div>
                      <span className="muted">Provider</span>
                      <strong>{currentProvider?.name ?? selectedProviderId}</strong>
                    </div>
                    <div>
                      <span className="muted">音色</span>
                      <strong>{currentVoice?.name ?? (selectedVoiceId || '未选择')}</strong>
                    </div>
                    <div>
                      <span className="muted">倍速</span>
                      <strong>{selectedSpeed}x</strong>
                    </div>
                  </div>
                  <small className="muted provider-note">
                    默认设置：{settings.defaultProviderId} / {settings.defaultVoiceId || '未选音色'} / {settings.defaultSpeed}x
                  </small>
                </article>

                <article className={`tts-status status-${ttsState.status}`}>
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
                  {currentOfflineHealth ? (
                    <small className="muted provider-note">
                      离线健康：{currentOfflineHealth.status} · {currentOfflineHealth.message}
                    </small>
                  ) : null}
                </article>
              </section>

              <section className="panel playback-controls">
                <div className="panel-header">
                  <strong>播放控制</strong>
                  <span className="muted">本地离线引擎优先，renderer 已订阅主进程播放事件</span>
                </div>
                <div className="actions vertical-actions">
                  <button type="button" className="secondary" onClick={() => void syncPlaybackState(api?.pauseTts() ?? Promise.resolve({ status: 'idle', queue: [], message: 'API 不可用。' }))}>
                    暂停
                  </button>
                  <button type="button" className="secondary" onClick={() => void syncPlaybackState(api?.resumeTts() ?? Promise.resolve({ status: 'idle', queue: [], message: 'API 不可用。' }))}>
                    继续
                  </button>
                  <button type="button" className="secondary" onClick={() => void syncPlaybackState(api?.stopTts() ?? Promise.resolve({ status: 'idle', queue: [], message: 'API 不可用。' }))}>
                    停止
                  </button>
                  <button type="button" className="secondary" onClick={() => void syncPlaybackState(api?.getTtsStatus() ?? Promise.resolve({ status: 'idle', queue: [], message: 'API 不可用。' }))}>
                    兜底刷新
                  </button>
                </div>
              </section>
            </aside>
          </div>
        ) : (
          <div className="settings-stack">
            <section className="settings-grid">
              <article className="panel settings-card">
                <div className="panel-header">
                  <strong>朗读默认设置</strong>
                  <span className="muted">已从阅读主界面收拢</span>
                </div>
                <div className="settings-form-grid">
                  <label>
                    <span>语音引擎</span>
                    <select value={selectedProviderId} onChange={(event) => setSelectedProviderId(event.target.value)}>
                      {providers.map((provider) => (
                        <option key={provider.id} value={provider.id}>
                          {provider.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>默认音色</span>
                    <select value={selectedVoiceId} onChange={(event) => setSelectedVoiceId(event.target.value)}>
                      {voices.map((voice) => (
                        <option key={voice.id} value={voice.id}>
                          {voice.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>语速 / 倍速</span>
                    <select value={selectedSpeed} onChange={(event) => setSelectedSpeed(Number(event.target.value))}>
                      {speedOptions.map((speed) => (
                        <option key={speed} value={speed}>
                          {speed}x
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="actions">
                  <button type="button" className="secondary" onClick={() => void saveCurrentDefaults()}>
                    保存为默认
                  </button>
                  <button type="button" className="secondary" onClick={() => void handleSpeak()} disabled={!currentChapter || !selectedVoiceId}>
                    立即用当前配置试听
                  </button>
                </div>
                <small className="muted provider-note">
                  {currentProvider?.description ?? '未选择 Provider'}
                  {currentProvider?.requiresApiKey && !currentProvider.configured ? '（请先配置对应 API Key）' : ''}
                </small>
              </article>

              <article className="panel settings-card">
                <div className="panel-header">
                  <strong>阅读显示</strong>
                  <span className="muted">界面偏好</span>
                </div>
                <div className="settings-form-grid">
                  <label>
                    <span>字号</span>
                    <select value={settings.fontSize} onChange={(event) => void persistSettingsPatch({ fontSize: Number(event.target.value) })}>
                      {fontSizeOptions.map((size) => (
                        <option key={size} value={size}>{size}px</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>行高</span>
                    <select value={settings.lineHeight} onChange={(event) => void persistSettingsPatch({ lineHeight: Number(event.target.value) })}>
                      {lineHeightOptions.map((value) => (
                        <option key={value} value={value}>{value}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>主题</span>
                    <select value={settings.theme} onChange={(event) => void persistSettingsPatch({ theme: event.target.value as ReaderTheme })}>
                      {themeOptions.map((theme) => (
                        <option key={theme} value={theme}>{theme}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </article>
            </section>

            <section className="settings-grid">
              <article className="panel settings-card">
                <div className="panel-header">
                  <strong>缓存与草稿队列</strong>
                  <span className="muted">缓存相关能力已集中展示</span>
                </div>
                <div className="stats-grid">
                  <div>
                    <span className="muted">磁盘缓存</span>
                    <strong>{playbackMetrics.diskCacheUsage}</strong>
                  </div>
                  <div>
                    <span className="muted">缓存命中</span>
                    <strong>{playbackMetrics.cacheSummary}</strong>
                  </div>
                  <div>
                    <span className="muted">累计清理</span>
                    <strong>{playbackMetrics.cacheEvictedEntries}</strong>
                  </div>
                  <div>
                    <span className="muted">草稿队列</span>
                    <strong>{persistedState.playbackDraftQueue.length} 段</strong>
                  </div>
                  <div>
                    <span className="muted">自动续播</span>
                    <strong>{queueChapterCount} 章 / {ttsState.queue.length} 段</strong>
                  </div>
                  <div>
                    <span className="muted">当前片段</span>
                    <strong>{playbackMetrics.currentChunkChars}</strong>
                  </div>
                </div>
                {ttsState.progress?.isLongText && ttsState.progress.longTextHint ? (
                  <div className="long-text-hint">
                    <strong>长文本提示</strong>
                    <span>{ttsState.progress.longTextHint}</span>
                  </div>
                ) : null}
                <small className="muted provider-note">删除书籍时会联动清理该书对应的自动续播草稿与磁盘缓存；这里仍以集中查看缓存态势为主。</small>
              </article>

              <ModelManagementPanel
                engines={offlineConsole}
                tasks={offlineTasks}
                manifests={offlineModelManifests}
                actionState={offlineActionState}
                actionResults={offlineActionResults}
                onRefresh={refreshOfflineStatus}
                onCheckEnv={(providerId) => runOfflineAction(providerId, 'checking')}
                onStart={(providerId) => runOfflineAction(providerId, 'starting')}
                onCreateTask={createOfflineTask}
                onRetryTask={retryOfflineTask}
              />
            </section>

            <section className={`tts-status status-${ttsState.status}`}>
              <div className="tts-status-header">
                <div>
                  <strong>播放态势：</strong>
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
                  <span className="muted">后台预取</span>
                  <strong>{playbackMetrics.pendingPrefetchChunks}</strong>
                </div>
                <div>
                  <span className="muted">动态窗口</span>
                  <strong>{playbackMetrics.dynamicPrefetchAhead}</strong>
                </div>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

function getPlaybackStateSummary(status: TtsPlaybackStatus, phase: TtsPlaybackPhase | undefined, message: string) {
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

function getPlaybackTimeline(phase: TtsPlaybackPhase | undefined) {
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

function getPlaybackMetrics(ttsState: TtsPlaybackState) {
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

function formatBytes(bytes: number) {
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

function getBookTitle(bookId: string, bookshelf: Book[]) {
  return bookshelf.find((item) => item.id === bookId)?.title ?? '已删除书籍';
}

function splitTextIntoDrafts(text: string, size = 280) {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (normalized.length <= size) {
    return [normalized];
  }

  const result: string[] = [];
  for (let index = 0; index < normalized.length; index += size) {
    result.push(normalized.slice(index, index + size));
  }
  return result;
}
