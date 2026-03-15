import {
  HashRouter,
  Navigate,
  Route,
  Routes
} from 'react-router-dom';
import { AppShell } from './AppShell';
import { BookDetailPage } from '../pages/book/BookDetailPage';
import { LibraryPage } from '../pages/library/LibraryPage';
import { ReaderPage } from '../pages/reader/ReaderPage';
import { AboutSettingsPage } from '../pages/settings/AboutSettingsPage';
import { DataSettingsPage } from '../pages/settings/DataSettingsPage';
import { OfflineSettingsPage } from '../pages/settings/OfflineSettingsPage';
import { ReadingSettingsPage } from '../pages/settings/ReadingSettingsPage';
import { SettingsPage } from '../pages/settings/SettingsPage';
import { TtsSettingsPage } from '../pages/settings/TtsSettingsPage';

export function AppRoutes() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/library" replace />} />
        <Route element={<AppShell />}>
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/book/:bookId" element={<BookDetailPage />} />
          <Route path="/settings" element={<SettingsPage />}>
            <Route index element={<Navigate to="tts" replace />} />
            <Route path="tts" element={<TtsSettingsPage />} />
            <Route path="reading" element={<ReadingSettingsPage />} />
            <Route path="offline" element={<OfflineSettingsPage />} />
            <Route path="data" element={<DataSettingsPage />} />
            <Route path="about" element={<AboutSettingsPage />} />
          </Route>
        </Route>
        <Route path="/reader/:bookId/:chapterId" element={<ReaderPage />} />
        <Route path="*" element={<Navigate to="/library" replace />} />
      </Routes>
    </HashRouter>
  );
}
