// Tribe Hub — vertical, single-type marketplace feed shown when the
// "Marketplace" filter pill is selected. Structural clone of
// TribeEsekSection's pagination, just vertical (full-width cards,
// onEndReached at the bottom) instead of horizontal.
//
// Unlike the carousel (which hides itself entirely when empty, so it doesn't
// leave a bare title row inside the composite "All" view), this dedicated
// view shows a proper empty state — the user explicitly chose "Marketplace",
// so a blank screen below the pills would read as broken, not "nothing here".
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
import { esekApi } from '@/services/api';
import { EsekCard } from '@/components/ui/esek/EsekCard';
import { useTabBarSpace } from '@/hooks/useTabBarSpace';
import { COLORS, FONTS, SPACING } from '@/constants';
import type { EsekProduct } from '@/types';

const CARD_GAP = 12;

function Separator() {
  return <View style={{ height: CARD_GAP }} />;
}

export function TribeEsekList() {
  const { colors } = useTheme();
  const tabBarSpace = useTabBarSpace();

  const [products, setProducts] = useState<EsekProduct[]>([]);
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
        const res = await esekApi.feed(cur);
        if (mode === 'initial') setProducts(res.products);
        else setProducts((prev) => [...prev, ...res.products]);
        setCursor(res.nextCursor);
        setHasMore(res.hasMore);
      } catch {
        // Non-critical: leave existing products; do not crash the screen
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

  const renderItem = useCallback<ListRenderItem<EsekProduct>>(
    ({ item }) => <EsekCard product={item} fullWidth />,
    [],
  );

  const keyExtractor = useCallback((item: EsekProduct) => String(item.id), []);

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

  if (products.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={[styles.emptyText, { color: colors.textMuted }]}>
          No marketplace listings yet — check back soon
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={products}
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

export default TribeEsekList;

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
