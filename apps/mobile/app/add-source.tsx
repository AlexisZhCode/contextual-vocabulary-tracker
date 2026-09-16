import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { fallbackColorForTitle, searchCover } from '../src/api/dictionary';
import { ScreenHeader } from '../src/components/ScreenHeader';
import * as queries from '../src/db/queries';
import { colors, radii } from '../src/theme/colors';

function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function AddSourceScreen() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [saving, setSaving] = useState(false);

  const onSave = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      const coverUrl = await searchCover(title.trim(), author.trim() || null);
      const id = createId('src');
      await queries.createSource({
        id,
        title: title.trim(),
        author: author.trim() || null,
        coverUrl,
        coverFallback: fallbackColorForTitle(title.trim()),
        status: 'toRead',
      });
      router.replace(`/source/${id}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScreenHeader title="Add Source" leftLabel="Close" onLeftPress={() => router.back()} />
      <View style={styles.form}>
        <Text style={styles.label}>Title</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Book, PDF, or article title"
          placeholderTextColor={colors.textTertiary}
          style={styles.input}
          autoFocus
        />
        <Text style={styles.label}>Author (optional)</Text>
        <TextInput
          value={author}
          onChangeText={setAuthor}
          placeholder="Author name"
          placeholderTextColor={colors.textTertiary}
          style={styles.input}
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
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  form: { paddingHorizontal: 20, gap: 8 },
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
  },
  saveDisabled: { opacity: 0.4 },
  saveText: { color: '#fff', fontSize: 17, fontWeight: '600' },
});
