import { StyleSheet, Text, type TextStyle } from 'react-native';

import { colors } from '../theme/colors';

/** Normalize IPA / ASCII phonetics into /.../ form. */
export function formatPhonetic(phonetic?: string | null): string | null {
  if (!phonetic) return null;
  const inner = phonetic.replace(/^\/+|\/+$/g, '').trim();
  return inner ? `/${inner}/` : null;
}

type Props = {
  phonetic?: string | null;
  style?: TextStyle;
  /** Show leading 音标 label (default true). */
  showLabel?: boolean;
};

export function PhoneticLabel({ phonetic, style, showLabel = true }: Props) {
  const formatted = formatPhonetic(phonetic);
  if (!formatted) return null;

  return (
    <Text style={[styles.text, style]}>
      {showLabel ? <Text style={styles.label}>音标 </Text> : null}
      {formatted}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textTertiary,
  },
});
