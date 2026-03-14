# 离线 TTS 真机部署清单 / 环境补齐方案

本文档面向 **ai-novel-reader-desktop 真机联调**，目标不是只解释“接了什么骨架”，而是把 **CosyVoice 3.0 + GPT-SoVITS** 从“代码已预留接口”推进到“本机可实际跑通”。

适用场景：

- 你已经能跑起 Electron 桌面端
- 但离线 TTS 仍卡在仓库目录、模型权重、Python 版本、ffmpeg、推理依赖、env 占位值、接口路径不一致等问题
- 你需要一份按顺序执行的补齐清单，而不是零散提示

---

## 0. 当前已知卡点总览

本项目当前离线 TTS 接线已具备：

- Electron 主进程协议适配层：`src/main/services/offline-tts-protocol.ts`
- 本地服务管理器：`src/main/services/offline-tts-service-manager.ts`
- 启动包装脚本：`scripts/offline-tts/start-cosyvoice.sh` / `start-gpt-sovits.sh`
- 环境模板：`scripts/offline-tts/*.env.example`
- 请求示例：`scripts/offline-tts/*request.example.json`

但真机部署通常还会卡在下面几类问题：

1. **缺真实仓库目录**
   - `COSYVOICE_MODEL_DIR` / `GPTSOVITS_MODEL_DIR` 还是占位值
2. **缺模型权重**
   - 仓库 clone 了，但 inference 所需 checkpoint、speaker、reference audio、tokenizer / config 没补齐
3. **缺 Python 推理依赖**
   - torch / torchaudio / librosa / fastapi / uvicorn / gradio / model runtime 等未装全
4. **缺 ffmpeg**
   - 音频重采样、格式转换、参考音频预处理经常依赖 ffmpeg
5. **Python 版本可能偏低或不兼容**
   - 某些仓库要求 3.10 / 3.11；系统 `python3` 可能太旧、太新、或与依赖轮子不匹配
6. **env 还是占位值**
   - `*_ENTRY`、`*_MODEL_DIR`、`*_REF_AUDIO_PATH`、`*_PROMPT_TEXT` 没有改成真实值
7. **服务 API 与当前项目默认协议不完全一致**
   - 默认健康检查、合成路径、请求字段可能需要按你本地服务微调

---

## 1. 推荐安装顺序（强烈建议照这个顺序来）

不要一上来同时装两个引擎。推荐顺序：

### 第一阶段：先把桌面端自身跑稳

```bash
npm install
npm run typecheck
npm run build
npm test
npm run dev
```

目的：确认桌面端本身没有 Node / Electron 问题。

### 第二阶段：先打通 CosyVoice 3.0

原因：

- 这个项目里它是**默认主朗读引擎**
- 更适合整章、连续朗读链路验证
- 先把一条稳定离线朗读链跑通，能更快验证 UI、IPC、播放器、临时文件落地都正常

### 第三阶段：再接 GPT-SoVITS

原因：

- GPT-SoVITS 更偏角色声线、克隆、参考音频驱动
- 所需素材和参数更多，变量也更多
- 放在第二步更容易定位问题：是桌面端通路问题，还是角色引擎自身问题

### 第四阶段：最后再启用 Electron `spawn` 自动拉起

先手工启动成功，再交给 Electron 自动拉起：

```bash
export COSYVOICE_START_MODE=spawn
export GPTSOVITS_START_MODE=spawn
```

否则一旦失败，你会同时面对：

- Python 环境问题
- 模型路径问题
- API 启动失败
- Electron 管理器等待健康检查失败

调试成本会明显升高。

---

## 2. 推荐目录规划

下面是一套适合 macOS 开发机的推荐目录规划，便于长期维护。

```text
~/workspace/
├── ai-novel-reader-desktop/              # 本项目

~/ai-models/
├── CosyVoice/                            # CosyVoice 仓库或服务封装目录
│   ├── .venv/
│   ├── server.py                         # 举例，真实入口以仓库为准
│   ├── pretrained_models/                # 模型权重示例
│   └── ...
├── GPT-SoVITS/                           # GPT-SoVITS 仓库
│   ├── .venv/
│   ├── api_v2.py                         # 举例，真实入口以仓库为准
│   ├── GPT_weights/
│   ├── SoVITS_weights/
│   ├── references/                       # 推荐额外放参考音频
│   └── ...
└── assets/
    └── speaker_refs/
        ├── narrator.wav
        └── role-a.wav
```

### 为什么建议分开

- **项目代码** 和 **模型仓库/权重** 分开，避免主仓库过大
- 便于以后替换上游仓库实现，而不污染桌面端代码库
- 更利于 `.env` 只写真实绝对路径

### 本项目内建议只保留

```text
ai-novel-reader-desktop/
├── docs/OFFLINE-TTS-SETUP.md
├── scripts/offline-tts/
│   ├── start-cosyvoice.sh
│   ├── start-gpt-sovits.sh
│   ├── cosyvoice.env.example
│   ├── gpt-sovits.env.example
│   ├── cosyvoice-request.example.json
│   └── gpt-sovits-request.example.json
```

不要把大模型权重直接塞进本项目仓库。

---

## 3. 环境要求基线

以下是建议基线，重点是“尽量减少真机踩坑”。

## 3.1 Node / Electron 侧

- Node：以当前项目 lockfile 能正常安装为准
- npm：能正常执行 `npm install` / `npm run build`
- macOS：当前项目默认播放器是 `afplay`，因此 macOS 联调最顺滑

## 3.2 Python 侧

建议：

- **优先 Python 3.10 或 3.11**
- 尽量不要直接依赖系统自带 Python
- 每个引擎各用自己的 `.venv`

原因：

- 很多语音推理仓库对 torch / torchaudio / numpy / gradio / pydantic 版本较敏感
- 用独立虚拟环境最容易隔离依赖冲突

## 3.3 ffmpeg

建议安装并确认可执行：

```bash
ffmpeg -version
ffprobe -version
```

很多常见问题都和 ffmpeg 缺失有关：

- 参考音频读不进去
- 音频采样率不对
- wav/mp3 转换失败
- 推理前预处理失败

## 3.4 GPU / CPU 说明

本文档不强绑定 GPU。若你本机没有合适 CUDA / MPS / Metal 支持，也应先以 **CPU 可跑通** 为目标。

目标顺序应是：

1. 能启动服务
2. 能返回音频
3. 再优化推理速度

而不是反过来。

---

## 4. CosyVoice 3.0 需要准备什么

> 它在本项目里承担“主朗读引擎”职责，优先跑通。

## 4.1 你至少需要准备

1. **真实仓库/服务目录**
   - 填到 `COSYVOICE_MODEL_DIR`
2. **可执行 Python 环境**
   - 推荐：`COSYVOICE_MODEL_DIR/.venv/bin/python`
3. **真实启动入口**
   - 填到 `COSYVOICE_ENTRY`
   - 当前默认值是 `server.py`，仅是占位，不保证你的仓库真叫这个名字
4. **模型权重**
   - 包括但不限于 pretrained model、speaker 资源、config/tokenizer 等
5. **服务监听参数是否支持**
   - 本项目脚本默认以：
     ```bash
     python <entry> --host 127.0.0.1 --port 9880
     ```
   - 如果你的服务 CLI 不支持这种参数，需要改上游服务启动方式，或换一个包装入口
6. **实际健康检查与合成接口路径**
   - 当前项目默认：
     - health: `/health`
     - synth: `/inference/tts`
   - 若你的服务不是这个路径，需要改环境变量

## 4.2 CosyVoice 推荐 env 填法

先复制：

```bash
cp scripts/offline-tts/cosyvoice.env.example scripts/offline-tts/cosyvoice.env
```

然后把占位值改成真实值，例如：

```bash
COSYVOICE_PORT=9880
COSYVOICE_HOST=127.0.0.1
COSYVOICE_PYTHON=/Users/xxx/ai-models/CosyVoice/.venv/bin/python
COSYVOICE_ENTRY=server.py
COSYVOICE_MODEL_DIR=/Users/xxx/ai-models/CosyVoice
COSYVOICE_EXTRA_ARGS=
```

如果服务真实入口不是 `server.py`，必须改成实际文件名。

### 4.2.1 当前这台机器的实测状态（2026-03-14）

- 已验证可启动配置：
  - `COSYVOICE_MODEL_DIR=/Users/baymax/AI/offline-tts/CosyVoice`
  - `COSYVOICE_ENTRY=runtime/python/fastapi/server.py`
- 已确认 `CosyVoice-300M` 关键权重齐全：`llm.pt`、`flow.pt`、`hift.pt`
- 已确认 `start-cosyvoice.sh` 能把官方 FastAPI 服务拉起到 `127.0.0.1:9880`
- 已启动补齐 `CosyVoice-300M-SFT` 到 `pretrained_models/CosyVoice-300M-SFT`，主路线目标切换为 `/inference_sft + spk_id`
- **特别注意**：官方 FastAPI `/inference_sft` 需要 `multipart/form-data`；桌面端若继续发 JSON，会直接与官方服务不兼容

因此当前接入策略已收敛为：

1. **桌面端主路线**
   - 改用 `CosyVoice-300M-SFT`
   - 默认对接 `/inference_sft`
   - 请求体改为 `multipart/form-data`
   - 以 `tts_text + spk_id` 为核心字段
2. **基础 300M 保留为备用**
   - 若 SFT 权重暂未齐全，可临时回到 zero-shot
   - 但这不再是桌面端默认主链路

## 4.3 CosyVoice 接口要求

桌面端默认会发送这类字段：

- `text`
- `voice` / `voice_id` / `speaker`
- `speed` / `speed_factor`
- `chapter_id` / `chapter_title` / `book_id`
- `stream=false`
- `format=wav`

请求样例见：

- `scripts/offline-tts/cosyvoice-request.example.json`

若你的 CosyVoice 服务字段不同，需要对齐：

- 服务端兼容这些字段，或
- 微调 `src/main/services/offline-tts-protocol.ts`

---

## 5. GPT-SoVITS 需要准备什么

> 它在本项目里承担“角色声线 / 参考音频驱动 / 克隆路线”。

## 5.1 你至少需要准备

1. **真实 GPT-SoVITS 仓库目录**
   - 填到 `GPTSOVITS_MODEL_DIR`
2. **独立 Python 环境**
   - 推荐：`GPTSOVITS_MODEL_DIR/.venv/bin/python`
3. **真实 API 入口脚本**
   - 填到 `GPTSOVITS_ENTRY`
   - 当前默认 `api_v2.py` 只是常见命名，不保证你的分支就是它
4. **GPT / SoVITS 权重**
   - 通常至少要有对应 checkpoint
5. **参考音频**
   - 若你走克隆/角色路线，通常需要真实 `ref_audio_path`
6. **提示文本 / prompt**
   - 某些实现对 `prompt_text`、`prompt_lang`、`text_lang` 有要求
7. **ffmpeg / 音频预处理链**
   - GPT-SoVITS 比较常见地依赖参考音频预处理
8. **服务 API 路径**
   - 当前项目默认：
     - health: `/health`
     - synth: `/tts`
   - 若真实接口不同，需改 env 或代码适配

## 5.2 GPT-SoVITS 推荐 env 填法

先复制：

```bash
cp scripts/offline-tts/gpt-sovits.env.example scripts/offline-tts/gpt-sovits.env
```

然后改成真实值，例如：

```bash
GPTSOVITS_PORT=9881
GPTSOVITS_HOST=127.0.0.1
GPTSOVITS_PYTHON=/Users/xxx/ai-models/GPT-SoVITS/.venv/bin/python
GPTSOVITS_ENTRY=api_v2.py
GPTSOVITS_MODEL_DIR=/Users/xxx/ai-models/GPT-SoVITS
GPTSOVITS_REF_AUDIO_PATH=/Users/xxx/ai-models/assets/speaker_refs/narrator.wav
GPTSOVITS_PROMPT_TEXT=这是角色参考提示词
GPTSOVITS_EXTRA_ARGS=
```

### `GPTSOVITS_REF_AUDIO_PATH` 何时必填

- 如果你的服务要求参考音频才能生成稳定音色：**必填**
- 如果你的服务本身已经内置 speaker preset：可以为空，但要以服务实际要求为准

## 5.3 GPT-SoVITS 接口要求

桌面端默认发送：

- `text`
- `voice` / `voice_id`
- `speed` / `speed_factor`
- `text_lang=zh`
- `prompt_lang=zh`
- `ref_audio_path`
- `prompt_text`
- `top_k` / `top_p` / `temperature`

请求样例见：

- `scripts/offline-tts/gpt-sovits-request.example.json`

如果真实服务参数名不同，也需要在 `offline-tts-protocol.ts` 中做映射调整。

---

## 6. 与本项目当前默认协议的对应关系

当前项目默认配置如下：

### CosyVoice

- base URL: `http://127.0.0.1:9880`
- health path: `/health`
- synth path: `/inference/tts`
- start mode: `manual`

### GPT-SoVITS

- base URL: `http://127.0.0.1:9881`
- health path: `/health`
- synth path: `/tts`
- start mode: `manual`

如果你的本地服务不是这些路径，建议优先通过环境变量覆盖：

```bash
export COSYVOICE_BASE_URL=http://127.0.0.1:9880
export COSYVOICE_HEALTH_PATH=/health
export COSYVOICE_SYNTH_PATH=/inference/tts

export GPTSOVITS_BASE_URL=http://127.0.0.1:9881
export GPTSOVITS_HEALTH_PATH=/health
export GPTSOVITS_SYNTH_PATH=/tts
```

如果仅路径不同，先不要动代码；先改 env。

---

## 7. 推荐部署步骤（可直接执行）

## 7.1 步骤 A：确认桌面端可运行

```bash
npm install
npm run typecheck
npm run build
npm test
npm run dev
```

预期：

- 构建通过
- UI 可打开
- 即使离线 TTS 未就绪，也不应影响基础阅读功能

## 7.2 步骤 B：安装系统依赖

至少确认：

```bash
python3 --version
ffmpeg -version
ffprobe -version
```

若 `python3` 版本不理想，建议直接为各自仓库创建独立 `.venv`，不要硬依赖系统 python。

## 7.3 步骤 C：准备 CosyVoice 仓库与权重

你需要确保：

- 仓库目录真实存在
- 能创建并激活 `.venv`
- 能按该仓库官方说明安装依赖
- 模型权重已放到该仓库要求的位置
- 存在真实服务入口脚本

然后编辑：

```bash
scripts/offline-tts/cosyvoice.env
```

## 7.4 步骤 D：手工启动 CosyVoice

```bash
scripts/offline-tts/start-cosyvoice.sh
```

脚本会先校验：

- env 是否还是占位值
- `COSYVOICE_MODEL_DIR` 是否存在
- Python 是否存在
- 入口脚本是否存在

若失败，先把脚本报错清零，再继续。

## 7.5 步骤 E：验证 CosyVoice 服务

至少验证两件事：

1. **健康检查**
2. **实际返回音频**

示例：

```bash
curl http://127.0.0.1:9880/health
```

如果健康接口不是这个路径，就用你真实的路径。

然后根据真实 API 发一次合成请求；至少保证能返回下面三种之一：

1. JSON：`{ "audioPath": "..." }`
2. JSON：`{ "audioBase64": "..." }`
3. `audio/*` 二进制流

桌面端当前支持这三种响应。

## 7.6 步骤 F：在桌面端验证 CosyVoice

1. 打开桌面端
2. 导入 TXT
3. 选择 `cosyvoice-local`
4. 观察：
   - 离线引擎健康
   - 本地服务接线状态
   - 合成是否报错
   - 是否成功落地临时音频并播放

## 7.7 步骤 G：准备 GPT-SoVITS 仓库与权重

与 CosyVoice 同理，但要额外确认：

- `GPT_weights` / `SoVITS_weights` 是否齐全
- 参考音频是否真实存在
- 参考音频格式是否可被当前服务接受
- `prompt_text` 是否需要配套填写

## 7.8 步骤 H：手工启动 GPT-SoVITS

```bash
scripts/offline-tts/start-gpt-sovits.sh
```

预期先通过脚本级校验，再进入服务启动阶段。

## 7.9 步骤 I：验证 GPT-SoVITS 服务

```bash
curl http://127.0.0.1:9881/health
```

然后用真实接口发一次最小合成请求，确保能拿到音频结果。

## 7.10 步骤 J：在桌面端验证 GPT-SoVITS

1. 打开桌面端
2. 选择 `gpt-sovits-local`
3. 输入或选择角色音色方案
4. 观察接线状态与播放结果

## 7.11 步骤 K：最后才启用 `spawn`

当且仅当两个引擎都能手工启动成功后，再启用：

```bash
export COSYVOICE_START_MODE=spawn
export GPTSOVITS_START_MODE=spawn
```

---

## 8. 最小验证清单

以下清单建议逐项打勾：

### 桌面端

- [ ] `npm run typecheck` 通过
- [ ] `npm run build` 通过
- [ ] `npm test` 通过
- [ ] `npm run dev` 能打开 UI

### CosyVoice

- [ ] `COSYVOICE_MODEL_DIR` 已改为真实目录
- [ ] `COSYVOICE_ENTRY` 已改为真实入口（若默认不对）
- [ ] `COSYVOICE_PYTHON` 指向可用解释器
- [ ] 模型权重已到位
- [ ] `/health` 可访问或已改成真实路径
- [ ] `/inference/tts` 可访问或已改成真实路径
- [ ] 手工请求能拿到音频
- [ ] 桌面端能成功播放

### GPT-SoVITS

- [ ] `GPTSOVITS_MODEL_DIR` 已改为真实目录
- [ ] `GPTSOVITS_ENTRY` 已改为真实入口（若默认不对）
- [ ] `GPTSOVITS_PYTHON` 指向可用解释器
- [ ] GPT / SoVITS 权重已到位
- [ ] `GPTSOVITS_REF_AUDIO_PATH` 已配置或确认不需要
- [ ] `GPTSOVITS_PROMPT_TEXT` 已按服务要求填写
- [ ] `/health` 可访问或已改成真实路径
- [ ] `/tts` 可访问或已改成真实路径
- [ ] 手工请求能拿到音频
- [ ] 桌面端能成功播放

---

## 9. 常见报错排查

## 9.1 `*_MODEL_DIR 未设置为真实目录`

原因：

- `scripts/offline-tts/*.env` 仍是示例占位值

处理：

- 打开对应 env
- 将 `/absolute/path/to/...` 改成真实绝对路径

## 9.2 `*_MODEL_DIR 不存在`

原因：

- 路径写错
- 仓库尚未 clone
- 仓库被移动了位置

处理：

```bash
ls -la <真实目录>
```

先确认路径真的存在。

## 9.3 `找不到 Python 解释器`

原因：

- `*_PYTHON` 写错
- `.venv` 还没建
- 系统 `python3` 不在 PATH

处理：

- 优先给对应仓库创建 `.venv`
- 然后把 env 显式写成绝对路径，例如：
  `/Users/xxx/ai-models/CosyVoice/.venv/bin/python`

## 9.4 `入口脚本不存在`

原因：

- 默认 `server.py` / `api_v2.py` 与真实仓库不一致

处理：

```bash
find <仓库目录> -maxdepth 2 -type f | grep -E 'server|api|app|webui'
```

找到真实入口后，改 `*_ENTRY`。

## 9.5 服务启动了，但健康检查失败

原因：

- 真实健康路径不是 `/health`
- 服务虽然启动，但还没 ready
- 端口占用

处理：

- 先手工 `curl` 真正的健康路径
- 检查端口占用
- 若服务启动较慢，先维持 `manual` 模式，不急着交给 Electron 拉起

## 9.6 服务能健康，但合成失败

常见原因：

- 请求字段名不匹配
- 必填参数缺失
- 模型未完全加载
- 参考音频路径无效
- ffmpeg 不存在
- 输入采样率/音频格式不符合要求

处理顺序：

1. 先用 `curl` 或服务自带 demo 验证服务本身
2. 再对照 `scripts/offline-tts/*request.example.json`
3. 最后再微调 `offline-tts-protocol.ts`

## 9.7 返回了 JSON，但桌面端不播放

原因：

- `audioPath` 指向文件不存在
- `audioBase64` 无法正确解码
- 响应 `Content-Type` 不被识别
- 临时文件落地失败

当前桌面端支持：

- `{ audioPath }`
- `{ audioBase64 }`
- `audio/*` 二进制流

若都不符合，需要改服务返回格式，或扩展协议解析。

## 9.8 GPT-SoVITS 角色声线效果异常

原因常见于：

- 参考音频太短/太嘈杂
- prompt 与 ref audio 不匹配
- `text_lang` / `prompt_lang` 设置不一致
- checkpoint 与推理脚本版本不匹配

处理：

- 先用服务官方推荐的最小样例跑通
- 再替换成你自己的参考音频
- 最后才接到桌面端流程里

---

## 10. API / 响应约定备忘

当前桌面端支持三类响应：

### 1）JSON 路径

```json
{ "audioPath": "/tmp/example.wav" }
```

### 2）JSON Base64

```json
{ "audioBase64": "..." }
```

### 3）二进制音频流

例如：

- `Content-Type: audio/wav`
- `Content-Type: audio/mpeg`

如果你的服务不是这三种之一，桌面端需要补协议适配。

---

## 11. 当前项目内与离线 TTS 相关的关键文件

### 文档

- `README.md`
- `docs/OFFLINE-TTS-SETUP.md`
- `scripts/offline-tts/README.md`

### 启动脚本 / 模板

- `scripts/offline-tts/start-cosyvoice.sh`
- `scripts/offline-tts/start-gpt-sovits.sh`
- `scripts/offline-tts/cosyvoice.env.example`
- `scripts/offline-tts/gpt-sovits.env.example`
- `scripts/offline-tts/cosyvoice-request.example.json`
- `scripts/offline-tts/gpt-sovits-request.example.json`

### 运行时接线

- `src/main/services/offline-tts-protocol.ts`
- `src/main/services/offline-tts-service-manager.ts`
- `src/main/config/offline-tts-config.ts`

---

## 12. 建议的落地策略（一句话版）

**先桌面端稳定，再先打通 CosyVoice 主朗读，再打通 GPT-SoVITS 角色声线，最后才切换到 Electron 自动拉起。**

这样最不容易把“环境问题、模型问题、接口问题、桌面端问题”混在一起。
