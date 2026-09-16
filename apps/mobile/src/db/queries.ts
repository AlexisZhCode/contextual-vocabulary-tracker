import type { Entry, LibraryShelf, Source, SourceStatus, SourceWithStats } from '../types';
import { getDb } from './client';

type SourceRow = {
  id: string;
  title: string;
  author: string | null;
  isbn: string | null;
  cover_url: string | null;
  cover_fallback: string | null;
  status: SourceStatus;
  starred: number;
  created_at: string;
  last_captured_at: string | null;
  word_count?: number;
  due_count?: number;
  reviewed_count?: number;
};

type EntryRow = {
  id: string;
  source_id: string;
  word: string;
  phonetic: string | null;
  pos: string | null;
  gloss_zh: string;
  gloss_en: string | null;
  audio_url: string | null;
  sentence: string | null;
  due_at: string | null;
  reviewed_count: number;
  created_at: string;
};

function mapSource(row: SourceRow): Source {
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    isbn: row.isbn,
    coverUrl: row.cover_url,
    coverFallback: row.cover_fallback,
    status: row.status,
    starred: row.starred,
    createdAt: row.created_at,
    lastCapturedAt: row.last_captured_at,
  };
}

function mapSourceWithStats(row: SourceRow): SourceWithStats {
  return {
    ...mapSource(row),
    wordCount: row.word_count ?? 0,
    dueCount: row.due_count ?? 0,
    reviewedCount: row.reviewed_count ?? 0,
  };
}

function mapEntry(row: EntryRow): Entry {
  return {
    id: row.id,
    sourceId: row.source_id,
    word: row.word,
    phonetic: row.phonetic,
    pos: row.pos,
    glossZh: row.gloss_zh,
    glossEn: row.gloss_en,
    audioUrl: row.audio_url,
    sentence: row.sentence,
    dueAt: row.due_at,
    reviewedCount: row.reviewed_count,
    createdAt: row.created_at,
  };
}

const STATS_SELECT = `
  SELECT s.*,
    (SELECT COUNT(*) FROM entries e WHERE e.source_id = s.id) AS word_count,
    (SELECT COUNT(*) FROM entries e WHERE e.source_id = s.id AND e.due_at IS NOT NULL AND e.due_at <= datetime('now')) AS due_count,
    (SELECT COALESCE(SUM(e.reviewed_count), 0) FROM entries e WHERE e.source_id = s.id) AS reviewed_count
  FROM sources s
`;

export async function listSourcesWithStats(): Promise<SourceWithStats[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<SourceRow>(
    `${STATS_SELECT} ORDER BY COALESCE(s.last_captured_at, s.created_at) DESC`,
  );
  return rows.map(mapSourceWithStats);
}

export async function listReadingNow(): Promise<SourceWithStats[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<SourceRow>(
    `${STATS_SELECT}
     WHERE s.status = 'readingNow'
     ORDER BY COALESCE(s.last_captured_at, s.created_at) DESC`,
  );
  return rows.map(mapSourceWithStats);
}

export async function getShelfCounts(): Promise<Record<LibraryShelf, number>> {
  const sources = await listSourcesWithStats();
  return {
    library: sources.length,
    toRead: sources.filter((s) => s.status === 'toRead').length,
    readingNow: sources.filter((s) => s.status === 'readingNow').length,
    finished: sources.filter((s) => s.status === 'finished').length,
    abandoned: sources.filter((s) => s.status === 'abandoned').length,
    starred: sources.filter((s) => s.starred === 1).length,
  };
}

export async function listSourcesByShelf(shelf: LibraryShelf): Promise<SourceWithStats[]> {
  const sources = await listSourcesWithStats();
  switch (shelf) {
    case 'library':
      return sources;
    case 'starred':
      return sources.filter((s) => s.starred === 1);
    case 'toRead':
      return sources.filter((s) => s.status === 'toRead');
    case 'readingNow':
      return sources.filter((s) => s.status === 'readingNow');
    case 'finished':
      return sources.filter((s) => s.status === 'finished');
    case 'abandoned':
      return sources.filter((s) => s.status === 'abandoned');
  }
}

export async function getSource(id: string): Promise<SourceWithStats | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<SourceRow>(`${STATS_SELECT} WHERE s.id = ?`, [id]);
  return row ? mapSourceWithStats(row) : null;
}

export async function listEntriesForSource(sourceId: string): Promise<Entry[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<EntryRow>(
    `SELECT * FROM entries WHERE source_id = ? ORDER BY created_at DESC`,
    [sourceId],
  );
  return rows.map(mapEntry);
}

export async function listDueEntries(limit = 50): Promise<(Entry & { sourceTitle: string })[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<EntryRow & { source_title: string }>(
    `SELECT e.*, s.title AS source_title
     FROM entries e
     JOIN sources s ON s.id = e.source_id
     WHERE e.due_at IS NOT NULL AND e.due_at <= datetime('now')
     ORDER BY e.due_at ASC
     LIMIT ?`,
    [limit],
  );
  return rows.map((row) => ({ ...mapEntry(row), sourceTitle: row.source_title }));
}

export async function getStatsSummary() {
  const db = await getDb();
  const words = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM entries');
  const sources = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM sources');
  const due = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM entries WHERE due_at IS NOT NULL AND due_at <= datetime('now')`,
  );
  const reviewed = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(reviewed_count), 0) as total FROM entries`,
  );
  return {
    wordCount: words?.count ?? 0,
    sourceCount: sources?.count ?? 0,
    dueCount: due?.count ?? 0,
    reviewCount: reviewed?.total ?? 0,
  };
}

export async function createSource(input: {
  id: string;
  title: string;
  author?: string | null;
  isbn?: string | null;
  coverUrl?: string | null;
  coverFallback?: string | null;
  status?: SourceStatus;
  starred?: boolean;
}): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO sources
      (id, title, author, isbn, cover_url, cover_fallback, status, starred, created_at, last_captured_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.id,
      input.title.trim(),
      input.author ?? null,
      input.isbn ?? null,
      input.coverUrl ?? null,
      input.coverFallback ?? null,
      input.status ?? 'toRead',
      input.starred ? 1 : 0,
      now,
      null,
    ],
  );
}

export async function updateSourceStatus(id: string, status: SourceStatus): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE sources SET status = ? WHERE id = ?`, [status, id]);
}

export async function toggleSourceStarred(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE sources SET starred = CASE WHEN starred = 1 THEN 0 ELSE 1 END WHERE id = ?`,
    [id],
  );
}

export async function deleteSource(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM sources WHERE id = ?`, [id]);
}

export async function createEntry(input: {
  id: string;
  sourceId: string;
  word: string;
  phonetic?: string | null;
  pos?: string | null;
  glossZh: string;
  glossEn?: string | null;
  audioUrl?: string | null;
  sentence?: string | null;
}): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO entries
      (id, source_id, word, phonetic, pos, gloss_zh, gloss_en, audio_url, sentence, due_at, reviewed_count, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    [
      input.id,
      input.sourceId,
      input.word.trim().toLowerCase(),
      input.phonetic ?? null,
      input.pos ?? null,
      input.glossZh,
      input.glossEn ?? null,
      input.audioUrl ?? null,
      input.sentence ?? null,
      now,
      now,
    ],
  );
  await db.runAsync(
    `UPDATE sources SET last_captured_at = ?, status = CASE WHEN status = 'toRead' THEN 'readingNow' ELSE status END WHERE id = ?`,
    [now, input.sourceId],
  );
}

export async function getEntry(id: string): Promise<Entry | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<EntryRow>(`SELECT * FROM entries WHERE id = ?`, [id]);
  return row ? mapEntry(row) : null;
}

export async function markEntryReviewed(id: string, nextDueAt: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE entries SET reviewed_count = reviewed_count + 1, due_at = ? WHERE id = ?`,
    [nextDueAt, id],
  );
}
