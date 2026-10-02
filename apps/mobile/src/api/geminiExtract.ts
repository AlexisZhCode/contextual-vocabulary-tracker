import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';

import { resolveApiBase } from './config';

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '';

// Prefer Flash-Lite first (low latency). Keep fuller Flash as fallbacks.
// Avoid retired ids (gemini-1.5-*, gemini-2.0-*, gemini-2.5-* for many new keys).
const GEMINI_MODELS = [
  'gemini-flash-lite-latest',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-flash-latest',
  'gemini-3.5-flash',
  'gemini-3.6-flash',
] as const;

const RETRYABLE_STATUSES = new Set([429, 503]);
const MAX_ATTEMPTS_PER_MODEL = 2;

function geminiEndpoint(model: string) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function extractMarkedTextViaApi(
  imageBase64: string,
  options?: GeminiExtractOptions,
): Promise<MarkedTextItem[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  try {
    const res = await fetch(`${resolveApiBase()}/v1/gemini/extract-marked`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        imageBase64,
        regionMode: Boolean(options?.regionMode),
      }),
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
};

const MARKED_TEXT_PROMPT = `Extract vocabulary from this book-page photo.

Find physical marks: underlines, circles, highlights, brackets/boxes.
For each marked region return JSON objects with:
- "marked_text": exact marked word/phrase/sentence
- "context": surrounding sentence
- "definition": brief Chinese definition
- "phonetic": IPA or "" 

Return ONLY a JSON array. If nothing marked, [].`;

const REGION_TEXT_PROMPT = `Extract the clearest English word(s)/short phrase(s) from this crop.
Return ONLY a JSON array of:
- "marked_text"
- "context" (sentence if visible, else marked_text)
- "definition" (brief Chinese)
- "phonetic" (or "")
If unreadable, [].`;

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
  const raw = base64Image.includes('base64,')
    ? base64Image.slice(base64Image.indexOf('base64,') + 7)
    : base64Image.replace(/\s/g, '');

  if (!raw) {
    throw new Error('No image data provided for Gemini extraction.');
  }

  if (!GEMINI_API_KEY) {
    return extractMarkedTextViaApi(raw, options);
  }

  const prompt = options?.regionMode ? REGION_TEXT_PROMPT : MARKED_TEXT_PROMPT;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);

  try {
    let lastError = 'Gemini request failed.';
    for (const model of GEMINI_MODELS) {
      const generationConfig: Record<string, unknown> = {
        temperature: 0.1,
        maxOutputTokens: 2048,
        responseMimeType: 'application/json',
      };
      // Lite models reject thinkingConfig (400). Full Flash needs budget 0 to stay fast.
      if (!/lite/i.test(model)) {
        generationConfig.thinkingConfig = { thinkingBudget: 0 };
      }

      const requestBody = {
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: 'image/jpeg',
                  data: raw,
                },
              },
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
        return parseMarkedTextArray(text);
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

/** Resize a local image URI and return JPEG base64 for Gemini. */
export async function imageUriToJpegBase64(imageUri: string): Promise<string> {
  const manipulated = await ImageManipulator.manipulateAsync(
    imageUri,
    [{ resize: { width: 1024 } }],
    {
      compress: 0.7,
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
      { resize: { width: Math.max(280, Math.min(768, crop.width * 1.5)) } },
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
    });
  }
  return out;
}
