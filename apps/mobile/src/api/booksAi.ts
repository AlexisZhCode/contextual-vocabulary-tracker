import { resolveApiBase } from './config';
import type { ChapterSummary } from '../types';

export type ResolvedBook = {
  title: string;
  author: string | null;
  isbn: string | null;
  year: number | null;
  summary: string | null;
  coverUrl: string | null;
};

export type ChapterVocabWord = {
  word: string;
  phonetic: string | null;
  pos: string | null;
  definition: string;
  glossEn: string | null;
  context: string | null;
};

export type PreparedChapter = {
  chapter: string;
  summary: ChapterSummary;
  words: ChapterVocabWord[];
};

export type PreparedBookChapters = {
  title: string;
  author: string | null;
  chapters: PreparedChapter[];
};

export type ChapterVocab = {
  title: string;
  author: string | null;
  chapters: Array<{
    chapter: string;
    words: ChapterVocabWord[];
  }>;
};

async function postJson<T>(path: string, body: unknown, timeoutMs = 120000): Promise<T> {
  const base = resolveApiBase();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify(body),
    });
    const payload = (await res.json().catch(() => ({}))) as T & {
      error?: string;
      message?: string;
    };
    if (!res.ok) {
      throw new Error(
        payload.message || payload.error || `Request failed (${res.status})`,
      );
    }
    return payload;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timed out. Is the API running on port 8787?');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** Ask the backend (Gemini + Open Library) to resolve a book title → metadata + cover. */
export async function resolveBook(title: string, author?: string | null): Promise<ResolvedBook> {
  return postJson<ResolvedBook>(
    '/v1/books/resolve',
    { title: title.trim(), author: author?.trim() || undefined },
    60000,
  );
}

/** Batch-generate chapter vocab + summaries for Progress Tree. */
export async function prepareBookChapters(
  title: string,
  author?: string | null,
  options?: { level?: string; maxChapters?: number },
): Promise<PreparedBookChapters> {
  return postJson<PreparedBookChapters>(
    '/v1/books/prepare-chapters',
    {
      title: title.trim(),
      author: author?.trim() || undefined,
      level: options?.level,
      maxChapters: options?.maxChapters ?? 8,
    },
    150000,
  );
}

/** Ask the backend for chapter-grouped vocabulary suggestions. */
export async function fetchChapterVocab(
  title: string,
  author?: string | null,
  options?: { level?: string; maxChapters?: number },
): Promise<ChapterVocab> {
  return postJson<ChapterVocab>(
    '/v1/books/chapter-vocab',
    {
      title: title.trim(),
      author: author?.trim() || undefined,
      level: options?.level,
      maxChapters: options?.maxChapters ?? 10,
    },
    120000,
  );
}
