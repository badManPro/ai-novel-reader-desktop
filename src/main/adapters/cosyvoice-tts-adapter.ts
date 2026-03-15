import type { ModelProvider, VoiceOption } from '../../shared/types';

export const cosyVoiceProvider: ModelProvider = {
  id: 'cosyvoice-local',
  name: 'CosyVoice Local Fallback',
  category: 'tts',
  kind: 'local',
  configured: true,
  isPrimary: false,
  description: '本地隐私与离线兜底线路：适合无网、隐私优先和云端失败时继续朗读。'
};

export const cosyVoiceVoices: VoiceOption[] = [
  { id: '中文女', name: '中文女', providerId: 'cosyvoice-local', language: 'zh-CN', gender: 'female', description: 'CosyVoice-300M-SFT 官方中文女说话人。' },
  { id: '中文男', name: '中文男', providerId: 'cosyvoice-local', language: 'zh-CN', gender: 'male', description: 'CosyVoice-300M-SFT 官方中文男说话人。' },
  { id: '日语男', name: '日语男', providerId: 'cosyvoice-local', language: 'ja-JP', gender: 'male', description: 'CosyVoice-300M-SFT 官方日语男说话人。' },
  { id: '粤语女', name: '粤语女', providerId: 'cosyvoice-local', language: 'zh-HK', gender: 'female', description: 'CosyVoice-300M-SFT 官方粤语女说话人。' },
  { id: '英文女', name: '英文女', providerId: 'cosyvoice-local', language: 'en-US', gender: 'female', description: 'CosyVoice-300M-SFT 官方英文女说话人。' },
  { id: '英文男', name: '英文男', providerId: 'cosyvoice-local', language: 'en-US', gender: 'male', description: 'CosyVoice-300M-SFT 官方英文男说话人。' }
];
