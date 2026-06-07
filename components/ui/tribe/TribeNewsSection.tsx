// Phase 18-04: Tribe Hub — horizontal infinite news carousel.
//
// Replaces the 18-01 skeleton. Owns all cursor-pagination state for the news feed:
//   - Initial load on mount: newsApi.feed() → first page (~10 articles)
//   - Right-edge scroll: onEndReached → newsApi.feed(cursor) → append next page
//   - Repeats until hasMore === false (footer spinner stops; no further fetch)
//   - No "See all" / vertical full-feed affordance (TRIBE-04)
//
// Nested-scroll note: this horizontal FlatList lives inside TribeHubScreen's
// vertical ScrollView — no same-axis VirtualizedList nesting warning.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  type ListRenderItem,
} from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { newsApi } from '@/services/api';
import { NewsCard, NEWS_CARD_WIDTH } from '@/components/ui/news/NewsCard';
import { COLORS, FONTS, SPACING } from '@/constants';
import type { NewsArticle } from '@/types';

// ── Constants ────────────────────────────────────────────────────────────────

const CARD_GAP = 12;
// Card height is variable (image + text body), so we fix a comfortable
// skeleton height for the loading-initial placeholder.
const CARD_SKELETON_HEIGHT = 220;

// ── Sub-components ────────────────────────────────────────────────────────────

function Separator() {
  return <View style={{ width: CARD_GAP }} />;
}

// ── Props ────────────────────────────────────────────────────────────────────

interface TribeNewsSectionProps {
  /** Called when the section has loaded new articles (e.g. parent wants to dismiss banner). */
  onRefreshed?: () => void;
  /**
   * Called once on mount to hand the parent a stable refresh() function.
   * Parent stores it in a ref and calls it when the "new articles" banner is tapped.
   */
  onSetRefresh?: (refresh: () => Promise<void>) => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export function TribeNewsSection({ onRefreshed, onSetRefresh }: TribeNewsSectionProps) {
  const { colors } = useTheme();

  // ── Pagination state ──────────────────────────────────────────────────────
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Guard against concurrent fetches in the rare case React fires two effects
  const fetchingRef = useRef(false);

  // ── Fetch logic ────────────────────────────────────────────────────────────

  const load = useCallback(
    async (mode: 'initial' | 'more') => {
      if (fetchingRef.current) return;
      fetchingRef.current = true;

      if (mode === 'initial') {
        setLoadingInitial(true);
      } else {
        setLoadingMore(true);
      }

      try {
        const before = mode === 'more' ? (cursor ?? undefined) : undefined;
        const res = await newsApi.feed(before);
        if (mode === 'initial') {
          setArticles(res.articles);
        } else {
          setArticles(prev => [...prev, ...res.articles]);
        }
        setCursor(res.nextCursor);
        setHasMore(res.hasMore);
        onRefreshed?.();
      } catch {
        // Non-critical: leave existing articles; do not crash the screen
      } finally {
        fetchingRef.current = false;
        if (mode === 'initial') setLoadingInitial(false);
        else setLoadingMore(false);
      }
    },
    // cursor intentionally omitted — load('more') captures the current cursor
    // via the argument derived at call-site, not via closure capture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cursor, onRefreshed],
  );

  // Initial load on mount
  useEffect(() => {
    load('initial');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Expose refresh for parent banner ──────────────────────────────────────

  // TribeHubScreen calls refresh() when the user taps the "new articles" banner.
  // We reset pagination state and re-fetch from the top.
  const refresh = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setLoadingInitial(true);
    setCursor(null);
    setHasMore(true);
    try {
      const res = await newsApi.feed();
      setArticles(res.articles);
      setCursor(res.nextCursor);
      setHasMore(res.hasMore);
      onRefreshed?.();
    } catch {
      // silent
    } finally {
      fetchingRef.current = false;
      setLoadingInitial(false);
    }
  }, [onRefreshed]);

  // Register the refresh function with the parent once (on mount).
  // onSetRefresh is stable from the parent (inline arrow stored in ref) so
  // this effect correctly fires exactly once.
  useEffect(() => {
    onSetRefresh?.(refresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── onEndReached ──────────────────────────────────────────────────────────

  // T-18-04-02: gated by all three conditions — cannot double-fire or loop at end.
  const handleEndReached = useCallback(() => {
    if (loadingMore || !hasMore || !cursor) return;
    load('more');
  }, [loadingMore, hasMore, cursor, load]);

  // ── Render helpers ────────────────────────────────────────────────────────

  const renderItem = useCallback<ListRenderItem<NewsArticle>>(
    ({ item }) => <NewsCard article={item} />,
    [],
  );

  const keyExtractor = useCallback((item: NewsArticle) => String(item.id), []);

  const getItemLayout = useCallback(
    (_data: ArrayLike<NewsArticle> | null | undefined, index: number) => ({
      length: NEWS_CARD_WIDTH + CARD_GAP,
      offset: (NEWS_CARD_WIDTH + CARD_GAP) * index,
      index,
    }),
    [],
  );

  const ListFooter = loadingMore ? (
    <View style={styles.footer}>
      <ActivityIndicator color={COLORS.primary} />
    </View>
  ) : null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={styles.section}>
      <Text style={[styles.title, { color: colors.text }]}>News</Text>

      {loadingInitial ? (
        // Loading-initial state: simple spinner at card height
        <View style={[styles.loadingRow, { height: CARD_SKELETON_HEIGHT }]}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : articles.length === 0 ? (
        // Empty state (loaded, no articles yet)
        <View style={[styles.emptyRow, { height: CARD_SKELETON_HEIGHT }]}>
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            No news yet — check back soon
          </Text>
        </View>
      ) : (
        <FlatList
          horizontal
          data={articles}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          getItemLayout={getItemLayout}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={Separator}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.5}
          ListFooterComponent={ListFooter}
        />
      )}
    </View>
  );
}

// Expose refresh so TribeHubScreen can call it via ref pattern or prop drilling
// without needing to lift all pagination state. We attach it as a static method
// for convenience — parent passes onRefreshed prop; actual re-fetch is via
// a separate refreshSection prop described below.
export type TribeNewsSectionRef = { refresh: () => Promise<void> };

export default TribeNewsSection;

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  section: {
    marginBottom: SPACING.lg,
  },
  title: {
    fontFamily: FONTS.semiBold,
    fontSize: 18,
    paddingHorizontal: SPACING.page,
    marginBottom: SPACING.sm,
  },
  listContent: {
    paddingHorizontal: SPACING.page,
  },
  loadingRow: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyRow: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.page,
  },
  emptyText: {
    fontFamily: FONTS.regular,
    fontSize: 14,
  },
  footer: {
    width: 56,
    height: CARD_SKELETON_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: CARD_GAP,
  },
});
