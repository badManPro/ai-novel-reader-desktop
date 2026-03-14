import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getOfflineModelAssetManifest,
  getOfflineModelTaskTemplate,
  listOfflineModelAssetManifests
} from '../main/config/offline-model-assets';
import { buildOfflineModelTask } from '../main/services/offline-model-task-service';

test('offline model asset manifests provide required assets and real sources', () => {
  const cosyvoiceManifest = getOfflineModelAssetManifest('cosyvoice-local');
  const gptSovitsManifest = getOfflineModelAssetManifest('gpt-sovits-local');

  assert.equal(cosyvoiceManifest.assets.some((asset) => asset.id === 'cosyvoice-repo'), true);
  assert.equal(gptSovitsManifest.assets.some((asset) => asset.id === 'gpt-sovits-repo'), true);
  assert.match(cosyvoiceManifest.assets[0]?.sources[0]?.url ?? '', /^https:\/\//);
  assert.match(gptSovitsManifest.assets[0]?.sources[0]?.url ?? '', /^https:\/\//);
  assert.ok(cosyvoiceManifest.assets.filter((asset) => asset.required).length >= 3);
  assert.ok(gptSovitsManifest.assets.filter((asset) => asset.required).length >= 4);
});

test('offline model asset manifests expose file-level verification coverage and resumable download metadata', () => {
  const manifests = listOfflineModelAssetManifests();
  assert.equal(manifests.length >= 2, true);

  for (const manifest of manifests) {
    assert.equal(manifest.assets.every((asset) => (asset.fileChecks?.length ?? 0) > 0), true);
    assert.equal(manifest.assets.some((asset) => asset.fileChecks?.some((check) => !check.checksumSha256)), true);
  }

  const cosyvoiceManifest = getOfflineModelAssetManifest('cosyvoice-local');
  const gptSovitsManifest = getOfflineModelAssetManifest('gpt-sovits-local');
  assert.equal(cosyvoiceManifest.assets.some((asset) => asset.fileChecks?.some((check) => check.downloadUrlEnvKey === 'COSYVOICE_SFT_LLM_URL')), true);
  assert.equal(gptSovitsManifest.assets.some((asset) => asset.fileChecks?.some((check) => check.downloadUrl === 'https://raw.githubusercontent.com/RVC-Boss/GPT-SoVITS/main/api_v2.py')), true);
});

test('offline model task builder injects manifest and verification metadata', () => {
  const template = getOfflineModelTaskTemplate('cosyvoice-local', 'download');
  const built = buildOfflineModelTask('cosyvoice-local', 'download');

  assert.equal(built.templateId, template.templateId);
  assert.equal(built.action, 'download');
  assert.ok(built.manifestId.length > 0);
  assert.ok(built.assets.length > 0);
  assert.match(built.command, /asset manifest:/);
  assert.match(built.command, /git clone|git fetch\/pull/);
  assert.match(built.command, /runOfflineModelDownloads/);
  assert.match(built.command, /COSYVOICE_SFT_LLM_URL/);
  assert.match(built.command, /asset verify :: cosyvoice-model-sft/);
  assert.match(built.summary, /资源/);
});
