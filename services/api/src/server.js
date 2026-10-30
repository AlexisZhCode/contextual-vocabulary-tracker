import cors from 'cors';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { createWorker } from 'tesseract.js';

import { geminiJson, loadLocalEnv } from './gemini.js';
import { findPenUnderlinedWords } from './penUnderlines.js';

loadLocalEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'data', 'ecdict.sqlite');

const FALLBACK = {
  resilient: {
    word: 'resilient',
    phonetic: 'rɪˈzɪliənt',
    pos: 'adj',
    glossZh: '有弹性的；能复原的；适应力强的',
    glossEn: 'able to recover quickly from difficult conditions',
    audioUrl: null,
  },
  ephemeral: {
    word: 'ephemeral',
    phonetic: 'ɪˈfemərəl',
    pos: 'adj',
    glossZh: '短暂的；朝生暮死的',
    glossEn: 'lasting for a very short time',
    audioUrl: null,
  },
};

function stripWord(word) {
  return word.toLowerCase().replace(/[^a-z0-9']/g, '');
}

/** Candidate dictionary keys: exact, stripped, and simple inflection lemmas. */
function dictionaryKeyVariants(word) {
  const cleaned = String(word || '')
    .trim()
    .toLowerCase()
    .match(/[a-z][a-z'-]*/)?.[0];
  if (!cleaned) return [];

  const variants = new Set([cleaned, stripWord(cleaned)]);
  const add = (value) => {
    if (value && value.length >= 3) variants.add(value);
  };

  if (cleaned.endsWith('ies') && cleaned.length > 4) add(`${cleaned.slice(0, -3)}y`);
  if (cleaned.endsWith('ves') && cleaned.length > 4) add(`${cleaned.slice(0, -3)}f`);
  if (cleaned.endsWith('ing') && cleaned.length > 5) {
    add(cleaned.slice(0, -3));
    add(`${cleaned.slice(0, -3)}e`);
  }
  if (cleaned.endsWith('ied') && cleaned.length > 4) add(`${cleaned.slice(0, -3)}y`);
  if (cleaned.endsWith('ed') && cleaned.length > 4) {
    add(cleaned.slice(0, -2));
    add(cleaned.slice(0, -1));
  }
  // abortionists → abortionist; eulogists → eulogist (keep agent noun, don't map to eulogy)
  if (cleaned.endsWith('ists') && cleaned.length > 5) add(cleaned.slice(0, -1));
  if (cleaned.endsWith('es') && cleaned.length > 4) add(cleaned.slice(0, -2));
  if (cleaned.endsWith('s') && !cleaned.endsWith('ss') && cleaned.length > 3) {
    add(cleaned.slice(0, -1));
  }

  return [...variants];
}

function openDb() {
  if (!fs.existsSync(dbPath)) return null;
  return new Database(dbPath, { readonly: true, fileMustExist: true });
}

function lookupEcdict(word) {
  if (!db || !word) return null;
  for (const key of dictionaryKeyVariants(word)) {
    const hit =
      db.prepare('SELECT * FROM stardict WHERE word = ? COLLATE NOCASE LIMIT 1').get(key) ||
      db.prepare('SELECT * FROM stardict WHERE sw = ? LIMIT 1').get(stripWord(key));
    if (hit) return hit;
  }
  return null;
}

async function searchOpenLibraryCover(title, author) {
  async function query(t, a) {
    const url = new URL('https://openlibrary.org/search.json');
    url.searchParams.set('title', t);
    url.searchParams.set('limit', '3');
    if (a) url.searchParams.set('author', a);
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data?.docs) ? data.docs : [];
  }

  function pickCover(docs) {
    for (const doc of docs) {
      const isbn = Array.isArray(doc.isbn) ? doc.isbn[0] : null;
      if (doc.cover_i) {
        return {
          coverUrl: `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`,
          isbn,
        };
      }
      if (isbn) {
        return {
          coverUrl: `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`,
          isbn,
        };
      }
    }
    return { coverUrl: null, isbn: null };
  }

  try {
    let docs = await query(title, author);
    let picked = pickCover(docs || []);
    if (!picked.coverUrl && author) {
      docs = await query(title, null);
      picked = pickCover(docs || []);
    }
    if (!picked.coverUrl) {
      // Broad search as last resort
      const url = new URL('https://openlibrary.org/search.json');
      url.searchParams.set('q', title);
      url.searchParams.set('limit', '5');
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        picked = pickCover(Array.isArray(data?.docs) ? data.docs : []);
      }
    }
    return picked;
  } catch {
    return { coverUrl: null, isbn: null };
  }
}

const db = openDb();
const app = express();
app.use(cors());
app.use(express.json({ limit: '12mb' }));

let ocrWorkerPromise = null;

async function getOcrWorker() {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = (async () => {
      const worker = await createWorker('eng');
      return worker;
    })();
  }
  return ocrWorkerPromise;
}

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    ecdict: Boolean(db),
    ocr: true,
    gemini: Boolean(process.env.GEMINI_API_KEY),
  });
});

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

function stripImageBase64(value) {
  return String(value || '')
    .replace(/^data:[^;]+;base64,/, '')
    .replace(/\s/g, '');
}

function collectExtractImages(body) {
  const fromArray = Array.isArray(body?.images) ? body.images : [];
  const images = fromArray
    .map((item) => stripImageBase64(item))
    .filter(Boolean)
    .slice(0, 8);
  if (images.length) return images;
  const single = stripImageBase64(body?.imageBase64);
  return single ? [single] : [];
}

function firstEnglishToken(value) {
  return (
    String(value || '')
      .trim()
      .toLowerCase()
      .match(/[a-z][a-z'-]*/)?.[0] || ''
  );
}

function enrichMarkedItem(item) {
  const original = String(item?.marked_text || item?.markedText || '').trim();
  const context = String(item?.context || '').trim();
  if (!original) return null;

  // Prefer model lemma (singular noun / base verb); fall back to first token.
  const lemma =
    firstEnglishToken(item?.lemma) ||
    firstEnglishToken(original) ||
    original.toLowerCase();

  // Look up the lemma in ECDICT (with light inflection variants only).
  // Do not replace the listed lemma with a different related headword.
  const local = defineFromLocal(lemma) || defineFromLocal(original);

  return {
    // Client lists/saves marked_text — always the lemma form.
    marked_text: lemma,
    context,
    definition: local?.glossZh || '',
    phonetic: local?.phonetic || '',
    glossEn: local?.glossEn || null,
    pos: local?.pos || null,
    lookupKey: lemma.toLowerCase(),
  };
}

app.post('/v1/gemini/extract-marked', async (req, res) => {
  try {
    const images = collectExtractImages(req.body);
    if (!images.length) {
      res.status(400).json({ error: 'imageBase64_or_images_required' });
      return;
    }

    const regionMode = Boolean(req.body?.regionMode) || images.length > 1;
    const prompt =
      images.length > 1
        ? MULTI_REGION_PROMPT
        : regionMode
          ? REGION_TEXT_PROMPT
          : MARKED_TEXT_PROMPT;

    const raw = await geminiJson(prompt, {
      timeoutMs: 60000,
      liteOnly: true,
      // Dense pages can have 10–20 marks; 1024 truncated mid-JSON and looked like "no words".
      maxOutputTokens: 4096,
      temperature: 0.1,
      images: images.map((data) => ({ data, mimeType: 'image/jpeg' })),
    });
    const rows = Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : [];
    const items = [];
    const seen = new Set();
    for (const row of rows) {
      const item = enrichMarkedItem(row);
      if (!item) continue;
      const key = item.lookupKey || item.marked_text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(item);
    }

    // Only words missing from ECDICT get an AI dictionary lookup.
    const needGloss = items.filter((item) => !item.definition);
    if (needGloss.length) {
      const geminiHits = await defineMissingWithGemini(
        needGloss.map((item) => item.lookupKey || item.marked_text),
      );
      for (const item of needGloss) {
        const key = String(item.lookupKey || item.marked_text)
          .trim()
          .toLowerCase();
        const hit = geminiHits[key];
        if (!hit) continue;
        item.definition = hit.glossZh || item.definition;
        item.glossEn = item.glossEn || hit.glossEn;
        item.phonetic = item.phonetic || hit.phonetic || '';
      }
    }

    for (const item of items) {
      delete item.lookupKey;
    }

    res.json({ items });
  } catch (err) {
    console.error('Gemini marked-text extraction failed', err);
    res.status(502).json({
      error: 'gemini_extract_failed',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * Resolve a book by title using Gemini + Open Library cover lookup.
 * Body: { title: string, author?: string }
 */
app.post('/v1/books/resolve', async (req, res) => {
  try {
    const title = String(req.body?.title || '').trim();
    const authorHint = String(req.body?.author || '').trim();
    if (!title) {
      res.status(400).json({ error: 'title_required' });
      return;
    }

    const prompt = `You are a book librarian. Identify the best-matching published book for this query.

Query title: ${JSON.stringify(title)}
${authorHint ? `Author hint: ${JSON.stringify(authorHint)}` : ''}

Return STRICT JSON object with keys:
- "title": canonical book title (string)
- "author": primary author name (string or null)
- "isbn": ISBN-13 if reasonably known, else null
- "year": publication year number or null
- "summary": one short English sentence about the book

If the query is ambiguous, pick the most well-known English edition.
If nothing matches, still return your best guess with title filled.`;

    const meta = await geminiJson(prompt, { timeoutMs: 45000 });
    const resolvedTitle = String(meta?.title || title).trim() || title;
    const resolvedAuthor = meta?.author ? String(meta.author).trim() : authorHint || null;
    const resolvedIsbn = meta?.isbn ? String(meta.isbn).trim() : null;
    const summary = meta?.summary ? String(meta.summary).trim() : null;
    const year = typeof meta?.year === 'number' ? meta.year : null;

    const cover = await searchOpenLibraryCover(resolvedTitle, resolvedAuthor);
    const isbn = resolvedIsbn || cover.isbn || null;

    res.json({
      title: resolvedTitle,
      author: resolvedAuthor,
      isbn,
      year,
      summary,
      coverUrl: cover.coverUrl,
    });
  } catch (err) {
    console.error('books/resolve failed', err);
    res.status(502).json({
      error: 'book_resolve_failed',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * Suggest likely new vocabulary for a reader, grouped by chapter.
 * Body: { title: string, author?: string, level?: string, maxChapters?: number }
 */
app.post('/v1/books/chapter-vocab', async (req, res) => {
  try {
    const title = String(req.body?.title || '').trim();
    const author = String(req.body?.author || '').trim();
    const level = String(req.body?.level || 'intermediate ESL').trim();
    const maxChapters = Math.min(20, Math.max(3, Number(req.body?.maxChapters) || 10));

    if (!title) {
      res.status(400).json({ error: 'title_required' });
      return;
    }

    const prompt = `You help English learners prepare vocabulary before reading a book.

Book: ${JSON.stringify(title)}
${author ? `Author: ${JSON.stringify(author)}` : ''}
Learner level: ${JSON.stringify(level)}

Produce a chapter-by-chapter vocabulary preview for this book.
Use real chapter titles/numbers when the book is well-known; otherwise use plausible chapter labels (e.g. "Chapter 1", "Chapter 2").
Include about ${maxChapters} chapters (not more).
For each chapter, list 8–12 words that an ${level} reader might find new or useful while reading that chapter.
Prefer content words (verbs, nouns, adjectives, idioms). Avoid ultra-basic words (the, and, go, happy).

Return STRICT JSON:
{
  "chapters": [
    {
      "chapter": "Chapter 1 — Title",
      "words": [
        {
          "word": "string",
          "phonetic": "IPA or empty string",
          "definition": "brief Chinese definition",
          "context": "short example sentence from / typical of that chapter"
        }
      ]
    }
  ]
}`;

    const raw = await geminiJson(prompt, { timeoutMs: 120000 });
    const chaptersIn = Array.isArray(raw?.chapters) ? raw.chapters : [];
    const chapters = [];

    for (const ch of chaptersIn.slice(0, maxChapters)) {
      const chapterLabel = String(ch?.chapter || ch?.title || '').trim();
      if (!chapterLabel) continue;
      const wordsIn = Array.isArray(ch?.words) ? ch.words : [];
      const words = [];
      const seen = new Set();

      for (const item of wordsIn) {
        const word = String(item?.word || '')
          .trim()
          .toLowerCase();
        if (!word || seen.has(word)) continue;
        seen.add(word);

        const ec = lookupEcdict(word);
        words.push({
          word: ec?.word || word,
          phonetic: String(item?.phonetic || ec?.phonetic || '').trim() || null,
          pos: ec?.pos || null,
          definition:
            String(item?.definition || '').trim() ||
            ec?.translation ||
            ec?.definition ||
            '',
          glossEn: ec?.definition || null,
          context: String(item?.context || '').trim() || null,
        });
      }

      if (words.length) {
        chapters.push({ chapter: chapterLabel, words });
      }
    }

    res.json({ title, author: author || null, chapters });
  } catch (err) {
    console.error('books/chapter-vocab failed', err);
    res.status(502).json({
      error: 'chapter_vocab_failed',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * Pre-generate chapter vocab + short AI summaries for Progress Tree (batch, for instant unlock later).
 * Body: { title, author?, level?, maxChapters? }
 */
app.post('/v1/books/prepare-chapters', async (req, res) => {
  try {
    const title = String(req.body?.title || '').trim();
    const author = String(req.body?.author || '').trim();
    const level = String(req.body?.level || 'intermediate ESL').trim();
    const maxChapters = Math.min(12, Math.max(4, Number(req.body?.maxChapters) || 8));

    if (!title) {
      res.status(400).json({ error: 'title_required' });
      return;
    }

    const prompt = `You help English learners prepare a chapter reading plan for a book.

Book: ${JSON.stringify(title)}
${author ? `Author: ${JSON.stringify(author)}` : ''}
Learner level: ${JSON.stringify(level)}

Create exactly ${maxChapters} chapters (or fewer if the book is shorter).
Use real chapter titles when known; otherwise "Chapter N — short label".

For EACH chapter return:
1) 8–10 useful vocabulary words for an ${level} reader (no ultra-basic words)
2) A spoiler-light summary in THREE short modules (English, concise):
   - coreTakeaway: 1–2 sentences on what the chapter is about (no major plot spoilers beyond that chapter)
   - bestPart: one vivid / funny / striking detail from the chapter
   - hook: half a sentence teasing the next chapter (empty string for the last chapter)

Return STRICT JSON only:
{
  "chapters": [
    {
      "chapter": "Chapter 1 — Title",
      "summary": {
        "coreTakeaway": "...",
        "bestPart": "...",
        "hook": "..."
      },
      "words": [
        {
          "word": "string",
          "phonetic": "IPA or empty string",
          "definition": "brief Chinese definition",
          "context": "short example sentence"
        }
      ]
    }
  ]
}`;

    const raw = await geminiJson(prompt, { timeoutMs: 150000 });
    const chaptersIn = Array.isArray(raw?.chapters) ? raw.chapters : [];
    const chapters = [];

    for (const ch of chaptersIn.slice(0, maxChapters)) {
      const chapterLabel = String(ch?.chapter || ch?.title || '').trim();
      if (!chapterLabel) continue;

      const summaryRaw = ch?.summary && typeof ch.summary === 'object' ? ch.summary : {};
      const summary = {
        coreTakeaway: String(summaryRaw.coreTakeaway || '').trim(),
        bestPart: String(summaryRaw.bestPart || '').trim(),
        hook: String(summaryRaw.hook || '').trim(),
      };

      const wordsIn = Array.isArray(ch?.words) ? ch.words : [];
      const words = [];
      const seen = new Set();
      for (const item of wordsIn) {
        const word = String(item?.word || '')
          .trim()
          .toLowerCase();
        if (!word || seen.has(word)) continue;
        seen.add(word);
        const ec = lookupEcdict(word);
        words.push({
          word: ec?.word || word,
          phonetic: String(item?.phonetic || ec?.phonetic || '').trim() || null,
          pos: ec?.pos || null,
          definition:
            String(item?.definition || '').trim() ||
            ec?.translation ||
            ec?.definition ||
            '',
          glossEn: ec?.definition || null,
          context: String(item?.context || '').trim() || null,
        });
      }

      chapters.push({
        chapter: chapterLabel,
        summary,
        words,
      });
    }

    res.json({ title, author: author || null, chapters });
  } catch (err) {
    console.error('books/prepare-chapters failed', err);
    res.status(502).json({
      error: 'prepare_chapters_failed',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

app.post('/v1/ocr', async (req, res) => {
  try {
    const imageBase64 = String(req.body?.imageBase64 || '').trim();
    if (!imageBase64) {
      res.status(400).json({ error: 'imageBase64 required' });
      return;
    }
    const payload = imageBase64.includes('base64,')
      ? imageBase64
      : `data:image/jpeg;base64,${imageBase64}`;

    const worker = await getOcrWorker();
    const result = await worker.recognize(payload);
    const text = (result?.data?.text || '').trim();
    res.json({ text });
  } catch (err) {
    console.error('OCR failed', err);
    res.status(500).json({
      error: 'ocr_failed',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

app.post('/v1/ocr/pen-underlines', async (req, res) => {
  try {
    const imageBase64 = String(req.body?.imageBase64 || '').trim();
    if (!imageBase64) {
      res.status(400).json({ error: 'imageBase64 required' });
      return;
    }
    const raw = imageBase64.includes('base64,')
      ? imageBase64.slice(imageBase64.indexOf('base64,') + 7)
      : imageBase64;
    const buffer = Buffer.from(raw, 'base64');
    if (buffer.length < 32) {
      res.status(400).json({ error: 'invalid_image' });
      return;
    }

    const worker = await getOcrWorker();
    const detected = await findPenUnderlinedWords(buffer, worker);
    if (db && Array.isArray(detected.words) && detected.words.length > 0) {
      const lookup = db.prepare(
        'SELECT word FROM stardict WHERE word = ? COLLATE NOCASE LIMIT 1',
      );
      const swLookup = db.prepare(
        'SELECT word FROM stardict WHERE sw = ? LIMIT 1',
      );
      detected.words = detected.words
        .map((w) => {
          const row =
            lookup.get(w) ||
            swLookup.get(String(w).toLowerCase().replace(/[^a-z0-9']/g, ''));
          return row?.word || null;
        })
        .filter(Boolean);
      detected.words = [...new Set(detected.words.map((w) => w.toLowerCase()))];
      detected.rawText = detected.words.join(' ');
    }
    res.json(detected);
  } catch (err) {
    console.error('Pen underline OCR failed', err);
    res.status(500).json({
      error: 'pen_underline_ocr_failed',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

function defineFromLocal(word) {
  const cleaned =
    String(word || '')
      .trim()
      .toLowerCase()
      .match(/[a-z][a-z'-]*/)?.[0] || String(word || '').trim().toLowerCase();
  if (!cleaned) return null;

  const ec = lookupEcdict(cleaned);
  if (ec) {
    return {
      word: ec.word || cleaned,
      phonetic: ec.phonetic || null,
      pos: ec.pos || null,
      glossZh: ec.translation || '',
      glossEn: ec.definition || null,
      audioUrl: null,
    };
  }

  const fallback = FALLBACK[cleaned];
  if (fallback) {
    return { ...fallback };
  }
  return null;
}

async function defineMissingWithGemini(words) {
  const missing = words.filter(Boolean).slice(0, 40);
  if (!missing.length || !process.env.GEMINI_API_KEY) return {};

  const prompt = `You are an English→Chinese learner dictionary.
These words were not found in the local dictionary. They are already lemma forms
(singular nouns / base present-tense verbs) — define them as given.

Words: ${JSON.stringify(missing)}

Return ONLY a JSON array of objects:
[
  {
    "word": "exact input lemma",
    "phonetic": "IPA or empty string",
    "glossZh": "brief Chinese definition",
    "glossEn": "brief English definition"
  }
]`;

  try {
    const raw = await geminiJson(prompt, {
      timeoutMs: 45000,
      liteOnly: true,
      maxOutputTokens: 4096,
      temperature: 0.1,
    });
    const rows = Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : [];
    const results = {};
    for (const row of rows) {
      const word = String(row?.word || '')
        .trim()
        .toLowerCase();
      if (!word) continue;
      const glossZh = String(row?.glossZh || row?.definition || '').trim();
      const glossEn = String(row?.glossEn || '').trim() || null;
      if (!glossZh && !glossEn) continue;
      results[word] = {
        word,
        phonetic: String(row?.phonetic || '').trim() || null,
        pos: null,
        glossZh: glossZh || '（暂无中文释义）',
        glossEn,
        audioUrl: null,
      };
    }
    return results;
  } catch (err) {
    console.error('Gemini define-batch fallback failed', err);
    return {};
  }
}

app.get('/v1/define/:word', async (req, res) => {
  const raw = String(req.params.word || '');
  const word = raw.trim().toLowerCase();
  if (!word) {
    res.status(400).json({ error: 'word required' });
    return;
  }

  let local = defineFromLocal(word);
  if (!local) {
    const geminiHits = await defineMissingWithGemini([word]);
    local = geminiHits[word] || geminiHits[dictionaryKeyVariants(word)[0]] || null;
  }

  let audioUrl = null;
  try {
    const audioRes = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
    );
    if (audioRes.ok) {
      const data = await audioRes.json();
      audioUrl = data?.[0]?.phonetics?.find((p) => p.audio)?.audio ?? null;
    }
  } catch {
    // optional
  }

  if (local) {
    res.json({ ...local, audioUrl: audioUrl ?? local.audioUrl ?? null });
    return;
  }

  res.status(404).json({ error: 'not_found', word });
});

/**
 * Batch dictionary lookup: ECDICT first, then one Gemini call for misses.
 * Body: { words: string[] }
 */
app.post('/v1/define-batch', async (req, res) => {
  try {
    const input = Array.isArray(req.body?.words) ? req.body.words : [];
    const words = [];
    const seen = new Set();
    for (const raw of input.slice(0, 100)) {
      const word =
        String(raw || '')
          .trim()
          .toLowerCase()
          .match(/[a-z][a-z'-]*/)?.[0] || String(raw || '').trim().toLowerCase();
      if (!word || seen.has(word)) continue;
      seen.add(word);
      words.push(word);
    }

    const results = {};
    const missing = [];
    for (const word of words) {
      const hit = defineFromLocal(word);
      if (hit) results[word] = hit;
      else missing.push(word);
    }

    if (missing.length) {
      const geminiHits = await defineMissingWithGemini(missing);
      for (const word of missing) {
        if (geminiHits[word]) results[word] = geminiHits[word];
      }
    }

    res.json({ results, ecdict: Boolean(db), geminiFallback: missing.length > 0 });
  } catch (err) {
    console.error('define-batch failed', err);
    res.status(502).json({
      error: 'define_batch_failed',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

app.get('/v1/audio/:word', async (req, res) => {
  const word = String(req.params.word || '').trim().toLowerCase();
  try {
    const audioRes = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
    );
    if (!audioRes.ok) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    const data = await audioRes.json();
    const audioUrl = data?.[0]?.phonetics?.find((p) => p.audio)?.audio ?? null;
    if (!audioUrl) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json({ word, audioUrl });
  } catch (err) {
    res.status(502).json({ error: 'upstream_failed', message: String(err) });
  }
});

const port = Number(process.env.PORT || 8787);
app.listen(port, '0.0.0.0', () => {
  console.log(
    `vocab api on http://0.0.0.0:${port} (ecdict db: ${db ? 'yes' : 'fallback only'}, ocr: tesseract, gemini: ${
      process.env.GEMINI_API_KEY ? 'yes' : 'no'
    })`,
  );
});
