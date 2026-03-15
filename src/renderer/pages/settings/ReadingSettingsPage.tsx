import { useSettingsOutlet } from './useSettingsOutlet';

export function ReadingSettingsPage() {
  const {
    settings,
    persistSettingsPatch,
    fontSizeOptions,
    lineHeightOptions,
    themeOptions
  } = useSettingsOutlet();

  return (
    <section className="settings-page-stack">
      <article className="route-card settings-route-card">
        <p className="route-page-kicker">Reading</p>
        <h4>阅读显示</h4>
        <p>这些设置会直接影响书籍详情页和阅读页的表现，不再夹杂在旧阅读工作台里。</p>

        <div className="settings-form-grid">
          <label>
            <span>字号</span>
            <select value={settings.fontSize} onChange={(event) => void persistSettingsPatch({ fontSize: Number(event.target.value) })}>
              {fontSizeOptions.map((size) => (
                <option key={size} value={size}>{size}px</option>
              ))}
            </select>
          </label>
          <label>
            <span>行高</span>
            <select value={settings.lineHeight} onChange={(event) => void persistSettingsPatch({ lineHeight: Number(event.target.value) })}>
              {lineHeightOptions.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            <span>主题</span>
            <select value={settings.theme} onChange={(event) => void persistSettingsPatch({ theme: event.target.value as typeof settings.theme })}>
              {themeOptions.map((theme) => (
                <option key={theme} value={theme}>{theme}</option>
              ))}
            </select>
          </label>
        </div>
      </article>

      <article className="route-card settings-route-card">
        <p className="route-page-kicker">Preview</p>
        <h4>当前阅读偏好</h4>
        <div className="book-summary-grid">
          <div>
            <span className="route-page-kicker">Font Size</span>
            <strong>{settings.fontSize}px</strong>
          </div>
          <div>
            <span className="route-page-kicker">Line Height</span>
            <strong>{settings.lineHeight}</strong>
          </div>
          <div>
            <span className="route-page-kicker">Theme</span>
            <strong>{settings.theme}</strong>
          </div>
          <div>
            <span className="route-page-kicker">Drawer</span>
            <strong>目录抽屉默认启用</strong>
          </div>
        </div>
      </article>
    </section>
  );
}
