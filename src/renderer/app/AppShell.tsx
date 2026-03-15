import { NavLink, Outlet, useLocation } from 'react-router-dom';

function getPageMeta(pathname: string) {
  if (pathname.startsWith('/book/')) {
    return {
      eyebrow: 'Book Detail',
      title: '书籍详情',
      description: '单本书的章节、进度、继续阅读与朗读操作已经迁移到这里，阅读页后续再进一步收窄职责。'
    };
  }

  if (pathname.startsWith('/settings')) {
    return {
      eyebrow: 'Settings',
      title: '设置中心',
      description: '朗读、阅读、离线、数据与关于已拆成独立子页，常用设置与高级能力不再混在一个大面板里。'
    };
  }

  return {
    eyebrow: 'Library',
    title: '书库',
    description: '新的默认首页已经接入真实书架数据；下一步会继续把章节与主操作迁移到书籍详情页。'
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
          <p className="app-shell-caption">书库、详情、阅读和设置都已切到新页面结构，旧 `ReaderShell` 仅作为过渡工作台保留。</p>
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
          <p>默认云端朗读，本地离线兜底。当前优先把“导入书、进入书、继续读”打通成用户主路径。</p>
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
