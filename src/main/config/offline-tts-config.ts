import path from 'node:path';
import type { OfflineEngineConfig, OfflineEngineId } from '../../shared/types';

const projectRoot = path.resolve(__dirname, '../../..');

function parseEnabled(envKey: string, fallback = true) {
  const raw = process.env[envKey];
  if (!raw) {
    return fallback;
  }
  return !['0', 'false', 'off', 'no'].includes(raw.toLowerCase());
}

function parseTimeout(envKey: string, fallback: number) {
  const raw = Number(process.env[envKey] ?? fallback);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

function normalizeBaseUrl(value: string) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function createEngineConfig(id: OfflineEngineId): OfflineEngineConfig {
  if (id === 'gpt-sovits-local') {
    return {
      id,
      providerId: id,
      name: 'GPT-SoVITS Local',
      protocol: 'gpt-sovits-v1',
      baseUrl: normalizeBaseUrl(process.env.GPTSOVITS_BASE_URL ?? 'http://127.0.0.1:9881'),
      healthPath: process.env.GPTSOVITS_HEALTH_PATH ?? '/docs',
      synthesizePath: process.env.GPTSOVITS_SYNTH_PATH ?? '/tts',
      voicesPath: process.env.GPTSOVITS_VOICES_PATH ?? '/voices',
      timeoutMs: parseTimeout('GPTSOVITS_TIMEOUT_MS', 120000),
      enabled: parseEnabled('GPTSOVITS_ENABLED', true),
      transport: 'binary-audio',
      audioFormat: 'wav',
      isPrimary: false,
      description: '本地角色声线 / 声音克隆引擎，适合人物化演绎。',
      startup: {
        mode: process.env.GPTSOVITS_START_MODE === 'spawn' ? 'spawn' : 'manual',
        command: process.env.GPTSOVITS_START_COMMAND ?? path.join(projectRoot, 'scripts/offline-tts/start-gpt-sovits.sh'),
        args: process.env.GPTSOVITS_START_ARGS?.split(' ').filter(Boolean) ?? [],
        cwd: process.env.GPTSOVITS_WORKDIR ?? path.join(projectRoot, 'scripts/offline-tts'),
        envFile: process.env.GPTSOVITS_ENV_FILE ?? path.join(projectRoot, 'scripts/offline-tts/gpt-sovits.env'),
        readyTimeoutMs: parseTimeout('GPTSOVITS_READY_TIMEOUT_MS', 180000),
        notes: '默认按手动模式处理；若配置为 spawn，可由主进程尝试拉起本地包装脚本。'
      }
    };
  }

  return {
    id,
    providerId: id,
    name: 'CosyVoice 300M SFT Local',
    protocol: 'cosyvoice-v1',
    baseUrl: normalizeBaseUrl(process.env.COSYVOICE_BASE_URL ?? 'http://127.0.0.1:9880'),
    healthPath: process.env.COSYVOICE_HEALTH_PATH ?? '/docs',
    synthesizePath: process.env.COSYVOICE_SYNTH_PATH ?? '/inference_sft',
    voicesPath: process.env.COSYVOICE_VOICES_PATH ?? '/voices',
    timeoutMs: parseTimeout('COSYVOICE_TIMEOUT_MS', 120000),
    enabled: parseEnabled('COSYVOICE_ENABLED', true),
    transport: 'binary-audio',
    audioFormat: 'wav',
    isPrimary: true,
    description: '本地离线主朗读引擎，优先走 /inference_sft + speaker-id 以承担整章与长文本朗读。',
    startup: {
      mode: process.env.COSYVOICE_START_MODE === 'spawn' ? 'spawn' : 'manual',
      command: process.env.COSYVOICE_START_COMMAND ?? path.join(projectRoot, 'scripts/offline-tts/start-cosyvoice.sh'),
      args: process.env.COSYVOICE_START_ARGS?.split(' ').filter(Boolean) ?? [],
      cwd: process.env.COSYVOICE_WORKDIR ?? path.join(projectRoot, 'scripts/offline-tts'),
      envFile: process.env.COSYVOICE_ENV_FILE ?? path.join(projectRoot, 'scripts/offline-tts/cosyvoice.env'),
      readyTimeoutMs: parseTimeout('COSYVOICE_READY_TIMEOUT_MS', 180000),
      notes: '默认按手动模式处理；若配置为 spawn，可由主进程尝试拉起本地包装脚本。'
    }
  };
}

export function getOfflineEngineConfigs(): OfflineEngineConfig[] {
  return [createEngineConfig('cosyvoice-local'), createEngineConfig('gpt-sovits-local')];
}

export function getOfflineEngineConfig(providerId: string) {
  return getOfflineEngineConfigs().find((item) => item.providerId === providerId);
}
