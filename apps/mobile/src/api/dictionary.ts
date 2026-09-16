import { LOCAL_ECDICT } from '../data/localEcdict';
import type { DictionaryResult } from '../types';
import { resolveApiBase } from './config';

function normalizeWord(word: string) {
  return word.trim().toLowerCase().replace(/[^a-z0-9'-]/gi, '');
}

function stripHtml(html: string) {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function fetchJson(url: string) {
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'ContextualVocabularyTracker/1.0',
    },
  });
  if (!res.ok) return null;
  return res.json();
}

async function fetchRemoteEcdict(word: string): Promise<DictionaryResult | null> {
  const base = resolveApiBase();
  if (!base) return null;
  try {
    const data = (await fetchJson(`${base}/v1/define/${encodeURIComponent(word)}`)) as
      | DictionaryResult
      | null;
    if (!data?.word) return null;
    return data;
  } catch {
    return null;
  }
}

async function fetchFreeDictionary(word: string): Promise<{
  phonetic: string | null;
  glossEn: string | null;
  audioUrl: string | null;
  pos: string | null;
} | null> {
  try {
    const data = (await fetchJson(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
    )) as Array<{
      phonetic?: string;
      phonetics?: Array<{ text?: string; audio?: string }>;
      meanings?: Array<{
        partOfSpeech?: string;
        definitions?: Array<{ definition?: string }>;
      }>;
    }> | null;
    const entry = data?.[0];
    if (!entry) return null;
    const audioUrl =
      entry.phonetics?.find((p) => p.audio && p.audio.length > 0)?.audio ?? null;
    const phonetic =
      entry.phonetic ?? entry.phonetics?.find((p) => p.text)?.text ?? null;
    const meaning = entry.meanings?.[0];
    return {
      phonetic,
      audioUrl,
      pos: meaning?.partOfSpeech ?? null,
      glossEn: meaning?.definitions?.[0]?.definition ?? null,
    };
  } catch {
    return null;
  }
}

async function fetchWiktionary(word: string): Promise<{
  glossEn: string | null;
  pos: string | null;
} | null> {
  try {
    const data = (await fetchJson(
      `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}`,
    )) as {
      en?: Array<{ partOfSpeech?: string; definitions?: Array<{ definition?: string }> }>;
    } | null;
    const block = data?.en?.[0];
    const raw = block?.definitions?.[0]?.definition;
    if (!raw) return null;
    return {
      pos: block?.partOfSpeech ?? null,
      glossEn: stripHtml(raw),
    };
  } catch {
    return null;
  }
}

async function fetchZhTranslation(word: string): Promise<string | null> {
  try {
    const data = (await fetchJson(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=en|zh-CN`,
    )) as {
      responseData?: { translatedText?: string };
      responseStatus?: number | string;
    } | null;
    const text = data?.responseData?.translatedText?.trim();
    if (!text) return null;
    // MyMemory sometimes echoes the English word when it can't translate.
    if (text.toLowerCase() === word.toLowerCase()) return null;
    return text;
  } catch {
    return null;
  }
}

export async function lookupWord(rawWord: string): Promise<DictionaryResult | null> {
  const word = normalizeWord(rawWord);
  if (!word) return null;

  const local = LOCAL_ECDICT[word];

  // Prefer ECDICT API when available; otherwise fan out to public sources.
  // Free Dictionary is currently unreliable (Cloudflare 522), so Wiktionary + MyMemory matter.
  const [remote, free, wiki, zh] = await Promise.all([
    withTimeout(fetchRemoteEcdict(word), 2500),
    withTimeout(fetchFreeDictionary(word), 3500),
    withTimeout(fetchWiktionary(word), 4500),
    withTimeout(fetchZhTranslation(word), 4500),
  ]);

  if (remote?.glossZh || remote?.glossEn) {
    return {
      word: remote.word || word,
      phonetic: remote.phonetic ?? local?.phonetic ?? free?.phonetic ?? null,
      pos: remote.pos ?? local?.pos ?? free?.pos ?? wiki?.pos ?? null,
      glossZh: remote.glossZh || local?.translation || zh || '（暂无中文释义）',
      glossEn: remote.glossEn ?? local?.definition ?? free?.glossEn ?? wiki?.glossEn ?? null,
      audioUrl: remote.audioUrl ?? free?.audioUrl ?? null,
    };
  }

  const glossEn = local?.definition ?? free?.glossEn ?? wiki?.glossEn ?? null;
  const glossZh = local?.translation ?? zh ?? null;

  if (!glossEn && !glossZh) {
    return null;
  }

  return {
    word,
    phonetic: local?.phonetic ?? free?.phonetic ?? null,
    pos: local?.pos ?? free?.pos ?? wiki?.pos ?? null,
    glossZh: glossZh ?? '（暂无中文释义）',
    glossEn,
    audioUrl: free?.audioUrl ?? null,
  };
}

export async function searchCover(title: string, author?: string | null): Promise<string | null> {
  try {
    const res = await fetch(
      `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&limit=1${
        author ? `&author=${encodeURIComponent(author)}` : ''
      }`,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      docs?: Array<{ cover_i?: number; isbn?: string[] }>;
    };
    const doc = data.docs?.[0];
    if (doc?.cover_i) {
      return `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`;
    }
    const isbn = doc?.isbn?.[0];
    if (isbn) {
      return `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;
    }
    return null;
  } catch {
    return null;
  }
}

export function fallbackColorForTitle(title: string): string {
  const palette = ['#E8A0BF', '#1B3A5C', '#F4A261', '#2A9D8F', '#264653', '#9B2226', '#457B9D'];
  let hash = 0;
  for (let i = 0; i < title.length; i += 1) {
    hash = (hash + title.charCodeAt(i) * (i + 1)) % palette.length;
  }
  return palette[hash] ?? '#8E8E93';
}
