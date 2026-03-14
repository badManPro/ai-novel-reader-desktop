import test from 'node:test';
import assert from 'node:assert/strict';
import { OfflineTtsServiceManager } from '../main/services/offline-tts-service-manager';

test('OfflineTtsServiceManager exposes manual startup hints by default', async () => {
  const manager = new OfflineTtsServiceManager();
  const list = await manager.getStatusList();
  const cosy = list.find((item) => item.providerId === 'cosyvoice-local');
  const gpt = list.find((item) => item.providerId === 'gpt-sovits-local');

  assert.ok(cosy);
  assert.ok(gpt);
  assert.ok(cosy?.command?.includes('start-cosyvoice.sh'));
  assert.ok(gpt?.command?.includes('start-gpt-sovits.sh'));
  assert.ok(['manual', 'idle'].includes(cosy?.status ?? ''));
});
