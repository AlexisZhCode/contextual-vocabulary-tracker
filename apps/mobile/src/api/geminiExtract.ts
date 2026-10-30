import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';

import { resolveApiBase } from './config';
import { defineBatch } from './dictionary';

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '';

// Extract path: Flash-Lite only for latency. Avoid walking full Flash fallbacks.
const GEMINI_LITE_MODELS = [
  'gemini-flash-lite-latest',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
] as const;

const RETRYABLE_STATUSES = new Set([429, 503]);
const MAX_ATTEMPTS_PER_MODEL = 2;
const EXTRACT_TIMEOUT_MS = 45000;

function geminiEndpoint(model: string) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function normalizeBase64(base64Image: string) {
  return base64Image.includes('base64,')
    ? base64Image.slice(base64Image.indexOf('base64,') + 7)
    : base64Image.replace(/\s/g, '');
}

async function extractMarkedTextViaApi(
  images: string[],
  options?: GeminiExtractOptions,
): Promise<MarkedTextItem[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EXTRACT_TIMEOUT_MS);
  const cleaned = images.map(normalizeBase64).filter(Boolean).slice(0, 8);
  try {
    const body =
      cleaned.length === 1
        ? {
            imageBase64: cleaned[0],
            regionMode: Boolean(options?.regionMode),
          }
        : {
            images: cleaned,
            regionMode: true,
          };

    const res = await fetch(`${resolveApiBase()}/v1/gemini/extract-marked`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify(body),
    });
    const payload = (await res.json().catch(() => ({}))) as {
      items?: MarkedTextItem[];
      error?: string;
      message?: string;
    };
    if (!res.ok) {
      throw new Error(payload.message || payload.error || `Gemini request failed (${res.status}).`);
    }
    return parseMarkedTextArray(JSON.stringify(payload.items ?? []));
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Gemini timed out. Try a clearer photo or a smaller image.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export type MarkedTextItem = {
  marked_text: string;
  context: string;
  definition: string;
  phonetic: string;
  glossEn?: string | null;
  pos?: string | null;
};

const MARKED_TEXT_PROMPT = `Extract vocabulary from this book-page photo.

Find EVERY physical hand-drawn mark: underlines, circles, highlights, brackets/boxes.
Include thin/shaky pen underlines even when they touch letter descenders (g, y, p).
If a marked word is hyphenated across two lines (e.g. need- / ful), join it into one word.
For each marked region return JSON objects with:
- "marked_text": exact marked word/phrase as printed (prefer the word, not a long sentence)
- "lemma": dictionary headword — singular noun or base/present-tense verb (e.g. eulogists→eulogist, swinging→swing, suffered→suffer, botched→botch)
- "context": short surrounding sentence (keep brief)

This is ordinary vocabulary study of a printed book page — extract the marked words only.
Do NOT include definitions or phonetics.
Return ONLY a JSON array. If nothing marked, [].`;

const REGION_TEXT_PROMPT = `Extract the clearest English word(s)/short phrase(s) from this crop.
Return ONLY a JSON array of:
- "marked_text": as printed
- "lemma": singular noun or base/present-tense verb
- "context" (sentence if visible, else marked_text)

Do NOT include definitions or phonetics.
If unreadable, [].`;

const MULTI_REGION_PROMPT = `You are given several tight crops from a book page (user-drawn underlines/circles).
For EACH image, extract the clearest English word(s)/short phrase(s).
Return ONLY one JSON array of objects with:
- "marked_text": as printed
- "lemma": singular noun or base/present-tense verb
- "context" (sentence if visible, else marked_text)

Do NOT include definitions or phonetics.
Deduplicate by lemma. If unreadable, skip that image.`;

type GeminiExtractOptions = {
  /** When true, treat the image as a tight crop (drawn mark) instead of a full marked page. */
  regionMode?: boolean;
};

/**
 * Call Gemini to find physically marked words/phrases/sentences in a book photo.
 * @param base64Image JPEG/PNG base64 without a data-URL prefix
 */
export async function extractMarkedText(
  base64Image: string,
  options?: GeminiExtractOptions,
): Promise<MarkedTextItem[]> {
  const raw = normalizeBase64(base64Image);
  if (!raw) {
    throw new Error('No image data provided for Gemini extraction.');
  }
  return extractMarkedImages([raw], options);
}

/** One Gemini call for many drawn-mark crops (via API or direct key). */
export async function extractMarkedTextBatch(
  base64Images: string[],
  options?: GeminiExtractOptions,
): Promise<MarkedTextItem[]> {
  const cleaned = base64Images.map(normalizeBase64).filter(Boolean).slice(0, 8);
  if (!cleaned.length) {
    throw new Error('No image data provided for Gemini extraction.');
  }
  return extractMarkedImages(cleaned, { ...options, regionMode: true });
}

async function extractMarkedImages(
  images: string[],
  options?: GeminiExtractOptions,
): Promise<MarkedTextItem[]> {
  if (!GEMINI_API_KEY) {
    return extractMarkedTextViaApi(images, options);
  }

  const prompt =
    images.length > 1
      ? MULTI_REGION_PROMPT
      : options?.regionMode
        ? REGION_TEXT_PROMPT
        : MARKED_TEXT_PROMPT;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EXTRACT_TIMEOUT_MS);

  try {
    let lastError = 'Gemini request failed.';
    for (const model of GEMINI_LITE_MODELS) {
      const generationConfig: Record<string, unknown> = {
        temperature: 0.1,
        maxOutputTokens: 4096,
        responseMimeType: 'application/json',
      };

      const requestBody = {
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              ...images.map((data) => ({
                inline_data: {
                  mime_type: 'image/jpeg',
                  data,
                },
              })),
            ],
          },
        ],
        generationConfig,
      };

      for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_MODEL; attempt++) {
        const res = await fetch(
          `${geminiEndpoint(model)}?key=${encodeURIComponent(GEMINI_API_KEY)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify(requestBody),
          },
        );

        // Skip unavailable / invalid-config models and try the next one.
        if (res.status === 404 || res.status === 400) {
          lastError = `Model ${model} not available (${res.status}).`;
          break;
        }

        if (RETRYABLE_STATUSES.has(res.status)) {
          const detail = await res.text().catch(() => '');
          lastError = `Gemini busy (${res.status}${detail ? `: ${detail.slice(0, 120)}` : ''}).`;
          if (attempt < MAX_ATTEMPTS_PER_MODEL) {
            await sleep(400 * attempt);
            continue;
          }
          break;
        }

        if (!res.ok) {
          const detail = await res.text().catch(() => '');
          lastError = `Gemini request failed (${res.status}). ${detail.slice(0, 220) || res.statusText}`;
          break;
        }

        const payload = (await res.json()) as {
          candidates?: Array<{
            content?: { parts?: Array<{ text?: string }> };
          }>;
          error?: { message?: string };
        };

        if (payload.error?.message) {
          lastError = payload.error.message;
          break;
        }

        const text =
          payload.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
        const extracted = parseMarkedTextArray(text);
        return enrichMarkedItemsWithDictionary(extracted);
      }
    }

    throw new Error(
      `${lastError} Gemini is overloaded right now — wait a few seconds and try again.`,
    );
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Gemini timed out. Try a clearer photo or a smaller image.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function enrichMarkedItemsWithDictionary(
  items: MarkedTextItem[],
): Promise<MarkedTextItem[]> {
  const missing = items
    .filter((item) => !item.definition && !item.glossEn)
    .map((item) => item.marked_text);
  if (!missing.length) return items;

  const results = await defineBatch(missing);
  return items.map((item) => {
    if (item.definition || item.glossEn) return item;
    const key = item.marked_text.toLowerCase();
    const hit =
      results[key] ||
      results[key.match(/[a-z][a-z'-]*/)?.[0] || ''];
    if (!hit) return item;
    return {
      ...item,
      definition: hit.glossZh || '',
      phonetic: hit.phonetic || item.phonetic || '',
      glossEn: hit.glossEn ?? null,
      pos: hit.pos ?? null,
    };
  });
}

/** Resize a local image URI and return JPEG base64 for Gemini. */
export async function imageUriToJpegBase64(imageUri: string): Promise<string> {
  // Keep a roomy max width so phone screenshots stay readable without user resizing.
  const manipulated = await ImageManipulator.manipulateAsync(
    imageUri,
    [{ resize: { width: 1280 } }],
    {
      compress: 0.75,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    },
  );

  let base64 = manipulated.base64;
  if (!base64 && manipulated.uri) {
    base64 = await FileSystem.readAsStringAsync(manipulated.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
  }
  if (!base64) {
    throw new Error('Could not read image for Gemini extraction.');
  }
  return base64;
}

/** Crop a region from a local image and return JPEG base64 for Gemini. */
export async function cropUriToJpegBase64(
  imageUri: string,
  crop: { originX: number; originY: number; width: number; height: number },
): Promise<string> {
  const manipulated = await ImageManipulator.manipulateAsync(
    imageUri,
    [
      {
        crop: {
          originX: crop.originX,
          originY: crop.originY,
          width: crop.width,
          height: crop.height,
        },
      },
      { resize: { width: Math.max(320, Math.min(900, Math.round(crop.width * 1.5))) } },
    ],
    {
      compress: 0.75,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    },
  );

  let base64 = manipulated.base64;
  if (!base64 && manipulated.uri) {
    base64 = await FileSystem.readAsStringAsync(manipulated.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
  }
  if (!base64) {
    throw new Error('Could not read cropped image for Gemini extraction.');
  }
  return base64;
}

function parseMarkedTextArray(text: string): MarkedTextItem[] {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('[');
    const end = cleaned.lastIndexOf(']');
    if (start >= 0 && end > start) {
      parsed = JSON.parse(cleaned.slice(start, end + 1));
    } else {
      throw new Error('Gemini returned invalid JSON for marked text.');
    }
  }

  const rows = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { items?: unknown })?.items)
      ? (parsed as { items: unknown[] }).items
      : null;

  if (!rows) {
    throw new Error('Gemini JSON must be an array of marked text objects.');
  }

  const out: MarkedTextItem[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const rec = row as Record<string, unknown>;
    const marked = String(rec.marked_text ?? rec.markedText ?? '').trim();
    if (!marked) continue;
    const key = marked.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      marked_text: marked,
      context: String(rec.context ?? '').trim(),
      definition: String(rec.definition ?? '').trim(),
      phonetic: String(rec.phonetic ?? '').trim(),
      glossEn: rec.glossEn != null ? String(rec.glossEn).trim() || null : null,
      pos: rec.pos != null ? String(rec.pos).trim() || null : null,
    });
  }
  return out;
}
