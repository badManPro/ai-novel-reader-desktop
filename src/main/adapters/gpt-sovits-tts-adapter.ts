import type { ModelProvider, VoiceOption } from '../../shared/types';

export const gptSovitsProvider: ModelProvider = {
  id: 'gpt-sovits-local',
  name: 'GPT-SoVITS Local',
  category: 'tts',
  kind: 'local',
  configured: true,
  isPrimary: false,
  description: '离线角色引擎：负责声音克隆、角色化朗读与特殊声线。'
};

export const gptSovitsVoices: VoiceOption[] = [
  { id: 'gpt-sovits-default', name: 'GPT-SoVITS Default', providerId: 'gpt-sovits-local', language: 'zh-CN', description: '离线默认角色骨架音色。' },
  { id: 'gpt-sovits-role-a', name: 'GPT-SoVITS Role A', providerId: 'gpt-sovits-local', language: 'zh-CN', description: '角色音色占位符，用于后续声线资产接入。' }
];
