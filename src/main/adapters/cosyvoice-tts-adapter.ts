import type { ModelProvider, VoiceOption } from '../../shared/types';

export const cosyVoiceProvider: ModelProvider = {
  id: 'cosyvoice-local',
  name: 'CosyVoice 300M SFT Local',
  category: 'tts',
  kind: 'local',
  configured: true,
  isPrimary: true,
  description: '离线主引擎：优先走 CosyVoice 官方 /inference_sft + speaker-id 朗读链路。'
};

export const cosyVoiceVoices: VoiceOption[] = [
  { id: '中文女', name: '中文女', providerId: 'cosyvoice-local', language: 'zh-CN', gender: 'female', description: 'CosyVoice-300M-SFT 官方中文女说话人。' },
  { id: '中文男', name: '中文男', providerId: 'cosyvoice-local', language: 'zh-CN', gender: 'male', description: 'CosyVoice-300M-SFT 官方中文男说话人。' },
  { id: '日语男', name: '日语男', providerId: 'cosyvoice-local', language: 'ja-JP', gender: 'male', description: 'CosyVoice-300M-SFT 官方日语男说话人。' },
  { id: '粤语女', name: '粤语女', providerId: 'cosyvoice-local', language: 'zh-HK', gender: 'female', description: 'CosyVoice-300M-SFT 官方粤语女说话人。' },
  { id: '英文女', name: '英文女', providerId: 'cosyvoice-local', language: 'en-US', gender: 'female', description: 'CosyVoice-300M-SFT 官方英文女说话人。' },
  { id: '英文男', name: '英文男', providerId: 'cosyvoice-local', language: 'en-US', gender: 'male', description: 'CosyVoice-300M-SFT 官方英文男说话人。' }
];
