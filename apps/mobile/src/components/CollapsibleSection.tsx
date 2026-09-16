import type { ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme/colors';

type Props = {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
};

export function CollapsibleSection({ title, expanded, onToggle, children }: Props) {
  return (
    <View style={styles.wrap}>
      <Pressable onPress={onToggle} style={styles.header} hitSlop={8}>
        <Text style={styles.title}>{title}</Text>
        <Ionicons
          name={expanded ? 'chevron-down' : 'chevron-forward'}
          size={18}
          color={colors.textSecondary}
        />
      </Pressable>
      {expanded ? children : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 22,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingRight: 2,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
  },
});
