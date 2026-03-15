import { Link, useParams } from 'react-router-dom';

export function BookDetailPage() {
  const { bookId } = useParams();

  return (
    <section className="route-page">
      <article className="route-hero-card compact">
        <div>
          <p className="route-page-kicker">Book Detail Skeleton</p>
          <h3>{bookId ?? '未指定书籍'}</h3>
          <p>Step 3 会把书籍元信息、进度、章节列表和“继续阅读 / 开始朗读”主操作迁移到这里。</p>
        </div>
        <div className="route-hero-actions">
          <Link to={`/reader/${bookId ?? 'demo-book'}/demo-chapter`} className="route-primary-link">
            打开阅读页
          </Link>
        </div>
      </article>

      <div className="route-card-grid two-up">
        <article className="route-card">
          <h4>将迁移到这里的内容</h4>
          <ul className="route-list">
            <li>书籍元信息与阅读进度</li>
            <li>章节列表与当前章节定位</li>
            <li>继续阅读 / 从当前章节朗读</li>
            <li>删除书籍与缓存清理</li>
          </ul>
        </article>
        <article className="route-card">
          <h4>当前状态</h4>
          <p>这一步只建路由骨架，不迁移真实书架和章节数据，避免在 Step 1 就碰大面积业务逻辑。</p>
        </article>
      </div>
    </section>
  );
}
