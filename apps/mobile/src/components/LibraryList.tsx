import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme/colors';
import type { LibraryShelf } from '../types';

type Row = {
  key: LibraryShelf;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  count: number;
};

type Props = {
  rows: Row[];
  onPress: (shelf: LibraryShelf) => void;
};

export function LibraryList({ rows, onPress }: Props) {
  return (
    <View style={styles.card}>
      {rows.map((row, index) => (
        <Pressable
          key={row.key}
          onPress={() => onPress(row.key)}
          style={[styles.row, index < rows.length - 1 && styles.border]}
        >
          <View style={styles.left}>
            <Ionicons name={row.icon} size={22} color={colors.text} style={styles.icon} />
            <Text style={styles.label}>{row.label}</Text>
          </View>
          <View style={styles.right}>
            <Text style={styles.count}>{row.count}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    overflow: 'hidden',
  },
  row: {
    minHeight: 52,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  border: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separatorLight,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  icon: {
    width: 28,
  },
  label: {
    fontSize: 17,
    color: colors.text,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  count: {
    fontSize: 17,
    color: colors.textSecondary,
    marginRight: 2,
  },
});
