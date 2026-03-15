import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'node:path';
import type {
  ChapterPlaybackSource,
  ClearBookCacheResult,
  DeleteBookResult,
  ReaderPersistedState,
  TtsSpeakRequest,
  TtsSpeakResult
} from '../shared/types';
import { BookImportService } from './services/book-import-service';
import { PlaybackDiskCache } from './services/playback-disk-cache';
import { PlaybackService } from './services/playback-service';
import { ReaderStoreService } from './services/reader-store-service';
import { OfflineTtsConsoleService } from './services/offline-tts-console-service';
import { OfflineModelTaskService } from './services/offline-model-task-service';
import { listOfflineModelAssetManifests } from './config/offline-model-assets';
import { TtsCatalogService } from './services/tts-catalog-service';

const isDev = process.env.NODE_ENV === 'development';

const bookImportService = new BookImportService();
const ttsCatalogService = new TtsCatalogService();
const playbackService = new PlaybackService();
const readerStoreService = new ReaderStoreService();
const playbackDiskCache = new PlaybackDiskCache();
const offlineTtsConsoleService = new OfflineTtsConsoleService();
const offlineModelTaskService = new OfflineModelTaskService();

async function buildChapterSequenceForSpeak(request: TtsSpeakRequest): Promise<ChapterPlaybackSource[] | undefined> {
  if (request.chapterSequence?.length) {
    return request.chapterSequence;
  }

  if (!request.bookId || !request.chapterId) {
    return undefined;
  }

  const state = await readerStoreService.loadState();
  const book = state.bookshelf.find((item) => item.id === request.bookId);
  if (!book) {
    return undefined;
  }

  const startIndex = book.chapters.findIndex((chapter) => chapter.id === request.chapterId);
  const normalizedStartIndex = startIndex >= 0 ? startIndex : 0;
  return book.chapters.slice(normalizedStartIndex).map((chapter) => ({
    chapterId: chapter.id,
    chapterTitle: chapter.title,
    text: chapter.content,
    order: chapter.order
  }));
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 760,
    title: 'AI Novel Reader',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev) {
    void mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../../renderer/index.html'));
  }
}

async function deleteBook(bookId: string): Promise<DeleteBookResult> {
  await playbackService.stop(true);
  const cacheCleanup = await playbackDiskCache.removeBook(bookId);
  return readerStoreService.deleteBook(bookId, {
    removedCacheEntries: cacheCleanup.removedEntries,
    removedCacheBytes: cacheCleanup.removedAudioBytes
  });
}

async function clearBookCache(bookId: string): Promise<ClearBookCacheResult> {
  const cleanup = await playbackDiskCache.removeBook(bookId);
  return {
    bookId,
    removedEntries: cleanup.removedEntries,
    removedAudioBytes: cleanup.removedAudioBytes
  };
}

function registerIpcHandlers() {
  ipcMain.handle('books:import-txt', async () => bookImportService.importTxtBook());
  ipcMain.handle('books:delete', async (_event, bookId: string) => deleteBook(bookId));
  ipcMain.handle('books:clear-cache', async (_event, bookId: string) => clearBookCache(bookId));
  ipcMain.handle('reader-state:load', async () => readerStoreService.loadState());
  ipcMain.handle('reader-state:save', async (_event, patch: Partial<ReaderPersistedState>) => readerStoreService.saveState(patch));
  ipcMain.handle('tts:list-providers', async () => ttsCatalogService.listProviders());
  ipcMain.handle('tts:list-voices', async (_event, providerId: string) => ttsCatalogService.listVoices(providerId));
  ipcMain.handle('tts:offline-health', async () => ttsCatalogService.getOfflineEngineHealth());
  ipcMain.handle('tts:offline-service-status', async () => ttsCatalogService.getOfflineServiceStatus());
  ipcMain.handle('tts:offline-console', async () => offlineTtsConsoleService.getSnapshot());
  ipcMain.handle('tts:offline-manual-import-state', async (_event, providerId: 'cosyvoice-local' | 'gpt-sovits-local') => offlineTtsConsoleService.getManualImportState(providerId));
  ipcMain.handle('tts:offline-manual-import-choose', async (_event, providerId: 'cosyvoice-local' | 'gpt-sovits-local', target: 'repo-dir' | 'weights-dir') => {
    const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    return offlineTtsConsoleService.chooseManualImport(providerId, target, async (options) => dialog.showOpenDialog(window ?? undefined, options));
  });
  ipcMain.handle('tts:offline-check-env', async (_event, providerId: 'cosyvoice-local' | 'gpt-sovits-local') => offlineTtsConsoleService.checkEnvironment(providerId));
  ipcMain.handle('tts:offline-start', async (_event, providerId: 'cosyvoice-local' | 'gpt-sovits-local') => offlineTtsConsoleService.startEngine(providerId));
  ipcMain.handle('tts:offline-model-tasks', async () => offlineModelTaskService.listTasks());
  ipcMain.handle('tts:offline-model-asset-manifests', async () => listOfflineModelAssetManifests());
  ipcMain.handle('tts:offline-model-task-create', async (_event, providerId: 'cosyvoice-local' | 'gpt-sovits-local', action: 'prepare' | 'download' | 'install') => offlineModelTaskService.createTask(providerId, action));
  ipcMain.handle('tts:offline-model-task-retry', async (_event, taskId: string) => offlineModelTaskService.retryTask(taskId));
  ipcMain.handle('tts:speak', async (_event, request: TtsSpeakRequest): Promise<TtsSpeakResult> => {
    const chapterSequence = await buildChapterSequenceForSpeak(request);
    return playbackService.speak({
      ...request,
      chapterSequence
    });
  });
  ipcMain.handle('tts:pause', async () => playbackService.pause());
  ipcMain.handle('tts:resume', async () => playbackService.resume());
  ipcMain.handle('tts:stop', async () => playbackService.stop());
  ipcMain.handle('tts:status', async () => playbackService.getState());
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
