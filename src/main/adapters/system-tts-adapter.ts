import type { ModelProvider, TtsSpeakRequest, VoiceOption } from '../../shared/types';

export const isMac = process.platform === 'darwin';

export const systemTtsProvider: ModelProvider = {
  id: 'system-say',
  name: isMac ? 'System Say (macOS)' : 'System TTS Fallback',
  category: 'tts',
  kind: 'system',
  configured: isMac,
  description: isMac ? '轻量本地隐私线路：使用 macOS say 命令直接朗读，不经过云端。' : '当前主要面向 macOS，其他平台可继续扩展本地朗读实现。'
};

export const systemVoices: VoiceOption[] = [
  {
    id: 'Ting-Ting',
    name: 'Ting-Ting',
    providerId: 'system-say',
    language: 'zh-CN',
    gender: 'female',
    description: 'macOS 中文女声。'
  },
  {
    id: 'Mei-Jia',
    name: 'Mei-Jia',
    providerId: 'system-say',
    language: 'zh-TW',
    gender: 'female',
    description: 'macOS 中文女声（繁体）。'
  },
  {
    id: 'Sin-ji',
    name: 'Sin-ji',
    providerId: 'system-say',
    language: 'zh-HK',
    gender: 'female',
    description: 'macOS 粤语音色。'
  }
];

export function buildSystemSayArgs(request: TtsSpeakRequest) {
  if (!isMac) {
    throw new Error('System Say fallback 当前仅在 macOS 上可用。');
  }

  const args = ['-v', request.voiceId];
  if (request.speed && Number.isFinite(request.speed)) {
    args.push('-r', String(Math.max(90, Math.min(360, Math.round(request.speed * 175)))));
  }
  args.push(request.text);
  return args;
}
