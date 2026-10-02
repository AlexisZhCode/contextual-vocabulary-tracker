export type SourceStatus = 'toRead' | 'readingNow' | 'finished' | 'abandoned';

export type ChapterProgressStatus = 'unread' | 'reading' | 'finished';

export type ChapterDifficulty = 'hard' | 'just_right' | 'easy';

export type ChapterSummary = {
  coreTakeaway: string;
  bestPart: string;
  hook: string;
};

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

export type Chapter = {
  id: string;
  sourceId: string;
  position: number;
  title: string;
  aiSummary: ChapterSummary | null;
  status: ChapterProgressStatus;
  difficulty: ChapterDifficulty | null;
  finishedAt: string | null;
};

/** Chapter row with unlock state for the Progress Tree UI. */
export type ChapterTreeItem = Chapter & {
  unlocked: boolean;
  wordCount: number;
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
  chapter: string | null;
  chapterId: string | null;
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
