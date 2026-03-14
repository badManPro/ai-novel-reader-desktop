# 离线模型任务模板与资源清单

本文档说明当前项目如何把 **CosyVoice / GPT-SoVITS** 的部署工作拆成可追踪的 **task templates**、**asset manifests** 与 **文件级校验视图**，并接到现有页面任务系统中。

## 1. 本轮新增了什么

### 代码入口

- `src/main/config/offline-model-assets.ts`
  - manifest 中每个 asset 新增 `fileChecks[]`
  - 支持列出完整 manifests，供 IPC / 页面消费
  - 模板版本升级到 `*-v2`
- `src/main/services/offline-model-task-service.ts`
  - 任务执行时输出统一的 `asset verify :: ...` 日志
  - 任务快照中新增可校验资产数、checksum 覆盖数、缺失资产数、校验通过数、资产详情
  - 新增 SQLite 持久化、重启恢复、失败任务重试能力
- `src/shared/types.ts`
  - 新增文件级校验、校验状态、任务详情类型
  - 任务记录补充 `retryCount / retryOfTaskId`
- `src/main/index.ts`
  - 新增 `tts:offline-model-asset-manifests` IPC
  - 新增 `tts:offline-model-task-retry` IPC
- `src/preload/index.ts`
  - 暴露 `getOfflineModelAssetManifests()`
  - 暴露 `retryOfflineModelTask()`
- `src/renderer/components/ModelManagementPanel.tsx`
  - 页面可展开完整 manifest
  - 任务卡片可展开资产校验详情，不再只显示摘要
  - 新增失败任务重试按钮与任务筛选

## 2. 资源清单结构

每个 manifest 至少包含：

- `manifestId`
- `providerId`
- `engineName`
- `version`
- `summary`
- `assets[]`

每个 asset 至少包含：

- `id`
- `name`
- `purpose`
- `category`
- `required`
- `targetPath`
- `envKey`（可选）
- `installHint`（可选）
- `sources[]`
- `fileChecks[]`（新增）

每个 `fileChecks[]` 项至少包含：

- `id`
- `label`
- `path`
- `required`
- `checksumSha256`（可选）
- `note`（可选）

## 3. 当前校验框架做到什么程度

### 已做到

- 可以识别 **哪些 asset 有文件级可校验项**
- 可以识别 **哪些校验项缺少 checksum**
- 任务运行中会把校验结果解析为统一状态：
  - `pending`
  - `missing`
  - `exists-unverified`
  - `checksum-passed`
  - `checksum-failed`
  - `not-applicable`
- 页面上可看到：
  - manifest 级别：完整 asset 列表、来源、目标路径、文件级校验项、checksum 是否预置
  - task 级别：每个 asset 的校验状态、缺失数、checksum 覆盖数、详情行

### 当前限制

- 大部分大权重文件 **仍未内置固定 sha256**，所以目前主要会落到：
  - `missing`
  - `exists-unverified`
- 只有当 `fileChecks[].checksumSha256` 补齐时，任务系统才会进入真正的 `checksum-passed / checksum-failed` 文件哈希校验
- GPT / SoVITS 权重当前先按目录级 / 代表性文件级框架建模，尚未细化到具体 checkpoint 名单
- 但下载链路已支持：
  - 基于 `fileChecks[].downloadUrl / downloadUrlEnvKey` 生成真实下载计划
  - `.part` 临时文件续传
  - `.download-state.json` 状态落盘
  - 下载完成后自动做文件级 sha256 校验（若 manifest 已给实值）

## 4. 任务模板如何工作

目前每个 provider 仍有三类模板：

- `prepare`
  - 复制 env 示例（若尚未存在）
  - 加载 env
  - 检查 manifest 中各 asset 是否存在
  - 输出每个 file check 的状态
- `download`
  - 加载 env
  - 对仓库类资源执行 git 拉取
  - 对权重/参考音频/配置类资源输出明确下载提示与来源 URL
  - 产出文件级校验日志
- `install`
  - 加载 env
  - 校验 Python / model dir / entry
  - 再按 manifest 核验 asset + file check 状态

因此，现在的任务系统已经具备：

**provider -> template + manifest + fileChecks -> 生成部署任务 -> 输出可消费的校验结果**。

## 5. 页面变化

模型管理页现在增加了两层详情：

### manifest 详情

每个 provider 卡片中可展开查看：

- Manifest ID / 版本
- 资源总数 / 必需资源数
- 文件级可校验项总数
- 已预置 checksum 的资产数
- 每个 asset 的：
  - 目标路径
  - 环境变量
  - 来源 URL
  - 文件级校验项
  - 哪些校验项还缺少 checksum

### task 校验详情

每张任务卡片中可查看：

- 可校验资产数
- 已带 checksum 的资产数
- 缺失资产数
- 已 checksum 校验通过的资产数
- 展开后每个 asset 的状态与明细行

## 6. 当前完成度与后续建议

### 当前完成度

已达到：

- [x] CosyVoice / GPT-SoVITS 都有独立 manifest
- [x] manifest 内有真实来源 URL、目标路径、用途、必需性
- [x] manifest 内有文件级 `fileChecks[]`
- [x] 任务系统可识别可校验项 / 缺失项 / 校验状态
- [x] IPC 已暴露完整 manifests
- [x] UI 已能展开完整 asset 列表与任务校验详情
- [x] 最小测试已覆盖 manifest 列表与 task command 中的校验输出

### 下一步建议

- [ ] 给权重项补真实 `checksumSha256`
- [ ] 针对目录型权重资产定义更细的 checkpoint 白名单
- [ ] 增加“重新校验”与“仅显示缺失项”筛选
- [ ] 为不同上游分支（如不同 GPT-SoVITS 入口）拆更多模板版本
