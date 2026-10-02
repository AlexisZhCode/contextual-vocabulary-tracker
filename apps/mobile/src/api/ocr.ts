import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';

import { resolveApiBase } from './config';

export type CropRect = {
  originX: number;
  originY: number;
  width: number;
  height: number;
};

export type Point = { x: number; y: number };

export type Bounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

export function boundsFromPoints(points: Point[]): Bounds | null {
  if (points.length === 0) return null;
  let minX = points[0].x;
  let maxX = points[0].x;
  let minY = points[0].y;
  let maxY = points[0].y;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, maxX, minY, maxY };
}

/** Map gesture coords (view) → pixel crop on the source image (contain-fit). */
export function viewBoundsToImageCrop(
  bounds: Bounds,
  layout: { width: number; height: number },
  imageSize: { width: number; height: number },
  mode: 'underline' | 'circle',
): CropRect | null {
  if (layout.width <= 0 || layout.height <= 0) return null;
  if (imageSize.width <= 0 || imageSize.height <= 0) return null;

  const scale = Math.min(layout.width / imageSize.width, layout.height / imageSize.height);
  const dispW = imageSize.width * scale;
  const dispH = imageSize.height * scale;
  const offsetX = (layout.width - dispW) / 2;
  const offsetY = (layout.height - dispH) / 2;

  let { minX, maxX, minY, maxY } = bounds;

  if (mode === 'underline') {
    const strokeH = Math.max(maxY - minY, 6);
    const wordBand = Math.max(36, strokeH * 5);
    minY -= wordBand;
    maxY += strokeH * 1.5;
    minX -= 12;
    maxX += 12;
  } else {
    const pad = 10;
    minX -= pad;
    maxX += pad;
    minY -= pad;
    maxY += pad;
  }

  minX = Math.max(offsetX, minX);
  maxX = Math.min(offsetX + dispW, maxX);
  minY = Math.max(offsetY, minY);
  maxY = Math.min(offsetY + dispH, maxY);

  if (maxX - minX < 4 || maxY - minY < 4) return null;

  const originX = Math.max(0, Math.floor((minX - offsetX) / scale));
  const originY = Math.max(0, Math.floor((minY - offsetY) / scale));
  const width = Math.max(
    1,
    Math.min(imageSize.width - originX, Math.ceil((maxX - minX) / scale)),
  );
  const height = Math.max(
    1,
    Math.min(imageSize.height - originY, Math.ceil((maxY - minY) / scale)),
  );

  return { originX, originY, width, height };
}

const STOP = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'of',
  'to',
  'in',
  'on',
  'for',
  'is',
  'are',
  'be',
  'as',
  'at',
  'by',
  'it',
  'from',
  'with',
  'this',
  'that',
  'you',
  'we',
  'they',
  'he',
  'she',
  'his',
  'her',
  'its',
  'our',
  'your',
  'was',
  'were',
  'been',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'not',
  'but',
  'if',
  'so',
  'than',
  'then',
  'too',
  'very',
  'can',
  'will',
  'just',
  'about',
  'into',
  'over',
  'after',
  'before',
  'what',
  'when',
  'where',
  'which',
  'who',
  'how',
  'all',
  'any',
  'each',
  'few',
  'more',
  'most',
  'other',
  'some',
  'such',
  'no',
  'nor',
  'only',
  'own',
  'same',
  's',
  't',
  'll',
  're',
  've',
  'd',
  'm',
]);

export function extractEnglishWords(text: string): string[] {
  const matches = text.match(/[A-Za-z][A-Za-z'-]{0,}/g) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const match of matches) {
    const word = match.toLowerCase().replace(/^'+|'+$/g, '');
    if (word.length < 2) continue;
    if (STOP.has(word)) continue;
    if (seen.has(word)) continue;
    seen.add(word);
    out.push(word);
  }
  return out;
}

async function ocrViaLocalApi(base64: string): Promise<string> {
  const base = resolveApiBase();
  if (!base) {
    throw new Error('No API base URL configured for OCR.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const res = await fetch(`${base}/v1/ocr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: base64 }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(
        `Local OCR failed (${res.status}). Is services/api running? ${detail.slice(0, 120)}`,
      );
    }
    const data = (await res.json()) as { text?: string };
    return (data.text || '').trim();
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('OCR timed out. Keep the API running and try a smaller mark.');
    }
    const message = error instanceof Error ? error.message : String(error);
    if (
      error instanceof TypeError ||
      /network request failed|could not connect|fetch failed/i.test(message)
    ) {
      throw new Error(
        `Cannot reach OCR API at ${base}. On your Mac run: cd services/api && npm run dev (same Wi‑Fi as the phone).`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function cropAndRecognizeWords(input: {
  imageUri: string;
  crop: CropRect;
}): Promise<{ words: string[]; rawText: string; cropUri: string }> {
  // Upscale small crops slightly so Tesseract reads thin book text better.
  const manipulated = await ImageManipulator.manipulateAsync(
    input.imageUri,
    [
      {
        crop: {
          originX: input.crop.originX,
          originY: input.crop.originY,
          width: input.crop.width,
          height: input.crop.height,
        },
      },
      { resize: { width: Math.max(320, Math.min(1280, input.crop.width * 2)) } },
    ],
    {
      compress: 0.9,
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
    throw new Error('Could not read cropped image for OCR.');
  }

  const rawText = await ocrViaLocalApi(base64);
  const words = extractEnglishWords(rawText);
  return { words, rawText, cropUri: manipulated.uri };
}

/** Detect real pen underlines in a photo and OCR the words above them. */
export async function recognizePenUnderlinedWords(imageUri: string): Promise<{
  words: string[];
  rawText: string;
}> {
  const manipulated = await ImageManipulator.manipulateAsync(
    imageUri,
    [{ resize: { width: 2200 } }],
    {
      compress: 0.85,
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
    throw new Error('Could not read image for pen-underline OCR.');
  }

  const base = resolveApiBase();
  if (!base) {
    throw new Error('No API base URL configured for OCR.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120000);
  try {
    const res = await fetch(`${base}/v1/ocr/pen-underlines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: base64 }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(
        `Pen underline OCR failed (${res.status}). Is services/api running? ${detail.slice(0, 160)}`,
      );
    }
    const data = (await res.json()) as { words?: string[]; rawText?: string };
    const words = Array.isArray(data.words)
      ? data.words.map((w) => w.toLowerCase()).filter(Boolean)
      : extractEnglishWords(data.rawText || '');
    return { words, rawText: (data.rawText || words.join(' ')).trim() };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Pen underline OCR timed out. Keep the API running and try a clearer photo.');
    }
    const message = error instanceof Error ? error.message : String(error);
    if (
      error instanceof TypeError ||
      /network request failed|could not connect|fetch failed/i.test(message)
    ) {
      throw new Error(
        `Cannot reach OCR API at ${base}. On your Mac run: cd services/api && npm run dev (same Wi‑Fi as the phone).`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

