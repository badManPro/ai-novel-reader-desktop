import { useSettingsOutlet } from './useSettingsOutlet';

export function TtsSettingsPage() {
  const {
    providers,
    voices,
    selectedProviderId,
    selectedVoiceId,
    selectedSpeed,
    setSelectedProviderId,
    setSelectedVoiceId,
    setSelectedSpeed,
    currentProvider,
    speedOptions,
    saveTtsDefaults,
    previewTts
  } = useSettingsOutlet();

  return (
    <section className="settings-page-stack">
      <article className="route-card settings-route-card">
        <p className="route-page-kicker">TTS</p>
        <h4>默认朗读</h4>
        <p>把最常用的 Provider、音色和语速放在一起；真正的播放态势统一看底部 Player Dock。</p>

        <div className="settings-form-grid">
          <label>
            <span>语音引擎</span>
            <select value={selectedProviderId} onChange={(event) => setSelectedProviderId(event.target.value)}>
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>默认音色</span>
            <select value={selectedVoiceId} onChange={(event) => setSelectedVoiceId(event.target.value)}>
              {voices.map((voice) => (
                <option key={voice.id} value={voice.id}>
                  {voice.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>语速 / 倍速</span>
            <select value={selectedSpeed} onChange={(event) => setSelectedSpeed(Number(event.target.value))}>
              {speedOptions.map((speed) => (
                <option key={speed} value={speed}>
                  {speed}x
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="actions">
          <button type="button" onClick={() => void saveTtsDefaults()}>
            保存为默认
          </button>
          <button type="button" className="secondary" onClick={() => void previewTts()}>
            试听当前配置
          </button>
        </div>

        <small className="muted provider-note">
          {currentProvider?.description ?? '未选择 Provider'}
          {currentProvider?.requiresApiKey && !currentProvider.configured ? '（请先配置对应 API Key）' : ''}
        </small>
      </article>

      <article className="route-card settings-route-card">
        <p className="route-page-kicker">Modes</p>
        <h4>模式预览</h4>
        <ul className="route-list">
          <li>标准模式：优先日常整章朗读，底部 Dock 统一展示播放状态。</li>
          <li>隐私模式：后续 Step 7 在这里落地本地兜底策略与文案。</li>
          <li>角色模式：继续保留为高级能力，不抢占普通用户默认入口。</li>
        </ul>
      </article>
    </section>
  );
}
