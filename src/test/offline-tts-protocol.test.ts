import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOfflineSynthesisPayload, buildOfflineSynthesisRequest, parseVoiceList } from '../main/services/offline-tts-protocol';
import { getOfflineEngineConfigs } from '../main/config/offline-tts-config';

const [cosyVoice, gptSovits] = getOfflineEngineConfigs();

test('buildOfflineSynthesisPayload builds cosyvoice-compatible fields', () => {
  const payload = buildOfflineSynthesisPayload(cosyVoice!, {
    providerId: 'cosyvoice-local',
    voiceId: '中文女',
    text: '测试文本',
    speed: 1.2,
    chapterId: 'chapter-1',
    chapterTitle: '第一章',
    bookId: 'book-1'
  });

  assert.equal(payload.voice, '中文女');
  assert.equal(payload.speaker, '中文女');
  assert.equal(payload.speed_factor, 1.2);
  assert.equal(payload.format, 'wav');
  assert.equal(payload.spk_id, '中文女');
});

test('buildOfflineSynthesisRequest builds cosyvoice form-data body for official fastapi', async () => {
  const request = buildOfflineSynthesisRequest(cosyVoice!, {
    providerId: 'cosyvoice-local',
    voiceId: '中文女',
    text: '测试文本',
    speed: 1
  });

  assert.equal(request.headers, undefined);
  assert.ok(request.body instanceof FormData);
  const form = request.body as FormData;
  assert.equal(form.get('tts_text'), '测试文本');
  assert.equal(form.get('spk_id'), '中文女');
});

test('buildOfflineSynthesisPayload builds gpt-sovits-compatible fields', () => {
  const payload = buildOfflineSynthesisPayload(gptSovits!, {
    providerId: 'gpt-sovits-local',
    voiceId: 'role-a',
    text: '测试文本',
    speed: 1
  });

  assert.equal(payload.voice_id, 'role-a');
  assert.equal(payload.text_lang, 'zh');
  assert.ok('top_k' in payload);
});

test('buildOfflineSynthesisRequest keeps gpt-sovits json body', async () => {
  const request = buildOfflineSynthesisRequest(gptSovits!, {
    providerId: 'gpt-sovits-local',
    voiceId: 'role-a',
    text: '测试文本',
    speed: 1
  });

  assert.equal(request.headers?.['Content-Type'], 'application/json');
  assert.equal(typeof request.body, 'string');
  const payload = JSON.parse(request.body as string);
  assert.equal(payload.voice_id, 'role-a');
});

test('parseVoiceList supports provider voice payload aliases', () => {
  const voices = parseVoiceList(cosyVoice!, {
    voices: [
      { voice_id: 'speaker-1', speaker: 'Speaker One', language: 'zh-CN' },
      { id: 'speaker-2', name: 'Speaker Two', lang: 'en-US' }
    ]
  });

  assert.equal(voices.length, 2);
  assert.equal(voices[0]?.id, 'speaker-1');
  assert.equal(voices[0]?.name, 'Speaker One');
  assert.equal(voices[1]?.language, 'en-US');
});
