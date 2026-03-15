import { useSettingsOutlet } from './useSettingsOutlet';

export function AboutSettingsPage() {
  const { api } = useSettingsOutlet();

  return (
    <section className="settings-page-stack">
      <article className="route-card settings-route-card">
        <p className="route-page-kicker">About</p>
        <h4>应用信息</h4>
        <div className="book-summary-grid">
          <div>
            <span className="route-page-kicker">App</span>
            <strong>{api?.appName ?? 'AI Novel Reader'}</strong>
          </div>
          <div>
            <span className="route-page-kicker">Version</span>
            <strong>{api?.version ?? 'unknown'}</strong>
          </div>
          <div>
            <span className="route-page-kicker">Formats</span>
            <strong>{api?.capabilities.formats.join(', ') ?? 'txt'}</strong>
          </div>
          <div>
            <span className="route-page-kicker">Providers</span>
            <strong>{api?.capabilities.providers.length ?? 0} 个</strong>
          </div>
        </div>
      </article>

      <article className="route-card settings-route-card">
        <p className="route-page-kicker">Policy</p>
        <h4>产品说明</h4>
        <ul className="route-list">
          <li>默认体验优先面向云端整章朗读，本地模型作为离线与隐私场景兜底。</li>
          <li>播放状态统一由底部 Player Dock 承接，设置页不重复展示播放器主面板。</li>
          <li>离线模型管理属于高级能力，集中放在“离线与模型”子页中。</li>
        </ul>
      </article>
    </section>
  );
}
