import { useSettingsOutlet } from './useSettingsOutlet';
import { TTS_MODE_LABELS } from '../../../shared/tts-strategy';
import type { TtsMode } from '../../../shared/types';

const modeDescriptions: Record<TtsMode, string> = {
  standard: '云端整章朗读优先，失败时自动切到本地兜底。',
  privacy: '只走本地或系统语音，不上传正文。',
  character: '本地角色声线与克隆能力，保留在高级模式。'
};

export function TtsSettingsPage() {
  const {
    modeProviders,
    selectedMode,
    voices,
    selectedProviderId,
    selectedVoiceId,
    selectedSpeed,
    setSelectedMode,
    setSelectedProviderId,
    setSelectedVoiceId,
    setSelectedSpeed,
    draftStrategy,
    currentProvider,
    speedOptions,
    saveTtsDefaults,
    previewTts
  } = useSettingsOutlet();

  return (
    <section className="settings-page-stack">
      <article className="route-card settings-route-card">
        <p className="route-page-kicker">TTS</p>
        <h4>默认朗读策略</h4>
        <p>先选主模式，再配置当前模式对应的 Provider、音色和语速；真正的播放态势统一看底部 Player Dock。</p>

        <div className="route-card-grid">
          {(Object.keys(modeDescriptions) as TtsMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              className={`settings-route-tab ${selectedMode === mode ? 'active' : ''}`}
              onClick={() => setSelectedMode(mode)}
            >
              <strong>{TTS_MODE_LABELS[mode]}</strong>
              <small>{modeDescriptions[mode]}</small>
            </button>
          ))}
        </div>

        <div className="settings-form-grid">
          <label>
            <span>当前模式 Provider</span>
            <select value={selectedProviderId} onChange={(event) => setSelectedProviderId(event.target.value)}>
              {modeProviders.map((provider) => (
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
            保存默认策略
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
        <h4>策略落点</h4>
        <div className="route-card-grid">
          <section className="settings-metric-card">
            <p className="route-page-kicker">Standard</p>
            <strong>{draftStrategy.standard.providerId}</strong>
            <p>音色：{draftStrategy.standard.voiceId}</p>
            <p>失败后兜底：{draftStrategy.fallback?.providerId ?? '无'}</p>
          </section>
          <section className="settings-metric-card">
            <p className="route-page-kicker">Privacy</p>
            <strong>{draftStrategy.privacy.providerId}</strong>
            <p>音色：{draftStrategy.privacy.voiceId}</p>
            <p>本模式下不走云端。</p>
          </section>
          <section className="settings-metric-card">
            <p className="route-page-kicker">Character</p>
            <strong>{draftStrategy.character.providerId}</strong>
            <p>音色：{draftStrategy.character.voiceId}</p>
            <p>作为高级能力保留，不抢默认入口。</p>
          </section>
        </div>
      </article>
    </section>
  );
}
