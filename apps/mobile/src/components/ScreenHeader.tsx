import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radii } from '../theme/colors';

type Props = {
  title: string;
  editing?: boolean;
  onEditPress?: () => void;
  onAddPress?: () => void;
  onScanPress?: () => void;
  showEdit?: boolean;
  showAdd?: boolean;
  showScan?: boolean;
  leftLabel?: string;
  onLeftPress?: () => void;
};

export function ScreenHeader({
  title,
  editing,
  onEditPress,
  onAddPress,
  onScanPress,
  showEdit = false,
  showAdd = false,
  showScan = false,
  leftLabel,
  onLeftPress,
}: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrap, { paddingTop: Math.max(insets.top, 12) }]}>
      <View style={styles.topRow}>
        {showEdit ? (
          <Pressable onPress={onEditPress} hitSlop={10}>
            <Text style={styles.link}>{editing ? 'Done' : 'Edit'}</Text>
          </Pressable>
        ) : leftLabel ? (
          <Pressable onPress={onLeftPress} hitSlop={10} style={styles.back}>
            <Ionicons name="chevron-back" size={28} color={colors.link} />
            <Text style={styles.link}>{leftLabel}</Text>
          </Pressable>
        ) : (
          <View style={styles.spacer} />
        )}
        <View style={styles.rightActions}>
          {showScan ? (
            <Pressable onPress={onScanPress} style={styles.iconBtn} hitSlop={8}>
              <Ionicons name="scan-outline" size={24} color={colors.link} />
            </Pressable>
          ) : null}
          {showAdd ? (
            <Pressable onPress={onAddPress} style={styles.iconBtn} hitSlop={8}>
              <Ionicons name="add" size={26} color={colors.link} />
            </Pressable>
          ) : !showScan ? (
            <View style={styles.spacer} />
          ) : null}
        </View>
      </View>
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    backgroundColor: colors.background,
  },
  topRow: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  link: {
    color: colors.link,
    fontSize: 17,
  },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: -8,
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: radii.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spacer: {
    width: 32,
    height: 32,
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: 0.3,
  },
});
