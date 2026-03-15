export function TtsSettingsPage() {
  return (
    <article className="route-card settings-route-card">
      <p className="route-page-kicker">TTS</p>
      <h4>朗读设置骨架</h4>
      <p>这里会承接默认朗读模式、云端 Provider、音色、语速和离线兜底策略。</p>
      <ul className="route-list">
        <li>标准模式：默认云端整章朗读</li>
        <li>隐私模式：本地轻量或系统朗读</li>
        <li>角色模式：本地角色声线扩展</li>
      </ul>
    </article>
  );
}
