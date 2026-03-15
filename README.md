# AI Novel Reader Desktop

一个面向桌面场景的 **AI 读小说客户端**，基于 Electron + React + TypeScript 构建。当前产品路线已切换到 **云端 TTS 主朗读 + 本地离线兜底**。

新的语音主路线：
- **云端 Provider（OpenAI TTS / GLM TTS 等）**：默认主朗读引擎，负责长文本、整章与稳定连续朗读
- **本地轻量 Provider / system-say**：离线、隐私优先或云端不可用时的保底兜底
- **GPT-SoVITS / 其他本地角色模型**：角色声线、声音克隆与人物化演绎引擎，仅在高级场景启用

> 当前重点链路已调整为：**TXT 导入 → SQLite 持久化 → 书库 / 阅读展示 → 云端 TTS 整章朗读 → 本地离线兜底 / 角色声线 → 播放状态事件驱动 UI**。

## 第八阶段本次新增实现

### 1. 本地服务协议适配层做实
- 新增 `src/main/services/offline-tts-protocol.ts`
- 将 CosyVoice / GPT-SoVITS 的请求字段统一映射为可落地结构
- 支持三类响应：
  - JSON `{ audioPath }`
  - JSON `{ audioBase64 }`
  - `audio/*` 二进制音频流

### 2. 本地服务管理器补齐
- 新增 `src/main/services/offline-tts-service-manager.ts`
- 支持：
  - 读取启动脚本与 env 模板
  - 区分 `manual` / `spawn` 两种启动模式
  - 在 `spawn` 模式下尝试等待健康检查通过
  - 汇总本地服务接线状态，供 renderer 展示

### 3. 启动脚本 / 配置模板 / 请求样例补齐
- 新增 `scripts/offline-tts/start-cosyvoice.sh`
- 新增 `scripts/offline-tts/start-gpt-sovits.sh`
- 新增 `scripts/offline-tts/*.env.example`
- 新增 `scripts/offline-tts/*request.example.json`

### 4. 音色列表支持动态发现
- `TtsCatalogService` 会优先请求本地服务的 `voicesPath`
- 获取失败时回退到内置骨架音色，避免 UI 空白或联调阻塞

### 5. 长文本 TTS 缓存治理补齐
- `PlaybackDiskCache` 新增容量上限：默认 **512 MB / 2000 条**，支持环境变量覆盖
- 缓存清理策略改为 **LRU 风格淘汰**：按 `lastAccessedAt` 最久未使用优先，若相同再按 `createdAt` 最早优先
- 缓存根目录新增整本级 `manifest.json`，按 `book -> chapter -> entry` 汇总缓存索引、体积、更新时间，便于恢复与排查
- renderer 状态面板新增磁盘缓存占用、累计清理条数展示，便于观察长文本预取与落盘结果

### 6. Electron 架构保持兼容
- 继续沿用 Electron main / preload / renderer 三层结构
- 新增 IPC：`tts:offline-service-status`
- renderer 增加“本地服务接线状态”面板
- 现有播放状态事件广播、自动续播、SQLite 状态持久化全部保留

### 7. 模型部署任务历史持久化 + 重试
- `OfflineModelTaskService` 现在会把任务历史落到用户目录下的 `offline-model-tasks.sqlite`
- 应用重启后可恢复最近任务历史，并继续展示基础状态、日志尾部、资源摘要、校验摘要
- 对于重启前仍处于 `queued/running` 的任务，启动后会自动标记为“上次运行中断”，避免误判仍在执行
- 新增失败任务重试入口：renderer 可直接重新触发同 provider / 同 action 的任务
- 页面新增任务筛选：全部 / 失败 / 运行中 / 最近 24h，并展示失败历史与恢复标记计数

### 8. 真实下载器 + 断点续传 + 文件校验实值
- 新增 `src/main/services/offline-model-downloader.ts`
- 下载任务不再只输出提示：对于 manifest 中带 `downloadUrl` / `downloadUrlEnvKey` 的文件，会进入真实下载执行
- 支持：
  - `.part` 临时文件断点续传
  - `.download-state.json` 状态侧写
  - Range 不支持时自动回退整文件重下
  - 完成后自动做 sha256 校验（若 manifest 已预置 checksum）
- 当前已补上部分可核验实值：
  - `scripts/offline-tts/*.env.example`
  - `scripts/offline-tts/start-*.sh`
  - `scripts/offline-tts/README.md`
  - 官方入口文件 `server.py` / `api_v2.py` 的真实 sha256 与直链
- 大模型权重位默认通过 `*_URL` 环境变量接入真实直链，避免把不稳定的大文件 URL 硬编码进仓库；一旦提供 URL，即可进入可恢复下载流程

## 当前 Provider 结构

### 云端主链路（默认推荐）
1. `openai-tts`
   - 默认主 Provider
   - 推荐承担整章连续朗读与长文本播放
2. `glm-tts`
   - 云端备选 Provider
   - 用于云端能力切换或区域性备份

### 本地离线兜底
1. `system-say`
   - 最小可用回退
   - 适合无网、调试或极简兜底
2. `cosyvoice-local`
   - 本地轻量朗读保底
   - 适合隐私优先或云端失败时降级

### 本地角色声线扩展
1. `gpt-sovits-local`
   - 角色声线 / 克隆路线
   - 适合人物化段落或高级配音扩展

## 离线服务环境变量示例

```bash
export COSYVOICE_BASE_URL=http://127.0.0.1:9880
export COSYVOICE_HEALTH_PATH=/docs
export COSYVOICE_SYNTH_PATH=/inference_sft
export COSYVOICE_DEFAULT_SPK_ID=中文女
export COSYVOICE_START_MODE=manual

export GPTSOVITS_BASE_URL=http://127.0.0.1:9881
export GPTSOVITS_HEALTH_PATH=/health
export GPTSOVITS_SYNTH_PATH=/tts
export GPTSOVITS_START_MODE=manual
```

> 若要让主进程尝试拉起包装脚本，可将 `*_START_MODE` 改为 `spawn`，并补齐 `scripts/offline-tts/*.env`。

## 快速联调

```bash
npm install
cp scripts/offline-tts/cosyvoice.env.example scripts/offline-tts/cosyvoice.env
cp scripts/offline-tts/gpt-sovits.env.example scripts/offline-tts/gpt-sovits.env
npm run typecheck
npm run build
npm test
npm run dev
```

然后按这个顺序联调：
1. 先配置云端 Provider（如 `openai-tts`）并确认可发起朗读
2. 导入 TXT
3. 选择默认云端 Provider 并点击“开始自动续播”
4. 观察播放状态、错误提示与章节连续朗读结果
5. 再把 `scripts/offline-tts/*.env` 从占位值改成真实路径
6. 手工跑通 **CosyVoice-300M-SFT**，验证离线兜底可用
7. 再手工跑通 **GPT-SoVITS**，验证角色声线场景
8. 两个本地引擎都可用后，再考虑切到 `spawn` 模式

> 真机部署清单、目录规划、环境要求、安装顺序、验证步骤、常见报错排查，见：[`docs/OFFLINE-TTS-SETUP.md`](./docs/OFFLINE-TTS-SETUP.md)

## 文档索引
- [架构设计](./docs/ARCHITECTURE.md)
- [离线 TTS 联调说明](./docs/OFFLINE-TTS-SETUP.md)
- [开发里程碑](./docs/MILESTONES.md)
- [模块拆分](./docs/MODULES.md)
- [产品需求文档](./docs/PRD.md)
- [技术选型说明](./docs/TECH-STACK.md)
- [风险与接口策略](./docs/RISKS-AND-INTEGRATIONS.md)
- [V1 路线图](./docs/ROADMAP-V1.md)

## 当前验证结果

本次计划执行：
```bash
npm run typecheck
npm run build
npm test
```

若本地未安装完整 Python 推理环境，构建与测试仍应可通过；默认云端朗读链路应先可用，本地 CosyVoice / GPT-SoVITS 作为离线与角色声线扩展能力再做联调。
