# 风险与接口策略

## 1. 主要风险

### 1.1 文件格式复杂度风险
- txt 编码可能混乱，存在乱码风险
- epub 结构相对标准但不同书源差异较大
- pdf 可能是扫描件，文本提取不稳定

**策略：**
- 一期只承诺 txt
- parser 输出统一 warning 结构
- PDF 先作为预留能力，不在一期承诺可用

### 1.2 离线引擎集成风险
- CosyVoice 3.0 与 GPT-SoVITS 的部署方式、推理依赖、输入输出协议可能不同
- 离线模型对 CPU/GPU、显存、系统环境要求较高
- 角色声线模型、参考音频、权重文件管理复杂

**策略：**
- 统一 adapter contract
- 所有离线引擎能力通过 capability 声明
- 对音色/角色声线元数据做标准化映射
- 对文本长度限制做切片器层处理
- 将模型服务启动、健康检查、错误提示纳入主进程服务层

### 1.3 本地资源与性能风险
- 长篇小说离线朗读会持续占用 CPU/GPU 与内存
- 长文本连续合成可能导致本地队列阻塞、机器发热或耗电明显

**策略：**
- 引入 chunking 策略
- 做队列化与资源占用监控
- 支持按章节/按选中段落朗读
- 为不同机器提供性能档位与降级策略

### 1.4 安全风险
- API Key 泄露
- renderer 误暴露本地文件能力
- 第三方返回异常数据导致 UI 崩溃

**策略：**
- 使用 preload 白名单 API
- 密钥不进入前端持久化明文
- 所有外部响应先经 schema 校验

### 1.5 性能风险
- 超长章节渲染卡顿
- 音频缓存占用空间过大
- 大文件解析阻塞主线程

**策略：**
- 分段虚拟化渲染
- 大任务移入后台服务/worker
- 音频缓存设置容量与清理策略

## 2. 接口策略

## 2.1 LLM Provider Contract（建议）

```ts
interface LLMProvider {
  providerId: string;
  displayName: string;
  validateConfig(config: unknown): Promise<boolean>;
  listModels(): Promise<ModelDescriptor[]>;
  invoke(input: LLMRequest): Promise<LLMResponse>;
}
```

## 2.2 TTS Provider Contract（建议）

```ts
interface TTSProvider {
  providerId: string;
  displayName: string;
  validateConfig(config: unknown): Promise<boolean>;
  listVoices(): Promise<VoiceDescriptor[]>;
  synthesize(input: TTSRequest): Promise<TTSResult>;
}
```

## 2.3 Book Parser Contract（建议）

```ts
interface BookParser {
  format: 'txt' | 'epub' | 'pdf' | 'md';
  canParse(filePath: string): boolean;
  parse(filePath: string): Promise<BookSnapshot>;
}
```

## 3. 集成优先顺序建议

### 第一批
- txt parser
- CosyVoice 3.0 适配器
- GPT-SoVITS 适配器

### 第二批
- 配置持久化
- 本地模型服务管理
- 音频播放器

### 第三批
- epub parser
- AI 摘要/解释
- 可选云端 Provider 扩展

## 4. 对外依赖策略

- 所有第三方 SDK 或离线引擎调用尽量封装在 infrastructure/providers 或 adapters 内
- 避免在 UI 层直接引用具体 SDK
- 当离线引擎或可选云端 Provider 变动时，仅影响 adapter，不影响 Reader Core
