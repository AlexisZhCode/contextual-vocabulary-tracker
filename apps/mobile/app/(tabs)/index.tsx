import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CollapsibleSection } from '../../src/components/CollapsibleSection';
import { LibraryList } from '../../src/components/LibraryList';
import { LookUpActionBar } from '../../src/components/LookUpActionBar';
import { ReadingNowCard } from '../../src/components/ReadingNowCard';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { useBookshelf } from '../../src/hooks/useBookshelf';
import { colors } from '../../src/theme/colors';
import type { LibraryShelf } from '../../src/types';

export default function BookshelfScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { readingNow, counts, loading, editing, setEditing, refresh } = useBookshelf();
  const [readingExpanded, setReadingExpanded] = useState(true);
  const [libraryExpanded, setLibraryExpanded] = useState(true);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const openCapture = (intent?: 'camera' | 'library' | 'upload') => {
    router.push({
      pathname: '/capture',
      params: intent ? { intent } : undefined,
    });
  };

  const libraryRows: {
    key: LibraryShelf;
    label: string;
    icon:
      | 'library-outline'
      | 'bookmark-outline'
      | 'book-outline'
      | 'checkmark-circle-outline'
      | 'trash-outline'
      | 'star-outline';
    count: number;
  }[] = [
    { key: 'library', label: 'Library', icon: 'library-outline', count: counts.library },
    { key: 'toRead', label: 'To Read', icon: 'bookmark-outline', count: counts.toRead },
    { key: 'readingNow', label: 'Reading Now', icon: 'book-outline', count: counts.readingNow },
    {
      key: 'finished',
      label: 'Finished',
      icon: 'checkmark-circle-outline',
      count: counts.finished,
    },
    { key: 'abandoned', label: 'Abandoned', icon: 'trash-outline', count: counts.abandoned },
    { key: 'starred', label: 'Starred', icon: 'star-outline', count: counts.starred },
  ];

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Bookshelf"
        showEdit
        showAdd
        showScan
        editing={editing}
        onEditPress={() => setEditing((v) => !v)}
        onAddPress={() => router.push('/add-source')}
        onScanPress={() => openCapture()}
      />
      {loading && readingNow.length === 0 ? (
        <View style={styles.loader}>
          <ActivityIndicator color={colors.textSecondary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <LookUpActionBar
            onOpenCapture={() => openCapture('upload')}
            onCamera={() => openCapture('camera')}
            onScreenshot={() => openCapture('upload')}
          />

          <CollapsibleSection
            title="Reading Now"
            expanded={readingExpanded}
            onToggle={() => setReadingExpanded((v) => !v)}
          >
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.readingRow}
            >
              {readingNow.map((source) => (
                <ReadingNowCard
                  key={source.id}
                  source={source}
                  editing={editing}
                  onPress={() => router.push(`/source/${source.id}`)}
                />
              ))}
              <Pressable style={styles.captureCard} onPress={() => openCapture()}>
                <Ionicons name="camera-outline" size={28} color={colors.link} />
                <Text style={styles.captureLabel}>Look up</Text>
              </Pressable>
            </ScrollView>
          </CollapsibleSection>

          <CollapsibleSection
            title="Library"
            expanded={libraryExpanded}
            onToggle={() => setLibraryExpanded((v) => !v)}
          >
            <LibraryList
              rows={libraryRows}
              onPress={(shelf) => router.push(`/library/${shelf}`)}
            />
          </CollapsibleSection>
        </ScrollView>
      )}

      <Pressable
        style={[styles.fab, { bottom: Math.max(insets.bottom, 12) + 8 }]}
        onPress={() => openCapture('camera')}
        accessibilityLabel="Take a photo to look up a word"
      >
        <Ionicons name="camera" size={26} color="#fff" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 96,
  },
  readingRow: {
    paddingRight: 8,
    paddingBottom: 4,
  },
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureCard: {
    width: 118,
    height: 178,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.separator,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    gap: 8,
  },
  captureLabel: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  fab: {
    position: 'absolute',
    right: 20,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
