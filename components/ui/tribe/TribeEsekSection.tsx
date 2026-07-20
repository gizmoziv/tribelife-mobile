// Phase 33: Tribe Hub — horizontal infinite Esek marketplace carousel.
//
// Props-less clone of TribeJobsSection. Owns all cursor-pagination state for the
// Esek feed:
//   - Initial load on mount: esekApi.feed() → first page
//   - Right-edge scroll: onEndReached → esekApi.feed(cursor) → append next page
//   - Repeats until hasMore === false (footer spinner stops; no further fetch)
//
// Empty behavior differs from Jobs per Locked Decision: when the feed returns no
// products on initial load (backend feed not yet live), the section renders null
// (hidden) rather than showing an empty-state message.
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
import { esekApi } from '@/services/api';
import { EsekCard, ESEK_CARD_WIDTH } from '@/components/ui/esek/EsekCard';
import { COLORS, FONTS, SPACING } from '@/constants';
import type { EsekProduct } from '@/types';

// ── Constants ────────────────────────────────────────────────────────────────

const CARD_GAP = 12;
// Card height is variable (image + text body), so we fix a comfortable
// skeleton height for the loading-initial placeholder.
const CARD_SKELETON_HEIGHT = 220;

// ── Sub-components ────────────────────────────────────────────────────────────

function Separator() {
  return <View style={{ width: CARD_GAP }} />;
}

// ── Component ────────────────────────────────────────────────────────────────

export function TribeEsekSection() {
  const { colors } = useTheme();

  // ── Pagination state ──────────────────────────────────────────────────────
  const [products, setProducts] = useState<EsekProduct[]>([]);
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
        const res = await esekApi.feed(cur);
        if (mode === 'initial') {
          setProducts(res.products);
        } else {
          setProducts(prev => [...prev, ...res.products]);
        }
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

  const renderItem = useCallback<ListRenderItem<EsekProduct>>(
    ({ item }) => <EsekCard product={item} />,
    [],
  );

  const keyExtractor = useCallback((item: EsekProduct) => String(item.id), []);

  const getItemLayout = useCallback(
    (_data: ArrayLike<EsekProduct> | null | undefined, index: number) => ({
      length: ESEK_CARD_WIDTH + CARD_GAP,
      offset: (ESEK_CARD_WIDTH + CARD_GAP) * index,
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

  // Once loaded, hide the entire section when the feed returned no products
  // (backend feed not yet live). Differs from Jobs' empty-state copy per the
  // Locked Decision success criteria ("render nothing if empty on initial load").
  if (!loadingInitial && products.length === 0) {
    return null;
  }

  return (
    <View style={styles.section}>
      <Text style={[styles.title, { color: colors.text }]}>Marketplace</Text>

      {loadingInitial ? (
        // Loading-initial state: simple spinner at card height
        <View style={[styles.loadingRow, { height: CARD_SKELETON_HEIGHT }]}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          horizontal
          data={products}
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

export default TribeEsekSection;

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
  footer: {
    width: 56,
    height: CARD_SKELETON_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: CARD_GAP,
  },
});
