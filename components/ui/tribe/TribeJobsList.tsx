// Tribe Hub — vertical, single-type jobs feed shown when the "Jobs" filter
// pill is selected. Structural clone of TribeJobsSection's pagination, just
// vertical (full-width cards, onEndReached at the bottom) instead of
// horizontal. Owns its own pagination state independently of the carousel —
// switching pills always starts a fresh feed from page 1.
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
import { JobCard } from '@/components/ui/jobs/JobCard';
import { useTabBarSpace } from '@/hooks/useTabBarSpace';
import { COLORS, FONTS, SPACING } from '@/constants';
import type { JobPosting } from '@/types';

const CARD_GAP = 12;

function Separator() {
  return <View style={{ height: CARD_GAP }} />;
}

export function TribeJobsList() {
  const { colors } = useTheme();
  const tabBarSpace = useTabBarSpace();

  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const fetchingRef = useRef(false);

  const load = useCallback(
    async (mode: 'initial' | 'more') => {
      if (fetchingRef.current) return;
      fetchingRef.current = true;
      if (mode === 'initial') setLoadingInitial(true);
      else setLoadingMore(true);

      try {
        const cur = mode === 'more' ? (cursor ?? undefined) : undefined;
        const res = await jobsApi.feed(cur);
        if (mode === 'initial') setJobs(res.jobs);
        else setJobs((prev) => [...prev, ...res.jobs]);
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

  useEffect(() => {
    load('initial');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleEndReached = useCallback(() => {
    if (loadingMore || !hasMore || !cursor) return;
    load('more');
  }, [loadingMore, hasMore, cursor, load]);

  const renderItem = useCallback<ListRenderItem<JobPosting>>(
    ({ item }) => <JobCard job={item} fullWidth />,
    [],
  );

  const keyExtractor = useCallback((item: JobPosting) => String(item.id), []);

  const ListFooter = loadingMore ? (
    <View style={styles.footer}>
      <ActivityIndicator color={COLORS.primary} />
    </View>
  ) : null;

  if (loadingInitial) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  if (jobs.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={[styles.emptyText, { color: colors.textMuted }]}>
          No job postings yet — check back soon
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={jobs}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      contentContainerStyle={[styles.listContent, { paddingBottom: tabBarSpace }]}
      ItemSeparatorComponent={Separator}
      onEndReached={handleEndReached}
      onEndReachedThreshold={0.5}
      ListFooterComponent={ListFooter}
      showsVerticalScrollIndicator={false}
    />
  );
}

export default TribeJobsList;

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: SPACING.page,
    paddingTop: SPACING.sm,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.page,
  },
  emptyText: {
    fontFamily: FONTS.regular,
    fontSize: 14,
  },
  footer: {
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
