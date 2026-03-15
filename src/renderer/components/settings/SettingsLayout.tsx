import { NavLink, Outlet } from 'react-router-dom';
import { useSettingsState } from '../../hooks/useSettingsState';

const tabs = [
  { to: '/settings/tts', label: '朗读', description: 'Provider、音色、语速与试听' },
  { to: '/settings/reading', label: '阅读', description: '字号、行高与主题' },
  { to: '/settings/offline', label: '离线与模型', description: '离线保底、健康检查与控制台' },
  { to: '/settings/data', label: '数据与缓存', description: '草稿队列、缓存占用与清理' },
  { to: '/settings/about', label: '关于', description: '版本、格式与隐私说明' }
];

export function SettingsLayout() {
  const state = useSettingsState();

  return (
    <section className="route-page settings-route-page">
      <aside className="settings-route-nav enhanced-settings-nav">
        <p className="route-page-kicker">Settings</p>
        <h3>设置中心</h3>
        <p>常用朗读与阅读偏好在前，高级离线能力和模型管理收进二级页，不再与阅读主链路混在一起。</p>

        <nav className="settings-route-tab-list" aria-label="设置子导航">
          {tabs.map((tab) => (
            <NavLink key={tab.to} to={tab.to} className={({ isActive }) => `settings-route-tab ${isActive ? 'active' : ''}`}>
              <span>{tab.label}</span>
              <small>{tab.description}</small>
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="settings-route-panel settings-route-panel-enhanced">
        {state.notices.length > 0 ? (
          <section className="warning-card">
            <strong>设置页提示</strong>
            <ul>
              {state.notices.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {state.actionMessage ? (
          <section className="info-card">
            <strong>设置操作</strong>
            <p>{state.actionMessage}</p>
          </section>
        ) : null}

        <Outlet context={state} />
      </div>
    </section>
  );
}
