// Phase 24: Tribe Hub — horizontal infinite jobs carousel.
//
// Props-less (no onSetRefresh/onRefreshed — jobs have no socket/banner refresh in v1).
// Owns all cursor-pagination state for the jobs feed:
//   - Initial load on mount: jobsApi.feed() → first page (~20 jobs)
//   - Right-edge scroll: onEndReached → jobsApi.feed(cursor) → append next page
//   - Repeats until hasMore === false (footer spinner stops; no further fetch)
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
import { jobsApi } from '@/services/api';
import { JobCard, JOB_CARD_WIDTH } from '@/components/ui/jobs/JobCard';
import { COLORS, FONTS, SPACING } from '@/constants';
import type { JobPosting } from '@/types';

// ── Constants ────────────────────────────────────────────────────────────────

const CARD_GAP = 12;
// Card height is variable (logo + text body), so we fix a comfortable
// skeleton height for the loading-initial placeholder.
const CARD_SKELETON_HEIGHT = 220;

// ── Sub-components ────────────────────────────────────────────────────────────

function Separator() {
  return <View style={{ width: CARD_GAP }} />;
}

// ── Component ────────────────────────────────────────────────────────────────

export function TribeJobsSection() {
  const { colors } = useTheme();

  // ── Pagination state ──────────────────────────────────────────────────────
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Guard against concurrent fetches
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
        const cur = mode === 'more' ? (cursor ?? undefined) : undefined;
        const res = await jobsApi.feed(cur);
        if (mode === 'initial') {
          setJobs(res.jobs);
        } else {
          setJobs(prev => [...prev, ...res.jobs]);
        }
        setCursor(res.nextCursor);
        setHasMore(res.hasMore);
      } catch {
        // Non-critical: leave existing jobs; do not crash the screen
      } finally {
        fetchingRef.current = false;
        if (mode === 'initial') setLoadingInitial(false);
        else setLoadingMore(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cursor],
  );

  // Initial load on mount
  useEffect(() => {
    load('initial');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── onEndReached ──────────────────────────────────────────────────────────

  const handleEndReached = useCallback(() => {
    if (loadingMore || !hasMore || !cursor) return;
    load('more');
  }, [loadingMore, hasMore, cursor, load]);

  // ── Render helpers ────────────────────────────────────────────────────────

  const renderItem = useCallback<ListRenderItem<JobPosting>>(
    ({ item }) => <JobCard job={item} />,
    [],
  );

  const keyExtractor = useCallback((item: JobPosting) => String(item.id), []);

  const getItemLayout = useCallback(
    (_data: ArrayLike<JobPosting> | null | undefined, index: number) => ({
      length: JOB_CARD_WIDTH + CARD_GAP,
      offset: (JOB_CARD_WIDTH + CARD_GAP) * index,
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
      <Text style={[styles.title, { color: colors.text }]}>Jobs</Text>

      {loadingInitial ? (
        // Loading-initial state: simple spinner at card height
        <View style={[styles.loadingRow, { height: CARD_SKELETON_HEIGHT }]}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : jobs.length === 0 ? (
        // Empty state (loaded, no jobs yet)
        <View style={[styles.emptyRow, { height: CARD_SKELETON_HEIGHT }]}>
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            No job postings yet — check back soon
          </Text>
        </View>
      ) : (
        <FlatList
          horizontal
          data={jobs}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          getItemLayout={getItemLayout}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={Separator}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.5}
          ListFooterComponent={ListFooter}
          initialNumToRender={3}
        />
      )}
    </View>
  );
}

export default TribeJobsSection;

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
