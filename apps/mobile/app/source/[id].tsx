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

import { prepareBookChapters } from '../../src/api/booksAi';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import * as queries from '../../src/db/queries';
import { colors, radii } from '../../src/theme/colors';
import type { ChapterTreeItem, Entry, SourceStatus, SourceWithStats } from '../../src/types';

const STATUS_OPTIONS: { value: SourceStatus; label: string }[] = [
  { value: 'toRead', label: 'To Read' },
  { value: 'readingNow', label: 'Reading Now' },
  { value: 'finished', label: 'Finished' },
  { value: 'abandoned', label: 'Abandoned' },
];

function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function SourceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [source, setSource] = useState<SourceWithStats | null>(null);
  const [chapters, setChapters] = useState<ChapterTreeItem[]>([]);
  const [savedWords, setSavedWords] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const refresh = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [s, ch, words] = await Promise.all([
        queries.getSource(id),
        queries.listChaptersForSource(id),
        queries.listUnassignedEntriesForSource(id),
      ]);
      setSource(s);
      setChapters(ch);
      setSavedWords(words);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const onGenerateTree = async () => {
    if (!source || generating) return;
    setGenerating(true);
    try {
      const prepared = await prepareBookChapters(source.title, source.author, {
        maxChapters: 8,
      });
      await queries.replaceChaptersForSource(
        source.id,
        prepared.chapters.map((ch, index) => ({
          id: createId('ch'),
          position: index,
          title: ch.chapter,
          aiSummary: ch.summary,
          words: ch.words.map((w) => ({
            id: createId('ent'),
            word: w.word,
            phonetic: w.phonetic,
            pos: w.pos,
            glossZh: w.definition || '（暂无中文释义）',
            glossEn: w.glossEn,
            sentence: w.context,
          })),
        })),
      );
      await refresh();
    } catch (error) {
      Alert.alert(
        'Could not build chapters',
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setGenerating(false);
    }
  };

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

  const finishedCount = chapters.filter((c) => c.status === 'finished').length;

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
              {chapters.length
                ? `${finishedCount} / ${chapters.length} chapters cleared`
                : `${source.wordCount} words`}
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
                  router.push(`/lookup?sourceId=${encodeURIComponent(source.id)}` as Href)
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

        <Text style={[styles.section, { marginTop: 8, marginBottom: 10 }]}>Status</Text>
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

        <Text style={styles.section}>Progress Tree</Text>
        <Text style={styles.treeHint}>
          Finish a chapter to unlock the next. Summaries stay sealed until you mark finished.
        </Text>

        {chapters.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.empty}>
              No chapter tree yet. Generate one from this book&apos;s structure.
            </Text>
            <Pressable
              style={styles.generateBtn}
              onPress={() => void onGenerateTree()}
              disabled={generating}
            >
              {generating ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.generateText}>Build chapter tree</Text>
              )}
            </Pressable>
          </View>
        ) : (
          chapters.map((ch, index) => {
            const done = ch.status === 'finished';
            const locked = !ch.unlocked;
            return (
              <Pressable
                key={ch.id}
                style={[styles.chapterRow, locked && styles.chapterLocked]}
                disabled={locked}
                onPress={() =>
                  router.push({
                    pathname: '/source/[id]/chapter/[chapterId]',
                    params: { id: source.id, chapterId: ch.id },
                  })
                }
              >
                <View style={styles.chapterLeft}>
                  <View style={styles.rail}>
                    <View style={[styles.dot, done && styles.dotDone, locked && styles.dotLocked]} />
                    {index < chapters.length - 1 ? (
                      <View style={[styles.railLine, done && styles.railLineDone]} />
                    ) : null}
                  </View>
                  <View style={styles.chapterMeta}>
                    <Text
                      style={[styles.chapterTitle, locked && styles.chapterTitleLocked]}
                      numberOfLines={2}
                    >
                      {ch.title}
                    </Text>
                    <Text style={styles.chapterSub}>
                      {locked
                        ? 'Locked — finish the previous chapter'
                        : done
                          ? 'Finished'
                          : ch.status === 'reading'
                            ? 'In progress'
                            : `${ch.wordCount} words ready`}
                    </Text>
                  </View>
                </View>
                <Ionicons
                  name={
                    done ? 'checkbox' : locked ? 'lock-closed' : 'square-outline'
                  }
                  size={26}
                  color={done ? colors.link : locked ? colors.textTertiary : colors.separator}
                />
              </Pressable>
            );
          })
        )}

        <View style={styles.vocabularyHeader}>
          <View>
            <Text style={styles.section}>Saved Vocabulary</Text>
            <Text style={styles.vocabularyHint}>From screenshots and typed lookups</Text>
          </View>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{savedWords.length}</Text>
          </View>
        </View>

        {savedWords.length === 0 ? (
          <View style={styles.emptyVocabulary}>
            <Text style={styles.empty}>No saved words yet.</Text>
            <Pressable
              style={styles.scanWordsBtn}
              onPress={() =>
                router.push({ pathname: '/capture', params: { sourceId: source.id } })
              }
            >
              <Ionicons name="scan-outline" size={17} color={colors.link} />
              <Text style={styles.scanWordsText}>Scan a page</Text>
            </Pressable>
          </View>
        ) : (
          savedWords.map((entry) => (
            <Pressable
              key={entry.id}
              style={styles.wordRow}
              onPress={() => router.push(`/word/${entry.id}`)}
            >
              <View style={styles.wordMeta}>
                <View style={styles.wordTitleRow}>
                  <Text style={styles.word}>{entry.word}</Text>
                  {entry.phonetic ? (
                    <Text style={styles.phonetic}>/{entry.phonetic}/</Text>
                  ) : null}
                </View>
                <Text style={styles.gloss} numberOfLines={2}>
                  {entry.glossZh}
                </Text>
                {entry.glossEn ? (
                  <Text style={styles.context} numberOfLines={2}>
                    {entry.glossEn}
                  </Text>
                ) : null}
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </Pressable>
          ))
        )}

        <Pressable
          style={styles.delete}
          onPress={() =>
            Alert.alert('Delete source?', 'Words and chapter progress will be removed.', [
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
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
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
    color: colors.text,
    marginBottom: 8,
  },
  treeHint: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
    marginBottom: 14,
  },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  statusChip: {
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
  },
  statusActive: { backgroundColor: colors.text },
  statusText: { fontSize: 13, color: colors.text },
  statusTextActive: { color: colors.surface },
  emptyBox: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: 16,
    gap: 14,
  },
  empty: { color: colors.textSecondary, fontSize: 15, lineHeight: 21 },
  generateBtn: {
    backgroundColor: colors.text,
    borderRadius: radii.card,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    minHeight: 48,
  },
  generateText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  chapterRow: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  chapterLocked: { opacity: 0.55 },
  chapterLeft: { flex: 1, flexDirection: 'row', gap: 12 },
  rail: { width: 16, alignItems: 'center' },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.separator,
    marginTop: 4,
  },
  dotDone: { backgroundColor: colors.link },
  dotLocked: { backgroundColor: colors.textTertiary },
  railLine: {
    flex: 1,
    width: 2,
    backgroundColor: colors.separatorLight,
    marginTop: 4,
    minHeight: 18,
  },
  railLineDone: { backgroundColor: colors.link },
  chapterMeta: { flex: 1, gap: 4 },
  chapterTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  chapterTitleLocked: { color: colors.textSecondary },
  chapterSub: { fontSize: 13, color: colors.textTertiary },
  vocabularyHeader: {
    marginTop: 18,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  vocabularyHint: { marginTop: 2, fontSize: 13, color: colors.textTertiary },
  countBadge: {
    minWidth: 30,
    height: 30,
    borderRadius: 15,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.separatorLight,
  },
  countText: { fontSize: 14, fontWeight: '700', color: colors.textSecondary },
  emptyVocabulary: {
    padding: 16,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    gap: 12,
  },
  scanWordsBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  scanWordsText: { fontSize: 15, fontWeight: '600', color: colors.link },
  wordRow: {
    padding: 14,
    marginBottom: 8,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  wordMeta: { flex: 1 },
  wordTitleRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 },
  word: { fontSize: 17, fontWeight: '700', color: colors.text, textTransform: 'capitalize' },
  phonetic: { fontSize: 13, color: colors.textTertiary },
  gloss: { marginTop: 4, fontSize: 14, color: colors.textSecondary },
  context: { marginTop: 5, fontSize: 13, lineHeight: 18, color: colors.textTertiary },
  delete: { marginTop: 28, alignItems: 'center', padding: 14 },
  deleteText: { color: colors.danger, fontSize: 16 },
});
