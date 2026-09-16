import { useCallback, useEffect, useState } from 'react';

import * as queries from '../db/queries';
import type { LibraryShelf, SourceWithStats } from '../types';

export function useBookshelf() {
  const [readingNow, setReadingNow] = useState<SourceWithStats[]>([]);
  const [counts, setCounts] = useState<Record<LibraryShelf, number>>({
    library: 0,
    toRead: 0,
    readingNow: 0,
    finished: 0,
    abandoned: 0,
    starred: 0,
  });
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [now, shelfCounts] = await Promise.all([
        queries.listReadingNow(),
        queries.getShelfCounts(),
      ]);
      setReadingNow(now);
      setCounts(shelfCounts);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    readingNow,
    counts,
    loading,
    editing,
    setEditing,
    refresh,
  };
}
