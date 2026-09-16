import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { type Href, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ScreenHeader } from '../../src/components/ScreenHeader';
import * as queries from '../../src/db/queries';
import { colors, radii } from '../../src/theme/colors';
import type { Entry, SourceStatus, SourceWithStats } from '../../src/types';

const STATUS_OPTIONS: { value: SourceStatus; label: string }[] = [
  { value: 'toRead', label: 'To Read' },
  { value: 'readingNow', label: 'Reading Now' },
  { value: 'finished', label: 'Finished' },
  { value: 'abandoned', label: 'Abandoned' },
];

export default function SourceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [source, setSource] = useState<SourceWithStats | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [s, e] = await Promise.all([
        queries.getSource(id),
        queries.listEntriesForSource(id),
      ]);
      setSource(s);
      setEntries(e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  if (loading && !source) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!source) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Missing" leftLabel="Books" onLeftPress={() => router.back()} />
        <Text style={styles.empty}>Source not found.</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={source.title}
        leftLabel="Books"
        onLeftPress={() => router.back()}
        showAdd
        onAddPress={() =>
          router.push({ pathname: '/capture', params: { sourceId: source.id } })
        }
      />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          {source.coverUrl ? (
            <Image source={{ uri: source.coverUrl }} style={styles.cover} contentFit="cover" />
          ) : (
            <View
              style={[
                styles.cover,
                { backgroundColor: source.coverFallback ?? colors.progressFill },
              ]}
            />
          )}
          <View style={styles.heroMeta}>
            {source.author ? <Text style={styles.author}>{source.author}</Text> : null}
            <Text style={styles.statLine}>
              {source.wordCount} words · {source.dueCount} due
            </Text>
            <View style={styles.actions}>
              <Pressable
                style={styles.chip}
                onPress={async () => {
                  await queries.toggleSourceStarred(source.id);
                  await refresh();
                }}
              >
                <Ionicons
                  name={source.starred ? 'star' : 'star-outline'}
                  size={16}
                  color={colors.star}
                />
                <Text style={styles.chipText}>{source.starred ? 'Starred' : 'Star'}</Text>
              </Pressable>
                <Pressable
                  style={styles.chip}
                  onPress={() =>
                    router.push(
                      `/lookup?sourceId=${encodeURIComponent(source.id)}` as Href,
                    )
                  }
                >
                  <Ionicons name="search" size={16} color={colors.link} />
                  <Text style={[styles.chipText, { color: colors.link }]}>Type</Text>
                </Pressable>
                <Pressable
                  style={styles.chip}
                  onPress={() =>
                    router.push({ pathname: '/capture', params: { sourceId: source.id } })
                  }
                >
                  <Ionicons name="scan-outline" size={16} color={colors.link} />
                  <Text style={[styles.chipText, { color: colors.link }]}>Look up</Text>
                </Pressable>
            </View>
          </View>
        </View>

        <Text style={styles.section}>Status</Text>
        <View style={styles.statusRow}>
          {STATUS_OPTIONS.map((opt) => (
            <Pressable
              key={opt.value}
              style={[styles.statusChip, source.status === opt.value && styles.statusActive]}
              onPress={async () => {
                await queries.updateSourceStatus(source.id, opt.value);
                await refresh();
              }}
            >
              <Text
                style={[
                  styles.statusText,
                  source.status === opt.value && styles.statusTextActive,
                ]}
              >
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.section}>Vocabulary</Text>
        {entries.length === 0 ? (
          <Text style={styles.empty}>No words yet. Tap Look up to capture one.</Text>
        ) : (
          entries.map((entry) => (
            <Pressable
              key={entry.id}
              style={styles.entry}
              onPress={() => router.push(`/word/${entry.id}`)}
            >
              <View>
                <Text style={styles.word}>{entry.word}</Text>
                <Text style={styles.gloss} numberOfLines={1}>
                  {entry.glossZh}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </Pressable>
          ))
        )}

        <Pressable
          style={styles.delete}
          onPress={() =>
            Alert.alert('Delete source?', 'Words saved under this source will be removed.', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                  await queries.deleteSource(source.id);
                  router.back();
                },
              },
            ])
          }
        >
          <Text style={styles.deleteText}>Delete source</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingBottom: 48 },
  hero: { flexDirection: 'row', gap: 16, marginBottom: 20 },
  cover: {
    width: 100,
    height: 150,
    borderRadius: radii.cover,
    backgroundColor: colors.separatorLight,
  },
  heroMeta: { flex: 1, justifyContent: 'center', gap: 8 },
  author: { fontSize: 16, color: colors.textSecondary },
  statLine: { fontSize: 14, color: colors.textTertiary },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 16,
  },
  chipText: { fontSize: 13, color: colors.text },
  section: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 10,
    marginTop: 8,
    color: colors.text,
  },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  statusChip: {
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
  },
  statusActive: { backgroundColor: colors.text },
  statusText: { fontSize: 13, color: colors.text },
  statusTextActive: { color: colors.surface },
  entry: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  word: { fontSize: 17, fontWeight: '600', textTransform: 'capitalize' },
  gloss: { marginTop: 4, color: colors.textSecondary, fontSize: 14, maxWidth: 260 },
  empty: { color: colors.textSecondary, fontSize: 15 },
  delete: { marginTop: 28, alignItems: 'center', padding: 14 },
  deleteText: { color: colors.danger, fontSize: 16 },
});
