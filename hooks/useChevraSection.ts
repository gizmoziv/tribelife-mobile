// Phase 18: per-section paging state for one Chevra discovery carousel.
//
// Each carousel (regions / chavurot / timezones) owns one instance of this hook.
// It fetches page 0 on mount and whenever the search query changes, appends on
// loadMore(), and exposes reset() for focus refresh / membership-change refetch.
//
// Stale-response safety: every reset bumps `reqIdRef`; in-flight responses whose
// id no longer matches are discarded so a slow page-0 from an old query can't
// clobber a newer one. `busyRef` prevents overlapping fetches (rapid
// onEndReached) and is only cleared by the request that currently owns it.
import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';
import { globeApi } from '@/services/api';
import type { ChevraRow, ChevraSection } from '@/types';

const PAGE_SIZE = 12;

export interface ChevraSectionState {
  rows: ChevraRow[];
  hasMore: boolean;
  isLoading: boolean; // first page (cold-start) loading
  isLoadingMore: boolean; // a subsequent page is loading
  error: boolean;
  loadMore: () => void;
  reset: () => void;
  setRows: React.Dispatch<React.SetStateAction<ChevraRow[]>>;
}

export function useChevraSection(section: ChevraSection, q: string): ChevraSectionState {
  const [rows, setRows] = useState<ChevraRow[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState(false);

  const offsetRef = useRef(0);
  const busyRef = useRef(false);
  const reqIdRef = useRef(0);

  const fetchPage = useCallback(
    async (offset: number, requestId: number) => {
      if (busyRef.current) return;
      busyRef.current = true;
      if (offset === 0) setIsLoading(true);
      else setIsLoadingMore(true);
      try {
        const res = await globeApi.section({ section, q, offset, limit: PAGE_SIZE });
        if (requestId !== reqIdRef.current) return; // superseded by a newer reset
        setRows((prev) => (offset === 0 ? res.rows : [...prev, ...res.rows]));
        offsetRef.current = offset + res.rows.length;
        setHasMore(res.hasMore);
        setError(false);
      } catch {
        if (requestId === reqIdRef.current) setError(true);
      } finally {
        if (requestId === reqIdRef.current) {
          setIsLoading(false);
          setIsLoadingMore(false);
          busyRef.current = false;
        }
      }
    },
    [section, q],
  );

  // Mount + query-change: discard any in-flight page, reset paging, fetch page 0.
  useEffect(() => {
    reqIdRef.current += 1;
    const reqId = reqIdRef.current;
    offsetRef.current = 0;
    busyRef.current = false;
    setRows([]);
    setHasMore(true);
    setError(false);
    fetchPage(0, reqId);
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (busyRef.current || !hasMore) return;
    fetchPage(offsetRef.current, reqIdRef.current);
  }, [fetchPage, hasMore]);

  const reset = useCallback(() => {
    reqIdRef.current += 1;
    const reqId = reqIdRef.current;
    offsetRef.current = 0;
    busyRef.current = false;
    fetchPage(0, reqId);
  }, [fetchPage]);

  return { rows, hasMore, isLoading, isLoadingMore, error, loadMore, reset, setRows };
}
