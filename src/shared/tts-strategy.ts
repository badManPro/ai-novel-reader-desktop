import type { ReaderSettings, TtsMode, TtsSpeakRequest } from './types';

export interface TtsModeProfile {
  providerId: string;
  voiceId: string;
}

export interface ResolvedTtsStrategy {
  mode: TtsMode;
  standard: TtsModeProfile;
  privacy: TtsModeProfile;
  character: TtsModeProfile;
  active: TtsModeProfile;
  fallback: TtsModeProfile | null;
}

const STANDARD_DEFAULT: TtsModeProfile = {
  providerId: 'openai-tts',
  voiceId: 'alloy'
};

const PRIVACY_DEFAULT: TtsModeProfile = {
  providerId: 'cosyvoice-local',
  voiceId: '中文女'
};

const CHARACTER_DEFAULT: TtsModeProfile = {
  providerId: 'gpt-sovits-local',
  voiceId: 'gpt-sovits-default'
};

export const TTS_MODE_LABELS: Record<TtsMode, string> = {
  standard: '标准模式',
  privacy: '隐私模式',
  character: '角色模式'
};

function inferMode(settings: ReaderSettings): TtsMode {
  if (settings.ttsMode) {
    return settings.ttsMode;
  }

  if (settings.defaultProviderId === 'gpt-sovits-local') {
    return 'character';
  }

  if (settings.defaultProviderId === 'openai-tts' || settings.defaultProviderId === 'glm-tts') {
    return 'standard';
  }

  return 'privacy';
}

function resolveStandardProfile(settings: ReaderSettings): TtsModeProfile {
  const hasLegacyRemote = settings.defaultProviderId === 'openai-tts' || settings.defaultProviderId === 'glm-tts';
  return {
    providerId: settings.standardProviderId ?? (hasLegacyRemote ? settings.defaultProviderId : STANDARD_DEFAULT.providerId),
    voiceId: settings.standardVoiceId ?? (hasLegacyRemote ? settings.defaultVoiceId : STANDARD_DEFAULT.voiceId)
  };
}

function resolvePrivacyProfile(settings: ReaderSettings): TtsModeProfile {
  const hasLegacyPrivacy = settings.defaultProviderId === 'cosyvoice-local' || settings.defaultProviderId === 'system-say';
  return {
    providerId: settings.privacyProviderId ?? (hasLegacyPrivacy ? settings.defaultProviderId : PRIVACY_DEFAULT.providerId),
    voiceId: settings.privacyVoiceId ?? (hasLegacyPrivacy ? settings.defaultVoiceId : PRIVACY_DEFAULT.voiceId)
  };
}

function resolveCharacterProfile(settings: ReaderSettings): TtsModeProfile {
  const hasLegacyCharacter = settings.defaultProviderId === 'gpt-sovits-local';
  return {
    providerId: settings.characterProviderId ?? (hasLegacyCharacter ? settings.defaultProviderId : CHARACTER_DEFAULT.providerId),
    voiceId: settings.characterVoiceId ?? (hasLegacyCharacter ? settings.defaultVoiceId : CHARACTER_DEFAULT.voiceId)
  };
}

export function resolveTtsStrategySettings(settings: ReaderSettings): ResolvedTtsStrategy {
  const mode = inferMode(settings);
  const standard = resolveStandardProfile(settings);
  const privacy = resolvePrivacyProfile(settings);
  const character = resolveCharacterProfile(settings);
  const active = mode === 'standard'
    ? standard
    : mode === 'privacy'
      ? privacy
      : character;
  const fallback = mode === 'standard'
    ? privacy
    : mode === 'character' && character.providerId !== privacy.providerId
      ? privacy
      : null;

  return {
    mode,
    standard,
    privacy,
    character,
    active,
    fallback
  };
}

export function normalizeReaderSettings(settings: ReaderSettings): ReaderSettings {
  const resolved = resolveTtsStrategySettings(settings);
  return {
    ...settings,
    ttsMode: resolved.mode,
    standardProviderId: resolved.standard.providerId,
    standardVoiceId: resolved.standard.voiceId,
    privacyProviderId: resolved.privacy.providerId,
    privacyVoiceId: resolved.privacy.voiceId,
    characterProviderId: resolved.character.providerId,
    characterVoiceId: resolved.character.voiceId,
    defaultProviderId: resolved.active.providerId,
    defaultVoiceId: resolved.active.voiceId
  };
}

export function buildTtsSpeakRequest(
  request: Omit<TtsSpeakRequest, 'providerId' | 'voiceId'> & Partial<Pick<TtsSpeakRequest, 'speed'>>,
  settings: ReaderSettings
): TtsSpeakRequest {
  const resolved = resolveTtsStrategySettings(settings);
  return {
    ...request,
    providerId: resolved.active.providerId,
    voiceId: resolved.active.voiceId,
    speed: request.speed ?? settings.defaultSpeed,
    mode: resolved.mode,
    fallbackProviderId: resolved.fallback?.providerId,
    fallbackVoiceId: resolved.fallback?.voiceId
  };
}
