import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ModelProvider, TtsSpeakRequest, VoiceOption } from '../../shared/types';
import { SecureConfigService } from '../services/secure-config-service';

const secureConfigService = new SecureConfigService();

export const openAiTtsProvider: ModelProvider = {
  id: 'openai-tts',
  name: 'OpenAI TTS',
  category: 'tts',
  kind: 'remote',
  requiresApiKey: true,
  configured: Boolean(process.env.OPENAI_API_KEY),
  description: '真实 Provider 适配器示例：优先读取环境变量，也可从 SecureConfigService 文件回退配置加载。'
};

export const openAiVoices: VoiceOption[] = [
  { id: 'alloy', name: 'alloy', providerId: 'openai-tts', language: 'multi', description: 'OpenAI 官方音色。' },
  { id: 'nova', name: 'nova', providerId: 'openai-tts', language: 'multi', description: 'OpenAI 官方音色。' },
  { id: 'shimmer', name: 'shimmer', providerId: 'openai-tts', language: 'multi', description: 'OpenAI 官方音色。' }
];

export async function synthesizeWithOpenAi(request: TtsSpeakRequest) {
  const secureConfig = await secureConfigService.getProviderSecret('openai-tts');
  const apiKey = secureConfig?.apiKey;
  const baseUrl = secureConfig?.baseUrl ?? 'https://api.openai.com/v1';
  const model = secureConfig?.model ?? 'gpt-4o-mini-tts';
  if (!apiKey) {
    throw new Error('未检测到 OpenAI API Key；请先设置 OPENAI_API_KEY，或写入 secure-provider-config.json。');
  }

  const response = await fetch(`${baseUrl}/audio/speech`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      voice: request.voiceId,
      input: request.text,
      format: 'mp3'
    })
  });

  if (!response.ok) {
    const reason = await response.text();
    throw new Error(`OpenAI TTS 请求失败：${response.status} ${reason}`);
  }

  const tempDir = await mkdtemp(path.join(tmpdir(), 'ai-novel-reader-tts-'));
  const target = path.join(tempDir, `${randomUUID()}.mp3`);
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(target, buffer);
  return target;
}
