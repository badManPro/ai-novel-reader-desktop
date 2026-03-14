import type { OfflineEngineConfig, TtsSpeakRequest, VoiceOption } from '../../shared/types';

interface JsonRecord {
  [key: string]: unknown;
}

export interface OfflineSynthesisRequestOptions {
  headers?: Record<string, string>;
  body: BodyInit;
}

function normalizeSpeed(speed?: number) {
  return typeof speed === 'number' && Number.isFinite(speed) && speed > 0 ? speed : 1;
}

export function buildOfflineSynthesisPayload(config: OfflineEngineConfig, request: TtsSpeakRequest): JsonRecord {
  const common = {
    text: request.text,
    voice: request.voiceId,
    voice_id: request.voiceId,
    speed: normalizeSpeed(request.speed),
    speed_factor: normalizeSpeed(request.speed),
    chapter_id: request.chapterId,
    chapter_title: request.chapterTitle,
    book_id: request.bookId,
    provider_id: request.providerId
  };

  if (config.protocol === 'gpt-sovits-v1') {
    return {
      ...common,
      text_lang: 'zh',
      prompt_lang: 'zh',
      ref_audio_path: process.env.GPTSOVITS_REF_AUDIO_PATH ?? '',
      prompt_text: process.env.GPTSOVITS_PROMPT_TEXT ?? '',
      top_k: Number(process.env.GPTSOVITS_TOP_K ?? 5),
      top_p: Number(process.env.GPTSOVITS_TOP_P ?? 1),
      temperature: Number(process.env.GPTSOVITS_TEMPERATURE ?? 1)
    };
  }

  return {
    ...common,
    stream: false,
    format: 'wav',
    speaker: request.voiceId,
    tts_text: request.text,
    spk_id: request.voiceId || process.env.COSYVOICE_DEFAULT_SPK_ID || '中文女'
  };
}

export function buildOfflineSynthesisRequest(config: OfflineEngineConfig, request: TtsSpeakRequest): OfflineSynthesisRequestOptions {
  const payload = buildOfflineSynthesisPayload(config, request);
  if (config.protocol === 'cosyvoice-v1') {
    const form = new FormData();
    for (const [key, value] of Object.entries(payload)) {
      if (value === undefined || value === null) {
        continue;
      }
      form.set(key, String(value));
    }
    return {
      body: form
    };
  }

  return {
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  };
}

export async function parseOfflineSynthesisResponse(response: Response) {
  const contentType = response.headers.get('content-type') ?? 'application/octet-stream';
  if (contentType.includes('application/json')) {
    const payload = await response.json() as JsonRecord;
    const audioPath = pickString(payload, ['audioPath', 'audio_path', 'path', 'output_path']);
    const audioBase64 = pickString(payload, ['audioBase64', 'audio_base64']);
    const message = pickString(payload, ['message', 'detail', 'error']);
    return {
      kind: 'json' as const,
      contentType,
      audioPath,
      audioBase64,
      message,
      payload
    };
  }

  return {
    kind: 'binary' as const,
    contentType,
    arrayBuffer: await response.arrayBuffer()
  };
}

export function parseVoiceList(config: OfflineEngineConfig, payload: unknown): VoiceOption[] {
  const items = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { voices?: unknown })?.voices)
      ? (payload as { voices: unknown[] }).voices
      : [];

  return items
    .map((item, index) => {
      const record = typeof item === 'object' && item ? item as JsonRecord : {};
      const id = pickString(record, ['id', 'voiceId', 'voice_id', 'speaker', 'name']) ?? `${config.providerId}-voice-${index + 1}`;
      const name = pickString(record, ['name', 'title', 'speaker', 'voice']) ?? id;
      return {
        id,
        name,
        providerId: config.providerId,
        language: pickString(record, ['language', 'lang']) ?? 'zh-CN',
        description: pickString(record, ['description', 'desc']) ?? `来自 ${config.name} 服务的动态音色。`
      } satisfies VoiceOption;
    })
    .filter((item) => Boolean(item.id));
}

function pickString(record: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}
