// CandleHeaderChip — compact amber chip in the Tribe tab header's left slot,
// shown only while a content pill (News / Jobs / Marketplace) is selected and
// the strip is therefore hidden. It renders in the Tabs header tree, outside
// TribeHubScreen, so it reads the shared useTribeHubStore and never renders a
// sheet of its own: it only sets sheetOpen; the single CandleSheet mounted in
// TribeHubScreen reacts. All strings come from utils/candleViewModel.ts.
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { FONTS } from '@/constants';
import { useTheme } from '@/contexts/ThemeContext';
import { useTribeHubStore } from '@/store/tribeHubStore';
import { buildCandleViewModel, CANDLE_AMBER } from '@/utils/candleViewModel';
import { CandleGlyph } from './CandleLightingCard';

const FILLED_INK = '#1A1205';
const FILLED_INK_SUB = 'rgba(26,18,5,0.7)';

export function CandleHeaderChip() {
  const { colors } = useTheme();
  const filter = useTribeHubStore((s) => s.filter);
  const today = useTribeHubStore((s) => s.today);
  const todayLoading = useTribeHubStore((s) => s.todayLoading);
  const todayError = useTribeHubStore((s) => s.todayError);
  const todayFetchedAt = useTribeHubStore((s) => s.todayFetchedAt);

  const vm = buildCandleViewModel({
    today,
    loading: todayLoading,
    error: todayError,
    fetchedAt: todayFetchedAt,
    now: Date.now(),
  });

  if (filter === 'all' || !vm.chip.visible) return null;

  const loading = vm.state === 'loading';
  const filled = vm.chip.filled;
  const muted = vm.chip.muted;

  const handlePress = () => {
    if (loading) return;
    Haptics.selectionAsync();
    useTribeHubStore.getState().openSheet(vm.state === 'no-location' ? 'location' : 'details');
  };

  const textColor = filled ? FILLED_INK : muted ? colors.textMuted : colors.text;
  const subColor = filled ? FILLED_INK_SUB : colors.textMuted;
  const glyphColor = filled ? FILLED_INK : muted ? colors.textMuted : CANDLE_AMBER;

  return (
    <Pressable
      onPress={handlePress}
      disabled={loading}
      accessibilityRole="button"
      accessibilityLabel={vm.a11yLabel}
      accessibilityHint={vm.a11yHint || undefined}
      accessibilityState={{ busy: loading, disabled: loading }}
      style={styles.target}
    >
      <View
        style={[
          styles.pill,
          filled
            ? { backgroundColor: CANDLE_AMBER, borderColor: CANDLE_AMBER, ...styles.glow }
            : muted
              ? { backgroundColor: colors.surfaceGlass, borderColor: colors.border }
              : { backgroundColor: 'rgba(229,162,58,0.12)', borderColor: 'rgba(229,162,58,0.30)' },
        ]}
      >
        <CandleGlyph size={16} color={glyphColor} />
        {vm.chip.text ? (
          <Text style={[styles.text, { color: textColor }]} numberOfLines={1}>
            {vm.chip.text}
          </Text>
        ) : null}
        {vm.chip.sub !== null ? (
          <Text style={[styles.sub, { color: subColor }]}>{vm.chip.sub}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  target: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    marginLeft: 12,
  },
  pill: {
    height: 30,
    borderRadius: 15,
    paddingLeft: 7,
    paddingRight: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
  },
  glow: {
    shadowColor: CANDLE_AMBER,
    shadowOpacity: 0.45,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  text: {
    fontFamily: FONTS.bold,
    fontSize: 13,
  },
  sub: {
    fontFamily: FONTS.semiBold,
    fontSize: 11,
  },
});

export default CandleHeaderChip;
