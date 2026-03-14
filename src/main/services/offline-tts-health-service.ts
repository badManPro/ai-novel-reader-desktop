import type { OfflineEngineConfig, OfflineEngineHealth } from '../../shared/types';

export class OfflineTtsHealthService {
  async check(config: OfflineEngineConfig): Promise<OfflineEngineHealth> {
    const checkedAt = new Date().toISOString();
    const endpoint = `${config.baseUrl}${config.healthPath}`;

    if (!config.enabled) {
      return {
        engineId: config.id,
        providerId: config.providerId,
        status: 'disabled',
        checkedAt,
        endpoint,
        message: '本地引擎已在配置中禁用。'
      };
    }

    const startedAt = Date.now();
    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        signal: AbortSignal.timeout(Math.max(1000, config.timeoutMs))
      });

      const latencyMs = Date.now() - startedAt;
      if (!response.ok) {
        return {
          engineId: config.id,
          providerId: config.providerId,
          status: 'degraded',
          checkedAt,
          endpoint,
          latencyMs,
          message: `健康检查返回异常状态：${response.status}`
        };
      }

      return {
        engineId: config.id,
        providerId: config.providerId,
        status: 'healthy',
        checkedAt,
        endpoint,
        latencyMs,
        message: '本地离线 TTS 服务可用。'
      };
    } catch (error) {
      return {
        engineId: config.id,
        providerId: config.providerId,
        status: 'unreachable',
        checkedAt,
        endpoint,
        latencyMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : '无法连接本地离线 TTS 服务。'
      };
    }
  }

  async checkAll(configs: OfflineEngineConfig[]) {
    return Promise.all(configs.map((config) => this.check(config)));
  }
}
