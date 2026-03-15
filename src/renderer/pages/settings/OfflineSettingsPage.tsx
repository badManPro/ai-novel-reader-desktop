import { ModelManagementPanel } from '../../components/ModelManagementPanel';
import { useSettingsOutlet } from './useSettingsOutlet';

export function OfflineSettingsPage() {
  const {
    offlineHealth,
    offlineServiceStatus,
    offlineConsole,
    offlineModelManifests,
    offlineTasks,
    offlineActionState,
    offlineActionResults,
    offlineManualImportResults,
    refreshOfflineStatus,
    runOfflineAction,
    createOfflineTask,
    retryOfflineTask,
    chooseOfflineManualImport
  } = useSettingsOutlet();

  return (
    <section className="settings-page-stack">
      <article className="route-card settings-route-card">
        <p className="route-page-kicker">Offline</p>
        <h4>离线保底概览</h4>
        <p>把离线健康检查和服务状态收进高级页，普通用户默认不需要先理解这些概念。</p>

        <div className="settings-metric-grid">
          {offlineHealth.map((health) => {
            const service = offlineServiceStatus.find((item) => item.providerId === health.providerId);
            return (
              <div key={health.providerId} className="settings-metric-card">
                <span className="route-page-kicker">{health.providerId}</span>
                <strong>{health.status}</strong>
                <p>{health.message}</p>
                <small className="muted">服务状态：{service?.status ?? 'manual'} · 更新时间：{service?.updatedAt ?? health.checkedAt}</small>
              </div>
            );
          })}
        </div>
      </article>

      <ModelManagementPanel
        engines={offlineConsole}
        tasks={offlineTasks}
        manifests={offlineModelManifests}
        actionState={offlineActionState}
        actionResults={offlineActionResults}
        manualImportResults={offlineManualImportResults}
        onRefresh={refreshOfflineStatus}
        onCheckEnv={(providerId) => runOfflineAction(providerId, 'checking')}
        onStart={(providerId) => runOfflineAction(providerId, 'starting')}
        onCreateTask={createOfflineTask}
        onRetryTask={retryOfflineTask}
        onChooseManualImport={chooseOfflineManualImport}
      />
    </section>
  );
}
