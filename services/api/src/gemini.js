import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Load services/api/.env into process.env if present (no dotenv dependency). */
export function loadLocalEnv() {
  try {
    const envPath = path.join(__dirname, '..', '.env');
    if (!fs.existsSync(envPath)) return;
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch {
    // optional
  }
}

// Models verified against ListModels for current Google AI keys.
// Avoid retired ids (1.5 / 2.0 / 2.5 for many new keys).
const GEMINI_MODELS = [
  'gemini-flash-lite-latest',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-flash-latest',
  'gemini-3.5-flash',
  'gemini-3.6-flash',
];

const GEMINI_LITE_MODELS = [
  'gemini-flash-lite-latest',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
];

const RETRYABLE = new Set([429, 503]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function endpoint(model) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

function getApiKey() {
  return String(process.env.GEMINI_API_KEY || '').trim();
}

function normalizeImages(options = {}) {
  if (Array.isArray(options.images) && options.images.length) {
    return options.images
      .map((img) => ({
        data: String(img?.data || '').replace(/\s/g, ''),
        mimeType: img?.mimeType || 'image/jpeg',
      }))
      .filter((img) => img.data);
  }
  if (options.image?.data) {
    return [
      {
        data: String(options.image.data).replace(/\s/g, ''),
        mimeType: options.image.mimeType || 'image/jpeg',
      },
    ];
  }
  return [];
}

function buildBody(prompt, model, options = {}) {
  const maxOutputTokens = Number(options.maxOutputTokens) || 8192;
  const generationConfig = {
    temperature: options.temperature ?? 0.2,
    maxOutputTokens,
    responseMimeType: 'application/json',
  };
  // Lite models reject thinkingConfig (400). Full Flash often needs budget 0 to stay fast.
  if (!/lite/i.test(model)) {
    generationConfig.thinkingConfig = { thinkingBudget: 0 };
  }
  const parts = [{ text: prompt }];
  for (const image of normalizeImages(options)) {
    parts.push({
      inline_data: {
        mime_type: image.mimeType || 'image/jpeg',
        data: image.data,
      },
    });
  }
  return {
    contents: [{ role: 'user', parts }],
    generationConfig,
  };
}

/**
 * Call Gemini and parse a JSON response (object or array).
 * @param {string} prompt
 * @param {{
 *   timeoutMs?: number,
 *   image?: { data: string, mimeType?: string },
 *   images?: Array<{ data: string, mimeType?: string }>,
 *   liteOnly?: boolean,
 *   maxOutputTokens?: number,
 *   temperature?: number,
 * }} [options]
 */
export async function geminiJson(prompt, options = {}) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY missing. Create services/api/.env with GEMINI_API_KEY=...',
    );
  }

  const timeoutMs = options.timeoutMs ?? 90000;
  const models = options.liteOnly ? GEMINI_LITE_MODELS : GEMINI_MODELS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let lastError = 'Gemini request failed.';
    for (const model of models) {
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        const res = await fetch(`${endpoint(model)}?key=${encodeURIComponent(apiKey)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify(buildBody(prompt, model, options)),
        });

        if (res.status === 404 || res.status === 400) {
          const detail = await res.text().catch(() => '');
          lastError = `Model ${model} rejected (${res.status}).`;
          if (detail) lastError += ` ${detail.slice(0, 100)}`;
          break; // try next model
        }

        if (RETRYABLE.has(res.status)) {
          lastError = `Gemini busy (${res.status}).`;
          if (attempt < 2) {
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

        const payload = await res.json();
        if (payload?.error?.message) {
          lastError = payload.error.message;
          break;
        }

        const candidate = payload?.candidates?.[0];
        const finishReason = String(candidate?.finishReason || '');
        if (/SAFETY|BLOCK|RECITATION/i.test(finishReason) || !candidate) {
          lastError = `Gemini blocked or returned no content (${finishReason || 'empty'}).`;
          break;
        }

        const text =
          candidate?.content?.parts?.map((p) => p.text || '').join('') || '';
        if (!text.trim()) {
          lastError = `Gemini returned empty text (${finishReason || 'no parts'}).`;
          break;
        }
        try {
          return parseJsonLoose(text);
        } catch (parseErr) {
          // Truncated JSON from a low token cap — try next model / attempt.
          lastError =
            parseErr instanceof Error
              ? parseErr.message
              : 'Gemini returned invalid JSON.';
          if (/MAX_TOKENS|LENGTH/i.test(finishReason)) {
            break;
          }
          break;
        }
      }
    }
    throw new Error(
      `${lastError} Try again in a moment — no available Flash model responded.`,
    );
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Gemini timed out.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function parseJsonLoose(text) {
  const cleaned = String(text || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const startObj = cleaned.indexOf('{');
    const startArr = cleaned.indexOf('[');
    let start = -1;
    if (startObj >= 0 && (startArr < 0 || startObj < startArr)) start = startObj;
    else if (startArr >= 0) start = startArr;
    if (start < 0) throw new Error('Gemini returned invalid JSON.');
    const endChar = cleaned[start] === '[' ? ']' : '}';
    const end = cleaned.lastIndexOf(endChar);
    if (end <= start) throw new Error('Gemini returned invalid JSON.');
    return JSON.parse(cleaned.slice(start, end + 1));
  }
}
