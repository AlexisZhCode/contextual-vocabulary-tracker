import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  type GestureResponderEvent,
} from 'react-native';

import { playWordPronunciation, speakWithWebSpeech } from '../api/pronounce';
import { colors } from '../theme/colors';

type Props = {
  word: string;
  audioUrl?: string | null;
  size?: number;
  onResolved?: (audioUrl: string) => void;
};

export function PronounceButton({ word, audioUrl, size = 22, onResolved }: Props) {
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState(audioUrl ?? null);

  useEffect(() => {
    setUrl(audioUrl ?? null);
  }, [audioUrl, word]);

  const play = (event?: GestureResponderEvent) => {
    event?.stopPropagation?.();
    if (loading) return;

    // Critical for iPhone PWA: start TTS before any await loses the user-gesture.
    if (Platform.OS === 'web') {
      speakWithWebSpeech(word);
    }

    setLoading(true);
    void playWordPronunciation(word, url)
      .then((resolved) => {
        if (resolved && resolved !== url) {
          setUrl(resolved);
          onResolved?.(resolved);
        }
      })
      .finally(() => setLoading(false));
  };

  return (
    <Pressable
      onPress={play}
      hitSlop={10}
      style={styles.btn}
      accessibilityRole="button"
      accessibilityLabel={`Pronounce ${word}`}
    >
      {loading ? (
        <ActivityIndicator size="small" color={colors.link} />
      ) : (
        <Ionicons name="volume-high-outline" size={size} color={colors.link} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    minWidth: 28,
    minHeight: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
