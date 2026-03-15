# 架构设计

## 1. 总体架构

系统继续采用 Electron 三层结构，并将**云端 TTS 主朗读 + 本地离线兜底**作为当前产品主链路：

1. **Main Process**：窗口管理、文件系统访问、SQLite 持久化、TTS 队列调度、播放事件广播、云端 TTS 调用与本地离线兜底编排
2. **Preload Layer**：安全桥接层，暴露最小 API、离线健康状态查询、接线状态查询与事件订阅入口
3. **Renderer Layer**：React UI，负责书库、阅读体验、设置、播放控制、健康状态与接线状态展示
4. **Remote Voice Layer**：OpenAI / GLM 等云端 TTS，负责默认整章连续朗读
5. **Offline Voice Engine Layer**：CosyVoice + GPT-SoVITS，本地服务化运行，用于离线兜底与角色声线扩展

## 2. 当前主路径

### 2.1 云端优先语音调用链路
```text
Renderer 发起朗读请求
  ↓ IPC: tts:speak
Main.PlaybackService
  ↓ buildPlaybackQueue()
选择默认云端 Provider
  ↓ 调用 Remote TTS Adapter
生成音频 / 流式片段
  ↓
Main 将音频落临时文件或播放器缓冲
  ↓
afplay 播放
  ↓
PlaybackEventBus.publish(state)
  ↓
Renderer 自动刷新状态
```

### 2.2 离线兜底与角色声线链路
```text
云端不可用 / 用户启用隐私模式 / 用户进入角色模式
  ↓
Main.PlaybackService 根据 fallbackPolicy 切换本地 Provider
  ↓
OfflineTtsService.synthesize()
  ↓ ensureReady() / check health
OfflineTtsServiceManager + OfflineTtsHealthService
  ↓ POST local engine endpoint
offline-tts-protocol.ts 统一构造请求
  ↓
CosyVoice / GPT-SoVITS local service
  ├─ 返回 JSON audioPath
  ├─ 返回 JSON audioBase64
  └─ 或返回 audio/* binary
  ↓
Main 将音频落临时文件
  ↓
afplay 播放
  ↓
PlaybackEventBus.publish(state)
  ↓
Renderer 自动刷新状态
```

### 2.3 离线健康检查与接线状态链路
```text
Renderer 启动 / 手动刷新
  ├─ IPC: tts:offline-health
  └─ IPC: tts:offline-service-status
        ↓
TtsCatalogService
  ├─ OfflineTtsHealthService.checkAll()
  └─ OfflineTtsServiceManager.getStatusList()
        ↓
返回 healthy / degraded / unreachable / disabled
以及 manual / idle / starting / running / error
        ↓
Renderer 展示引擎状态与接线提示
```

### 2.4 多章节自动续播链路
```text
Renderer 选择当前章节并点击“开始自动续播”
  ↓
playback-events.ts 生成 chapterSequence（当前章 → 末章）
  ↓
Preload.speak(request + chapterSequence)
  ↓ IPC: tts:speak
Main.PlaybackService
  ↓
chapter-playback-queue.ts
  ├─ 先按章节顺序展开
  ├─ 每章再切为多个 PlaybackQueueItem
  └─ 生成跨章节连续队列
  ↓
PlaybackService.playQueue() 串行推进
```

## 3. 新增关键模块

```text
src/main/config/
└── offline-tts-config.ts            # 离线引擎配置、协议、启动模式与 env 路径

src/main/services/
├── offline-tts-health-service.ts    # 本地服务健康检查
├── offline-tts-protocol.ts          # CosyVoice / GPT-SoVITS 请求响应适配
├── offline-tts-service-manager.ts   # 本地包装脚本启动与状态管理
├── offline-tts-service.ts           # 离线 TTS 统一入口与错误封装
├── playback-service.ts              # 云端优先，本地兜底的播放编排核心
├── playback-event-bus.ts            # 播放事件广播
└── reader-store-service.ts          # SQLite 持久化

scripts/offline-tts/
├── start-cosyvoice.sh               # CosyVoice 启动包装脚本
├── start-gpt-sovits.sh              # GPT-SoVITS 启动包装脚本
├── *.env.example                    # 本地服务配置模板
└── *request.example.json            # 请求协议示例
```

## 4. 设计原则

1. **云端优先**：默认 Provider 使用云端 TTS 处理整章与长文本朗读
2. **本地兜底**：无网、隐私优先或云端失败时才切入本地朗读链路
3. **角色分工明确**：CosyVoice 负责离线保底，GPT-SoVITS 负责角色声线
4. **Electron 架构不推翻**：保持现有 IPC、Preload、Renderer 交互方式兼容
5. **本地服务异常可观测**：必须有健康检查、接线状态、错误信息与返回状态
6. **允许先接壳层再接真推理**：即便 Python 推理未完整安装，也能先联调协议、脚本、env 与 UI
7. **动态发现优先，骨架回退兜底**：音色列表优先请求本地服务，失败时自动回退内置值

## 5. 当前边界

- 当前完成的是**可落地接线层**，不包含模型权重与 Python 环境自动安装
- 启动脚本使用通用参数封装，真实项目入口文件与参数仍需按各仓库版本核对
- 音频播放仍以 macOS `afplay` 为已验证链路
- Windows / Linux 需补跨平台播放器适配
- 真正的角色素材管理、模型下载、GPU 资源检测仍在后续阶段
