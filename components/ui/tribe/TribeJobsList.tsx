// Tribe Hub — vertical, single-type jobs feed shown when the "Jobs" filter
// pill is selected. Structural clone of TribeJobsSection's pagination, just
// vertical (full-width cards, onEndReached at the bottom) instead of
// horizontal. Owns its own pagination state independently of the carousel —
// switching pills always starts a fresh feed from page 1.
//
// Quick task 260830-etv (D-07/D-08): adds a "My Location" toggle chip that
// filters the feed to the caller's timezone zone (server-side, always
// including null-location + remote jobs). The chip is always mounted above
// all three body states (loading/empty/list) so a user whose filtered feed
// comes back empty can still reach the toggle to switch it back off.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  type ListRenderItem,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/contexts/ThemeContext';
import { jobsApi } from '@/services/api';
import { JobCard } from '@/components/ui/jobs/JobCard';
import { useTabBarSpace } from '@/hooks/useTabBarSpace';
import { COLORS, FONTS, RADIUS, SPACING } from '@/constants';
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
  const [myLocation, setMyLocation] = useState(false);
  const fetchingRef = useRef(false);
  // Mirrors `myLocation`, written synchronously in the toggle handler — used
  // to discard stale in-flight responses issued under a since-changed flag.
  const myLocationRef = useRef(false);

  const load = useCallback(
    async (mode: 'initial' | 'more', flag: boolean) => {
      if (fetchingRef.current) return;
      fetchingRef.current = true;
      if (mode === 'initial') setLoadingInitial(true);
      else setLoadingMore(true);

      try {
        const cur = mode === 'more' ? (cursor ?? undefined) : undefined;
        const res = await jobsApi.feed(cur, flag);
        // Discard this response if the toggle flipped while it was in flight —
        // stops a slow page-2 fetch from the previous filter appending rows
        // under the new one.
        if (flag !== myLocationRef.current) return;
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
    [cursor, myLocation],
  );

  useEffect(() => {
    load('initial', myLocation);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myLocation]);

  const handleEndReached = useCallback(() => {
    if (loadingMore || !hasMore || !cursor) return;
    load('more', myLocation);
  }, [loadingMore, hasMore, cursor, load, myLocation]);

  const handleToggleMyLocation = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = !myLocationRef.current;
    myLocationRef.current = next;
    // A fetch in flight under the old flag must not block the reload below.
    fetchingRef.current = false;
    setJobs([]);
    setCursor(null);
    setHasMore(true);
    setMyLocation(next);
  }, []);

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

  const chip = (
    <Pressable
      onPress={handleToggleMyLocation}
      accessibilityRole="button"
      accessibilityState={{ selected: myLocation }}
      style={[
        styles.chip,
        myLocation
          ? { backgroundColor: 'rgba(129, 140, 248, 0.85)', borderColor: 'rgba(129, 140, 248, 0.95)' }
          : { backgroundColor: colors.surfaceGlass, borderColor: colors.border },
      ]}
    >
      <Text
        style={[
          styles.chipText,
          myLocation
            ? { color: '#FFFFFF', fontFamily: FONTS.semiBold }
            : { color: colors.textMuted, fontFamily: FONTS.medium },
        ]}
      >
        My Location
      </Text>
    </Pressable>
  );

  let body: React.ReactNode;
  if (loadingInitial) {
    body = (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  } else if (jobs.length === 0) {
    body = (
      <View style={styles.loadingContainer}>
        <Text style={[styles.emptyText, { color: colors.textMuted }]}>
          {myLocation
            ? 'No jobs found near you yet — tap "My Location" to see all jobs'
            : 'No job postings yet — check back soon'}
        </Text>
      </View>
    );
  } else {
    body = (
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

  return (
    <View style={styles.container}>
      <View style={styles.chipRow}>{chip}</View>
      {body}
    </View>
  );
}

export default TribeJobsList;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  chipRow: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.page,
    paddingVertical: SPACING.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
  },
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
