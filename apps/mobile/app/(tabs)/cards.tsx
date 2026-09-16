import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ScreenHeader } from '../../src/components/ScreenHeader';
import * as queries from '../../src/db/queries';
import { colors, radii } from '../../src/theme/colors';

type DueCard = Awaited<ReturnType<typeof queries.listDueEntries>>[number];

export default function CardsScreen() {
  const router = useRouter();
  const [cards, setCards] = useState<DueCard[]>([]);

  const refresh = useCallback(async () => {
    setCards(await queries.listDueEntries());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Cards" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.subtitle}>
          {cards.length === 0
            ? 'Nothing due — capture words from Books to build your deck.'
            : `${cards.length} card${cards.length === 1 ? '' : 's'} ready to review`}
        </Text>
        {cards.map((card) => (
          <Pressable
            key={card.id}
            style={styles.card}
            onPress={() => router.push(`/word/${card.id}`)}
          >
            <Text style={styles.word}>{card.word}</Text>
            <Text style={styles.gloss} numberOfLines={2}>
              {card.glossZh}
            </Text>
            <Text style={styles.source}>{card.sourceTitle}</Text>
          </Pressable>
        ))}
      </ScrollView>
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
    paddingBottom: 40,
    gap: 12,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 15,
    marginBottom: 4,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: 16,
  },
  word: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    textTransform: 'capitalize',
  },
  gloss: {
    marginTop: 6,
    fontSize: 16,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  source: {
    marginTop: 10,
    fontSize: 13,
    color: colors.textTertiary,
  },
});
