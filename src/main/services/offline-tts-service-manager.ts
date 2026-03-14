import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import type { OfflineEngineConfig, OfflineEngineId, OfflineServiceStatus } from '../../shared/types';
import { getOfflineEngineConfig, getOfflineEngineConfigs } from '../config/offline-tts-config';
import { OfflineTtsHealthService } from './offline-tts-health-service';

interface ManagedProcessRecord {
  process: ChildProcessWithoutNullStreams;
  status: OfflineServiceStatus;
}

export class OfflineTtsServiceManager {
  private readonly processMap = new Map<OfflineEngineId, ManagedProcessRecord>();
  private readonly healthService = new OfflineTtsHealthService();

  async getStatusList(): Promise<OfflineServiceStatus[]> {
    const configs = getOfflineEngineConfigs();
    const healthList = await this.healthService.checkAll(configs);

    return configs.map((config) => {
      const running = this.processMap.get(config.providerId);
      const health = healthList.find((item) => item.providerId === config.providerId);
      if (running) {
        return {
          ...running.status,
          status: health?.status === 'healthy' ? 'running' : running.status.status,
          message: health?.message ?? running.status.message,
          updatedAt: new Date().toISOString()
        } satisfies OfflineServiceStatus;
      }

      return {
        providerId: config.providerId,
        status: config.startup.mode === 'spawn' ? 'idle' : 'manual',
        endpoint: `${config.baseUrl}${config.synthesizePath}`,
        startupMode: config.startup.mode,
        message: config.startup.mode === 'spawn'
          ? '尚未启动本地包装脚本。'
          : (config.startup.notes ?? '请按文档手动启动本地服务。'),
        command: config.startup.command,
        args: config.startup.args,
        cwd: config.startup.cwd,
        envFile: config.startup.envFile,
        updatedAt: new Date().toISOString()
      } satisfies OfflineServiceStatus;
    });
  }

  async ensureReady(providerId: string) {
    const config = getOfflineEngineConfig(providerId);
    if (!config) {
      return;
    }

    const health = await this.healthService.check(config);
    if (health.status === 'healthy' || config.startup.mode !== 'spawn') {
      return;
    }

    if (this.processMap.has(config.providerId)) {
      return;
    }

    await this.start(config.providerId);
  }

  async start(providerId: OfflineEngineId) {
    const config = getOfflineEngineConfig(providerId);
    if (!config) {
      throw new Error(`未找到离线引擎配置：${providerId}`);
    }

    if (config.startup.mode !== 'spawn') {
      throw new Error(`${config.name} 当前配置为手动模式，请先按 README 启动服务。`);
    }

    return this.launch(providerId);
  }

  async launch(providerId: OfflineEngineId) {
    const config = getOfflineEngineConfig(providerId);
    if (!config) {
      throw new Error(`未找到离线引擎配置：${providerId}`);
    }

    if (!config.startup.command) {
      throw new Error(`${config.name} 未配置启动命令。`);
    }

    if (this.processMap.has(config.providerId)) {
      return this.processMap.get(config.providerId)?.status;
    }

    const child = spawn(config.startup.command, config.startup.args ?? [], {
      cwd: config.startup.cwd,
      env: {
        ...process.env,
        ...(await this.loadEnvFile(config.startup.envFile))
      },
      stdio: 'pipe',
      shell: true
    }) as ChildProcessWithoutNullStreams;

    const status: OfflineServiceStatus = {
      providerId: config.providerId,
      status: 'starting',
      pid: child.pid,
      endpoint: `${config.baseUrl}${config.synthesizePath}`,
      startupMode: config.startup.mode,
      message: `正在启动 ${config.name} 本地包装脚本。`,
      command: config.startup.command,
      args: config.startup.args,
      cwd: config.startup.cwd,
      envFile: config.startup.envFile,
      updatedAt: new Date().toISOString()
    };

    this.processMap.set(config.providerId, { process: child, status });

    child.once('exit', (code, signal) => {
      this.processMap.delete(config.providerId);
      status.status = code === 0 || signal === 'SIGTERM' ? 'idle' : 'error';
      status.message = `本地包装脚本已退出：code=${code ?? 'unknown'} signal=${signal ?? 'none'}`;
      status.updatedAt = new Date().toISOString();
    });

    await this.waitUntilHealthy(config);
    status.status = 'running';
    status.message = `${config.name} 本地包装脚本已就绪。`;
    status.updatedAt = new Date().toISOString();
    return status;
  }

  async stop(providerId: OfflineEngineId) {
    const record = this.processMap.get(providerId);
    if (!record) {
      return;
    }
    record.process.kill('SIGTERM');
    this.processMap.delete(providerId);
  }

  private async waitUntilHealthy(config: OfflineEngineConfig) {
    const timeoutAt = Date.now() + (config.startup.readyTimeoutMs ?? 180000);
    while (Date.now() < timeoutAt) {
      const health = await this.healthService.check(config);
      if (health.status === 'healthy') {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    throw new Error(`${config.name} 启动超时，健康检查仍未通过。`);
  }

  private async loadEnvFile(filePath?: string) {
    if (!filePath) {
      return {};
    }

    try {
      const content = await readFile(filePath, 'utf8');
      return Object.fromEntries(
        content
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter((line) => line && !line.startsWith('#') && line.includes('='))
          .map((line) => {
            const index = line.indexOf('=');
            const key = line.slice(0, index).trim();
            const value = line.slice(index + 1).trim();
            return [key, value];
          })
      );
    } catch {
      return {};
    }
  }
}
