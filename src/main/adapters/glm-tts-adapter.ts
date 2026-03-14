import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ModelProvider, TtsSpeakRequest, VoiceOption } from '../../shared/types';
import { SecureConfigService } from '../services/secure-config-service';

const secureConfigService = new SecureConfigService();

export const glmTtsProvider: ModelProvider = {
  id: 'glm-tts',
  name: 'GLM Voice',
  category: 'tts',
  kind: 'remote',
  requiresApiKey: true,
  configured: Boolean(process.env.GLM_API_KEY),
  description: '智谱 GLM 语音 Provider 骨架，优先读取环境变量，也可从 SecureConfigService 文件回退配置加载。'
};

export const glmVoices: VoiceOption[] = [
  { id: 'female-qingxin', name: 'female-qingxin', providerId: 'glm-tts', language: 'zh-CN', gender: 'female', description: 'GLM 中文清新女声。' },
  { id: 'male-shenchen', name: 'male-shenchen', providerId: 'glm-tts', language: 'zh-CN', gender: 'male', description: 'GLM 中文沉稳男声。' }
];

export async function synthesizeWithGlm(request: TtsSpeakRequest) {
  const secureConfig = await secureConfigService.getProviderSecret('glm-tts');
  const apiKey = secureConfig?.apiKey;
  const baseUrl = secureConfig?.baseUrl ?? 'https://open.bigmodel.cn/api/paas/v4';
  const model = secureConfig?.model ?? 'glm-4-voice';
  if (!apiKey) {
    throw new Error('未检测到 GLM API Key；请先设置 GLM_API_KEY，或写入 secure-provider-config.json。');
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
      format: 'mp3',
      speed: request.speed ?? 1
    })
  });

  if (!response.ok) {
    const reason = await response.text();
    throw new Error(`GLM Voice 请求失败：${response.status} ${reason}`);
  }

  const tempDir = await mkdtemp(path.join(tmpdir(), 'ai-novel-reader-glm-'));
  const target = path.join(tempDir, `${randomUUID()}.mp3`);
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(target, buffer);
  return target;
}
