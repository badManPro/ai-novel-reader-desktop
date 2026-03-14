import type { ModelProvider, VoiceOption } from '../../shared/types';
import { cosyVoiceProvider, cosyVoiceVoices } from '../adapters/cosyvoice-tts-adapter';
import { glmTtsProvider, glmVoices } from '../adapters/glm-tts-adapter';
import { gptSovitsProvider, gptSovitsVoices } from '../adapters/gpt-sovits-tts-adapter';
import { openAiTtsProvider, openAiVoices } from '../adapters/openai-tts-adapter';
import { systemTtsProvider, systemVoices } from '../adapters/system-tts-adapter';
import { OfflineTtsService } from './offline-tts-service';
import { SecureConfigService } from './secure-config-service';

export class TtsCatalogService {
  private readonly secureConfigService = new SecureConfigService();
  private readonly offlineTtsService = new OfflineTtsService();

  async listProviders(): Promise<ModelProvider[]> {
    const [snapshot, healthList] = await Promise.all([
      this.secureConfigService.loadSnapshot(),
      this.offlineTtsService.getHealthSnapshot()
    ]);

    const configuredProviders = new Set(snapshot.providers.filter((item) => Boolean(item.apiKey)).map((item) => item.providerId));
    const healthyProviders = new Set(healthList.filter((item) => item.status === 'healthy').map((item) => item.providerId));

    return [cosyVoiceProvider, gptSovitsProvider, systemTtsProvider, openAiTtsProvider, glmTtsProvider].map((provider) => ({
      ...provider,
      configured: provider.kind === 'remote'
        ? configuredProviders.has(provider.id)
        : provider.kind === 'local'
          ? healthyProviders.has(provider.id as 'cosyvoice-local' | 'gpt-sovits-local')
          : provider.configured
    }));
  }

  async listVoices(providerId: string): Promise<VoiceOption[]> {
    if (providerId === 'cosyvoice-local') {
      const dynamicVoices = await this.offlineTtsService.listVoices(providerId);
      return dynamicVoices.length ? dynamicVoices : cosyVoiceVoices;
    }

    if (providerId === 'gpt-sovits-local') {
      const dynamicVoices = await this.offlineTtsService.listVoices(providerId);
      return dynamicVoices.length ? dynamicVoices : gptSovitsVoices;
    }

    if (providerId === 'openai-tts') {
      return openAiVoices;
    }

    if (providerId === 'glm-tts') {
      return glmVoices;
    }

    return systemVoices.filter((voice) => voice.providerId === providerId);
  }

  async getOfflineEngineHealth() {
    return this.offlineTtsService.getHealthSnapshot();
  }

  async getOfflineServiceStatus() {
    return this.offlineTtsService.getServiceStatus();
  }
}
