import { createAudioPlayer } from 'expo-audio';
import { Alert, Platform } from 'react-native';

import { resolveApiBase } from './config';
import { fetchWordAudio } from './dictionary';

function normalizeAudioUrl(url: string) {
  const trimmed = url.trim();
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  return trimmed;
}

/** Browser TTS — must run synchronously inside the tap handler on iOS. */
export function speakWithWebSpeech(word: string): boolean {
  if (Platform.OS !== 'web') return false;
  const synth =
    typeof globalThis !== 'undefined'
      ? (globalThis as { speechSynthesis?: SpeechSynthesis }).speechSynthesis
      : undefined;
  const Utterance =
    typeof globalThis !== 'undefined'
      ? (globalThis as { SpeechSynthesisUtterance?: typeof SpeechSynthesisUtterance })
          .SpeechSynthesisUtterance
      : undefined;
  if (!synth || !Utterance) return false;

  try {
    const cleaned = word.trim();
    if (!cleaned) return false;

    const speakNow = () => {
      synth.cancel();
      const utterance = new Utterance(cleaned);
      utterance.lang = 'en-US';
      utterance.rate = 0.95;
      const voices = synth.getVoices?.() ?? [];
      const en =
        voices.find((v) => /^en(-|_|$)/i.test(v.lang) && /us/i.test(v.lang)) ||
        voices.find((v) => /^en(-|_|$)/i.test(v.lang));
      if (en) utterance.voice = en;
      synth.speak(utterance);
    };

    speakNow();
    // iOS sometimes loads voices late; retry once when they appear.
    if ((synth.getVoices?.() ?? []).length === 0 && typeof synth.addEventListener === 'function') {
      const onVoices = () => {
        speakNow();
        synth.removeEventListener?.('voiceschanged', onVoices);
      };
      synth.addEventListener('voiceschanged', onVoices);
    }
    return true;
  } catch {
    return false;
  }
}

/** API-proxied MP3 — avoids Free Dictionary outages and browser CORS issues. */
export function apiPronunciationFileUrl(word: string): string | null {
  const base = resolveApiBase();
  const cleaned = word.trim().toLowerCase();
  if (!base || !cleaned) return null;
  return `${base}/v1/audio/${encodeURIComponent(cleaned)}/file`;
}

async function playRemoteAudio(url: string): Promise<boolean> {
  const src = normalizeAudioUrl(url);
  if (!src) return false;

  if (Platform.OS === 'web') {
    try {
      const AudioCtor = (globalThis as { Audio?: typeof Audio }).Audio;
      if (!AudioCtor) return false;
      const audio = new AudioCtor(src);
      audio.preload = 'auto';
      await audio.play();
      return true;
    } catch {
      return false;
    }
  }

  try {
    const player = createAudioPlayer(src);
    player.play();
    return true;
  } catch {
    return false;
  }
}

/**
 * Play pronunciation for a word.
 * Web: always tries browser TTS first (sync-friendly), then API-proxied MP3.
 * Native: API-proxied MP3 / Free Dictionary via expo-audio.
 */
export async function playWordPronunciation(
  word: string,
  knownAudioUrl?: string | null,
): Promise<string | null> {
  const cleaned = word.trim();
  if (!cleaned) return null;

  const proxied = apiPronunciationFileUrl(cleaned);
  let audioUrl = knownAudioUrl ? normalizeAudioUrl(knownAudioUrl) : null;

  // Web: TTS is started by PronounceButton synchronously. Don't also play MP3
  // (would overlap). Still resolve a stable proxied URL for caching.
  if (Platform.OS === 'web') {
    return proxied || audioUrl || (await fetchWordAudio(cleaned));
  }

  // Native: prefer API-proxied file, then known URL, then dictionary lookup.
  if (proxied && (await playRemoteAudio(proxied))) {
    return proxied;
  }
  if (audioUrl && (await playRemoteAudio(audioUrl))) {
    return audioUrl;
  }
  audioUrl = await fetchWordAudio(cleaned);
  if (audioUrl && (await playRemoteAudio(audioUrl))) {
    return audioUrl;
  }

  Alert.alert(
    'No pronunciation',
    `Could not play audio for “${cleaned}”. Check your network and try again.`,
  );
  return audioUrl || proxied;
}
