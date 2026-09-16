import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ScreenHeader } from '../../src/components/ScreenHeader';
import * as queries from '../../src/db/queries';
import { colors, radii } from '../../src/theme/colors';

export default function StatsScreen() {
  const [stats, setStats] = useState({
    wordCount: 0,
    sourceCount: 0,
    dueCount: 0,
    reviewCount: 0,
  });

  useFocusEffect(
    useCallback(() => {
      void queries.getStatsSummary().then(setStats);
    }, []),
  );

  const tiles = [
    { label: 'Words saved', value: stats.wordCount },
    { label: 'Sources', value: stats.sourceCount },
    { label: 'Due today', value: stats.dueCount },
    { label: 'Reviews logged', value: stats.reviewCount },
  ];

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Stats" />
      <View style={styles.grid}>
        {tiles.map((tile) => (
          <View key={tile.label} style={styles.tile}>
            <Text style={styles.value}>{tile.value}</Text>
            <Text style={styles.label}>{tile.label}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.hint}>
        Capture from Books → look up with ECDICT → review on Cards. Phase 2 adds
        contextual quotes and spaced repetition scheduling.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 20,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
  },
  tile: {
    width: '47%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    paddingVertical: 22,
    paddingHorizontal: 16,
  },
  value: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.text,
  },
  label: {
    marginTop: 6,
    fontSize: 14,
    color: colors.textSecondary,
  },
  hint: {
    marginTop: 24,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textTertiary,
  },
});
