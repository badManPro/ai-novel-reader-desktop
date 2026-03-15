import { Link } from 'react-router-dom';
import type { Book, Chapter } from '../../../shared/types';

interface LibraryHeroProps {
  recentBook: Book | null;
  recentChapter: Chapter | null;
  isImporting: boolean;
  onImport: () => void | Promise<void>;
}

export function LibraryHero({ recentBook, recentChapter, isImporting, onImport }: LibraryHeroProps) {
  const readerHref = recentBook && recentChapter
    ? `/reader/${recentBook.id}/${recentChapter.id}`
    : null;
  const detailHref = recentBook ? `/book/${recentBook.id}` : null;

  return (
    <article className="route-hero-card library-hero-card">
      <div className="library-hero-copy">
        <p className="route-page-kicker">Library</p>
        <h3>{recentBook ? `继续《${recentBook.title}》` : '先把第一本书放进来'}</h3>
        <p>
          {recentBook
            ? `最近阅读停留在“${recentChapter?.title ?? '首章'}”。默认朗读走云端 TTS，本地模型仅在离线或隐私场景兜底。`
            : '导入 TXT 后，书库会自动生成章节索引、最近阅读入口和后续详情页跳转。'}
        </p>

        <div className="library-feature-row" aria-label="书库特性">
          <span className="library-feature-chip">默认首页</span>
          <span className="library-feature-chip">最近阅读</span>
          <span className="library-feature-chip">云端朗读优先</span>
        </div>
      </div>

      <div className="library-hero-side">
        <div className="library-metric-grid">
          <div>
            <span className="route-page-kicker">Progress</span>
            <strong>{recentBook ? `${recentBook.chapters.length} 章已索引` : '等待导入'}</strong>
          </div>
          <div>
            <span className="route-page-kicker">Current</span>
            <strong>{recentChapter?.title ?? '暂无最近章节'}</strong>
          </div>
        </div>

        <div className="route-hero-actions library-hero-actions">
          {readerHref ? (
            <Link to={readerHref} className="route-primary-link">
              继续阅读
            </Link>
          ) : (
            <button type="button" onClick={() => void onImport()} disabled={isImporting}>
              {isImporting ? '导入中…' : '导入第一本书'}
            </button>
          )}

          <button type="button" className="secondary" onClick={() => void onImport()} disabled={isImporting}>
            {isImporting ? '导入中…' : '导入新书'}
          </button>

          {detailHref ? (
            <Link to={detailHref} className="route-secondary-link">
              查看书籍详情
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}
