import { createAudioPlayer } from 'expo-audio';
import { Alert, Platform } from 'react-native';

import { fetchWordAudio } from './dictionary';

function normalizeAudioUrl(url: string) {
  const trimmed = url.trim();
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  return trimmed;
}

function speakWithWebSpeech(word: string): boolean {
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
    synth.cancel();
    const utterance = new Utterance(word);
    utterance.lang = 'en-US';
    utterance.rate = 0.95;
    synth.speak(utterance);
    return true;
  } catch {
    return false;
  }
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
 * On web, prefers browser speech when no cached MP3 is ready (keeps the iOS user-gesture),
 * and caches Free Dictionary audio for later taps when available.
 */
export async function playWordPronunciation(
  word: string,
  knownAudioUrl?: string | null,
): Promise<string | null> {
  const cleaned = word.trim();
  if (!cleaned) return null;

  let audioUrl = knownAudioUrl ? normalizeAudioUrl(knownAudioUrl) : null;

  // Known MP3: try it first.
  if (audioUrl && (await playRemoteAudio(audioUrl))) {
    return audioUrl;
  }

  // Web with no ready MP3: speak immediately so Safari doesn't drop audio after await.
  if (Platform.OS === 'web') {
    const spoke = speakWithWebSpeech(cleaned);
    if (!audioUrl) {
      audioUrl = await fetchWordAudio(cleaned);
    }
    if (!spoke && audioUrl && (await playRemoteAudio(audioUrl))) {
      return audioUrl;
    }
    if (spoke) return audioUrl;
    Alert.alert(
      'No pronunciation',
      `Could not play audio for “${cleaned}”. Check your network and try again.`,
    );
    return audioUrl;
  }

  // Native: fetch then play with expo-audio.
  if (!audioUrl) {
    audioUrl = await fetchWordAudio(cleaned);
  }
  if (audioUrl && (await playRemoteAudio(audioUrl))) {
    return audioUrl;
  }

  Alert.alert(
    'No pronunciation',
    `Could not play audio for “${cleaned}”. Check your network and try again.`,
  );
  return audioUrl;
}
