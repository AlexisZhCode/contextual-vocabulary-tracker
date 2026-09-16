import { Ionicons } from '@expo/vector-icons';
import { type Href, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { colors, radii } from '../theme/colors';

type Props = {
  onCamera: () => void;
  onScreenshot: () => void;
  onOpenCapture: () => void;
};

export function LookUpActionBar({ onCamera, onScreenshot, onOpenCapture }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState('');

  const submit = () => {
    const q = draft.trim();
    if (!q) return;
    router.push(`/lookup?q=${encodeURIComponent(q)}` as Href);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.searchCard}>
        <Text style={styles.searchTitle}>Look up a word</Text>
        <View style={styles.searchRow}>
          <Ionicons name="search" size={20} color={colors.textSecondary} />
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Type an English word…"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            style={styles.input}
            onSubmitEditing={submit}
          />
          <Pressable
            style={[styles.goBtn, !draft.trim() && styles.goDisabled]}
            onPress={submit}
            disabled={!draft.trim()}
          >
            <Text style={styles.goText}>Go</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.row}>
        <Pressable style={styles.action} onPress={onCamera}>
          <Ionicons name="camera" size={22} color={colors.text} />
          <Text style={styles.actionLabel}>Photo</Text>
        </Pressable>
        <Pressable style={styles.action} onPress={onScreenshot}>
          <Ionicons name="cloud-upload-outline" size={22} color={colors.text} />
          <Text style={styles.actionLabel}>Upload</Text>
        </Pressable>
        <Pressable style={styles.action} onPress={onOpenCapture}>
          <Ionicons name="scan-outline" size={22} color={colors.text} />
          <Text style={styles.actionLabel}>Scan</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 22,
    gap: 10,
  },
  searchCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: 14,
    gap: 10,
  },
  searchTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.background,
    borderRadius: 10,
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 6,
    minHeight: 48,
  },
  input: {
    flex: 1,
    fontSize: 17,
    color: colors.text,
    paddingVertical: 8,
  },
  goBtn: {
    backgroundColor: colors.text,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  goDisabled: {
    opacity: 0.35,
  },
  goText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  action: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    paddingVertical: 14,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
});
