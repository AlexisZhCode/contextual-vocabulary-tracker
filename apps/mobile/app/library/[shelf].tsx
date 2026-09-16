import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { ScreenHeader } from '../../src/components/ScreenHeader';
import * as queries from '../../src/db/queries';
import { colors, radii } from '../../src/theme/colors';
import type { LibraryShelf, SourceWithStats } from '../../src/types';

const TITLES: Record<LibraryShelf, string> = {
  library: 'Library',
  toRead: 'To Read',
  readingNow: 'Reading Now',
  finished: 'Finished',
  abandoned: 'Abandoned',
  starred: 'Starred',
};

function isShelf(value: string): value is LibraryShelf {
  return value in TITLES;
}

export default function LibraryShelfScreen() {
  const { shelf: raw } = useLocalSearchParams<{ shelf: string }>();
  const shelf = raw && isShelf(raw) ? raw : 'library';
  const router = useRouter();
  const [sources, setSources] = useState<SourceWithStats[]>([]);

  useFocusEffect(
    useCallback(() => {
      void queries.listSourcesByShelf(shelf).then(setSources);
    }, [shelf]),
  );

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={TITLES[shelf]}
        leftLabel="Books"
        onLeftPress={() => router.back()}
      />
      <FlatList
        data={sources}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>No sources in this shelf yet.</Text>
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() => router.push(`/source/${item.id}`)}
          >
            {item.coverUrl ? (
              <Image source={{ uri: item.coverUrl }} style={styles.cover} contentFit="cover" />
            ) : (
              <View
                style={[
                  styles.cover,
                  { backgroundColor: item.coverFallback ?? colors.progressFill },
                ]}
              />
            )}
            <View style={styles.meta}>
              <Text style={styles.title} numberOfLines={2}>
                {item.title}
              </Text>
              {item.author ? (
                <Text style={styles.author} numberOfLines={1}>
                  {item.author}
                </Text>
              ) : null}
              <Text style={styles.stat}>
                {item.wordCount} words · {item.dueCount} due
              </Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { paddingHorizontal: 20, paddingBottom: 40, gap: 10 },
  row: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: 12,
    gap: 12,
    alignItems: 'center',
  },
  cover: {
    width: 52,
    height: 78,
    borderRadius: 6,
    backgroundColor: colors.separatorLight,
  },
  meta: { flex: 1 },
  title: { fontSize: 17, fontWeight: '600', color: colors.text },
  author: { marginTop: 4, fontSize: 14, color: colors.textSecondary },
  stat: { marginTop: 6, fontSize: 13, color: colors.textTertiary },
  empty: { color: colors.textSecondary, fontSize: 15, marginTop: 12 },
});
