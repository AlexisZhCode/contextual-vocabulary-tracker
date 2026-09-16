import Constants from 'expo-constants';
import { Platform } from 'react-native';

const RAW_API = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '') ?? '';

/** Metro / Expo Go host (LAN IP on a physical phone). */
function getDevHost(): string | null {
  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants as { manifest?: { debuggerHost?: string } }).manifest?.debuggerHost ??
    (
      Constants as {
        manifest2?: { extra?: { expoClient?: { hostUri?: string } } };
      }
    ).manifest2?.extra?.expoClient?.hostUri;

  if (!hostUri || typeof hostUri !== 'string') return null;
  const host = hostUri.split(':')[0]?.trim();
  if (!host) return null;
  return host;
}

/**
 * Resolve API base for the current runtime.
 * - Explicit EXPO_PUBLIC_API_URL wins
 * - Else Expo Go LAN host (works on physical phones)
 * - Else Android emulator → 10.0.2.2
 * - Else iOS simulator → localhost
 */
export function resolveApiBase() {
  if (RAW_API) {
    if (/localhost|127\.0\.0\.1/i.test(RAW_API) && Platform.OS === 'android') {
      return RAW_API.replace(/localhost|127\.0\.0\.1/gi, '10.0.2.2');
    }
    return RAW_API;
  }

  const host = getDevHost();
  if (host && host !== 'localhost' && host !== '127.0.0.1') {
    return `http://${host}:8787`;
  }
  if (Platform.OS === 'android') return 'http://10.0.2.2:8787';
  if (Platform.OS === 'ios') return 'http://localhost:8787';
  return 'http://localhost:8787';
}
