import cors from 'cors';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { createWorker } from 'tesseract.js';

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
  return word.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function openDb() {
  if (!fs.existsSync(dbPath)) return null;
  return new Database(dbPath, { readonly: true, fileMustExist: true });
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
  res.json({ ok: true, ecdict: Boolean(db), ocr: true });
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
    `vocab api on http://0.0.0.0:${port} (ecdict db: ${db ? 'yes' : 'fallback only'}, ocr: tesseract)`,
  );
});
