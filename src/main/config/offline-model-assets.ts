import path from 'node:path';
import type {
  OfflineEngineId,
  OfflineModelAssetFileCheck,
  OfflineModelAssetManifest,
  OfflineModelAssetSource,
  OfflineModelTaskAction,
  OfflineModelTaskTemplate
} from '../../shared/types';
import { getOfflineEngineConfig } from './offline-tts-config';

const projectRoot = path.resolve(__dirname, '../../..');
const scriptsDir = path.join(projectRoot, 'scripts/offline-tts');
const tmpTaskDir = path.join(projectRoot, '.tmp-model-tasks');

function createSource(url: string, type: OfflineModelAssetSource['type'], note?: string, checksumSha256?: string): OfflineModelAssetSource {
  return {
    type,
    url,
    note,
    checksumSha256
  };
}

function createFileCheck(
  id: string,
  label: string,
  filePath: string,
  required = true,
  checksumSha256?: string,
  note?: string,
  downloadUrl?: string,
  downloadUrlEnvKey?: string,
  expectedSizeBytes?: number
): OfflineModelAssetFileCheck {
  return {
    id,
    label,
    path: filePath,
    required,
    checksumSha256,
    note,
    downloadUrl,
    downloadUrlEnvKey,
    expectedSizeBytes
  };
}

export const offlineModelAssetManifests: Record<OfflineEngineId, OfflineModelAssetManifest> = {
  'cosyvoice-local': {
    manifestId: 'cosyvoice-300m-sft-mainline',
    providerId: 'cosyvoice-local',
    engineName: 'CosyVoice 300M SFT Local',
    version: '2026-03-14',
    summary: '主朗读链路：官方 CosyVoice 仓库 + FastAPI 入口 + CosyVoice-300M-SFT 权重目录。',
    assets: [
      {
        id: 'cosyvoice-repo',
        name: 'CosyVoice 仓库',
        purpose: '官方运行时与 FastAPI 服务入口。',
        category: 'repository',
        required: true,
        envKey: 'COSYVOICE_MODEL_DIR',
        targetPath: '${COSYVOICE_MODEL_DIR}',
        installHint: '若目录不存在，可先 git clone 官方仓库；若已存在则执行 git pull --ff-only。',
        sources: [createSource('https://github.com/FunAudioLLM/CosyVoice.git', 'git', '官方仓库')],
        fileChecks: [
          createFileCheck('repo-git-dir', '.git 目录', '${COSYVOICE_MODEL_DIR}/.git', true),
          createFileCheck('repo-readme', 'README', '${COSYVOICE_MODEL_DIR}/README.md', false)
        ]
      },
      {
        id: 'cosyvoice-fastapi-entry',
        name: 'FastAPI 服务入口',
        purpose: '由桌面端启动脚本调用，拉起官方 HTTP 服务。',
        category: 'entry',
        required: true,
        targetPath: '${COSYVOICE_MODEL_DIR}/runtime/python/fastapi/server.py',
        installHint: '当前项目默认使用官方 FastAPI 入口。',
        sources: [createSource('https://github.com/FunAudioLLM/CosyVoice/blob/main/runtime/python/fastapi/server.py', 'http', '入口文件参考')],
        fileChecks: [
          createFileCheck(
            'server-py',
            'server.py',
            '${COSYVOICE_MODEL_DIR}/runtime/python/fastapi/server.py',
            true,
            'e87cd59ac552357dcabbe54711ddc25c35131d974e0b95e247c195c407b8f35f',
            '官方 FastAPI 入口，可直接下载校验',
            'https://raw.githubusercontent.com/FunAudioLLM/CosyVoice/main/runtime/python/fastapi/server.py'
          )
        ]
      },
      {
        id: 'cosyvoice-model-sft',
        name: 'CosyVoice-300M-SFT 权重目录',
        purpose: '桌面端默认主路线，服务通过 /inference_sft + spk_id 朗读。',
        category: 'weights',
        required: true,
        targetPath: '${COSYVOICE_MODEL_DIR}/pretrained_models/CosyVoice-300M-SFT',
        installHint: '需补齐官方 SFT 权重、配置与 tokenizer 文件。',
        sources: [
          createSource('https://www.modelscope.cn/models/iic/CosyVoice-300M-SFT', 'modelscope', '官方权重页面'),
          createSource('https://huggingface.co/FunAudioLLM/CosyVoice-300M-SFT', 'huggingface', '镜像来源，便于外网下载')
        ],
        fileChecks: [
          createFileCheck('sft-config', 'cosyvoice.yaml', '${COSYVOICE_MODEL_DIR}/pretrained_models/CosyVoice-300M-SFT/cosyvoice.yaml', true, undefined, '可通过直链自动下载；建议补固定版本 sha256', undefined, 'COSYVOICE_SFT_CONFIG_URL'),
          createFileCheck('sft-tokenizer', 'speech_tokenizer_v1.onnx', '${COSYVOICE_MODEL_DIR}/pretrained_models/CosyVoice-300M-SFT/speech_tokenizer_v1.onnx', true, undefined, '支持断点续传；建议提供直链', undefined, 'COSYVOICE_SFT_TOKENIZER_URL'),
          createFileCheck('sft-campplus', 'campplus.onnx', '${COSYVOICE_MODEL_DIR}/pretrained_models/CosyVoice-300M-SFT/campplus.onnx', true, undefined, '支持断点续传；建议提供直链', undefined, 'COSYVOICE_SFT_CAMPPLUS_URL'),
          createFileCheck('sft-model', 'llm.pt', '${COSYVOICE_MODEL_DIR}/pretrained_models/CosyVoice-300M-SFT/llm.pt', true, undefined, '大文件下载入口，支持断点续传；建议提供真实 sha256', undefined, 'COSYVOICE_SFT_LLM_URL')
        ]
      },
      {
        id: 'cosyvoice-model-base',
        name: 'CosyVoice-300M 备用权重目录',
        purpose: 'zero-shot / 兼容性回退路线；保留基础权重可用于排障。',
        category: 'weights',
        required: false,
        targetPath: '${COSYVOICE_MODEL_DIR}/pretrained_models/CosyVoice-300M',
        installHint: '建议保留基础版权重用于回退。',
        sources: [
          createSource('https://www.modelscope.cn/models/iic/CosyVoice-300M', 'modelscope', '官方基础权重页面'),
          createSource('https://huggingface.co/FunAudioLLM/CosyVoice-300M', 'huggingface', '镜像来源')
        ],
        fileChecks: [
          createFileCheck('base-config', 'cosyvoice.yaml', '${COSYVOICE_MODEL_DIR}/pretrained_models/CosyVoice-300M/cosyvoice.yaml', false),
          createFileCheck('base-model', 'llm.pt', '${COSYVOICE_MODEL_DIR}/pretrained_models/CosyVoice-300M/llm.pt', false, undefined, '待补真实 sha256')
        ]
      },
      {
        id: 'cosyvoice-env-file',
        name: 'cosyvoice.env',
        purpose: '声明 Python、仓库目录、默认 speaker 与 model_dir。',
        category: 'config',
        required: true,
        targetPath: path.join(scriptsDir, 'cosyvoice.env'),
        installHint: '可从 cosyvoice.env.example 复制生成。',
        sources: [createSource(path.join(scriptsDir, 'cosyvoice.env.example'), 'local-file', '项目内模板')],
        fileChecks: [
          createFileCheck('env-file', 'cosyvoice.env', path.join(scriptsDir, 'cosyvoice.env'), true),
          createFileCheck('env-example', 'cosyvoice.env.example', path.join(scriptsDir, 'cosyvoice.env.example'), true, '63380f72edf4b442472bf1dd02ca278e29896b0f5bb7902347d42ad5cb6bef3a', '项目内模板实值 sha256'),
          createFileCheck('start-script', 'start-cosyvoice.sh', path.join(scriptsDir, 'start-cosyvoice.sh'), true, 'd155628cde5ced45a713edd202d3d3af8124ab3a3fd437421b4260e1cb1e1e37', '启动脚本实值 sha256'),
          createFileCheck('scripts-readme', 'offline-tts README', path.join(scriptsDir, 'README.md'), true, '29d272767866e98497d0baf6ab37a911226514cb44bb19ac169672adf80a941f', '脚本目录说明文档 sha256')
        ]
      }
    ]
  },
  'gpt-sovits-local': {
    manifestId: 'gpt-sovits-v2-mainline',
    providerId: 'gpt-sovits-local',
    engineName: 'GPT-SoVITS Local',
    version: '2026-03-14',
    summary: '角色声线链路：官方 GPT-SoVITS 仓库 + api_v2 服务入口 + GPT/SoVITS 权重 + 参考音频。',
    assets: [
      {
        id: 'gpt-sovits-repo',
        name: 'GPT-SoVITS 仓库',
        purpose: '角色声线与克隆服务运行时。',
        category: 'repository',
        required: true,
        envKey: 'GPTSOVITS_MODEL_DIR',
        targetPath: '${GPTSOVITS_MODEL_DIR}',
        installHint: '若目录不存在，可先 git clone 官方仓库；若已存在则执行 git pull --ff-only。',
        sources: [createSource('https://github.com/RVC-Boss/GPT-SoVITS.git', 'git', '官方仓库')],
        fileChecks: [
          createFileCheck('repo-git-dir', '.git 目录', '${GPTSOVITS_MODEL_DIR}/.git', true),
          createFileCheck('repo-readme', 'README', '${GPTSOVITS_MODEL_DIR}/README.md', false)
        ]
      },
      {
        id: 'gpt-sovits-api-entry',
        name: 'api_v2.py',
        purpose: '桌面端默认调用的 HTTP API 入口。',
        category: 'entry',
        required: true,
        targetPath: '${GPTSOVITS_MODEL_DIR}/api_v2.py',
        installHint: '若你的分支入口不同，需要同步修改 GPTSOVITS_ENTRY。',
        sources: [createSource('https://github.com/RVC-Boss/GPT-SoVITS/blob/main/api_v2.py', 'http', '入口文件参考')],
        fileChecks: [
          createFileCheck(
            'api-v2',
            'api_v2.py',
            '${GPTSOVITS_MODEL_DIR}/api_v2.py',
            true,
            '7a34a5bad6c06fb282b20463987ae5d6a0a65a9cfaa4aadbc520fafb4722f743',
            '官方 api_v2 入口，可直接下载校验',
            'https://raw.githubusercontent.com/RVC-Boss/GPT-SoVITS/main/api_v2.py'
          )
        ]
      },
      {
        id: 'gpt-sovits-gpt-weights',
        name: 'GPT 权重目录',
        purpose: '文本到语义表示推理所需权重。',
        category: 'weights',
        required: true,
        targetPath: '${GPTSOVITS_MODEL_DIR}/GPT_weights',
        installHint: '至少需要一组可被 tts_infer.yaml 引用的 GPT 权重。',
        sources: [
          createSource('https://huggingface.co/lj1995/GPT-SoVITS', 'huggingface', '社区常用发布页'),
          createSource('https://www.modelscope.cn/models?name=GPT-SoVITS', 'modelscope', 'ModelScope 检索入口')
        ],
        fileChecks: [
          createFileCheck('gpt-weights-dir', 'GPT_weights 目录', '${GPTSOVITS_MODEL_DIR}/GPT_weights', true),
          createFileCheck('gpt-sample-weight', 'gpt sample ckpt', '${GPTSOVITS_MODEL_DIR}/GPT_weights', true, undefined, '当前默认仍以目录校验为主；若给出直链可走断点续传下载器', undefined, 'GPTSOVITS_GPT_WEIGHT_URL')
        ]
      },
      {
        id: 'gpt-sovits-sovits-weights',
        name: 'SoVITS 权重目录',
        purpose: '声学合成与音色相关权重。',
        category: 'weights',
        required: true,
        targetPath: '${GPTSOVITS_MODEL_DIR}/SoVITS_weights',
        installHint: '至少需要一组可被 tts_infer.yaml 引用的 SoVITS 权重。',
        sources: [
          createSource('https://huggingface.co/lj1995/GPT-SoVITS', 'huggingface', '社区常用发布页'),
          createSource('https://www.modelscope.cn/models?name=GPT-SoVITS', 'modelscope', 'ModelScope 检索入口')
        ],
        fileChecks: [
          createFileCheck('sovits-weights-dir', 'SoVITS_weights 目录', '${GPTSOVITS_MODEL_DIR}/SoVITS_weights', true),
          createFileCheck('sovits-sample-weight', 'sovits sample ckpt', '${GPTSOVITS_MODEL_DIR}/SoVITS_weights', true, undefined, '当前默认仍以目录校验为主；若给出直链可走断点续传下载器', undefined, 'GPTSOVITS_SOVITS_WEIGHT_URL')
        ]
      },
      {
        id: 'gpt-sovits-ref-audio',
        name: '参考音频',
        purpose: '角色音色克隆 / 参考说话人素材。',
        category: 'reference-audio',
        required: false,
        envKey: 'GPTSOVITS_REF_AUDIO_PATH',
        targetPath: '${GPTSOVITS_REF_AUDIO_PATH}',
        installHint: '若当前路线需要参考音频，则需提供干净、较短、与 prompt 匹配的 wav。',
        sources: [createSource(path.join(projectRoot, 'docs/OFFLINE-TTS-SETUP.md'), 'local-file', '见文档中的 speaker_refs 规划')],
        fileChecks: [
          createFileCheck('ref-audio', '参考音频 wav', '${GPTSOVITS_REF_AUDIO_PATH}', false)
        ]
      },
      {
        id: 'gpt-sovits-env-file',
        name: 'gpt-sovits.env',
        purpose: '声明 Python、仓库目录、参考音频与 prompt 文本。',
        category: 'config',
        required: true,
        targetPath: path.join(scriptsDir, 'gpt-sovits.env'),
        installHint: '可从 gpt-sovits.env.example 复制生成。',
        sources: [createSource(path.join(scriptsDir, 'gpt-sovits.env.example'), 'local-file', '项目内模板')],
        fileChecks: [
          createFileCheck('env-file', 'gpt-sovits.env', path.join(scriptsDir, 'gpt-sovits.env'), true),
          createFileCheck('env-example', 'gpt-sovits.env.example', path.join(scriptsDir, 'gpt-sovits.env.example'), true, 'd2f7614063cdec72ed405910d3eeeb1f2ccb3f4c96370cc7b74eac0cd01bc293', '项目内模板实值 sha256'),
          createFileCheck('start-script', 'start-gpt-sovits.sh', path.join(scriptsDir, 'start-gpt-sovits.sh'), true, 'c166c36afca50b6a8694e6d2823544f2ac8407652402e4e8ddda727c65a95d85', '启动脚本实值 sha256'),
          createFileCheck('scripts-readme', 'offline-tts README', path.join(scriptsDir, 'README.md'), true, '29d272767866e98497d0baf6ab37a911226514cb44bb19ac169672adf80a941f', '脚本目录说明文档 sha256')
        ]
      }
    ]
  }
};

export const offlineModelTaskTemplates: Record<OfflineEngineId, Record<OfflineModelTaskAction, OfflineModelTaskTemplate>> = {
  'cosyvoice-local': {
    prepare: {
      templateId: 'cosyvoice-prepare-v2',
      providerId: 'cosyvoice-local',
      action: 'prepare',
      title: 'CosyVoice · 准备任务',
      summary: '校验 env、入口脚本与 SFT 主路线资产，并输出文件级可校验项 / 缺失项 / 校验状态。',
      stageLabels: {
        preparing: '检查配置',
        verifying: '核验资源',
        completed: '准备完成',
        failed: '准备失败'
      }
    },
    download: {
      templateId: 'cosyvoice-download-v2',
      providerId: 'cosyvoice-local',
      action: 'download',
      title: 'CosyVoice · 下载任务',
      summary: '围绕仓库、SFT 权重与 env 生成明确下载清单，并回填文件级校验视图。',
      stageLabels: {
        preparing: '装载环境',
        downloading: '拉取仓库/梳理权重',
        verifying: '扫描资源落位',
        completed: '下载任务完成',
        failed: '下载任务失败'
      }
    },
    install: {
      templateId: 'cosyvoice-install-v2',
      providerId: 'cosyvoice-local',
      action: 'install',
      title: 'CosyVoice · 安装任务',
      summary: '按主路线检查 Python、入口脚本与 SFT model_dir，产出可执行安装前提与校验状态。',
      stageLabels: {
        preparing: '装载环境',
        installing: '检查运行时',
        verifying: '校验入口',
        completed: '安装任务完成',
        failed: '安装任务失败'
      }
    }
  },
  'gpt-sovits-local': {
    prepare: {
      templateId: 'gpt-sovits-prepare-v2',
      providerId: 'gpt-sovits-local',
      action: 'prepare',
      title: 'GPT-SoVITS · 准备任务',
      summary: '校验 env、api_v2 入口、权重目录与参考音频配置，并输出文件级核验状态。',
      stageLabels: {
        preparing: '检查配置',
        verifying: '核验资源',
        completed: '准备完成',
        failed: '准备失败'
      }
    },
    download: {
      templateId: 'gpt-sovits-download-v2',
      providerId: 'gpt-sovits-local',
      action: 'download',
      title: 'GPT-SoVITS · 下载任务',
      summary: '围绕仓库、GPT/SoVITS 权重与参考音频生成具体资源清单，并回填文件级校验视图。',
      stageLabels: {
        preparing: '装载环境',
        downloading: '拉取仓库/梳理权重',
        verifying: '扫描资源落位',
        completed: '下载任务完成',
        failed: '下载任务失败'
      }
    },
    install: {
      templateId: 'gpt-sovits-install-v2',
      providerId: 'gpt-sovits-local',
      action: 'install',
      title: 'GPT-SoVITS · 安装任务',
      summary: '按角色声线路线检查 Python、入口、权重与可选参考音频，并输出校验状态。',
      stageLabels: {
        preparing: '装载环境',
        installing: '检查运行时',
        verifying: '校验入口',
        completed: '安装任务完成',
        failed: '安装任务失败'
      }
    }
  }
};

export function getOfflineModelAssetManifest(providerId: OfflineEngineId) {
  return offlineModelAssetManifests[providerId];
}

export function listOfflineModelAssetManifests() {
  return Object.values(offlineModelAssetManifests);
}

export function getOfflineModelTaskTemplate(providerId: OfflineEngineId, action: OfflineModelTaskAction) {
  return offlineModelTaskTemplates[providerId][action];
}

export function getOfflineTaskRuntimePaths(providerId: OfflineEngineId) {
  const engine = getOfflineEngineConfig(providerId);
  return {
    projectRoot,
    scriptsDir,
    tmpTaskDir,
    envFile: engine?.startup.envFile ?? '',
    startupCommand: engine?.startup.command ?? '',
    startupCwd: engine?.startup.cwd ?? projectRoot
  };
}
