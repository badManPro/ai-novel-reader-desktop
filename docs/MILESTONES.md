# 开发里程碑

## 阶段 0：立项与方案（已完成）
- 明确产品目标
- 技术选型定稿
- 架构分层与模块边界确定
- 输出项目文档
- 落首版工程骨架

## 阶段 1：V0.1 最小可用阅读闭环（已完成）
- 本地 txt 导入
- 基础文本读取
- 基础编码识别
- 简单分章
- 阅读页展示

## 阶段 2：V0.2 语音朗读闭环（已完成）
- TTS Adapter 主路径落地
- Provider 与音色列表查询
- 章节朗读按钮与状态反馈
- 音色切换
- `idle → loading → reading` 状态流转

## 阶段 3：V0.3 数据与设置完善（已完成）
- 本地配置持久化
- 最近阅读记录
- 阅读进度恢复
- 错误提示与日志增强

## 阶段 4：V0.4 主进程模块化与 JSON Store（已完成）
- Main Process JSON Store
- BookImport / ReaderStore / Playback / Catalog 模块拆分
- OpenAI TTS 示例适配器

## 阶段 5：V0.5 数据层升级与阅读体验增强（已完成）
- SQLite（sql.js）持久化替代 `reader-state.json`
- 阅读设置扩展与恢复
- 真实串行朗读队列
- 第二个远程 TTS Provider 骨架：GLM Voice

## 阶段 6：V0.6 播放调度与状态同步补强（已完成）
- 多章节自动续播
- 播放状态事件广播
- Secure config 文件回退结构
- 最小回归测试

## 阶段 7：V0.7 离线语音路线重构（启动并完成首批骨架）
### 本次已交付
- 默认 Provider 切到 `cosyvoice-local`
- 新增离线引擎配置层：`offline-tts-config.ts`
- 新增离线引擎 adapter：CosyVoice / GPT-SoVITS
- 新增离线健康检查服务：`offline-tts-health-service.ts`
- 新增离线调用统一入口：`offline-tts-service.ts`
- `PlaybackService` 接入离线合成主分支
- preload / IPC / renderer 接入离线健康状态展示
- README / ARCHITECTURE / TECH-STACK 更新
- 最小测试补充：离线配置 + 健康检查

### 阶段 7 后续建议
- 真正拉起 Python 本地推理服务
- Voice 列表改为动态发现
- 增加 GPU / 端口 / 模型文件自检
- 引入 FFmpeg 拼接与缓存策略

## 阶段 8：V1.0 AI 辅助阅读（后续）
- 章节摘要
- 生词/名词解释
- 角色梳理
- 段落问答
- 读到当前位置的上下文记忆
