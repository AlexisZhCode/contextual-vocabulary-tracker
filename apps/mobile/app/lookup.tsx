import { Ionicons } from '@expo/vector-icons';
import { createAudioPlayer } from 'expo-audio';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { lookupWord } from '../src/api/dictionary';
import * as queries from '../src/db/queries';
import { colors, radii } from '../src/theme/colors';
import type { DictionaryResult, SourceWithStats } from '../src/types';

function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function TypeLookupScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { sourceId: presetSourceId, q } = useLocalSearchParams<{
    sourceId?: string;
    q?: string;
  }>();

  const [word, setWord] = useState(typeof q === 'string' ? q : '');
  const [lookingUp, setLookingUp] = useState(false);
  const [result, setResult] = useState<DictionaryResult | null>(null);
  const [sources, setSources] = useState<SourceWithStats[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string | undefined>(
    presetSourceId,
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void queries.listSourcesWithStats().then((list) => {
      setSources(list);
      if (!presetSourceId && list[0]) {
        setSelectedSourceId(list[0].id);
      }
    });
  }, [presetSourceId]);

  useEffect(() => {
    if (typeof q === 'string' && q.trim()) {
      void runLookup(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runLookup = async (raw?: string) => {
    const query = (raw ?? word).trim();
    if (!query) {
      Alert.alert('Enter a word', 'Type an English word to look up.');
      return;
    }
    setLookingUp(true);
    try {
      const found = await lookupWord(query);
      if (!found) {
        Alert.alert(
          'Not found',
          `No definition for “${query}”. Check your network, or start the ECDICT API (services/api).`,
        );
        setResult(null);
        return;
      }
      setWord(found.word);
      setResult(found);
    } catch (error) {
      Alert.alert(
        'Lookup failed',
        error instanceof Error ? error.message : 'Something went wrong looking up that word.',
      );
      setResult(null);
    } finally {
      setLookingUp(false);
    }
  };

  const onSave = async () => {
    if (!result || !selectedSourceId || saving) return;
    setSaving(true);
    try {
      const id = createId('ent');
      await queries.createEntry({
        id,
        sourceId: selectedSourceId,
        word: result.word,
        phonetic: result.phonetic,
        pos: result.pos,
        glossZh: result.glossZh,
        glossEn: result.glossEn,
        audioUrl: result.audioUrl,
      });
      router.replace(`/source/${selectedSourceId}`);
    } finally {
      setSaving(false);
    }
  };

  const playAudio = () => {
    if (!result?.audioUrl) return;
    const player = createAudioPlayer(result.audioUrl);
    player.play();
  };

  const selectedSource = sources.find((s) => s.id === selectedSourceId);

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Text style={styles.link}>Close</Text>
        </Pressable>
        <Text style={styles.topTitle}>Type a word</Text>
        <View style={styles.spacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.label}>Word</Text>
        <TextInput
          value={word}
          onChangeText={(text) => {
            setWord(text);
            setResult(null);
          }}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          placeholder="e.g. ephemeral"
          placeholderTextColor={colors.textTertiary}
          style={styles.input}
          returnKeyType="search"
          onSubmitEditing={() => void runLookup()}
        />

        <Pressable
          style={[styles.primaryBtn, lookingUp && styles.disabled]}
          onPress={() => void runLookup()}
          disabled={lookingUp}
        >
          {lookingUp ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Ionicons name="search" size={18} color="#fff" />
          )}
          <Text style={styles.primaryText}>{lookingUp ? 'Looking up…' : 'Look up'}</Text>
        </Pressable>

        {result ? (
          <View style={styles.result}>
            <View style={styles.resultHeader}>
              <Text style={styles.resultWord}>{result.word}</Text>
              {result.audioUrl ? (
                <Pressable onPress={playAudio}>
                  <Ionicons name="volume-high-outline" size={24} color={colors.link} />
                </Pressable>
              ) : null}
            </View>
            {result.phonetic ? (
              <Text style={styles.phonetic}>/{result.phonetic}/</Text>
            ) : null}
            {result.pos ? <Text style={styles.pos}>{result.pos}</Text> : null}
            <Text style={styles.glossZh}>{result.glossZh}</Text>
            {result.glossEn ? <Text style={styles.glossEn}>{result.glossEn}</Text> : null}

            <Pressable style={styles.sourcePicker} onPress={() => setPickerOpen(true)}>
              <Text style={styles.sourceLabel}>Save to</Text>
              <Text style={styles.sourceValue} numberOfLines={1}>
                {selectedSource?.title ?? 'Choose source'}
              </Text>
              <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
            </Pressable>

            <Pressable
              style={[styles.primaryBtn, (!selectedSourceId || saving) && styles.disabled]}
              onPress={() => void onSave()}
              disabled={!selectedSourceId || saving}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryText}>Save to Bookshelf</Text>
              )}
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      <Modal visible={pickerOpen} animationType="slide" transparent>
        <Pressable style={styles.modalBackdrop} onPress={() => setPickerOpen(false)}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Choose source</Text>
            {sources.map((s) => (
              <Pressable
                key={s.id}
                style={styles.modalRow}
                onPress={() => {
                  setSelectedSourceId(s.id);
                  setPickerOpen(false);
                }}
              >
                <Text style={styles.modalRowText}>{s.title}</Text>
                {selectedSourceId === s.id ? (
                  <Ionicons name="checkmark" size={18} color={colors.link} />
                ) : null}
              </Pressable>
            ))}
            <Pressable
              style={styles.modalRow}
              onPress={() => {
                setPickerOpen(false);
                router.push('/add-source');
              }}
            >
              <Text style={[styles.modalRowText, { color: colors.link }]}>
                Add new source…
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  topBar: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topTitle: { fontSize: 17, fontWeight: '600' },
  link: { color: colors.link, fontSize: 17 },
  spacer: { width: 48 },
  content: { paddingHorizontal: 20, paddingBottom: 40 },
  label: {
    marginTop: 8,
    marginBottom: 6,
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
    fontSize: 20,
    color: colors.text,
  },
  primaryBtn: {
    marginTop: 14,
    backgroundColor: colors.text,
    borderRadius: radii.card,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  disabled: { opacity: 0.5 },
  result: {
    marginTop: 18,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: 16,
    gap: 6,
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  resultWord: {
    fontSize: 28,
    fontWeight: '800',
    textTransform: 'capitalize',
  },
  phonetic: { color: colors.textSecondary, fontSize: 15 },
  pos: { color: colors.textTertiary, fontSize: 13, fontStyle: 'italic' },
  glossZh: { marginTop: 8, fontSize: 17, lineHeight: 24, color: colors.text },
  glossEn: { fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  sourcePicker: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.background,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  sourceLabel: { color: colors.textSecondary, fontSize: 13 },
  sourceValue: { flex: 1, fontSize: 15, fontWeight: '600' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 40,
    gap: 4,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  modalRow: {
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separatorLight,
  },
  modalRowText: { fontSize: 16, color: colors.text },
});
