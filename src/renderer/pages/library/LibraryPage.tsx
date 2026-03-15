import { LibraryBookCard } from '../../components/library/LibraryBookCard';
import { LibraryHero } from '../../components/library/LibraryHero';
import { useLibraryState } from '../../hooks/useLibraryState';

export function LibraryPage() {
  const {
    bookshelf,
    recentBook,
    isLoading,
    isImporting,
    deletingBookId,
    importWarnings,
    bookActionMessage,
    handleDeleteBook,
    handleImport,
    getBookProgressChapter
  } = useLibraryState();
  const recentChapter = recentBook ? getBookProgressChapter(recentBook) : null;

  return (
    <section className="route-page library-page">
      <LibraryHero
        recentBook={recentBook}
        recentChapter={recentChapter}
        isImporting={isImporting}
        onImport={handleImport}
      />

      {importWarnings.length > 0 ? (
        <section className="warning-card">
          <strong>书库提示</strong>
          <ul>
            {importWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {bookActionMessage ? (
        <section className="info-card">
          <strong>书库操作</strong>
          <p>{bookActionMessage}</p>
        </section>
      ) : null}

      <section className="route-card recent-reading-card">
        <div className="library-section-heading">
          <div>
            <p className="route-page-kicker">Recent Reading</p>
            <h4>最近阅读</h4>
          </div>
          <span className="library-section-meta">{bookshelf.length} 本已入库</span>
        </div>

        {recentBook ? (
          <div className="library-recent-grid">
            <div className="library-recent-highlight">
              <strong>{recentBook.title}</strong>
              <p>{recentChapter?.title ?? '首章'} · {recentBook.chapters.length} 章 · {recentBook.format.toUpperCase()}</p>
            </div>
            <p className="library-recent-copy">
              默认继续阅读和朗读都从最近位置进入；书籍详情页会在下一步继续承接章节导航和更完整的书籍操作。
            </p>
          </div>
        ) : (
          <p className="library-empty-copy">当前还没有书。先导入一本 TXT，书库页会自动显示最近阅读和书籍卡片。</p>
        )}
      </section>

      <section className="route-page">
        <div className="library-section-heading">
          <div>
            <p className="route-page-kicker">My Library</p>
            <h4>我的书库</h4>
          </div>
          <span className="library-section-meta">{isLoading ? '加载中…' : `按最近导入排序`}</span>
        </div>

        {bookshelf.length ? (
          <div className="library-card-grid">
            {bookshelf.map((book) => (
              <LibraryBookCard
                key={book.id}
                book={book}
                progressChapter={getBookProgressChapter(book)}
                isRecent={book.id === recentBook?.id}
                isDeleting={deletingBookId === book.id}
                onDelete={handleDeleteBook}
              />
            ))}
          </div>
        ) : (
          <article className="route-card library-empty-state">
            <p className="route-page-kicker">Empty State</p>
            <h4>书库还是空的</h4>
            <p>支持先从 TXT 导入。后续会在设置与关于页补齐格式说明与数据管理。</p>
            <button type="button" onClick={() => void handleImport()} disabled={isImporting}>
              {isImporting ? '导入中…' : '导入 TXT'}
            </button>
          </article>
        )}
      </section>
    </section>
  );
}
