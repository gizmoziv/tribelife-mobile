// Phase 18: one horizontal Chevra discovery carousel (Netflix-style row).
//
// Renders a section title + a horizontal FlatList of ChevraCommunityTile cards
// that pages right (onEndReached → state.loadMore). Empty sections collapse to
// nothing after their first load so the screen has no dead space; the cold-start
// state shows an inline spinner placeholder at tile height.
import React, { useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  type ListRenderItem,
} from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { ChevraCommunityTile } from '@/components/ui/chevra/ChevraCommunityTile';
import { FONTS, SPACING, COLORS } from '@/constants';
import type { ChevraRow } from '@/types';
import type { ChevraSectionState } from '@/hooks/useChevraSection';

export const CHEVRA_TILE_WIDTH = 158;
const TILE_GAP = 12;
const TILE_HEIGHT = 184; // matches ChevraCommunityTile surface minHeight

type ChevraSectionProps = {
  title: string;
  state: ChevraSectionState;
  onPressItem: (item: ChevraRow) => void;
  keyForItem: (item: ChevraRow) => string;
};

function Separator() {
  return <View style={{ width: TILE_GAP }} />;
}

export function ChevraSection({ title, state, onPressItem, keyForItem }: ChevraSectionProps) {
  const { colors } = useTheme();
  const { rows, isLoading, isLoadingMore, hasMore, loadMore } = state;

  const renderItem = useCallback<ListRenderItem<ChevraRow>>(
    ({ item }) => (
      <ChevraCommunityTile
        item={item}
        width={CHEVRA_TILE_WIDTH}
        onPress={() => onPressItem(item)}
      />
    ),
    [onPressItem],
  );

  const getItemLayout = useCallback(
    (_data: ArrayLike<ChevraRow> | null | undefined, index: number) => ({
      length: CHEVRA_TILE_WIDTH + TILE_GAP,
      offset: (CHEVRA_TILE_WIDTH + TILE_GAP) * index,
      index,
    }),
    [],
  );

  // Collapse an empty section once its first load has resolved.
  if (!isLoading && rows.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      {isLoading ? (
        <View style={[styles.loadingRow, { height: TILE_HEIGHT }]}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          horizontal
          data={rows}
          keyExtractor={keyForItem}
          renderItem={renderItem}
          getItemLayout={getItemLayout}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={Separator}
          onEndReached={hasMore ? loadMore : undefined}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            isLoadingMore ? (
              <View style={styles.footer}>
                <ActivityIndicator color={COLORS.primary} />
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

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
    height: TILE_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: TILE_GAP,
  },
});
