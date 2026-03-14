import type { OpenDialogOptions, OpenDialogReturnValue } from 'electron';
import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  OfflineActiveStrategySummary,
  OfflineEngineConfig,
  OfflineEngineHealth,
  OfflineEngineId,
  OfflineManualImportItem,
  OfflineManualImportResult,
  OfflineManualImportState,
  OfflineManualImportTarget,
  OfflineServiceStatus
} from '../../shared/types';
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
  manualImport?: OfflineManualImportState;
}

export class OfflineTtsConsoleService {
  private readonly healthService = new OfflineTtsHealthService();
  private readonly serviceManager = new OfflineTtsServiceManager();

  async getSnapshot(): Promise<OfflineEngineConsoleSnapshot[]> {
    const configs = getOfflineEngineConfigs();
    const [healthList, statusList, manualImportStates] = await Promise.all([
      this.healthService.checkAll(configs),
      this.serviceManager.getStatusList(),
      Promise.all(configs.map((config) => this.getManualImportState(config.providerId)))
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
      serviceStatus: statusList.find((item) => item.providerId === config.providerId),
      manualImport: manualImportStates.find((item) => item.providerId === config.providerId)
    }));
  }

  async getManualImportState(providerId: OfflineEngineId): Promise<OfflineManualImportState> {
    const config = getOfflineEngineConfig(providerId);
    const checkedAt = new Date().toISOString();
    if (!config) {
      return { providerId, checkedAt, items: [] };
    }

    const envVars = await this.readEnvFile(config.startup.envFile);
    const state = providerId === 'cosyvoice-local'
      ? await buildCosyVoiceManualImportState(envVars)
      : await buildGptSovitsManualImportState(envVars);

    return { providerId, checkedAt, ...state };
  }

  async chooseManualImport(
    providerId: OfflineEngineId,
    target: OfflineManualImportTarget,
    openDialog: (options: OpenDialogOptions) => Promise<OpenDialogReturnValue>
  ): Promise<OfflineManualImportResult> {
    const config = getOfflineEngineConfig(providerId);
    if (!config?.startup.envFile) {
      return {
        ok: false,
        providerId,
        target,
        summary: '未找到可写入的环境文件。',
        state: await this.getManualImportState(providerId)
      };
    }

    const presetState = await this.getManualImportState(providerId);
    const currentPath = presetState.items.find((item) => item.target === target)?.selectedPath;
    const selection = await openDialog({
      title: target === 'repo-dir' ? '选择模型仓库目录' : '选择权重目录',
      defaultPath: currentPath,
      properties: ['openDirectory', 'createDirectory']
    });

    if (selection.canceled || !selection.filePaths[0]) {
      return {
        ok: true,
        cancelled: true,
        providerId,
        target,
        summary: '已取消手动导入。',
        state: presetState
      };
    }

    const selectedPath = selection.filePaths[0];
    const envContent = await safeReadFile(config.startup.envFile);
    const updates = buildManualImportEnvUpdates(providerId, target, selectedPath);
    const nextContent = applyEnvUpdates(envContent, updates);
    await writeFile(config.startup.envFile, nextContent, 'utf8');
    const state = await this.getManualImportState(providerId);

    return {
      ok: true,
      providerId,
      target,
      summary: target === 'repo-dir'
        ? '已写入仓库目录，可继续执行准备/安装任务。'
        : '已写入权重目录兜底配置，可继续执行准备任务查看承接状态。',
      detail: `${target} -> ${selectedPath}`,
      state
    };
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

    if (providerId === 'cosyvoice-local') {
      const sftResolution = resolveCosyVoiceSftModelDir(envVars);
      if (sftResolution.path) {
        if (sftResolution.exists) {
          details.push(`✅ CosyVoice SFT 生效目录（${sftResolution.sourceLabel}）：${sftResolution.path}`);
        } else {
          ok = false;
          details.push(`❌ CosyVoice SFT 生效目录不可用（${sftResolution.sourceLabel}）：${sftResolution.path}`);
        }
      } else {
        ok = false;
        details.push('❌ 未解析出 CosyVoice SFT 生效目录；请配置 COSYVOICE_SFT_MODEL_DIR、COSYVOICE_EXTRA_ARGS 的 --model_dir，或补齐仓库默认 SFT 目录。');
      }
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
      return parseEnvContent(content);
    } catch {
      return {} as Record<string, string>;
    }
  }
}

async function buildCosyVoiceManualImportState(envVars: Record<string, string>): Promise<{ items: OfflineManualImportItem[]; activeStrategy: OfflineActiveStrategySummary; }> {
  const repoDir = envVars.COSYVOICE_MODEL_DIR;
  const sftResolution = resolveCosyVoiceSftModelDir(envVars);
  sftResolution.exists = await pathExists(sftResolution.path);
  const items: OfflineManualImportItem[] = [
    {
      target: 'repo-dir',
      label: '模型仓库目录',
      envKey: 'COSYVOICE_MODEL_DIR',
      selectedPath: repoDir,
      exists: await pathExists(repoDir),
      source: repoDir ? (envVars.COSYVOICE_MODEL_DIR_MANUAL_IMPORT === '1' ? 'manual-import' : 'env') : 'unset',
      sourceLabel: repoDir ? (envVars.COSYVOICE_MODEL_DIR_MANUAL_IMPORT === '1' ? '手动导入' : '环境配置') : '未配置',
      hint: '优先选择官方 CosyVoice 仓库目录，后续准备/安装任务会直接复用。'
    },
    {
      target: 'weights-dir',
      label: 'SFT 权重目录',
      envKey: 'COSYVOICE_SFT_MODEL_DIR',
      selectedPath: sftResolution.path,
      exists: sftResolution.exists,
      source: sftResolution.source,
      sourceLabel: sftResolution.sourceLabel,
      hint: '真正参与启动/任务校验优先级：手动导入目录 > 明确 extra_args(model_dir) > 仓库内默认 pretrained_models/CosyVoice-300M-SFT。'
    }
  ];

  return {
    items,
    activeStrategy: {
      strategyId: sftResolution.strategyId,
      strategyLabel: sftResolution.strategyLabel,
      effectiveSource: sftResolution.sourceLabel,
      effectivePath: sftResolution.path,
      detail: sftResolution.detail
    }
  };
}

async function buildGptSovitsManualImportState(envVars: Record<string, string>): Promise<{ items: OfflineManualImportItem[]; activeStrategy: OfflineActiveStrategySummary; }> {
  const repoDir = envVars.GPTSOVITS_MODEL_DIR;
  const weightsDir = envVars.GPTSOVITS_MANUAL_WEIGHTS_DIR || repoDir;
  const items: OfflineManualImportItem[] = [
    {
      target: 'repo-dir',
      label: '模型仓库目录',
      envKey: 'GPTSOVITS_MODEL_DIR',
      selectedPath: repoDir,
      exists: await pathExists(repoDir),
      source: repoDir ? (envVars.GPTSOVITS_MODEL_DIR_MANUAL_IMPORT === '1' ? 'manual-import' : 'env') : 'unset',
      sourceLabel: repoDir ? (envVars.GPTSOVITS_MODEL_DIR_MANUAL_IMPORT === '1' ? '手动导入' : '环境配置') : '未配置',
      hint: '建议仍以官方仓库为准。'
    },
    {
      target: 'weights-dir',
      label: '权重目录',
      envKey: 'GPTSOVITS_MANUAL_WEIGHTS_DIR',
      selectedPath: weightsDir,
      exists: await pathExists(weightsDir),
      source: envVars.GPTSOVITS_MANUAL_WEIGHTS_DIR ? 'manual-import' : weightsDir ? 'derived' : 'unset',
      sourceLabel: envVars.GPTSOVITS_MANUAL_WEIGHTS_DIR ? '手动导入' : weightsDir ? '仓库推导' : '未配置',
      hint: '当前仅作为页面展示兜底，不替代完整安装。'
    }
  ];

  return {
    items,
    activeStrategy: {
      strategyId: envVars.GPTSOVITS_MANUAL_WEIGHTS_DIR ? 'manual-import' : repoDir ? 'official' : 'unset',
      strategyLabel: envVars.GPTSOVITS_MANUAL_WEIGHTS_DIR ? '手动导入' : repoDir ? '官方仓库' : '未配置',
      effectiveSource: envVars.GPTSOVITS_MANUAL_WEIGHTS_DIR ? '手动导入权重目录' : repoDir ? '官方仓库目录' : '未配置',
      effectivePath: weightsDir,
      detail: envVars.GPTSOVITS_MANUAL_WEIGHTS_DIR ? '当前以手动导入权重目录作为页面承接来源。' : repoDir ? '当前默认采用仓库内权重目录。' : '尚未形成可用策略。'
    }
  };
}

export function parseEnvContent(content: string) {
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
}

export function applyEnvUpdates(content: string, updates: Record<string, string>) {
  const lines = content ? content.split(/\r?\n/) : [];
  const nextKeys = new Set(Object.keys(updates));
  const touched = new Set<string>();
  const nextLines = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
      return line;
    }
    const index = line.indexOf('=');
    const key = line.slice(0, index).trim();
    if (!nextKeys.has(key)) {
      return line;
    }
    touched.add(key);
    return `${key}=${updates[key]}`;
  });

  for (const [key, value] of Object.entries(updates)) {
    if (!touched.has(key)) {
      nextLines.push(`${key}=${value}`);
    }
  }

  return `${nextLines.join('\n').replace(/\n{3,}/g, '\n\n')}\n`;
}

export function buildManualImportEnvUpdates(providerId: OfflineEngineId, target: OfflineManualImportTarget, selectedPath: string): Record<string, string> {
  if (providerId === 'cosyvoice-local') {
    if (target === 'repo-dir') {
      return {
        COSYVOICE_MODEL_DIR: selectedPath,
        COSYVOICE_MODEL_DIR_MANUAL_IMPORT: '1'
      };
    }
    return {
      COSYVOICE_SFT_MODEL_DIR: selectedPath,
      COSYVOICE_SFT_MODEL_DIR_MANUAL_IMPORT: '1'
    };
  }

  if (target === 'repo-dir') {
    return {
      GPTSOVITS_MODEL_DIR: selectedPath,
      GPTSOVITS_MODEL_DIR_MANUAL_IMPORT: '1'
    };
  }

  return {
    GPTSOVITS_MANUAL_WEIGHTS_DIR: selectedPath,
    GPTSOVITS_MANUAL_WEIGHTS_DIR_IMPORT: '1'
  };
}

function inferCosyVoiceWeightsDir(repoDir?: string) {
  if (!repoDir) {
    return undefined;
  }
  return path.join(repoDir, 'pretrained_models', 'CosyVoice-300M-SFT');
}

function resolveCosyVoiceSftModelDir(envVars: Record<string, string>) {
  const repoDir = envVars.COSYVOICE_MODEL_DIR;
  const manualDir = envVars.COSYVOICE_SFT_MODEL_DIR;
  const extraArgsModelDir = extractCosyVoiceModelDirFromExtraArgs(envVars.COSYVOICE_EXTRA_ARGS);
  const derivedDir = inferCosyVoiceWeightsDir(repoDir);
  const path = manualDir || extraArgsModelDir || derivedDir;
  const source: OfflineManualImportItem['source'] = manualDir ? 'manual-import' : extraArgsModelDir ? 'env' : derivedDir ? 'derived' : 'unset';
  const sourceLabel = manualDir
    ? '手动导入目录'
    : extraArgsModelDir
      ? 'extra_args / model_dir'
      : derivedDir
        ? '仓库内默认 SFT 目录'
        : '未配置';
  const strategyId: OfflineActiveStrategySummary['strategyId'] = manualDir ? 'manual-import' : extraArgsModelDir ? 'mirror' : derivedDir ? 'official' : 'unset';
  const strategyLabel = manualDir
    ? '手动导入'
    : extraArgsModelDir
      ? '显式 model_dir'
      : derivedDir
        ? '官方默认目录'
        : '未配置';
  const detail = manualDir
    ? '启动脚本与任务校验都会优先采用 COSYVOICE_SFT_MODEL_DIR。'
    : extraArgsModelDir
      ? '当前未手动导入，改为采用 COSYVOICE_EXTRA_ARGS 中显式传入的 --model_dir。'
      : derivedDir
        ? '当前回退到官方仓库内 pretrained_models/CosyVoice-300M-SFT。'
        : '尚未发现可用 SFT 模型目录。';

  return { path, source, sourceLabel, strategyId, strategyLabel, detail, exists: false };
}

function extractCosyVoiceModelDirFromExtraArgs(extraArgs?: string) {
  if (!extraArgs) {
    return undefined;
  }
  const match = extraArgs.match(/--model_dir(?:=|\s+)(?:"([^"]+)"|'([^']+)'|(\S+))/);
  return match?.[1] ?? match?.[2] ?? match?.[3];
}

async function pathExists(target?: string) {
  if (!target) {
    return false;
  }
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function safeReadFile(filePath: string) {
  try {
    return await readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}
