import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii } from '../theme/colors';
import type { SourceWithStats } from '../types';

type Props = {
  source: SourceWithStats;
  onPress: () => void;
  editing?: boolean;
};

function progressRatio(source: SourceWithStats) {
  if (source.wordCount <= 0) return 0;
  const reviewed = Math.min(source.reviewedCount, source.wordCount * 3);
  return Math.min(1, reviewed / Math.max(source.wordCount * 2, 1));
}

export function ReadingNowCard({ source, onPress, editing }: Props) {
  const ratio = progressRatio(source);
  const subtitle =
    source.wordCount === 0
      ? 'No words yet'
      : `${source.wordCount} words · ${source.dueCount} due`;

  return (
    <Pressable onPress={onPress} style={[styles.card, editing && styles.editing]}>
      <View style={styles.coverWrap}>
        {source.coverUrl ? (
          <Image
            source={{ uri: source.coverUrl }}
            style={styles.cover}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View
            style={[
              styles.cover,
              { backgroundColor: source.coverFallback ?? colors.progressFill },
            ]}
          >
            <Text style={styles.fallbackTitle} numberOfLines={3}>
              {source.title}
            </Text>
          </View>
        )}
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.max(ratio * 100, 4)}%` }]} />
      </View>
      <Text style={styles.meta} numberOfLines={1}>
        {subtitle}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 118,
    marginRight: 14,
  },
  editing: {
    opacity: 0.85,
  },
  coverWrap: {
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    borderRadius: radii.cover,
  },
  cover: {
    width: 118,
    height: 178,
    borderRadius: radii.cover,
    backgroundColor: colors.separatorLight,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
  },
  fallbackTitle: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
    textAlign: 'center',
  },
  track: {
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.progressTrack,
    marginTop: 10,
    overflow: 'hidden',
  },
  fill: {
    height: 3,
    backgroundColor: colors.progressFill,
    borderRadius: 2,
  },
  meta: {
    marginTop: 6,
    fontSize: 12,
    color: colors.textSecondary,
  },
});
