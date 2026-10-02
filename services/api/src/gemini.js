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

function buildBody(prompt, model, image) {
  const generationConfig = {
    temperature: 0.2,
    maxOutputTokens: 8192,
    responseMimeType: 'application/json',
  };
  // Lite models reject thinkingConfig (400). Full Flash often needs budget 0 to stay fast.
  if (!/lite/i.test(model)) {
    generationConfig.thinkingConfig = { thinkingBudget: 0 };
  }
  const parts = [{ text: prompt }];
  if (image?.data) {
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
 * @param {{ timeoutMs?: number, image?: { data: string, mimeType?: string } }} [options]
 */
export async function geminiJson(prompt, options = {}) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY missing. Create services/api/.env with GEMINI_API_KEY=...',
    );
  }

  const timeoutMs = options.timeoutMs ?? 90000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let lastError = 'Gemini request failed.';
    for (const model of GEMINI_MODELS) {
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        const res = await fetch(`${endpoint(model)}?key=${encodeURIComponent(apiKey)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify(buildBody(prompt, model, options.image)),
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

        const text =
          payload?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
        return parseJsonLoose(text);
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
