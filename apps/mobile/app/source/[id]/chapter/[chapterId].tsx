import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConfettiBurst } from '../../../../src/components/ConfettiBurst';
import { ScreenHeader } from '../../../../src/components/ScreenHeader';
import * as queries from '../../../../src/db/queries';
import { colors, radii } from '../../../../src/theme/colors';
import type {
  ChapterDifficulty,
  ChapterTreeItem,
  Entry,
} from '../../../../src/types';

const DIFFICULTY_OPTIONS: { value: ChapterDifficulty; label: string; hint: string }[] = [
  { value: 'hard', label: '太难', hint: 'A bit overwhelming' },
  { value: 'just_right', label: '刚好', hint: 'Sweet spot' },
  { value: 'easy', label: '太简单', hint: 'Too comfortable' },
];

export default function ChapterDetailScreen() {
  const { id: sourceId, chapterId } = useLocalSearchParams<{
    id: string;
    chapterId: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [chapter, setChapter] = useState<ChapterTreeItem | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [revealSummary, setRevealSummary] = useState(false);

  const refresh = useCallback(async () => {
    if (!chapterId) return;
    setLoading(true);
    try {
      const ch = await queries.getChapter(chapterId);
      if (!ch || !ch.unlocked) {
        setChapter(ch);
        setEntries([]);
        return;
      }
      if (ch.status === 'unread') {
        await queries.markChapterReading(chapterId);
      }
      const [fresh, words] = await Promise.all([
        queries.getChapter(chapterId),
        queries.listEntriesForChapter(chapterId),
      ]);
      setChapter(fresh);
      setEntries(words);
      if (fresh?.status === 'finished') {
        setRevealSummary(true);
      }
    } finally {
      setLoading(false);
    }
  }, [chapterId]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const onPickDifficulty = async (difficulty: ChapterDifficulty) => {
    if (!chapterId || saving) return;
    setSaving(true);
    try {
      await queries.markChapterFinished(chapterId, difficulty);
      setSheetOpen(false);
      setShowConfetti(true);
      setRevealSummary(true);
      const fresh = await queries.getChapter(chapterId);
      setChapter(fresh);
      setTimeout(() => setShowConfetti(false), 2200);
    } finally {
      setSaving(false);
    }
  };

  if (loading && !chapter) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!chapter) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Chapter" leftLabel="Back" onLeftPress={() => router.back()} />
        <Text style={styles.empty}>Chapter not found.</Text>
      </View>
    );
  }

  if (!chapter.unlocked) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Locked" leftLabel="Back" onLeftPress={() => router.back()} />
        <View style={styles.lockedBox}>
          <Ionicons name="lock-closed" size={36} color={colors.textTertiary} />
          <Text style={styles.lockedTitle}>Chapter locked</Text>
          <Text style={styles.empty}>
            Mark the previous chapter as finished to unlock this vocabulary list.
          </Text>
        </View>
      </View>
    );
  }

  const finished = chapter.status === 'finished';
  const summary = chapter.aiSummary;
  const showSummary = finished && revealSummary && summary;

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={chapter.title}
        leftLabel="Tree"
        onLeftPress={() => router.back()}
      />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 40 + insets.bottom }]}
      >
        <Text style={styles.kicker}>Chapter vocabulary</Text>
        <Text style={styles.lead}>
          Read these words before / while you read this chapter in the real book.
        </Text>

        {entries.length === 0 ? (
          <Text style={styles.empty}>No vocabulary stored for this chapter yet.</Text>
        ) : (
          entries.map((entry) => (
            <Pressable
              key={entry.id}
              style={styles.entry}
              onPress={() => router.push(`/word/${entry.id}`)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.word}>{entry.word}</Text>
                {entry.phonetic ? (
                  <Text style={styles.phonetic}>/{entry.phonetic}/</Text>
                ) : null}
                <Text style={styles.gloss} numberOfLines={2}>
                  {entry.glossZh}
                </Text>
                {entry.sentence ? (
                  <Text style={styles.sentence} numberOfLines={2}>
                    {entry.sentence}
                  </Text>
                ) : null}
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </Pressable>
          ))
        )}

        {showSummary ? (
          <View style={styles.summaryCard}>
            <Text style={styles.summaryBadge}>Chapter cleared · Summary unlocked</Text>
            <Text style={styles.summaryLabel}>Core Takeaway</Text>
            <Text style={styles.summaryBody}>{summary.coreTakeaway || '—'}</Text>
            <Text style={styles.summaryLabel}>The Best Part</Text>
            <Text style={styles.summaryBody}>{summary.bestPart || '—'}</Text>
            {summary.hook ? (
              <>
                <Text style={styles.summaryLabel}>The Hook</Text>
                <Text style={styles.summaryBody}>{summary.hook}</Text>
              </>
            ) : null}
          </View>
        ) : null}

        {!finished ? (
          <Pressable style={styles.finishBtn} onPress={() => setSheetOpen(true)}>
            <Text style={styles.finishText}>Mark {chapter.title.split('—')[0]?.trim() || 'Chapter'} as Finished</Text>
          </Pressable>
        ) : (
          <Pressable
            style={styles.nextBtn}
            onPress={() => router.replace(`/source/${sourceId}`)}
          >
            <Text style={styles.nextText}>Back to Progress Tree</Text>
          </Pressable>
        )}
      </ScrollView>

      <ConfettiBurst active={showConfetti} />

      <Modal visible={sheetOpen} animationType="slide" transparent>
        <Pressable style={styles.sheetBackdrop} onPress={() => !saving && setSheetOpen(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: 16 + insets.bottom }]} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>How was this chapter?</Text>
            <Text style={styles.sheetHint}>Quick feedback — then unlock your summary reward.</Text>
            {DIFFICULTY_OPTIONS.map((opt) => (
              <Pressable
                key={opt.value}
                style={styles.diffRow}
                disabled={saving}
                onPress={() => void onPickDifficulty(opt.value)}
              >
                <View>
                  <Text style={styles.diffLabel}>{opt.label}</Text>
                  <Text style={styles.diffHint}>{opt.hint}</Text>
                </View>
                {saving ? <ActivityIndicator /> : <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />}
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20 },
  kicker: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  lead: {
    marginTop: 8,
    marginBottom: 16,
    fontSize: 15,
    lineHeight: 21,
    color: colors.textSecondary,
  },
  entry: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  word: { fontSize: 17, fontWeight: '700', textTransform: 'capitalize', color: colors.text },
  phonetic: { marginTop: 2, fontSize: 13, color: colors.textTertiary },
  gloss: { marginTop: 4, fontSize: 14, color: colors.textSecondary },
  sentence: {
    marginTop: 6,
    fontSize: 13,
    fontStyle: 'italic',
    color: colors.textTertiary,
  },
  empty: { color: colors.textSecondary, fontSize: 15, lineHeight: 21 },
  lockedBox: {
    marginTop: 48,
    alignItems: 'center',
    paddingHorizontal: 28,
    gap: 10,
  },
  lockedTitle: { fontSize: 20, fontWeight: '700', color: colors.text },
  finishBtn: {
    marginTop: 28,
    backgroundColor: colors.link,
    borderRadius: radii.card,
    paddingVertical: 18,
    paddingHorizontal: 16,
    alignItems: 'center',
    minHeight: 58,
    justifyContent: 'center',
  },
  finishText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  nextBtn: {
    marginTop: 28,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    paddingVertical: 16,
    alignItems: 'center',
  },
  nextText: { fontSize: 16, fontWeight: '600', color: colors.link },
  summaryCard: {
    marginTop: 24,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: 16,
    gap: 6,
    borderWidth: 1,
    borderColor: colors.link,
  },
  summaryBadge: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.link,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  summaryLabel: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  summaryBody: {
    fontSize: 16,
    lineHeight: 23,
    color: colors.text,
  },
  sheetBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.separator,
    marginBottom: 14,
  },
  sheetTitle: { fontSize: 20, fontWeight: '700', color: colors.text },
  sheetHint: {
    marginTop: 6,
    marginBottom: 12,
    fontSize: 14,
    color: colors.textSecondary,
  },
  diffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separatorLight,
  },
  diffLabel: { fontSize: 18, fontWeight: '700', color: colors.text },
  diffHint: { marginTop: 2, fontSize: 13, color: colors.textTertiary },
});
