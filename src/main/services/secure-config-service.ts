import { app } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ProviderSecretRecord, SecureConfigSnapshot } from '../../shared/types';

interface SecureConfigFileShape {
  providers?: Array<Partial<ProviderSecretRecord>>;
}

const PROVIDER_ENV_MAP = {
  'openai-tts': {
    apiKey: 'OPENAI_API_KEY',
    baseUrl: 'OPENAI_TTS_BASE_URL',
    model: 'OPENAI_TTS_MODEL'
  },
  'glm-tts': {
    apiKey: 'GLM_API_KEY',
    baseUrl: 'GLM_TTS_BASE_URL',
    model: 'GLM_TTS_MODEL'
  }
} as const;

export class SecureConfigService {
  private readonly configPath = path.join(app.getPath('userData'), 'secure-provider-config.json');

  async loadSnapshot(): Promise<SecureConfigSnapshot> {
    const fileProviders = await this.readFileProviders();
    const providers = Object.entries(PROVIDER_ENV_MAP).map(([providerId, envMap]) => {
      const fromFile = fileProviders.find((item) => item.providerId === providerId);
      const apiKey = process.env[envMap.apiKey] ?? fromFile?.apiKey;
      const baseUrl = process.env[envMap.baseUrl] ?? fromFile?.baseUrl;
      const model = process.env[envMap.model] ?? fromFile?.model;
      const source: ProviderSecretRecord['source'] = process.env[envMap.apiKey] ? 'environment' : fromFile ? 'file' : 'system-keychain-placeholder';
      return {
        providerId,
        apiKey,
        baseUrl,
        model,
        updatedAt: fromFile?.updatedAt ?? new Date(0).toISOString(),
        source
      } satisfies ProviderSecretRecord;
    });

    return {
      providers,
      storageMode: 'file-fallback',
      keychainReady: false,
      configPath: this.configPath
    };
  }

  async getProviderSecret(providerId: string) {
    const snapshot = await this.loadSnapshot();
    return snapshot.providers.find((item) => item.providerId === providerId);
  }

  async saveProviderSecret(input: { providerId: string; apiKey?: string; baseUrl?: string; model?: string }) {
    const existing = await this.readFileProviders();
    const nextRecord: ProviderSecretRecord = {
      providerId: input.providerId,
      apiKey: input.apiKey,
      baseUrl: input.baseUrl,
      model: input.model,
      updatedAt: new Date().toISOString(),
      source: 'file'
    };
    const filtered = existing.filter((item) => item.providerId !== input.providerId);
    filtered.push(nextRecord);
    await this.writeFileProviders(filtered);
    return nextRecord;
  }

  private async readFileProviders(): Promise<ProviderSecretRecord[]> {
    try {
      const raw = await readFile(this.configPath, 'utf-8');
      const parsed = JSON.parse(raw) as SecureConfigFileShape;
      return (parsed.providers ?? []).filter((item): item is ProviderSecretRecord => Boolean(item.providerId));
    } catch {
      return [];
    }
  }

  private async writeFileProviders(providers: ProviderSecretRecord[]) {
    await mkdir(path.dirname(this.configPath), { recursive: true });
    await writeFile(this.configPath, JSON.stringify({
      providers,
      note: '当前为文件回退方案；如需接入系统钥匙串，可在 SecureConfigService 中替换 read/save ProviderSecretRecord 的实现。'
    }, null, 2));
  }
}
