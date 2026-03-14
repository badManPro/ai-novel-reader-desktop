import test from 'node:test';
import assert from 'node:assert/strict';
import { getOfflineEngineConfigs } from '../main/config/offline-tts-config';

test('getOfflineEngineConfigs returns cosyvoice as primary route', () => {
  const configs = getOfflineEngineConfigs();
  assert.equal(configs[0]?.providerId, 'cosyvoice-local');
  assert.equal(configs[0]?.isPrimary, true);
  assert.equal(configs[1]?.providerId, 'gpt-sovits-local');
});
