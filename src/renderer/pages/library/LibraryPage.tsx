import { Link } from 'react-router-dom';

export function LibraryPage() {
  return (
    <section className="route-page">
      <article className="route-hero-card">
        <div>
          <p className="route-page-kicker">Step 1 Skeleton</p>
          <h3>书库已经成为默认首页</h3>
          <p>
            这一步先把应用入口从单一阅读工作台切到书库首页。Step 2 会继续把最近阅读、导入、
            删除和书架网格正式迁移进来。
          </p>
        </div>
        <div className="route-hero-actions">
          <Link to="/reader/demo-book/demo-chapter" className="route-primary-link">
            进入旧阅读工作区
          </Link>
          <Link to="/settings/tts" className="route-secondary-link">
            查看设置骨架
          </Link>
        </div>
      </article>

      <div className="route-card-grid">
        <article className="route-card">
          <p className="route-page-kicker">Continue Reading</p>
          <h4>当前阅读入口</h4>
          <p>保留旧 `ReaderShell` 作为过渡工作区，后续由阅读页和播放器 Dock 逐步替代。</p>
          <Link to="/reader/demo-book/demo-chapter" className="route-inline-link">
            打开阅读页
          </Link>
        </article>

        <article className="route-card">
          <p className="route-page-kicker">Book Detail</p>
          <h4>书籍详情页骨架</h4>
          <p>单本书的章节、进度和主操作会迁移到详情页，不再长期挤在左侧边栏。</p>
          <Link to="/book/demo-book" className="route-inline-link">
            查看详情页
          </Link>
        </article>

        <article className="route-card">
          <p className="route-page-kicker">Settings</p>
          <h4>设置路由已拆分</h4>
          <p>朗读、阅读、离线与模型、数据和关于的二级路径已经建好，后续逐步填充真实内容。</p>
          <Link to="/settings/tts" className="route-inline-link">
            打开设置
          </Link>
        </article>
      </div>
    </section>
  );
}
