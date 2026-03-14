# 技术选型说明

## 1. 总体技术栈

- 桌面壳：Electron
- 前端 UI：React + TypeScript
- 前端构建：Vite
- 桌面打包：electron-builder
- 类型校验：TypeScript
- 代码规范：ESLint
- 本地离线 TTS 主路线：CosyVoice 3.0 + GPT-SoVITS
- 本地服务编排：Python 服务进程 + Electron 主进程调度
- 当前离线服务接入协议：HTTP health-check + HTTP synthesize

## 2. 当前语音路线决策

### 2.1 主路线
- `cosyvoice-local`：默认主朗读 Provider
- `gpt-sovits-local`：角色 / 克隆 Provider

### 2.2 可选扩展
- `system-say`：开发与兜底回退
- `openai-tts` / `glm-tts`：云端扩展，不再作为默认路径

## 3. 本次代码层设计点

### 3.1 配置层
- `offline-tts-config.ts`：集中维护离线服务 URL / Path / timeout / enabled
- 通过环境变量覆写服务地址，兼容不同开发机与模型部署方式

### 3.2 服务层
- `offline-tts-health-service.ts`：负责 health-check
- `offline-tts-service.ts`：负责 synthesize 请求、音频落盘、错误封装
- `playback-service.ts`：继续承担播放状态推进与事件广播，但离线调用成为主分支

### 3.3 Adapter 层
- `cosyvoice-tts-adapter.ts`
- `gpt-sovits-tts-adapter.ts`
- 先提供 provider/voice 元信息骨架，为后续动态 catalog 打底

## 4. 技术原则

1. 离线模型能力优先于云端 API 能力
2. 主进程统一控制文件路径、端口与本地服务访问
3. 渲染层只看到白名单 API，不直接接触本地服务端口
4. 错误必须显式返回给 UI，而不是吞掉
5. 云端 Provider 保留但退居二线
