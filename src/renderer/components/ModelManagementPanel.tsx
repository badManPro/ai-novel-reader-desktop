import { useMemo, useState } from 'react';
import type {
  OfflineEngineActionResult,
  OfflineEngineConsoleSnapshot,
  OfflineManualImportResult,
  OfflineModelAssetManifest,
  OfflineModelTaskAction,
  OfflineModelTaskSnapshot
} from '../../shared/types';

interface ModelManagementPanelProps {
  engines: OfflineEngineConsoleSnapshot[];
  manifests: OfflineModelAssetManifest[];
  tasks: OfflineModelTaskSnapshot[];
  actionState: Partial<Record<string, 'checking' | 'starting' | 'prepare' | 'download' | 'install'>>;
  actionResults: Partial<Record<string, OfflineEngineActionResult>>;
  manualImportResults: Partial<Record<string, OfflineManualImportResult>>;
  onRefresh: () => void | Promise<void>;
  onCheckEnv: (providerId: 'cosyvoice-local' | 'gpt-sovits-local') => void | Promise<void>;
  onStart: (providerId: 'cosyvoice-local' | 'gpt-sovits-local') => void | Promise<void>;
  onCreateTask: (providerId: 'cosyvoice-local' | 'gpt-sovits-local', action: OfflineModelTaskAction) => void | Promise<void>;
  onRetryTask: (taskId: string, providerId: 'cosyvoice-local' | 'gpt-sovits-local') => void | Promise<void>;
  onChooseManualImport: (providerId: 'cosyvoice-local' | 'gpt-sovits-local', target: 'repo-dir' | 'weights-dir') => void | Promise<void>;
}

type TaskFilter = 'all' | 'failed' | 'running' | 'recent';

const taskLabels: Record<OfflineModelTaskAction, string> = {
  prepare: '准备任务',
  download: '下载任务',
  install: '安装任务'
};

export function ModelManagementPanel({
  engines,
  manifests,
  tasks,
  actionState,
  actionResults,
  manualImportResults,
  onRefresh,
  onCheckEnv,
  onStart,
  onCreateTask,
  onRetryTask,
  onChooseManualImport
}: ModelManagementPanelProps) {
  const [taskFilter, setTaskFilter] = useState<TaskFilter>('all');
  const taskMetrics = useMemo(() => ({
    all: tasks.length,
    failed: tasks.filter((task) => task.status === 'failed').length,
    running: tasks.filter((task) => task.status === 'running' || task.status === 'queued').length,
    recent: tasks.filter((task) => Date.now() - new Date(task.createdAt).getTime() <= 24 * 60 * 60 * 1000).length
  }), [tasks]);

  return (
    <article className="panel settings-card model-management-panel">
      <div className="panel-header model-management-header">
        <div>
          <strong>模型管理 / 部署控制台</strong>
          <p className="muted model-management-subtitle">集中查看 CosyVoice / GPT-SoVITS 的目录、健康检查、服务状态、任务历史、失败重试与任务级校验结果。</p>
        </div>
        <button type="button" className="secondary" onClick={() => void onRefresh()}>
          刷新状态
        </button>
      </div>

      <div className="task-filter-toolbar">
        {([
          ['all', `全部任务 ${taskMetrics.all}`],
          ['failed', `失败任务 ${taskMetrics.failed}`],
          ['running', `运行中 ${taskMetrics.running}`],
          ['recent', `最近 24h ${taskMetrics.recent}`]
        ] as [TaskFilter, string][]).map(([key, label]) => (
          <button key={key} type="button" className={taskFilter === key ? 'primary' : 'secondary'} onClick={() => setTaskFilter(key)}>
            {label}
          </button>
        ))}
      </div>

      <div className="model-engine-grid">
        {engines.map((engine) => {
          const manifest = manifests.find((item) => item.providerId === engine.providerId);
          const result = actionResults[engine.providerId];
          const manualImportResult = manualImportResults[engine.providerId];
          const runningAction = actionState[engine.providerId];
          const filteredTasks = filterTasks(tasks.filter((task) => task.providerId === engine.providerId), taskFilter).slice(0, taskFilter === 'all' ? 6 : 8);
          const failedCount = tasks.filter((task) => task.providerId === engine.providerId && task.status === 'failed').length;
          const restoredCount = tasks.filter((task) => task.providerId === engine.providerId && task.stageLabel.includes('中断')).length;
          return (
            <section key={engine.providerId} className="model-engine-card">
              <div className="model-engine-card-header">
                <div>
                  <div className="model-title-row">
                    <strong>{engine.name}</strong>
                    {engine.isPrimary ? <span className="badge-pill badge-primary">主线路</span> : <span className="badge-pill">角色线路</span>}
                  </div>
                  <p className="muted">{engine.description}</p>
                </div>
                <div className="status-badge-group">
                  <span className={`badge-pill health-${engine.health.status}`}>健康：{engine.health.status}</span>
                  <span className={`badge-pill service-${engine.serviceStatus?.status ?? 'manual'}`}>服务：{engine.serviceStatus?.status ?? 'manual'}</span>
                </div>
              </div>

              <div className="model-engine-meta-grid">
                <MetaItem label="Base URL" value={engine.baseUrl} />
                <MetaItem label="Health" value={`${engine.baseUrl}${engine.healthPath}`} />
                <MetaItem label="Synthesize" value={`${engine.baseUrl}${engine.synthesizePath}`} />
                <MetaItem label="Voices" value={engine.voicesPath ? `${engine.baseUrl}${engine.voicesPath}` : '未配置'} />
                <MetaItem label="启动模式" value={engine.startupMode} />
                <MetaItem label="最近健康摘要" value={engine.health.message} />
                <MetaItem label="脚本" value={engine.startupCommand ?? '未配置'} />
                <MetaItem label="工作目录" value={engine.cwd ?? '未配置'} />
                <MetaItem label="环境文件" value={engine.envFile ?? '未配置'} />
                <MetaItem label="命令参数" value={engine.startupArgs.length ? engine.startupArgs.join(' ') : '无'} />
                <MetaItem label="失败历史" value={`${failedCount} 条`} />
                <MetaItem label="重启恢复标记" value={`${restoredCount} 条`} />
                <MetaItem label="上次状态时间" value={formatDateTime(engine.serviceStatus?.updatedAt ?? engine.health.checkedAt)} />
              </div>

              <div className="actions model-actions-row">
                <button type="button" className="secondary" onClick={() => void onCheckEnv(engine.providerId)} disabled={Boolean(runningAction)}>
                  {runningAction === 'checking' ? '检查中…' : '检查环境'}
                </button>
                <button type="button" className="secondary" onClick={() => void onStart(engine.providerId)} disabled={Boolean(runningAction)}>
                  {runningAction === 'starting' ? `启动 ${engine.name} 中…` : `启动 ${engine.name}`}
                </button>
                <button type="button" className="secondary" onClick={() => void onRefresh()} disabled={Boolean(runningAction)}>
                  刷新此页
                </button>
              </div>

              {engine.providerId === 'cosyvoice-local' ? (
                <div className="strategy-card">
                  <div className="task-list-header">
                    <div>
                      <strong>CosyVoice 推荐策略</strong>
                      <p className="muted">官方仓库 + 官方 FastAPI + 官方 ModelScope SFT 权重优先；HuggingFace 与手动导入仅作兜底，不直接宣称完整自动安装。</p>
                    </div>
                    <span className="badge-pill badge-primary">官方优先</span>
                  </div>
                  <div className="model-engine-meta-grid task-meta-grid" style={{ marginBottom: 12 }}>
                    <MetaItem label="当前采用策略" value={engine.manualImport?.activeStrategy?.strategyLabel ?? '未配置'} />
                    <MetaItem label="当前生效来源" value={engine.manualImport?.activeStrategy?.effectiveSource ?? '未配置'} />
                    <MetaItem label="当前生效路径" value={engine.manualImport?.activeStrategy?.effectivePath ?? '未解析'} />
                    <MetaItem label="策略说明" value={engine.manualImport?.activeStrategy?.detail ?? '尚未形成策略'} />
                  </div>
                  <div className="manual-import-grid">
                    {(engine.manualImport?.items ?? []).map((item) => (
                      <article key={`${engine.providerId}-${item.target}`} className="manual-import-card">
                        <div className="task-card-header">
                          <div>
                            <strong>{item.label}</strong>
                            <p className="muted">{item.hint}</p>
                          </div>
                          <span className={`badge-pill import-${item.exists ? 'ready' : 'missing'}`}>{item.exists ? '已承接' : '待导入'}</span>
                        </div>
                        <div className="model-engine-meta-grid task-meta-grid">
                          <MetaItem label="配置键" value={item.envKey} />
                          <MetaItem label="来源" value={item.sourceLabel ?? item.source} />
                          <MetaItem label="当前路径" value={item.selectedPath ?? '未配置'} />
                          <MetaItem label="状态" value={item.exists ? '路径可用' : '尚未落位'} />
                        </div>
                        <div className="task-action-row">
                          <button type="button" className="secondary" onClick={() => void onChooseManualImport(engine.providerId, item.target)} disabled={Boolean(runningAction)}>
                            {item.target === 'repo-dir' ? '手动导入仓库目录' : '手动导入权重目录'}
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="deployment-task-toolbar">
                {(['prepare', 'download', 'install'] as OfflineModelTaskAction[]).map((taskAction) => (
                  <button key={taskAction} type="button" className="secondary" onClick={() => void onCreateTask(engine.providerId, taskAction)} disabled={Boolean(runningAction)}>
                    {runningAction === taskAction ? `${taskLabels[taskAction]}中…` : taskLabels[taskAction]}
                  </button>
                ))}
              </div>

              {result?.providerId === engine.providerId ? (
                <div className={`action-result-card ${result.ok ? 'ok' : 'error'}`}>
                  <strong>{result.ok ? '执行成功' : '执行失败'}</strong>
                  <p>{result.summary}</p>
                  {result.detail ? <pre>{result.detail}</pre> : null}
                  <small className="muted">{formatDateTime(result.checkedAt)}</small>
                </div>
              ) : null}

              {manualImportResult?.providerId === engine.providerId ? (
                <div className={`action-result-card ${manualImportResult.ok ? 'ok' : 'error'}`}>
                  <strong>{manualImportResult.cancelled ? '已取消手动导入' : '手动导入结果'}</strong>
                  <p>{manualImportResult.summary}</p>
                  {manualImportResult.detail ? <pre>{manualImportResult.detail}</pre> : null}
                  <small className="muted">{formatDateTime(manualImportResult.state.checkedAt)}</small>
                </div>
              ) : null}

              <ManifestCard manifest={manifest} />

              <div className="task-list-card">
                <div className="task-list-header">
                  <strong>部署任务历史</strong>
                  <span className="muted">筛选后 {filteredTasks.length} 条</span>
                </div>
                {filteredTasks.length ? (
                  <div className="task-list">
                    {filteredTasks.map((task) => (
                      <TaskCard key={task.taskId} task={task} onRetryTask={onRetryTask} />
                    ))}
                  </div>
                ) : (
                  <p className="muted">当前筛选条件下暂无任务。可先执行“准备任务”，失败任务会支持在此直接重试。</p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </article>
  );
}

function filterTasks(tasks: OfflineModelTaskSnapshot[], filter: TaskFilter) {
  if (filter === 'failed') {
    return tasks.filter((task) => task.status === 'failed');
  }
  if (filter === 'running') {
    return tasks.filter((task) => task.status === 'running' || task.status === 'queued');
  }
  if (filter === 'recent') {
    return tasks.filter((task) => Date.now() - new Date(task.createdAt).getTime() <= 24 * 60 * 60 * 1000);
  }
  return tasks;
}

function ManifestCard({ manifest }: { manifest?: OfflineModelAssetManifest }) {
  const [expanded, setExpanded] = useState(false);
  const metrics = useMemo(() => {
    if (!manifest) {
      return null;
    }
    const checksumAssets = manifest.assets.filter((asset) => asset.fileChecks?.some((check) => Boolean(check.checksumSha256))).length;
    const fileChecks = manifest.assets.reduce((sum, asset) => sum + (asset.fileChecks?.length ?? 0), 0);
    return { checksumAssets, fileChecks };
  }, [manifest]);

  if (!manifest || !metrics) {
    return (
      <div className="manifest-card">
        <div className="task-list-header">
          <strong>资源清单详情</strong>
        </div>
        <p className="muted">当前未加载 manifest。</p>
      </div>
    );
  }

  return (
    <div className="manifest-card">
      <div className="task-list-header">
        <div>
          <strong>资源清单详情</strong>
          <p className="muted">{manifest.summary}</p>
        </div>
        <button type="button" className="secondary" onClick={() => setExpanded((value) => !value)}>
          {expanded ? '收起清单' : '展开清单'}
        </button>
      </div>
      <div className="model-engine-meta-grid task-meta-grid">
        <MetaItem label="Manifest ID" value={manifest.manifestId} />
        <MetaItem label="版本" value={manifest.version} />
        <MetaItem label="资源总数" value={`${manifest.assets.length} 项`} />
        <MetaItem label="必需资源" value={`${manifest.assets.filter((asset) => asset.required).length} 项`} />
        <MetaItem label="文件级可校验项" value={`${metrics.fileChecks} 项`} />
        <MetaItem label="已预置 checksum" value={`${metrics.checksumAssets} 项资产`} />
      </div>
      {expanded ? (
        <div className="manifest-asset-list">
          {manifest.assets.map((asset) => {
            const checksumCount = asset.fileChecks?.filter((check) => Boolean(check.checksumSha256)).length ?? 0;
            return (
              <article key={asset.id} className="manifest-asset-card">
                <div className="task-card-header">
                  <div>
                    <strong>{asset.name}</strong>
                    <p className="muted">{asset.purpose}</p>
                  </div>
                  <div className="status-badge-group">
                    <span className="badge-pill">{asset.required ? '必需' : '可选'}</span>
                    <span className="badge-pill">{asset.category}</span>
                    <span className="badge-pill">校验项 {asset.fileChecks?.length ?? 0}</span>
                    <span className="badge-pill">checksum {checksumCount}</span>
                  </div>
                </div>
                <div className="task-log-block compact-block">
                  <pre>{[
                    `ID: ${asset.id}`,
                    `目标路径: ${asset.targetPath}`,
                    asset.envKey ? `环境变量: ${asset.envKey}` : null,
                    asset.installHint ? `安装提示: ${asset.installHint}` : null,
                    '来源:',
                    ...asset.sources.map((source) => `- [${source.type}] ${source.url}${source.label ? ` | ${source.label}` : ''}${source.priority ? ` | priority=${source.priority}` : ''}${source.isOfficial ? ' | official=yes' : ''}${source.recommended ? ' | recommended=yes' : ''}${source.note ? ` (${source.note})` : ''}${source.checksumSha256 ? ` | sha256=${source.checksumSha256}` : ''}`),
                    '文件级校验:',
                    ...(asset.fileChecks?.map((check) => `- ${check.label} -> ${check.path} | ${check.required ? 'required' : 'optional'} | ${check.checksumSha256 ? `sha256=${check.checksumSha256}` : 'sha256=missing'}${check.note ? ` | ${check.note}` : ''}`) ?? ['- 暂无'])
                  ].filter(Boolean).join('\n')}</pre>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function TaskCard({ task, onRetryTask }: { task: OfflineModelTaskSnapshot; onRetryTask: (taskId: string, providerId: 'cosyvoice-local' | 'gpt-sovits-local') => void | Promise<void> }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <article className={`task-card task-${task.status}`}>
      <div className="task-card-header">
        <div>
          <strong>{task.title}</strong>
          <p className="muted">{task.summary}</p>
        </div>
        <div className="status-badge-group">
          <span className={`badge-pill task-status-${task.status}`}>状态：{task.status}</span>
          <span className="badge-pill">阶段：{task.stageLabel}</span>
          {typeof task.retryCount === 'number' ? <span className="badge-pill">重试次数：{task.retryCount}</span> : null}
        </div>
      </div>

      <div className="model-engine-meta-grid task-meta-grid">
        <MetaItem label="任务 ID" value={task.taskId} />
        <MetaItem label="动作" value={task.action} />
        <MetaItem label="模板 ID" value={task.templateId ?? '无'} />
        <MetaItem label="清单 ID" value={task.manifestId ?? '无'} />
        <MetaItem label="资源数" value={task.resourceCount ? `${task.resourceCount} 项（必需 ${task.requiredResourceCount ?? 0}）` : '无'} />
        <MetaItem label="可校验资产" value={task.verifiableAssetCount ? `${task.verifiableAssetCount} 项` : '无'} />
        <MetaItem label="已带 checksum" value={task.checksumReadyAssetCount ? `${task.checksumReadyAssetCount} 项` : '0'} />
        <MetaItem label="缺失资产" value={typeof task.missingAssetCount === 'number' ? `${task.missingAssetCount} 项` : '无'} />
        <MetaItem label="已 checksum 校验通过" value={typeof task.verifiedAssetCount === 'number' ? `${task.verifiedAssetCount} 项` : '无'} />
        <MetaItem label="创建时间" value={formatDateTime(task.createdAt)} />
        <MetaItem label="更新时间" value={formatDateTime(task.updatedAt)} />
        <MetaItem label="重试来源" value={task.retryOfTaskId ?? '首发任务'} />
        <MetaItem label="错误" value={task.errorMessage ?? '无'} />
      </div>

      {task.status === 'failed' ? (
        <div className="task-action-row">
          <button type="button" className="secondary" onClick={() => void onRetryTask(task.taskId, task.providerId)}>
            重试该任务
          </button>
        </div>
      ) : null}

      {task.resourceSummary?.length ? (
        <div className="task-log-block compact-block">
          <strong>资源摘要</strong>
          <pre>{task.resourceSummary.join('\n')}</pre>
        </div>
      ) : null}

      {task.assetVerificationSummary?.length ? (
        <div className="task-log-block compact-block">
          <strong>校验摘要</strong>
          <pre>{task.assetVerificationSummary.join('\n')}</pre>
        </div>
      ) : null}

      {task.assetDetails?.length ? (
        <div className="task-log-block compact-block">
          <div className="task-list-header">
            <strong>资产校验详情</strong>
            <button type="button" className="secondary" onClick={() => setExpanded((value) => !value)}>
              {expanded ? '收起详情' : '展开详情'}
            </button>
          </div>
          {expanded ? (
            <div className="manifest-asset-list">
              {task.assetDetails.map((asset) => (
                <article key={`${task.taskId}-${asset.assetId}`} className="manifest-asset-card verification-card">
                  <div className="task-card-header">
                    <div>
                      <strong>{asset.assetName}</strong>
                      <p className="muted">{asset.targetPath}</p>
                    </div>
                    <div className="status-badge-group">
                      <span className={`badge-pill verification-${asset.status}`}>{asset.status}</span>
                      <span className="badge-pill">文件 {asset.verifiableFileCount}</span>
                      <span className="badge-pill">checksum {asset.checksumProvidedCount}</span>
                      <span className="badge-pill">缺失 {asset.missingFileCount}</span>
                    </div>
                  </div>
                  <pre>{asset.detailLines.join('\n')}</pre>
                </article>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {task.logTail.length ? (
        <div className="task-log-block">
          <strong>日志片段</strong>
          <pre>{task.logTail.join('\n')}</pre>
        </div>
      ) : null}
    </article>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="model-meta-item">
      <span className="muted">{label}</span>
      <strong title={value}>{value}</strong>
    </div>
  );
}

function formatDateTime(value?: string) {
  if (!value) {
    return '暂无';
  }

  try {
    return new Date(value).toLocaleString('zh-CN', { hour12: false });
  } catch {
    return value;
  }
}
