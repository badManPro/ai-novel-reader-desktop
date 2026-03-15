import { NavLink, Outlet } from 'react-router-dom';

const tabs = [
  { to: '/settings/tts', label: '朗读' },
  { to: '/settings/reading', label: '阅读' },
  { to: '/settings/offline', label: '离线与模型' },
  { to: '/settings/data', label: '数据与缓存' },
  { to: '/settings/about', label: '关于' }
];

export function SettingsPage() {
  return (
    <section className="route-page settings-route-page">
      <aside className="settings-route-nav">
        <p className="route-page-kicker">Settings Tabs</p>
        <h3>设置二级导航</h3>
        <p>Step 1 先固化信息架构，Step 6 再迁移真实设置表单和模型管理面板。</p>

        <nav className="settings-route-tab-list" aria-label="设置子导航">
          {tabs.map((tab) => (
            <NavLink key={tab.to} to={tab.to} className={({ isActive }) => `settings-route-tab ${isActive ? 'active' : ''}`}>
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="settings-route-panel">
        <Outlet />
      </div>
    </section>
  );
}
