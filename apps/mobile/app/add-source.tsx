import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { prepareBookChapters, resolveBook } from '../src/api/booksAi';
import { fallbackColorForTitle } from '../src/api/dictionary';
import { ScreenHeader } from '../src/components/ScreenHeader';
import * as queries from '../src/db/queries';
import { colors, radii } from '../src/theme/colors';

function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function AddSourceScreen() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [phase, setPhase] = useState('');

  const onSave = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      setPhase('Looking up the book…');
      const resolved = await resolveBook(title.trim());
      const finalTitle = resolved.title || title.trim();
      const id = createId('src');

      await queries.createSource({
        id,
        title: finalTitle,
        author: resolved.author,
        isbn: resolved.isbn,
        coverUrl: resolved.coverUrl,
        coverFallback: fallbackColorForTitle(finalTitle),
        status: 'toRead',
      });

      setPhase('Building chapter tree & vocabulary…');
      const prepared = await prepareBookChapters(finalTitle, resolved.author, {
        maxChapters: 8,
      });

      await queries.replaceChaptersForSource(
        id,
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

      router.replace(`/source/${id}`);
    } catch (error) {
      Alert.alert(
        'Could not add book',
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setSaving(false);
      setPhase('');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScreenHeader title="Add Book" leftLabel="Close" onLeftPress={() => router.back()} />
      <View style={styles.form}>
        <Text style={styles.hint}>
          Enter the book name. We&apos;ll find the cover and pre-build a chapter Progress Tree with
          vocabulary + locked summaries.
        </Text>
        <Text style={styles.label}>Book name</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Humans"
          placeholderTextColor={colors.textTertiary}
          style={styles.input}
          autoFocus
          editable={!saving}
          returnKeyType="done"
          onSubmitEditing={() => void onSave()}
        />
        <Pressable
          style={[styles.save, !title.trim() && styles.saveDisabled]}
          onPress={() => void onSave()}
          disabled={!title.trim() || saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveText}>Add to Bookshelf</Text>
          )}
        </Pressable>
        {saving && phase ? <Text style={styles.progress}>{phase}</Text> : null}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  form: { paddingHorizontal: 20, gap: 8 },
  hint: {
    marginTop: 8,
    marginBottom: 4,
    fontSize: 15,
    lineHeight: 21,
    color: colors.textSecondary,
  },
  label: {
    marginTop: 12,
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 17,
    color: colors.text,
  },
  save: {
    marginTop: 24,
    backgroundColor: colors.text,
    borderRadius: radii.card,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    minHeight: 50,
  },
  saveDisabled: { opacity: 0.4 },
  saveText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  progress: {
    marginTop: 12,
    textAlign: 'center',
    color: colors.textSecondary,
    fontSize: 14,
  },
});
