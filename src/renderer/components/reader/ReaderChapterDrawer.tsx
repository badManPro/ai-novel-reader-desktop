import type { Book } from '../../../shared/types';

interface ReaderChapterDrawerProps {
  book: Book | null;
  currentChapterId: string | null;
  open: boolean;
  onClose: () => void;
  onSelectChapter: (chapterId: string) => void | Promise<void>;
}

export function ReaderChapterDrawer({ book, currentChapterId, open, onClose, onSelectChapter }: ReaderChapterDrawerProps) {
  if (!book) {
    return null;
  }

  return (
    <>
      <div className={`reader-drawer-scrim ${open ? 'open' : ''}`} onClick={onClose} aria-hidden={!open} />
      <aside className={`reader-chapter-drawer ${open ? 'open' : ''}`} aria-label="章节目录">
        <div className="reader-drawer-header">
          <div>
            <p className="route-page-kicker">Chapters</p>
            <h3>{book.title}</h3>
          </div>
          <button type="button" className="secondary" onClick={onClose}>
            收起目录
          </button>
        </div>

        <div className="reader-drawer-list">
          {book.chapters.map((chapter) => (
            <button
              key={chapter.id}
              type="button"
              className={`reader-drawer-item ${chapter.id === currentChapterId ? 'active' : ''}`}
              onClick={() => void onSelectChapter(chapter.id)}
            >
              <span>{chapter.title}</span>
              <small>第 {chapter.order} 章</small>
            </button>
          ))}
        </div>
      </aside>
    </>
  );
}
