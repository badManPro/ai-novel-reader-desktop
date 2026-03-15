import type { Book } from '../../../shared/types';

interface BookChapterListProps {
  book: Book;
  selectedChapterId: string | null;
  onSelectChapter: (chapterId: string) => void | Promise<void>;
}

export function BookChapterList({ book, selectedChapterId, onSelectChapter }: BookChapterListProps) {
  return (
    <section className="route-card book-chapter-card">
      <div className="library-section-heading">
        <div>
          <p className="route-page-kicker">Chapters</p>
          <h4>章节列表</h4>
        </div>
        <span className="library-section-meta">{book.chapters.length} 章</span>
      </div>

      <div className="book-chapter-list">
        {book.chapters.map((chapter) => (
          <button
            key={chapter.id}
            type="button"
            className={`book-chapter-item ${chapter.id === selectedChapterId ? 'active' : ''}`}
            onClick={() => void onSelectChapter(chapter.id)}
          >
            <span>{chapter.title}</span>
            <small>第 {chapter.order} 章</small>
          </button>
        ))}
      </div>
    </section>
  );
}
