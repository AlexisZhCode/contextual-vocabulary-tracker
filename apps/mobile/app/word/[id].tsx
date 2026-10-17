import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { PronounceButton } from '../../src/components/PronounceButton';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import * as queries from '../../src/db/queries';
import { colors, radii } from '../../src/theme/colors';
import type { Entry } from '../../src/types';

export default function WordDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [entry, setEntry] = useState<Entry | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    void queries
      .getEntry(id)
      .then(setEntry)
      .finally(() => setLoading(false));
  }, [id]);

  const onReviewed = async () => {
    if (!entry) return;
    const next = new Date(Date.now() + 1000 * 60 * 60 * 24 * 2).toISOString();
    await queries.markEntryReviewed(entry.id, next);
    router.back();
  };

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!entry) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Word" leftLabel="Back" onLeftPress={() => router.back()} />
        <Text style={styles.missing}>Entry not found.</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Word" leftLabel="Close" onLeftPress={() => router.back()} />
      <View style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.word}>{entry.word}</Text>
          <PronounceButton
            word={entry.word}
            audioUrl={entry.audioUrl}
            size={26}
            onResolved={(audioUrl) => {
              setEntry((prev) => (prev ? { ...prev, audioUrl } : prev));
              void queries.updateEntryAudio(entry.id, audioUrl);
            }}
          />
        </View>
        {entry.phonetic ? <Text style={styles.phonetic}>/{entry.phonetic}/</Text> : null}
        {entry.pos ? <Text style={styles.pos}>{entry.pos}</Text> : null}
        <Text style={styles.glossZh}>{entry.glossZh}</Text>
        {entry.glossEn ? <Text style={styles.glossEn}>{entry.glossEn}</Text> : null}
        {entry.sentence ? (
          <View style={styles.exampleBlock}>
            <Text style={styles.exampleLabel}>Example</Text>
            <Text style={styles.sentence}>“{entry.sentence}”</Text>
          </View>
        ) : null}
        <Pressable style={styles.reviewBtn} onPress={() => void onReviewed()}>
          <Text style={styles.reviewText}>Mark reviewed</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 20 },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: 20,
    gap: 6,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  word: { fontSize: 32, fontWeight: '800', textTransform: 'capitalize', flex: 1 },
  phonetic: { color: colors.textSecondary, fontSize: 16 },
  pos: { color: colors.textTertiary, fontStyle: 'italic' },
  glossZh: { marginTop: 10, fontSize: 18, lineHeight: 26 },
  glossEn: { fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  exampleBlock: { marginTop: 14, gap: 4 },
  exampleLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  sentence: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  reviewBtn: {
    marginTop: 20,
    backgroundColor: colors.text,
    borderRadius: radii.card,
    alignItems: 'center',
    paddingVertical: 14,
  },
  reviewText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  missing: { color: colors.textSecondary, paddingHorizontal: 20 },
});
