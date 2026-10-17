import { Ionicons } from '@expo/vector-icons';
import { createAudioPlayer } from 'expo-audio';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { fetchWordAudio } from '../api/dictionary';
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

  const play = async () => {
    if (loading) return;
    let next = url;
    if (!next) {
      setLoading(true);
      try {
        next = await fetchWordAudio(word);
        if (next) {
          setUrl(next);
          onResolved?.(next);
        }
      } finally {
        setLoading(false);
      }
    }
    if (!next) return;
    const player = createAudioPlayer(next);
    player.play();
  };

  return (
    <Pressable
      onPress={() => void play()}
      hitSlop={10}
      style={styles.btn}
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
