import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { OfflineEngineConfig, OfflineEngineHealth, OfflineSynthesisResult, TtsSpeakRequest, VoiceOption } from '../../shared/types';
import { getOfflineEngineConfig, getOfflineEngineConfigs } from '../config/offline-tts-config';
import { OfflineTtsHealthService } from './offline-tts-health-service';
import { buildOfflineSynthesisRequest, parseOfflineSynthesisResponse, parseVoiceList } from './offline-tts-protocol';
import { OfflineTtsServiceManager } from './offline-tts-service-manager';

export class OfflineTtsServiceError extends Error {
  constructor(
    message: string,
    public readonly code: 'ENGINE_NOT_FOUND' | 'ENGINE_UNHEALTHY' | 'SYNTHESIS_FAILED' | 'INVALID_RESPONSE',
    public readonly providerId?: string,
    public readonly details?: string
  ) {
    super(message);
    this.name = 'OfflineTtsServiceError';
  }
}

function buildWavFromPcm16le(pcm: Buffer, sampleRate: number, channels = 1) {
  const bitsPerSample = 16;
  const byteRate = sampleRate * channels * bitsPerSample / 8;
  const blockAlign = channels * bitsPerSample / 8;
  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]);
}

export class OfflineTtsService {
  private readonly healthService = new OfflineTtsHealthService();
  private readonly serviceManager = new OfflineTtsServiceManager();

  getConfigs() {
    return getOfflineEngineConfigs();
  }

  async getHealthSnapshot(): Promise<OfflineEngineHealth[]> {
    return this.healthService.checkAll(this.getConfigs());
  }

  async getServiceStatus() {
    return this.serviceManager.getStatusList();
  }

  async listVoices(providerId: string): Promise<VoiceOption[]> {
    const config = getOfflineEngineConfig(providerId);
    if (!config || !config.voicesPath) {
      return [];
    }

    const health = await this.healthService.check(config);
    if (health.status !== 'healthy') {
      return [];
    }

    try {
      const response = await fetch(`${config.baseUrl}${config.voicesPath}`, {
        method: 'GET',
        signal: AbortSignal.timeout(Math.max(1000, config.timeoutMs))
      });

      if (!response.ok) {
        return [];
      }

      const payload = await response.json();
      return parseVoiceList(config, payload);
    } catch {
      return [];
    }
  }

  async synthesize(request: TtsSpeakRequest): Promise<OfflineSynthesisResult> {
    const config = getOfflineEngineConfig(request.providerId);
    if (!config) {
      throw new OfflineTtsServiceError(`未找到离线引擎配置：${request.providerId}`, 'ENGINE_NOT_FOUND', request.providerId);
    }

    await this.serviceManager.ensureReady(config.providerId);

    const health = await this.healthService.check(config);
    if (health.status !== 'healthy') {
      throw new OfflineTtsServiceError(
        `离线语音引擎不可用：${config.name}（${health.message}）`,
        'ENGINE_UNHEALTHY',
        config.providerId,
        health.message
      );
    }

    return this.requestSynthesis(config, request);
  }

  private async requestSynthesis(config: OfflineEngineConfig, request: TtsSpeakRequest): Promise<OfflineSynthesisResult> {
    const endpoint = `${config.baseUrl}${config.synthesizePath}`;

    const synthesisRequest = buildOfflineSynthesisRequest(config, request);

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: synthesisRequest.headers,
        body: synthesisRequest.body,
        signal: AbortSignal.timeout(Math.max(1000, config.timeoutMs))
      });
    } catch (error) {
      throw new OfflineTtsServiceError(
        `离线语音服务请求失败：${config.name}`,
        'SYNTHESIS_FAILED',
        config.providerId,
        error instanceof Error ? error.message : 'unknown error'
      );
    }

    if (!response.ok) {
      const reason = await response.text().catch(() => 'unknown error');
      throw new OfflineTtsServiceError(
        `离线语音服务返回异常：${response.status}`,
        'SYNTHESIS_FAILED',
        config.providerId,
        reason
      );
    }

    const parsed = await parseOfflineSynthesisResponse(response);
    if (parsed.kind === 'json') {
      if (parsed.audioPath) {
        return {
          providerId: config.providerId,
          audioPath: parsed.audioPath,
          contentType: parsed.contentType
        };
      }

      if (parsed.audioBase64) {
        const tempDir = await mkdtemp(path.join(tmpdir(), 'ai-novel-reader-offline-tts-'));
        const audioPath = path.join(tempDir, `${randomUUID()}.${config.audioFormat}`);
        await writeFile(audioPath, Buffer.from(parsed.audioBase64, 'base64'));
        return {
          providerId: config.providerId,
          audioPath,
          contentType: parsed.contentType
        };
      }

      throw new OfflineTtsServiceError(
        parsed.message ?? '离线引擎未返回可识别音频结果。',
        'INVALID_RESPONSE',
        config.providerId
      );
    }

    const tempDir = await mkdtemp(path.join(tmpdir(), 'ai-novel-reader-offline-tts-'));
    const audioPath = path.join(tempDir, `${randomUUID()}.${config.audioFormat}`);
    const buffer = Buffer.from(parsed.arrayBuffer);

    if (!parsed.contentType.startsWith('audio/')) {
      if (config.protocol === 'cosyvoice-v1' && parsed.contentType === 'application/octet-stream') {
        const wavBuffer = buildWavFromPcm16le(buffer, 22050, 1);
        await writeFile(audioPath, wavBuffer);
        return {
          providerId: config.providerId,
          audioPath,
          contentType: 'audio/wav'
        };
      }

      throw new OfflineTtsServiceError(
        `离线引擎返回了不支持的内容类型：${parsed.contentType}`,
        'INVALID_RESPONSE',
        config.providerId
      );
    }

    await writeFile(audioPath, buffer);

    return {
      providerId: config.providerId,
      audioPath,
      contentType: parsed.contentType
    };
  }
}
