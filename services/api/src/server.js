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

function openDb() {
  if (!fs.existsSync(dbPath)) return null;
  return new Database(dbPath, { readonly: true, fileMustExist: true });
}

function lookupEcdict(word) {
  if (!db || !word) return null;
  const cleaned = String(word).trim().toLowerCase();
  return (
    db.prepare('SELECT * FROM stardict WHERE word = ? COLLATE NOCASE LIMIT 1').get(cleaned) ||
    db.prepare('SELECT * FROM stardict WHERE sw = ? LIMIT 1').get(stripWord(cleaned)) ||
    null
  );
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

app.post('/v1/gemini/extract-marked', async (req, res) => {
  try {
    const imageBase64 = String(req.body?.imageBase64 || '')
      .replace(/^data:[^;]+;base64,/, '')
      .replace(/\s/g, '');
    if (!imageBase64) {
      res.status(400).json({ error: 'imageBase64_required' });
      return;
    }

    const prompt = req.body?.regionMode ? REGION_TEXT_PROMPT : MARKED_TEXT_PROMPT;
    const raw = await geminiJson(prompt, {
      timeoutMs: 90000,
      image: { data: imageBase64, mimeType: 'image/jpeg' },
    });
    const rows = Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : [];
    const items = rows
      .map((item) => ({
        marked_text: String(item?.marked_text || item?.markedText || '').trim(),
        context: String(item?.context || '').trim(),
        definition: String(item?.definition || '').trim(),
        phonetic: String(item?.phonetic || '').trim(),
      }))
      .filter((item) => item.marked_text);
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

app.get('/v1/define/:word', async (req, res) => {
  const raw = String(req.params.word || '');
  const word = raw.trim().toLowerCase();
  if (!word) {
    res.status(400).json({ error: 'word required' });
    return;
  }

  let row = null;
  if (db) {
    row =
      db.prepare('SELECT * FROM stardict WHERE word = ? COLLATE NOCASE LIMIT 1').get(word) ||
      db.prepare('SELECT * FROM stardict WHERE sw = ? LIMIT 1').get(stripWord(word));
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

  if (row) {
    res.json({
      word: row.word,
      phonetic: row.phonetic || null,
      pos: row.pos || null,
      glossZh: row.translation || '',
      glossEn: row.definition || null,
      audioUrl,
    });
    return;
  }

  const fallback = FALLBACK[word];
  if (fallback) {
    res.json({ ...fallback, audioUrl: audioUrl ?? fallback.audioUrl });
    return;
  }

  res.status(404).json({ error: 'not_found', word });
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
