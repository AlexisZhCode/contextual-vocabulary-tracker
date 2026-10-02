import * as SQLite from 'expo-sqlite';

import { SEED_ENTRIES, SEED_SOURCES } from '../data/seed';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function ensureColumn(
  db: SQLite.SQLiteDatabase,
  table: string,
  column: string,
  typeSql: string,
) {
  try {
    await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${typeSql}`);
  } catch {
    // already exists
  }
}

export async function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('vocab.db');
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS sources (
          id TEXT PRIMARY KEY NOT NULL,
          title TEXT NOT NULL,
          author TEXT,
          isbn TEXT,
          cover_url TEXT,
          cover_fallback TEXT,
          status TEXT NOT NULL,
          starred INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          last_captured_at TEXT
        );

        CREATE TABLE IF NOT EXISTS chapters (
          id TEXT PRIMARY KEY NOT NULL,
          source_id TEXT NOT NULL,
          position INTEGER NOT NULL,
          title TEXT NOT NULL,
          ai_summary TEXT,
          FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS chapter_progress (
          chapter_id TEXT PRIMARY KEY NOT NULL,
          status TEXT NOT NULL DEFAULT 'unread',
          difficulty TEXT,
          finished_at TEXT,
          FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS entries (
          id TEXT PRIMARY KEY NOT NULL,
          source_id TEXT NOT NULL,
          word TEXT NOT NULL,
          phonetic TEXT,
          pos TEXT,
          gloss_zh TEXT NOT NULL,
          gloss_en TEXT,
          audio_url TEXT,
          sentence TEXT,
          chapter TEXT,
          chapter_id TEXT,
          due_at TEXT,
          reviewed_count INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_entries_source ON entries(source_id);
        CREATE INDEX IF NOT EXISTS idx_entries_due ON entries(due_at);
        CREATE INDEX IF NOT EXISTS idx_chapters_source ON chapters(source_id);
      `);

      await ensureColumn(db, 'entries', 'chapter', 'TEXT');
      await ensureColumn(db, 'entries', 'chapter_id', 'TEXT');

      const row = await db.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) as count FROM sources',
      );
      if (!row || row.count === 0) {
        for (const source of SEED_SOURCES) {
          await db.runAsync(
            `INSERT INTO sources
              (id, title, author, isbn, cover_url, cover_fallback, status, starred, created_at, last_captured_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              source.id,
              source.title,
              source.author,
              source.isbn,
              source.coverUrl,
              source.coverFallback,
              source.status,
              source.starred,
              source.createdAt,
              source.lastCapturedAt,
            ],
          );
        }
        for (const entry of SEED_ENTRIES) {
          await db.runAsync(
            `INSERT INTO entries
              (id, source_id, word, phonetic, pos, gloss_zh, gloss_en, audio_url, sentence, chapter, chapter_id, due_at, reviewed_count, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              entry.id,
              entry.sourceId,
              entry.word,
              entry.phonetic,
              entry.pos,
              entry.glossZh,
              entry.glossEn,
              entry.audioUrl,
              entry.sentence,
              entry.chapter ?? null,
              entry.chapterId ?? null,
              entry.dueAt,
              entry.reviewedCount,
              entry.createdAt,
            ],
          );
        }
      }

      return db;
    })();
  }
  return dbPromise;
}
