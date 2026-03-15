import { Link } from 'react-router-dom';
import type { Book, Chapter } from '../../../shared/types';

interface BookHeroProps {
  book: Book;
  currentChapter: Chapter | null;
  isClearingCache: boolean;
  isDeleting: boolean;
  onContinueReading: () => void | Promise<void>;
  onStartReading: () => void | Promise<void>;
  onClearCache: () => void | Promise<void>;
  onDelete: () => void | Promise<void>;
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

export function BookHero({
  book,
  currentChapter,
  isClearingCache,
  isDeleting,
  onContinueReading,
  onStartReading,
  onClearCache,
  onDelete
}: BookHeroProps) {
  return (
    <article className="route-hero-card book-hero-card">
      <div className="book-hero-copy">
        <p className="route-page-kicker">Book Detail</p>
        <h3>{book.title}</h3>
        <p>
          把针对这本书的阅读、朗读、章节选择和缓存处理都收拢到详情页，不再把章节列表长期挤在全局侧栏。
        </p>

        <div className="book-meta-grid">
          <div>
            <span className="route-page-kicker">Format</span>
            <strong>{book.format.toUpperCase()}</strong>
          </div>
          <div>
            <span className="route-page-kicker">Encoding</span>
            <strong>{book.encoding ?? 'unknown'}</strong>
          </div>
          <div>
            <span className="route-page-kicker">Size</span>
            <strong>{formatBookSize(book.size)}</strong>
          </div>
          <div>
            <span className="route-page-kicker">Progress</span>
            <strong>{currentChapter?.title ?? '首章'}</strong>
          </div>
        </div>
      </div>

      <div className="book-hero-side">
        <div className="book-hero-actions">
          <button type="button" onClick={() => void onContinueReading()}>
            继续阅读
          </button>
          <button type="button" className="secondary" onClick={() => void onStartReading()}>
            从当前章节开始朗读
          </button>
          <button type="button" className="secondary" onClick={() => void onClearCache()} disabled={isClearingCache}>
            {isClearingCache ? '清理中…' : '清理缓存'}
          </button>
          <button type="button" className="secondary danger-button" onClick={() => void onDelete()} disabled={isDeleting}>
            {isDeleting ? '删除中…' : '删除书籍'}
          </button>
        </div>

        <div className="book-hero-footer">
          <span className="library-feature-chip">{book.chapters.length} 章</span>
          <Link to="/library" className="route-inline-link">
            返回书库
          </Link>
        </div>
      </div>
    </article>
  );
}
