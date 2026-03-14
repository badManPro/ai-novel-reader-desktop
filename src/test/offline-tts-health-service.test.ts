import test from 'node:test';
import assert from 'node:assert/strict';
import { OfflineTtsHealthService } from '../main/services/offline-tts-health-service';

test('OfflineTtsHealthService marks disabled engines without network calls', async () => {
  const service = new OfflineTtsHealthService();
  const result = await service.check({
    id: 'cosyvoice-local',
    providerId: 'cosyvoice-local',
    name: 'CosyVoice 3.0 Local',
    protocol: 'cosyvoice-v1',
    baseUrl: 'http://127.0.0.1:9999',
    healthPath: '/health',
    synthesizePath: '/tts',
    timeoutMs: 1000,
    enabled: false,
    transport: 'binary-audio',
    audioFormat: 'wav',
    isPrimary: true,
    description: 'test',
    startup: {
      mode: 'manual'
    }
  });

  assert.equal(result.status, 'disabled');
  assert.match(result.message, /禁用/);
});
