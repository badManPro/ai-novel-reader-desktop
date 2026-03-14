import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyEnvUpdates,
  buildManualImportEnvUpdates,
  parseEnvContent
} from '../main/services/offline-tts-console-service';
import { getOfflineModelAssetManifest } from '../main/config/offline-model-assets';

test('manual import env updates patch existing env content and append new keys', () => {
  const original = [
    'COSYVOICE_MODEL_DIR=/old/repo',
    'COSYVOICE_PYTHON=/venv/bin/python'
  ].join('\n');

  const updates = buildManualImportEnvUpdates('cosyvoice-local', 'weights-dir', '/manual/CosyVoice-300M-SFT');
  const next = applyEnvUpdates(original, updates);
  const parsed = parseEnvContent(next);

  assert.equal(parsed.COSYVOICE_MODEL_DIR, '/old/repo');
  assert.equal(parsed.COSYVOICE_SFT_MODEL_DIR, '/manual/CosyVoice-300M-SFT');
  assert.equal(parsed.COSYVOICE_SFT_MODEL_DIR_MANUAL_IMPORT, '1');
});

test('cosyvoice manifest marks official-first sources before mirrors', () => {
  const manifest = getOfflineModelAssetManifest('cosyvoice-local');
  const sftAsset = manifest.assets.find((asset) => asset.id === 'cosyvoice-model-sft');

  assert.ok(sftAsset);
  assert.equal(sftAsset?.sources[0]?.isOfficial, true);
  assert.equal(sftAsset?.sources[0]?.recommended, true);
  assert.equal(sftAsset?.sources[0]?.priority, 'primary');
  assert.equal(sftAsset?.sources[1]?.priority, 'mirror');
});
