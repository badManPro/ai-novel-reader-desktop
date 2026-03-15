import { Link } from 'react-router-dom';
import type { Book, Chapter } from '../../../shared/types';

interface LibraryBookCardProps {
  book: Book;
  progressChapter: Chapter | null;
  isRecent: boolean;
  isDeleting: boolean;
  onDelete: (book: Book) => void | Promise<void>;
}

function formatBookSize(size?: number) {
  if (!size) {
    return '未知大小';
  }

  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (size >= 1024) {
    return `${Math.round(size / 1024)} KB`;
  }

  return `${size} B`;
}

export function LibraryBookCard({ book, progressChapter, isRecent, isDeleting, onDelete }: LibraryBookCardProps) {
  const readerHref = progressChapter
    ? `/reader/${book.id}/${progressChapter.id}`
    : `/reader/${book.id}/chapter-1`;

  return (
    <article className={`route-card library-book-card ${isRecent ? 'recent' : ''}`}>
      <div className="library-book-card-header">
        <div>
          <p className="route-page-kicker">{isRecent ? 'Recently Opened' : book.format.toUpperCase()}</p>
          <h4>{book.title}</h4>
        </div>
        <span className="library-book-badge">{book.chapters.length} 章</span>
      </div>

      <p className="library-book-meta">
        {book.author ? `作者：${book.author} · ` : ''}
        {formatBookSize(book.size)} · {book.encoding ?? 'unknown'}
      </p>

      <div className="library-book-progress">
        <span className="route-page-kicker">Continue From</span>
        <strong>{progressChapter?.title ?? '首章'}</strong>
      </div>

      <div className="library-book-actions">
        <Link to={`/book/${book.id}`} className="route-inline-link">
          查看详情
        </Link>
        <Link to={readerHref} className="route-inline-link">
          继续阅读
        </Link>
        <button type="button" className="secondary danger-button" onClick={() => void onDelete(book)} disabled={isDeleting}>
          {isDeleting ? '删除中…' : '删除'}
        </button>
      </div>
    </article>
  );
}
