/**
 * Build a local ECDICT SQLite DB for the API.
 *
 * Usage:
 *   1. Download CSV from https://github.com/skywind3000/ECDICT (ecdict.csv)
 *      or extract stardict from releases (stardict.7z → .csv)
 *   2. Place the CSV at services/api/data/ecdict.csv
 *   3. npm run build:db
 *
 * Without a CSV, writes a small starter DB so /v1/define works offline.
 */
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
const csvPath = path.join(dataDir, 'ecdict.csv');
const outPath = path.join(dataDir, 'ecdict.sqlite');

fs.mkdirSync(dataDir, { recursive: true });
if (fs.existsSync(outPath)) fs.unlinkSync(outPath);

const db = new Database(outPath);
db.exec(`
  CREATE TABLE stardict (
    id INTEGER PRIMARY KEY,
    word TEXT COLLATE NOCASE,
    sw TEXT,
    phonetic TEXT,
    definition TEXT,
    translation TEXT,
    pos TEXT,
    collins INTEGER,
    oxford INTEGER,
    tag TEXT,
    bnc INTEGER,
    frq INTEGER,
    exchange TEXT,
    detail TEXT,
    audio TEXT
  );
  CREATE INDEX idx_word ON stardict(word);
  CREATE INDEX idx_sw ON stardict(sw);
`);

function stripWord(word) {
  return String(word).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseCsvLine(line) {
  const cells = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      cells.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}

const insert = db.prepare(`
  INSERT INTO stardict
    (word, sw, phonetic, definition, translation, pos, collins, oxford, tag, bnc, frq, exchange, detail, audio)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const starter = [
  ['resilient', 'rɪˈzɪliənt', 'able to recover quickly', '有弹性的；能复原的；适应力强的', 'adj'],
  ['wistful', 'ˈwɪstfəl', 'regretful longing', '惆怅的；渴望的', 'adj'],
  ['incandescent', 'ˌɪnkænˈdesənt', 'emitting light when heated', '炽热的；辉耀的', 'adj'],
  ['labyrinth', 'ˈlæbərɪnθ', 'a maze', '迷宫；错综复杂', 'n'],
  ['anthropocene', 'ˈænθrəpəˌsiːn', 'human-influenced geological age', '人类世', 'n'],
  ['orthodoxy', 'ˈɔːθədɒksi', 'authorized doctrine', '正统观念', 'n'],
  ['ephemeral', 'ɪˈfemərəl', 'lasting a very short time', '短暂的；朝生暮死的', 'adj'],
  ['serendipity', 'ˌserənˈdɪpɪti', 'happy accident', '机缘凑巧', 'n'],
  ['melancholy', 'ˈmelənkɒli', 'pensive sadness', '忧郁；愁思', 'n'],
  ['eloquent', 'ˈeləkwənt', 'fluent and persuasive', '雄辩的；有说服力的', 'adj'],
  ['meticulous', 'məˈtɪkjələs', 'very careful and precise', '一丝不苟的', 'adj'],
  ['ubiquitous', 'juːˈbɪkwɪtəs', 'present everywhere', '无处不在的', 'adj'],
  ['ambiguous', 'æmˈbɪɡjuəs', 'open to more than one interpretation', '模棱两可的', 'adj'],
  ['poignant', 'ˈpɔɪnjənt', 'evoking sadness or regret', '深刻的；辛酸的', 'adj'],
  ['luminous', 'ˈluːmɪnəs', 'full of or shedding light', '发光的；明亮的', 'adj'],
];

const tx = db.transaction((rows) => {
  for (const [word, phonetic, definition, translation, pos] of rows) {
    insert.run(
      word,
      stripWord(word),
      phonetic,
      definition,
      translation,
      pos,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    );
  }
});

if (fs.existsSync(csvPath)) {
  console.log(`Importing ${csvPath} …`);
  const text = fs.readFileSync(csvPath, 'utf8');
  const lines = text.split(/\r?\n/);
  const header = parseCsvLine(lines[0] || '');
  const idx = Object.fromEntries(header.map((h, i) => [h.trim(), i]));
  let count = 0;
  const batch = db.transaction((chunk) => {
    for (const cells of chunk) {
      const word = cells[idx.word] || '';
      if (!word) continue;
      insert.run(
        word,
        stripWord(word),
        cells[idx.phonetic] || null,
        cells[idx.definition] || null,
        cells[idx.translation] || null,
        cells[idx.pos] || null,
        cells[idx.collins] || null,
        cells[idx.oxford] || null,
        cells[idx.tag] || null,
        cells[idx.bnc] || null,
        cells[idx.frq] || null,
        cells[idx.exchange] || null,
        cells[idx.detail] || null,
        cells[idx.audio] || null,
      );
      count += 1;
    }
  });

  let chunk = [];
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line) continue;
    chunk.push(parseCsvLine(line));
    if (chunk.length >= 1000) {
      batch(chunk);
      chunk = [];
      if (count % 50000 === 0) console.log(`  … ${count} rows`);
    }
  }
  if (chunk.length) batch(chunk);
  console.log(`Done. Imported ${count} entries → ${outPath}`);
} else {
  tx(starter);
  console.log(`No ecdict.csv found. Wrote starter DB (${starter.length} words) → ${outPath}`);
  console.log('Place full ECDICT CSV at services/api/data/ecdict.csv and re-run npm run build:db');
}

db.close();
