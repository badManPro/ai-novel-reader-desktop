# offline-tts 脚本说明

本目录的两个启动脚本现在会先做最小体检，再尝试启动真实服务：

- 校验 `*.env` 是否已从示例值改成真实路径
- 校验 `*_MODEL_DIR` 是否存在
- 若仓库内存在 `.venv/bin/python`，优先自动使用
- 校验 Python 解释器是否存在
- 校验入口脚本（`runtime/python/fastapi/server.py` / `api_v2.py` 或你自定义的 `*_ENTRY`）是否存在
- 启动前打印实际使用的 env、python、cwd、entry、监听地址

## 当前机型已落地的真实目录

- CosyVoice 仓库：`/Users/baymax/AI/offline-tts/CosyVoice`
- GPT-SoVITS 仓库：`/Users/baymax/AI/offline-tts/GPT-SoVITS`
- 建议 CosyVoice 模型目录：`/Users/baymax/AI/offline-tts/CosyVoice/pretrained_models/CosyVoice-300M`

## 快速使用

### CosyVoice
```bash
scripts/offline-tts/start-cosyvoice.sh
```

默认配置说明：
- `COSYVOICE_MODEL_DIR` 填的是 **CosyVoice 仓库根目录**
- CosyVoice SFT 生效目录优先级现为：`COSYVOICE_SFT_MODEL_DIR`（手动导入） > `COSYVOICE_EXTRA_ARGS` 中显式 `--model_dir ...` > 仓库内默认 `pretrained_models/CosyVoice-300M-SFT`
- 启动脚本与模型任务校验都会按上面这套优先级执行，不再只是页面展示
- 当前脚本已兼容官方 FastAPI 入口 `runtime/python/fastapi/server.py`
- 注意 `COSYVOICE_EXTRA_ARGS` 若包含空格，需整体加引号，例如：`'--model_dir /absolute/path/to/CosyVoice/pretrained_models/CosyVoice-300M'`

### CosyVoice 当前联调结论（2026-03-14）

- `/Users/baymax/AI/offline-tts/CosyVoice/pretrained_models/CosyVoice-300M` 已补齐关键权重：`llm.pt`、`flow.pt`、`hift.pt`
- `scripts/offline-tts/start-cosyvoice.sh` 已在 Baymax Mac mini 实测可启动，监听 `http://127.0.0.1:9880`
- `CosyVoice-300M-SFT` 已开始补齐到同一仓库下的 `pretrained_models/CosyVoice-300M-SFT`
- 桌面端主路线已调整为：**官方 `/inference_sft` + `spk_id` + multipart/form-data**
- 因此当前建议是：CosyVoice 服务尽快把 `COSYVOICE_EXTRA_ARGS` 切到 `--model_dir .../CosyVoice-300M-SFT`；基础 `CosyVoice-300M` 仅保留作 zero-shot 备用路线

### GPT-SoVITS
```bash
scripts/offline-tts/start-gpt-sovits.sh
```

默认配置说明：
- `GPTSOVITS_MODEL_DIR` 填的是 **GPT-SoVITS 仓库根目录**
- 当前脚本已兼容官方 `api_v2.py` 的 `-a/-p` 参数风格
- 真正可启动还取决于 `GPT_SoVITS/configs/tts_infer.yaml` 指向的权重是否已经到位

## 常见失败含义

### 1）`*_MODEL_DIR 未设置为真实目录`
说明 env 里还是示例占位值，需要改成真实仓库目录。

### 2）`找不到 Python 解释器`
说明 `*_PYTHON` 配置错了，或者仓库尚未创建 `.venv`。

### 3）`入口脚本不存在`
说明该项目的实际启动文件不是默认值，需要把 `*_ENTRY` 改成真实文件名。

### 4）启动后提示缺模型 / 缺权重
说明 Python 环境已到位，但推理权重尚未下载完整；CosyVoice 需要 `--model_dir` 指向有效预训练目录（例如缺 `llm.pt` 就说明模型没下全），GPT-SoVITS 需要 `tts_infer.yaml` 内权重路径可用。

## 当前项目建议

在接入 Electron `spawn` 模式前，优先先手工跑通这两个脚本；脚本可以成功启动后，再把：

```bash
export COSYVOICE_START_MODE=spawn
export GPTSOVITS_START_MODE=spawn
```

交给桌面端自动拉起。
