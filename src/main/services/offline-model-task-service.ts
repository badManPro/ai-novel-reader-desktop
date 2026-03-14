import { app } from 'electron';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import type {
  OfflineEngineId,
  OfflineModelAssetFileCheck,
  OfflineModelAssetItem,
  OfflineModelAssetVerificationItem,
  OfflineModelTaskAction,
  OfflineModelTaskCreateResult,
  OfflineModelTaskRecord,
  OfflineModelTaskSnapshot,
  OfflineModelTaskStage,
  OfflineModelTaskStatus,
  OfflineModelTaskTemplate
} from '../../shared/types';
import { getOfflineEngineConfig } from '../config/offline-tts-config';
import {
  getOfflineModelAssetManifest,
  getOfflineModelTaskTemplate,
  getOfflineTaskRuntimePaths
} from '../config/offline-model-assets';

interface BuiltTaskTemplate {
  action: OfflineModelTaskAction;
  templateId: string;
  manifestId: string;
  title: string;
  summary: string;
  command: string;
  cwd?: string;
  stageLabels: Partial<Record<OfflineModelTaskStage, string>>;
  assets: OfflineModelAssetItem[];
}

interface ManagedTask {
  record: OfflineModelTaskRecord;
  process?: ChildProcessWithoutNullStreams;
}

const MAX_LOG_LINES = 120;
const TASK_HISTORY_LIMIT = 60;

export class OfflineModelTaskService {
  private readonly tasks = new Map<string, ManagedTask>();
  private readonly dbPath = path.join(app.getPath('userData'), 'offline-model-tasks.sqlite');
  private sqlPromise: Promise<SqlJsStatic> | null = null;
  private dbPromise: Promise<Database> | null = null;
  private initialized = false;

  async listTasks(): Promise<OfflineModelTaskSnapshot[]> {
    await this.ensureInitialized();
    return [...this.tasks.values()]
      .map((item) => this.toSnapshot(item.record))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async createTask(providerId: OfflineEngineId, action: OfflineModelTaskAction): Promise<OfflineModelTaskCreateResult> {
    await this.ensureInitialized();
    const config = getOfflineEngineConfig(providerId);
    if (!config) {
      return {
        ok: false,
        message: `未找到引擎配置：${providerId}`
      };
    }

    const record = this.buildTaskRecord(providerId, action);
    const managed: ManagedTask = { record };
    this.tasks.set(record.taskId, managed);
    await this.persistAllTasks();
    void this.runTask(managed, buildOfflineModelTask(providerId, action));

    return {
      ok: true,
      message: `${config.name} 任务已创建：${record.title}`,
      task: this.toSnapshot(record)
    };
  }

  async retryTask(taskId: string): Promise<OfflineModelTaskCreateResult> {
    await this.ensureInitialized();
    const previous = this.tasks.get(taskId)?.record;
    if (!previous) {
      return {
        ok: false,
        message: `未找到任务：${taskId}`
      };
    }

    const next = await this.createTask(previous.providerId, previous.action);
    if (next.ok && next.task) {
      next.task.retryOfTaskId = previous.taskId;
      const managed = this.tasks.get(next.task.taskId);
      if (managed) {
        managed.record.retryOfTaskId = previous.taskId;
        managed.record.retryCount = previous.retryCount ?? 0;
        await this.persistAllTasks();
        next.task = this.toSnapshot(managed.record);
      }
    }
    return {
      ...next,
      message: next.ok ? `已基于任务 ${taskId} 重新触发：${next.task?.title ?? previous.title}` : next.message
    };
  }

  private buildTaskRecord(providerId: OfflineEngineId, action: OfflineModelTaskAction): OfflineModelTaskRecord {
    const config = getOfflineEngineConfig(providerId);
    const template = buildOfflineModelTask(providerId, action);
    const createdAt = new Date().toISOString();
    const taskId = `task-${providerId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const resourceSummary = template.assets.slice(0, 4).map((asset) => `${asset.required ? '必需' : '可选'} · ${asset.name} → ${asset.targetPath}`);
    const assetDetails = buildInitialVerificationItems(template.assets);

    return {
      taskId,
      providerId,
      engineName: config?.name ?? providerId,
      action,
      templateId: template.templateId,
      manifestId: template.manifestId,
      title: template.title,
      summary: template.summary,
      status: 'queued',
      stage: 'queued',
      stageLabel: template.stageLabels.queued ?? '等待执行',
      createdAt,
      updatedAt: createdAt,
      startedAt: undefined,
      finishedAt: undefined,
      logLines: [`[queued] ${template.summary}`],
      errorMessage: undefined,
      commandPreview: template.command,
      resourceCount: template.assets.length,
      requiredResourceCount: template.assets.filter((asset) => asset.required).length,
      resourceSummary,
      assetDetails,
      retryCount: 0,
      retryOfTaskId: undefined,
      ...summarizeVerification(assetDetails)
    };
  }

  private async ensureInitialized() {
    if (this.initialized) {
      return;
    }
    const db = await this.getDb();
    this.restoreTasksFromDb(db);
    this.markIncompleteTasksAsInterrupted();
    await this.persistAllTasks();
    this.initialized = true;
  }

  private async runTask(managed: ManagedTask, template: BuiltTaskTemplate) {
    const { record } = managed;
    try {
      await mkdir(path.join(process.cwd(), '.tmp-model-tasks'), { recursive: true });
      this.updateTask(record, 'running', 'preparing', template.stageLabels.preparing ?? '准备中');
      record.startedAt = new Date().toISOString();
      record.updatedAt = record.startedAt;
      this.appendLog(record, `[preparing] cwd=${template.cwd ?? process.cwd()}`);
      this.appendLog(record, `[template] ${template.templateId}`);
      this.appendLog(record, `[manifest] ${template.manifestId}`);
      await this.persistAllTasks();

      const child = spawn('/bin/bash', ['-lc', template.command], {
        cwd: template.cwd ?? process.cwd(),
        env: process.env,
        stdio: 'pipe'
      }) as ChildProcessWithoutNullStreams;
      managed.process = child;
      record.pid = child.pid;
      await this.persistAllTasks();

      child.stdout.on('data', (chunk: Buffer) => {
        void this.consumeOutput(record, String(chunk), template);
      });
      child.stderr.on('data', (chunk: Buffer) => {
        void this.consumeOutput(record, String(chunk), template);
      });

      const exitCode = await new Promise<number>((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', (code) => resolve(code ?? 1));
      });

      if (exitCode === 0) {
        this.updateTask(record, 'succeeded', 'completed', template.stageLabels.completed ?? '已完成');
        record.errorMessage = undefined;
        this.appendLog(record, '[completed] task finished successfully');
      } else {
        this.updateTask(record, 'failed', 'failed', template.stageLabels.failed ?? '执行失败');
        record.errorMessage = `任务退出码：${exitCode}`;
        this.appendLog(record, `[failed] exit code=${exitCode}`);
      }
    } catch (error) {
      this.updateTask(record, 'failed', 'failed', template.stageLabels.failed ?? '执行失败');
      record.errorMessage = error instanceof Error ? error.message : 'unknown error';
      this.appendLog(record, `[failed] ${record.errorMessage}`);
    } finally {
      record.finishedAt = new Date().toISOString();
      record.updatedAt = record.finishedAt;
      record.pid = undefined;
      managed.process = undefined;
      await this.persistAllTasks();
    }
  }

  private async consumeOutput(record: OfflineModelTaskRecord, text: string, template: BuiltTaskTemplate) {
    const lines = text.split(/\r?\n/).map((line) => line.trimEnd()).filter(Boolean);
    for (const line of lines) {
      if (/download|clone|fetch|curl|wget|huggingface|modelscope/i.test(line)) {
        this.updateTask(record, 'running', 'downloading', template.stageLabels.downloading ?? '下载中');
      } else if (/install|pip|npm|brew|venv|python -m/i.test(line)) {
        this.updateTask(record, 'running', 'installing', template.stageLabels.installing ?? '安装中');
      } else if (/verify|health|check|ready|存在|完成|missing|asset|checksum/i.test(line)) {
        this.updateTask(record, 'running', 'verifying', template.stageLabels.verifying ?? '验证中');
      }

      const parsed = parseVerificationLine(line);
      if (parsed) {
        const nextAssetDetails = updateVerificationItem(record.assetDetails ?? [], parsed);
        record.assetDetails = nextAssetDetails;
        Object.assign(record, summarizeVerification(nextAssetDetails));
      }
      this.appendLog(record, line);
    }
    await this.persistAllTasks();
  }

  private updateTask(record: OfflineModelTaskRecord, status: OfflineModelTaskStatus, stage: OfflineModelTaskStage, stageLabel: string) {
    record.status = status;
    record.stage = stage;
    record.stageLabel = stageLabel;
    record.updatedAt = new Date().toISOString();
  }

  private appendLog(record: OfflineModelTaskRecord, line: string) {
    record.logLines.push(line);
    if (record.logLines.length > MAX_LOG_LINES) {
      record.logLines = record.logLines.slice(-MAX_LOG_LINES);
    }
    record.updatedAt = new Date().toISOString();
  }

  private toSnapshot(record: OfflineModelTaskRecord): OfflineModelTaskSnapshot {
    return {
      ...record,
      logTail: record.logLines.slice(-20)
    };
  }

  private markIncompleteTasksAsInterrupted() {
    for (const managed of this.tasks.values()) {
      const record = managed.record;
      if (record.status === 'queued' || record.status === 'running') {
        record.status = 'failed';
        record.stage = 'failed';
        record.stageLabel = '上次运行中断';
        record.errorMessage = record.errorMessage ?? '应用重启前任务尚未完成，已标记为中断';
        record.finishedAt = record.finishedAt ?? new Date().toISOString();
        record.pid = undefined;
        this.appendLog(record, '[interrupted] task restored from persisted history and marked failed after restart');
      }
    }
  }

  private async getSql() {
    if (!this.sqlPromise) {
      this.sqlPromise = initSqlJs({
        locateFile: (file: string) => {
          if (file === 'sql-wasm.wasm') {
            return require.resolve('sql.js/dist/sql-wasm.wasm');
          }
          return file;
        }
      });
    }

    return this.sqlPromise;
  }

  private async getDb() {
    if (!this.dbPromise) {
      this.dbPromise = this.openDb();
    }
    return this.dbPromise;
  }

  private async openDb() {
    await mkdir(path.dirname(this.dbPath), { recursive: true });
    const SQL = await this.getSql();

    let db: Database;
    try {
      const buffer = await readFile(this.dbPath);
      db = new SQL.Database(buffer);
    } catch {
      db = new SQL.Database();
    }

    this.prepareSchema(db);
    await this.flush(db);
    return db;
  }

  private prepareSchema(db: Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS offline_model_tasks (
        task_id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );
    `);
  }

  private restoreTasksFromDb(db: Database) {
    const [result] = db.exec('SELECT payload_json FROM offline_model_tasks ORDER BY created_at DESC LIMIT 200');
    for (const row of result?.values ?? []) {
      try {
        const record = this.normalizePersistedTask(JSON.parse(String(row[0])) as Partial<OfflineModelTaskRecord>);
        this.tasks.set(record.taskId, { record });
      } catch {
        // ignore invalid row
      }
    }
    this.trimInMemoryTasks();
  }

  private normalizePersistedTask(raw: Partial<OfflineModelTaskRecord>): OfflineModelTaskRecord {
    return {
      taskId: String(raw.taskId ?? `restored-${Date.now()}`),
      providerId: (raw.providerId ?? 'cosyvoice-local') as OfflineEngineId,
      engineName: String(raw.engineName ?? raw.providerId ?? 'unknown'),
      action: (raw.action ?? 'prepare') as OfflineModelTaskAction,
      templateId: raw.templateId,
      manifestId: raw.manifestId,
      title: String(raw.title ?? '离线模型任务'),
      summary: String(raw.summary ?? ''),
      status: (raw.status ?? 'failed') as OfflineModelTaskStatus,
      stage: (raw.stage ?? 'failed') as OfflineModelTaskStage,
      stageLabel: String(raw.stageLabel ?? '已恢复'),
      createdAt: String(raw.createdAt ?? new Date().toISOString()),
      updatedAt: String(raw.updatedAt ?? raw.createdAt ?? new Date().toISOString()),
      startedAt: raw.startedAt,
      finishedAt: raw.finishedAt,
      pid: undefined,
      logLines: Array.isArray(raw.logLines) ? raw.logLines.map(String) : [],
      errorMessage: raw.errorMessage,
      commandPreview: raw.commandPreview,
      resourceCount: raw.resourceCount,
      requiredResourceCount: raw.requiredResourceCount,
      resourceSummary: raw.resourceSummary ?? [],
      verifiableAssetCount: raw.verifiableAssetCount,
      checksumReadyAssetCount: raw.checksumReadyAssetCount,
      missingAssetCount: raw.missingAssetCount,
      verifiedAssetCount: raw.verifiedAssetCount,
      assetVerificationSummary: raw.assetVerificationSummary ?? [],
      assetDetails: raw.assetDetails ?? [],
      retryCount: raw.retryCount ?? 0,
      retryOfTaskId: raw.retryOfTaskId
    };
  }

  private trimInMemoryTasks() {
    const ordered = [...this.tasks.values()].sort((a, b) => b.record.createdAt.localeCompare(a.record.createdAt));
    const keep = new Set(ordered.slice(0, TASK_HISTORY_LIMIT).map((item) => item.record.taskId));
    for (const taskId of [...this.tasks.keys()]) {
      if (!keep.has(taskId)) {
        this.tasks.delete(taskId);
      }
    }
  }

  private async persistAllTasks() {
    const db = await this.getDb();
    this.trimInMemoryTasks();
    db.exec('DELETE FROM offline_model_tasks');
    const stmt = db.prepare('INSERT INTO offline_model_tasks (task_id, created_at, updated_at, payload_json) VALUES (?, ?, ?, ?)');
    const ordered = [...this.tasks.values()].sort((a, b) => b.record.createdAt.localeCompare(a.record.createdAt)).slice(0, TASK_HISTORY_LIMIT);
    for (const item of ordered) {
      const payload = {
        ...item.record,
        pid: undefined,
        logLines: item.record.logLines.slice(-MAX_LOG_LINES)
      };
      stmt.run([item.record.taskId, item.record.createdAt, item.record.updatedAt, JSON.stringify(payload)]);
    }
    stmt.free();
    await this.flush(db);
  }

  private async flush(db: Database) {
    const data = Buffer.from(db.export());
    await writeFile(this.dbPath, data);
  }
}

export function buildOfflineModelTask(providerId: OfflineEngineId, action: OfflineModelTaskAction): BuiltTaskTemplate {
  const manifest = getOfflineModelAssetManifest(providerId);
  const template = getOfflineModelTaskTemplate(providerId, action);
  const runtime = getOfflineTaskRuntimePaths(providerId);

  const assets = manifest.assets;
  const label = providerId === 'cosyvoice-local' ? 'CosyVoice' : 'GPT-SoVITS';
  const envVar = providerId === 'cosyvoice-local' ? 'COSYVOICE_MODEL_DIR' : 'GPTSOVITS_MODEL_DIR';
  const envFile = runtime.envFile;
  const exampleEnv = providerId === 'cosyvoice-local'
    ? path.join(runtime.scriptsDir, 'cosyvoice.env.example')
    : path.join(runtime.scriptsDir, 'gpt-sovits.env.example');

  const header = [
    'set -e',
    `mkdir -p ${shellQuote(runtime.tmpTaskDir)}`,
    `echo "task template: ${template.templateId}"`,
    `echo "asset manifest: ${manifest.manifestId}"`,
    `echo "engine: ${label}"`,
    `echo "resource count: ${assets.length} (required ${assets.filter((asset) => asset.required).length})"`
  ];

  let body: string[] = [];
  if (action === 'prepare') {
    body = buildPrepareCommands(providerId, template, assets, envFile, exampleEnv, runtime.startupCommand);
  } else if (action === 'download') {
    body = buildDownloadCommands(providerId, template, assets, envFile, envVar);
  } else {
    body = buildInstallCommands(providerId, template, assets, envFile);
  }

  return {
    action,
    templateId: template.templateId,
    manifestId: manifest.manifestId,
    title: template.title,
    summary: `${template.summary}（资源 ${assets.length} 项，必需 ${assets.filter((asset) => asset.required).length} 项）`,
    command: [...header, ...body].join(' && '),
    cwd: runtime.scriptsDir,
    stageLabels: template.stageLabels,
    assets
  };
}

function buildPrepareCommands(
  providerId: OfflineEngineId,
  template: OfflineModelTaskTemplate,
  assets: OfflineModelAssetItem[],
  envFile: string,
  exampleEnv: string,
  startupCommand: string
) {
  const envPrefix = providerId === 'cosyvoice-local' ? 'COSYVOICE_' : 'GPTSOVITS_';
  return [
    `echo "prepare summary: ${template.summary}"`,
    `test -f ${shellQuote(path.join(path.dirname(envFile), 'README.md'))} && echo "README 存在：${path.join(path.dirname(envFile), 'README.md')}"`,
    `if [ ! -f ${shellQuote(envFile)} ]; then cp ${shellQuote(exampleEnv)} ${shellQuote(envFile)} && echo "已从示例生成 env：${envFile}"; else echo "env 已存在：${envFile}"; fi`,
    `set -a && source ${shellQuote(envFile)} && set +a`,
    `echo "check env keys (${envPrefix}*)"`,
    `node - <<'NODE'
const fs=require('fs');
const file=${JSON.stringify(envFile)};
const prefix=${JSON.stringify(envPrefix)};
const content=fs.readFileSync(file,'utf8');
const keys=content.split(/\r?\n/).filter(Boolean).filter(l=>!l.trim().startsWith('#')).map(l=>l.split('=')[0]).filter(k=>k.startsWith(prefix));
console.log('env keys:', keys.join(', '));
NODE`,
    ...assets.map((asset) => buildAssetInspectionCommand(asset)),
    `if [ -f ${shellQuote(startupCommand)} ]; then echo "startup command ready: ${startupCommand}"; else echo "startup command missing: ${startupCommand}"; fi`,
    'echo "prepare finished"'
  ];
}

function buildDownloadCommands(providerId: OfflineEngineId, template: OfflineModelTaskTemplate, assets: OfflineModelAssetItem[], envFile: string, envVar: string) {
  const repoAsset = assets.find((asset) => asset.category === 'repository');
  const repoSource = repoAsset?.sources.find((source) => source.type === 'git');
  const downloadPlans = buildDownloadPlanSeeds(assets);
  const downloaderModulePath = path.join(__dirname, 'offline-model-downloader.js');
  return [
    `echo "download summary: ${template.summary}"`,
    `set -a && source ${shellQuote(envFile)} && set +a`,
    `MODEL_DIR="${'$'}${envVar}"`,
    `if [ -z "${'$'}MODEL_DIR" ]; then echo "missing ${envVar}" >&2; exit 1; fi`,
    `echo "model dir: ${'$'}MODEL_DIR"`,
    repoSource
      ? `if [ -d "${'$'}MODEL_DIR/.git" ]; then cd "${'$'}MODEL_DIR" && echo "git fetch/pull" && git pull --ff-only || true; else echo "git clone ${repoSource.url} -> ${'$'}MODEL_DIR" && git clone ${shellQuote(repoSource.url)} "${'$'}MODEL_DIR"; fi`
      : 'echo "no git repository asset configured"',
    downloadPlans.length
      ? `node - <<'NODE'
const { runOfflineModelDownloads } = require(${JSON.stringify(downloaderModulePath)});
const plans = ${JSON.stringify(downloadPlans)};
const interpolate = (value) => value.replace(/\$\{([^}]+)\}/g, (_, key) => process.env[key] ?? '');
const resolved = plans.map((plan) => ({
  ...plan,
  destinationPath: interpolate(plan.destinationPath),
  url: plan.downloadUrlEnvKey ? (process.env[plan.downloadUrlEnvKey] || plan.url || '') : (plan.url || '')
})).filter((plan) => plan.url && plan.destinationPath);
const skipped = plans.filter((plan) => !(plan.downloadUrlEnvKey ? (process.env[plan.downloadUrlEnvKey] || plan.url || '') : (plan.url || '')));
for (const plan of skipped) {
  console.log('download skipped :: ' + plan.assetId + ' :: ' + plan.checkId + ' :: reason=no-url :: env=' + (plan.downloadUrlEnvKey || ''));
}
if (!resolved.length) {
  console.log('download skipped :: no direct-download plans resolved');
} else {
  runOfflineModelDownloads(resolved, { logger: (line) => console.log(line), progressIntervalBytes: 8 * 1024 * 1024 })
    .then((results) => {
      for (const result of results) {
        console.log('download result :: ' + result.assetId + ' :: ' + result.checkId + ' :: status=' + result.status + ' :: bytes=' + result.bytesWritten + ' :: resumed=' + result.resumedFromBytes);
      }
    })
    .catch((error) => {
      console.error('download fatal :: ' + (error instanceof Error ? error.message : String(error)));
      process.exitCode = 1;
    });
}
NODE`
      : 'echo "download skipped :: no direct-download checks configured"',
    ...assets.filter((asset) => asset.category !== 'repository').map((asset) => buildAssetDownloadHintCommand(asset)),
    `find "${'$'}MODEL_DIR" -maxdepth 3 \( -name '*.pt' -o -name '*.ckpt' -o -name '*.pth' -o -name '*.safetensors' -o -name '*.onnx' \) | sed -n '1,20p' || true`,
    'echo "download finished"'
  ];
}

function buildDownloadPlanSeeds(assets: OfflineModelAssetItem[]) {
  return assets.flatMap((asset) => (asset.fileChecks ?? [])
    .filter((check) => check.downloadUrl || check.downloadUrlEnvKey)
    .map((check) => ({
      assetId: asset.id,
      assetName: asset.name,
      checkId: check.id,
      label: check.label,
      destinationPath: check.path,
      url: check.downloadUrl ?? '',
      downloadUrlEnvKey: check.downloadUrlEnvKey,
      checksumSha256: check.checksumSha256,
      expectedSizeBytes: check.expectedSizeBytes,
      required: check.required
    })));
}

function buildInstallCommands(providerId: OfflineEngineId, template: OfflineModelTaskTemplate, assets: OfflineModelAssetItem[], envFile: string) {
  const pyVar = providerId === 'cosyvoice-local' ? 'COSYVOICE_PYTHON' : 'GPTSOVITS_PYTHON';
  const modelVar = providerId === 'cosyvoice-local' ? 'COSYVOICE_MODEL_DIR' : 'GPTSOVITS_MODEL_DIR';
  const entryVar = providerId === 'cosyvoice-local' ? 'COSYVOICE_ENTRY' : 'GPTSOVITS_ENTRY';
  const extraVar = providerId === 'cosyvoice-local' ? 'COSYVOICE_EXTRA_ARGS' : 'GPTSOVITS_EXTRA_ARGS';
  return [
    `echo "install summary: ${template.summary}"`,
    `set -a && source ${shellQuote(envFile)} && set +a`,
    `PY="${'$'}{${pyVar}:-python3}"`,
    `MODEL_DIR="${'$'}{${modelVar}:-}"`,
    `ENTRY="${'$'}{${entryVar}:-}"`,
    `EXTRA_ARGS="${'$'}{${extraVar}:-}"`,
    `echo "python: ${'$'}PY"`,
    `echo "model dir: ${'$'}MODEL_DIR"`,
    `echo "entry: ${'$'}ENTRY"`,
    `echo "extra args: ${'$'}EXTRA_ARGS"`,
    `if [ -n "${'$'}MODEL_DIR" ] && [ -x "${'$'}MODEL_DIR/.venv/bin/python" ]; then echo "venv ready: ${'$'}MODEL_DIR/.venv/bin/python"; fi`,
    `if [ -z "${'$'}MODEL_DIR" ] || [ -z "${'$'}ENTRY" ] || [ ! -f "${'$'}MODEL_DIR/${'$'}ENTRY" ]; then echo "entry missing or env incomplete" >&2; exit 1; fi`,
    ...assets.map((asset) => buildAssetInspectionCommand(asset)),
    'echo "install finished"'
  ];
}

function buildAssetInspectionCommand(asset: OfflineModelAssetItem) {
  const target = interpolateShellPath(asset.targetPath);
  const sourceSummary = asset.sources.map((source) => `${source.type}:${source.url}`).join(' | ');
  const installHint = asset.installHint ? `; hint=${asset.installHint}` : '';
  const checks = asset.fileChecks?.length ? asset.fileChecks : [{
    id: 'target',
    label: asset.name,
    path: asset.targetPath,
    required: asset.required,
    checksumSha256: undefined,
    note: undefined
  } satisfies OfflineModelAssetFileCheck];

  return [
    `if [ -e ${target} ] || [ -d ${target} ]; then echo "asset ok :: ${asset.id} :: ${asset.name} :: ${asset.targetPath}"; else echo "asset missing :: ${asset.id} :: required=${asset.required ? 'yes' : 'no'} :: target=${asset.targetPath} :: sources=${sourceSummary}${installHint}"; fi`,
    ...checks.map((check) => buildFileCheckCommand(asset, check))
  ].join(' && ');
}

function buildAssetDownloadHintCommand(asset: OfflineModelAssetItem) {
  const sources = asset.sources.map((source) => `${source.type}:${source.url}`).join(' | ');
  const downloadHints = (asset.fileChecks ?? [])
    .filter((check) => check.downloadUrl || check.downloadUrlEnvKey)
    .map((check) => `${check.id}:${check.downloadUrlEnvKey ?? check.downloadUrl}`)
    .join(' | ');
  return `${buildAssetInspectionCommand(asset)} && echo "download hint :: ${asset.name} :: ${sources}${downloadHints ? ` :: direct=${downloadHints}` : ''}"`;
}

function buildFileCheckCommand(asset: OfflineModelAssetItem, check: OfflineModelAssetFileCheck) {
  const filePath = interpolateShellPath(check.path);
  const checksum = check.checksumSha256 ?? '';
  const note = check.note ?? '';
  return `TARGET=${filePath}; if [ -e "${'$'}TARGET" ] || [ -d "${'$'}TARGET" ]; then if [ -n ${shellQuote(checksum)} ] && [ ! -d "${'$'}TARGET" ]; then ACTUAL_SHA=$(shasum -a 256 "${'$'}TARGET" | awk '{print ${'$'}1}'); if [ "${'$'}ACTUAL_SHA" = ${shellQuote(checksum)} ]; then echo "asset verify :: ${asset.id} :: ${asset.name} :: ${check.id} :: status=checksum-passed :: required=${check.required ? 'yes' : 'no'} :: path=${check.path} :: checksum=${checksum} :: actual=${'$'}ACTUAL_SHA :: note=${note}"; else echo "asset verify :: ${asset.id} :: ${asset.name} :: ${check.id} :: status=checksum-failed :: required=${check.required ? 'yes' : 'no'} :: path=${check.path} :: checksum=${checksum} :: actual=${'$'}ACTUAL_SHA :: note=${note}"; fi; else echo "asset verify :: ${asset.id} :: ${asset.name} :: ${check.id} :: status=exists-unverified :: required=${check.required ? 'yes' : 'no'} :: path=${check.path} :: checksum=${checksum || 'missing'} :: actual= :: note=${note}"; fi; else echo "asset verify :: ${asset.id} :: ${asset.name} :: ${check.id} :: status=missing :: required=${check.required ? 'yes' : 'no'} :: path=${check.path} :: checksum=${checksum || 'missing'} :: actual= :: note=${note}"; fi`;
}

function interpolateShellPath(value: string) {
  return `"${value.replace(/\$\{([^}]+)\}/g, '${$1}')}"`;
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function buildInitialVerificationItems(assets: OfflineModelAssetItem[]): OfflineModelAssetVerificationItem[] {
  return assets.map((asset) => {
    const checks = asset.fileChecks ?? [];
    const checksumProvidedCount = checks.filter((item) => Boolean(item.checksumSha256)).length;
    return {
      assetId: asset.id,
      assetName: asset.name,
      required: asset.required,
      targetPath: asset.targetPath,
      verifiableFileCount: checks.length,
      checksumProvidedCount,
      missingFileCount: 0,
      verifiedFileCount: 0,
      checksumFailedCount: 0,
      status: checks.length ? 'pending' : 'not-applicable',
      detailLines: checks.map((check) => `${check.label} · ${check.path} · ${check.checksumSha256 ? '预置 checksum' : '缺少 checksum'}${check.downloadUrl ? ` · 下载=${check.downloadUrl}` : ''}${check.downloadUrlEnvKey ? ` · 下载ENV=${check.downloadUrlEnvKey}` : ''}`)
    };
  });
}

type ParsedVerificationLine = {
  assetId: string;
  assetName: string;
  status: 'missing' | 'exists-unverified' | 'checksum-passed' | 'checksum-failed';
  required: boolean;
  path: string;
  checksum: string;
  actual: string;
  note: string;
};

function parseVerificationLine(line: string): ParsedVerificationLine | null {
  if (!line.startsWith('asset verify :: ')) {
    return null;
  }
  const parts = line.split(' :: ');
  if (parts.length < 6) {
    return null;
  }
  const fields = new Map<string, string>();
  for (const segment of parts.slice(4)) {
    const [key, ...rest] = segment.split('=');
    if (!key) continue;
    fields.set(key, rest.join('='));
  }
  const status = fields.get('status');
  if (!status || !['missing', 'exists-unverified', 'checksum-passed', 'checksum-failed'].includes(status)) {
    return null;
  }
  return {
    assetId: parts[1] ?? '',
    assetName: parts[2] ?? '',
    status: status as ParsedVerificationLine['status'],
    required: fields.get('required') === 'yes',
    path: fields.get('path') ?? '',
    checksum: fields.get('checksum') ?? '',
    actual: fields.get('actual') ?? '',
    note: fields.get('note') ?? ''
  };
}

function updateVerificationItem(items: OfflineModelAssetVerificationItem[], parsed: ParsedVerificationLine) {
  return items.map((item) => {
    if (item.assetId !== parsed.assetId) {
      return item;
    }
    const nextDetails = [
      ...item.detailLines.filter((line) => !line.includes(parsed.path)),
      `${parsed.status} · ${parsed.path}${parsed.checksum && parsed.checksum !== 'missing' ? ` · expected=${parsed.checksum}` : ' · checksum missing'}${parsed.actual ? ` · actual=${parsed.actual}` : ''}${parsed.note ? ` · ${parsed.note}` : ''}`
    ];
    const missingFileCount = nextDetails.filter((line) => line.startsWith('missing')).length;
    const verifiedFileCount = nextDetails.filter((line) => line.startsWith('checksum-passed')).length;
    const checksumFailedCount = nextDetails.filter((line) => line.startsWith('checksum-failed')).length;
    const status: OfflineModelAssetVerificationItem['status'] = checksumFailedCount > 0
      ? 'checksum-failed'
      : missingFileCount > 0
        ? 'missing'
        : verifiedFileCount > 0
          ? 'checksum-passed'
          : 'exists-unverified';
    return {
      ...item,
      required: parsed.required,
      missingFileCount,
      verifiedFileCount,
      checksumFailedCount,
      status,
      detailLines: nextDetails
    };
  });
}

function summarizeVerification(items: OfflineModelAssetVerificationItem[]) {
  const verifiableAssetCount = items.filter((item) => item.verifiableFileCount > 0).length;
  const checksumReadyAssetCount = items.filter((item) => item.checksumProvidedCount > 0).length;
  const missingAssetCount = items.filter((item) => item.status === 'missing').length;
  const verifiedAssetCount = items.filter((item) => item.status === 'checksum-passed').length;
  const assetVerificationSummary = items.slice(0, 6).map((item) => `${item.required ? '必需' : '可选'} · ${item.assetName} · ${item.status} · 文件 ${item.verifiableFileCount} / checksum ${item.checksumProvidedCount}`);
  return {
    verifiableAssetCount,
    checksumReadyAssetCount,
    missingAssetCount,
    verifiedAssetCount,
    assetVerificationSummary
  };
}
