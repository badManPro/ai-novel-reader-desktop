# 模块拆分

## 1. 主模块列表

### 1.1 App Shell
职责：应用启动、窗口创建、全局布局、菜单与系统事件。

### 1.2 Reader Core
职责：
- 当前书籍上下文
- 当前章节渲染
- 阅读展示
- 后续阅读进度与排版设置

### 1.3 Library / Bookshelf
职责：
- 已导入书籍列表
- 最近阅读
- 书籍元数据维护

当前阶段仍未持久化，仅保留单书阅读上下文。

### 1.4 Import & Parsing
职责：
- 文件选择
- 格式识别
- txt 编码识别
- 分章规则执行
- 统一数据结构输出

当前已落地：
- `books:import-txt` IPC
- 常见编码候选解码
- 文本清洗与基础章节拆分
- `ImportBookResult` 输出

### 1.5 AI Provider Module
职责：
- LLM Provider 抽象
- GPT/GLM/Kimi 配置与调用适配
- 能力发现与错误处理

当前仍为预留模块。

### 1.6 TTS Provider Module
职责：
- 音色列表查询
- 朗读请求封装
- 音频结果管理
- 供应商差异抹平

当前已落地：
- `tts:list-providers`
- `tts:list-voices`
- `tts:speak-mock`
- Mock TTS provider + 3 个音色

### 1.7 Audio Playback
职责：
- 播放、暂停、继续、停止
- 播放进度与 UI 同步
- 缓存与断点（后续）

当前仅实现状态流转，尚未接入真实音频播放。

### 1.8 Settings
职责：
- 服务商配置
- API Key 管理
- 默认模型/默认音色
- 阅读偏好

当前只覆盖运行时选择 provider / voice。

## 2. 当前目录结构

```text
src/
├── main/
│   └── index.ts          # 窗口、IPC、txt 导入、编码识别、mock tts
├── preload/
│   └── index.ts          # 安全桥接 API
├── renderer/
│   ├── main.tsx
│   ├── App.tsx
│   ├── components/
│   │   └── ReaderShell.tsx
│   └── styles/
│       └── global.css
└── shared/
    └── types.ts          # Book / Import / TTS 共享类型
```

## 3. 模块边界原则

- Reader 不直接依赖具体 Provider SDK
- Provider 不感知 UI 结构
- 解析器只负责结构化文本，不负责播放逻辑
- Audio 模块不感知文件格式来源
- Settings 是全局依赖源，但不承担业务逻辑

## 4. 当前优先级

P0（已完成主路径）：
- App Shell
- Reader Core 基础展示
- Import & Parsing 主路径
- TTS Adapter 主路径

P1（下一步）：
- Audio Playback 真正落地
- Library 持久化
- Reader 设置

P2：
- 更细的 AI 辅助能力
- 丰富的阅读布局能力
- 多格式解析
