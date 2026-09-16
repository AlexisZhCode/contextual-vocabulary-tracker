import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { colors } from '../src/theme/colors';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="source/[id]" options={{ presentation: 'card' }} />
          <Stack.Screen name="library/[shelf]" options={{ presentation: 'card' }} />
          <Stack.Screen
            name="add-source"
            options={{ presentation: 'modal', headerShown: false }}
          />
          <Stack.Screen
            name="capture"
            options={{ presentation: 'fullScreenModal', headerShown: false }}
          />
          <Stack.Screen
            name="lookup"
            options={{ presentation: 'modal', headerShown: false }}
          />
          <Stack.Screen name="word/[id]" options={{ presentation: 'modal' }} />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
