import { BrowserWindow } from 'electron';
import type { PlaybackStateEvent, TtsPlaybackState } from '../../shared/types';

const PLAYBACK_EVENT_CHANNEL = 'tts:playback-event';

export class PlaybackEventBus {
  publish(state: TtsPlaybackState) {
    const event: PlaybackStateEvent = {
      type: 'playback-state',
      state,
      emittedAt: new Date().toISOString()
    };

    BrowserWindow.getAllWindows().forEach((window) => {
      if (!window.isDestroyed()) {
        window.webContents.send(PLAYBACK_EVENT_CHANNEL, event);
      }
    });
  }
}

export function getPlaybackEventChannel() {
  return PLAYBACK_EVENT_CHANNEL;
}
