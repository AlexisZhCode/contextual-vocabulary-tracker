export type SourceStatus = 'toRead' | 'readingNow' | 'finished' | 'abandoned';

export type Source = {
  id: string;
  title: string;
  author: string | null;
  isbn: string | null;
  coverUrl: string | null;
  coverFallback: string | null;
  status: SourceStatus;
  starred: number;
  createdAt: string;
  lastCapturedAt: string | null;
};

export type Entry = {
  id: string;
  sourceId: string;
  word: string;
  phonetic: string | null;
  pos: string | null;
  glossZh: string;
  glossEn: string | null;
  audioUrl: string | null;
  sentence: string | null;
  dueAt: string | null;
  reviewedCount: number;
  createdAt: string;
};

export type SourceWithStats = Source & {
  wordCount: number;
  dueCount: number;
  reviewedCount: number;
};

export type LibraryShelf =
  | 'library'
  | 'toRead'
  | 'readingNow'
  | 'finished'
  | 'abandoned'
  | 'starred';

export type DictionaryResult = {
  word: string;
  phonetic: string | null;
  pos: string | null;
  glossZh: string;
  glossEn: string | null;
  audioUrl: string | null;
};
