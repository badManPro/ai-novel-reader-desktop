import { access, readFile } from 'node:fs/promises';
import type { OfflineEngineConfig, OfflineEngineHealth, OfflineEngineId, OfflineServiceStatus } from '../../shared/types';
import { getOfflineEngineConfig, getOfflineEngineConfigs } from '../config/offline-tts-config';
import { OfflineTtsHealthService } from './offline-tts-health-service';
import { OfflineTtsServiceManager } from './offline-tts-service-manager';

export interface OfflineEngineEnvCheckResult {
  providerId: OfflineEngineId;
  ok: boolean;
  summary: string;
  checkedAt: string;
  details: string[];
}

export interface OfflineEngineActionResult {
  providerId: OfflineEngineId;
  ok: boolean;
  action: 'check-env' | 'start';
  summary: string;
  detail?: string;
  checkedAt: string;
}

export interface OfflineEngineConsoleSnapshot {
  providerId: OfflineEngineId;
  name: string;
  description: string;
  isPrimary: boolean;
  baseUrl: string;
  healthPath: string;
  synthesizePath: string;
  voicesPath?: string;
  startupMode: OfflineEngineConfig['startup']['mode'];
  startupCommand?: string;
  startupArgs: string[];
  cwd?: string;
  envFile?: string;
  config: OfflineEngineConfig;
  health: OfflineEngineHealth;
  serviceStatus?: OfflineServiceStatus;
  envCheck?: OfflineEngineEnvCheckResult;
}

export class OfflineTtsConsoleService {
  private readonly healthService = new OfflineTtsHealthService();
  private readonly serviceManager = new OfflineTtsServiceManager();

  async getSnapshot(): Promise<OfflineEngineConsoleSnapshot[]> {
    const configs = getOfflineEngineConfigs();
    const [healthList, statusList] = await Promise.all([
      this.healthService.checkAll(configs),
      this.serviceManager.getStatusList()
    ]);

    return configs.map((config) => ({
      providerId: config.providerId,
      name: config.name,
      description: config.description,
      isPrimary: config.isPrimary,
      baseUrl: config.baseUrl,
      healthPath: config.healthPath,
      synthesizePath: config.synthesizePath,
      voicesPath: config.voicesPath,
      startupMode: config.startup.mode,
      startupCommand: config.startup.command,
      startupArgs: config.startup.args ?? [],
      cwd: config.startup.cwd,
      envFile: config.startup.envFile,
      config,
      health: healthList.find((item) => item.providerId === config.providerId) ?? {
        engineId: config.id,
        providerId: config.providerId,
        status: 'unreachable',
        checkedAt: new Date().toISOString(),
        endpoint: `${config.baseUrl}${config.healthPath}`,
        message: '未取到健康检查结果。'
      },
      serviceStatus: statusList.find((item) => item.providerId === config.providerId)
    }));
  }

  async checkEnvironment(providerId: OfflineEngineId): Promise<OfflineEngineActionResult> {
    const result = await this.inspectEnvironment(providerId);
    return {
      providerId,
      ok: result.ok,
      action: 'check-env',
      summary: result.summary,
      detail: result.details.join('\n'),
      checkedAt: result.checkedAt
    };
  }

  async startEngine(providerId: OfflineEngineId): Promise<OfflineEngineActionResult> {
    const config = getOfflineEngineConfig(providerId);
    if (!config) {
      return {
        providerId,
        ok: false,
        action: 'start',
        summary: `未找到离线引擎配置：${providerId}`,
        checkedAt: new Date().toISOString()
      };
    }

    try {
      await this.serviceManager.launch(providerId);
      const health = await this.healthService.check(config);
      return {
        providerId,
        ok: health.status === 'healthy',
        action: 'start',
        summary: health.status === 'healthy'
          ? `${config.name} 已启动并通过健康检查。`
          : `${config.name} 已触发启动脚本，但健康检查仍为 ${health.status}。`,
        detail: health.message,
        checkedAt: new Date().toISOString()
      };
    } catch (error) {
      return {
        providerId,
        ok: false,
        action: 'start',
        summary: `${config.name} 启动失败。`,
        detail: error instanceof Error ? error.message : 'unknown error',
        checkedAt: new Date().toISOString()
      };
    }
  }

  private async inspectEnvironment(providerId: OfflineEngineId): Promise<OfflineEngineEnvCheckResult> {
    const config = getOfflineEngineConfig(providerId);
    const checkedAt = new Date().toISOString();
    if (!config) {
      return {
        providerId,
        ok: false,
        summary: `未找到离线引擎配置：${providerId}`,
        checkedAt,
        details: [`providerId=${providerId}`]
      };
    }

    const details: string[] = [];
    let ok = true;

    const checks = [
      ['启动脚本', config.startup.command],
      ['工作目录', config.startup.cwd],
      ['环境文件', config.startup.envFile]
    ] as const;

    for (const [label, target] of checks) {
      if (!target) {
        ok = false;
        details.push(`❌ ${label} 未配置`);
        continue;
      }
      try {
        await access(target);
        details.push(`✅ ${label} 存在：${target}`);
      } catch {
        ok = false;
        details.push(`❌ ${label} 不存在：${target}`);
      }
    }

    const envVars = await this.readEnvFile(config.startup.envFile);
    if (Object.keys(envVars).length === 0) {
      details.push('⚠️ 环境文件为空、缺失或没有可解析的 KEY=VALUE。');
    }

    const repoDirKey = providerId === 'cosyvoice-local' ? 'COSYVOICE_MODEL_DIR' : 'GPTSOVITS_MODEL_DIR';
    const pythonKey = providerId === 'cosyvoice-local' ? 'COSYVOICE_PYTHON' : 'GPTSOVITS_PYTHON';
    const entryKey = providerId === 'cosyvoice-local' ? 'COSYVOICE_ENTRY' : 'GPTSOVITS_ENTRY';
    const extraArgsKey = providerId === 'cosyvoice-local' ? 'COSYVOICE_EXTRA_ARGS' : 'GPTSOVITS_EXTRA_ARGS';

    const repoDir = envVars[repoDirKey];
    const pythonPath = envVars[pythonKey];
    const entryPath = envVars[entryKey];

    if (repoDir) {
      try {
        await access(repoDir);
        details.push(`✅ 仓库目录可用：${repoDir}`);
      } catch {
        ok = false;
        details.push(`❌ 仓库目录不存在：${repoDir}`);
      }
    } else {
      ok = false;
      details.push(`❌ 缺少 ${repoDirKey}`);
    }

    if (pythonPath) {
      try {
        await access(pythonPath);
        details.push(`✅ Python 解释器可用：${pythonPath}`);
      } catch {
        ok = false;
        details.push(`❌ Python 解释器不存在：${pythonPath}`);
      }
    } else {
      details.push(`⚠️ 未显式配置 ${pythonKey}，启动脚本会尝试回退 python3 或仓库 .venv。`);
    }

    if (repoDir && entryPath) {
      const normalizedEntry = entryPath.startsWith('/') ? entryPath : `${repoDir}/${entryPath}`;
      try {
        await access(normalizedEntry);
        details.push(`✅ 入口脚本可用：${normalizedEntry}`);
      } catch {
        ok = false;
        details.push(`❌ 入口脚本不存在：${normalizedEntry}`);
      }
    } else {
      details.push(`⚠️ 缺少 ${entryKey}，将依赖脚本默认值。`);
    }

    if (envVars[extraArgsKey]) {
      details.push(`ℹ️ 额外参数：${envVars[extraArgsKey]}`);
    }

    return {
      providerId,
      ok,
      summary: ok ? `${config.name} 环境检查通过。` : `${config.name} 环境检查发现问题。`,
      checkedAt,
      details
    };
  }

  private async readEnvFile(filePath?: string) {
    if (!filePath) {
      return {} as Record<string, string>;
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
            let value = line.slice(index + 1).trim();
            if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
              value = value.slice(1, -1);
            }
            return [key, value];
          })
      );
    } catch {
      return {} as Record<string, string>;
    }
  }
}
