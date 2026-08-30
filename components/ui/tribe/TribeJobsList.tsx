// Tribe Hub — vertical, single-type jobs feed shown when the "Jobs" filter
// pill is selected. Structural clone of TribeJobsSection's pagination, just
// vertical (full-width cards, onEndReached at the bottom) instead of
// horizontal. Owns its own pagination state independently of the carousel —
// switching pills always starts a fresh feed from page 1.
//
// A label + Switch row filters the feed to the caller's timezone zone
// (server-side, always including null-location + remote jobs). The row is
// always mounted above all three body states (loading/empty/list) so a user
// whose filtered feed comes back empty can still reach the toggle to switch
// it back off. The toggle's value is owned by TribeHubScreen and received
// as a prop, which is what makes it survive this component unmounting when
// the filter pill moves off Jobs.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Switch,
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
import { COLORS, FONTS, SPACING } from '@/constants';
import type { JobPosting } from '@/types';

const CARD_GAP = 12;

function Separator() {
  return <View style={{ height: CARD_GAP }} />;
}

interface TribeJobsListProps {
  myLocation: boolean;
  onMyLocationChange: (next: boolean) => void;
}

export function TribeJobsList({ myLocation, onMyLocationChange }: TribeJobsListProps) {
  const { colors } = useTheme();
  const tabBarSpace = useTabBarSpace();

  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const fetchingRef = useRef(false);
  // Mirrors `myLocation`, written synchronously in the toggle handler — used
  // to discard stale in-flight responses issued under a since-changed flag.
  // Also seeded from, and re-mirrored against, the prop so a remount that
  // starts with the filter already on is not treated as a stale flag.
  const myLocationRef = useRef(myLocation);

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
    myLocationRef.current = myLocation;
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
    onMyLocationChange(next);
  }, [onMyLocationChange]);

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

  const toggleRow = (
    <View style={styles.toggleRow}>
      <Text style={[styles.toggleLabel, { color: colors.text }]}>
        My Timezone
      </Text>
      <Switch
        value={myLocation}
        onValueChange={handleToggleMyLocation}
        trackColor={{ false: colors.border, true: COLORS.primary }}
        thumbColor="#FFF"
      />
    </View>
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
            ? 'No jobs found in your timezone yet — turn off "My Timezone" to see all jobs'
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
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: tabBarSpace },
        ]}
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
      <View style={styles.chipRow}>{toggleRow}</View>
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
  toggleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleLabel: {
    fontFamily: FONTS.medium,
    fontSize: 14,
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
