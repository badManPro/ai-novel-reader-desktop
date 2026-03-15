import { NavLink, Outlet, useLocation } from 'react-router-dom';

function getPageMeta(pathname: string) {
  if (pathname.startsWith('/book/')) {
    return {
      eyebrow: 'Book Detail',
      title: '书籍详情',
      description: '承接单本书的章节、进度和主操作，后续在 Step 3 迁移完整书籍工作流。'
    };
  }

  if (pathname.startsWith('/settings')) {
    return {
      eyebrow: 'Settings',
      title: '设置中心',
      description: 'Step 1 先建立设置路由骨架，Step 6 再拆成朗读、阅读、离线、数据和关于五个子页。'
    };
  }

  return {
    eyebrow: 'Library',
    title: '书库',
    description: '新的默认首页。Step 2 会把最近阅读、导入入口和书架卡片正式迁移到这里。'
  };
}

export function AppShell() {
  const location = useLocation();
  const meta = getPageMeta(location.pathname);

  return (
    <div className="app-shell">
      <aside className="app-shell-sidebar">
        <div className="app-shell-brand">
          <p className="app-shell-kicker">AI Novel Reader</p>
          <h1>Consumer Refactor</h1>
          <p className="app-shell-caption">Step 1 已切入 App Shell 和页面骨架，旧阅读工作台先保留复用。</p>
        </div>

        <nav className="app-shell-nav" aria-label="主导航">
          <NavLink to="/library" className={({ isActive }) => `app-shell-nav-link ${isActive ? 'active' : ''}`}>
            书库
          </NavLink>
          <NavLink to="/book/demo-book" className={({ isActive }) => `app-shell-nav-link ${isActive ? 'active' : ''}`}>
            书籍详情
          </NavLink>
          <NavLink to="/settings/tts" className={({ isActive }) => `app-shell-nav-link ${isActive ? 'active' : ''}`}>
            设置
          </NavLink>
          <NavLink to="/reader/demo-book/demo-chapter" className="app-shell-nav-link ghost">
            当前阅读
          </NavLink>
        </nav>

        <div className="app-shell-sidebar-footer">
          <span className="app-shell-status-pill">Cloud-first TTS</span>
          <p>默认云端朗读，本地离线兜底。阅读工作区仍由旧 `ReaderShell` 承接，后续步骤逐步迁移。</p>
        </div>
      </aside>

      <div className="app-shell-main">
        <header className="app-shell-header">
          <div>
            <p className="app-shell-kicker">{meta.eyebrow}</p>
            <h2>{meta.title}</h2>
            <p className="app-shell-caption">{meta.description}</p>
          </div>
          <div className="app-shell-header-actions">
            <NavLink to="/library" className="app-shell-action secondary">
              返回书库
            </NavLink>
            <NavLink to="/settings/tts" className="app-shell-action secondary">
              打开设置
            </NavLink>
            <NavLink to="/reader/demo-book/demo-chapter" className="app-shell-action">
              打开阅读工作区
            </NavLink>
          </div>
        </header>

        <main className="app-shell-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
