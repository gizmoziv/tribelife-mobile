// CandleStrip — the slim 52px candle-lighting strip shown on the Tribe tab's
// All pill. One button; every string comes from the view-model
// (utils/candleViewModel.ts). The height never changes between states:
// loading skeleton, no location, error, upcoming, Friday, Saturday.
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import {
  FONTS,
  RADIUS,
  SPACING,
  REGION_TILE_GRADIENT_DARK,
  REGION_TILE_GRADIENT_LIGHT,
} from '@/constants';
import { useTheme } from '@/contexts/ThemeContext';
import { candleAmberText, type CandleViewModel } from '@/utils/candleViewModel';
import { CandleGlyph } from './CandleLightingCard';

type CandleStripProps = {
  vm: CandleViewModel;
  onPress: () => void;
};

export function CandleStrip({ vm, onPress }: CandleStripProps) {
  const { colors, isDark } = useTheme();
  const loading = vm.state === 'loading';

  const borderColor = vm.tonight
    ? isDark ? 'rgba(229,162,58,0.35)' : 'rgba(180,83,9,0.25)'
    : colors.border;

  const gradient: readonly [string, string] = vm.tonight
    ? isDark
      ? ['rgba(229,162,58,0.24)', 'rgba(229,162,58,0.08)']
      : ['#FCEBCB', '#F6DDB0']
    : isDark
      ? REGION_TILE_GRADIENT_DARK
      : REGION_TILE_GRADIENT_LIGHT;

  const handlePress = () => {
    Haptics.selectionAsync();
    onPress();
  };

  const showChevron =
    vm.stripAction === null &&
    (vm.state === 'upcoming' || vm.state === 'friday' || vm.state === 'saturday');

  return (
    <Pressable
      onPress={handlePress}
      disabled={loading}
      accessibilityRole="button"
      accessibilityLabel={vm.a11yLabel}
      accessibilityHint={vm.a11yHint || undefined}
      accessibilityState={{ busy: loading, disabled: loading }}
      style={[styles.root, { borderColor }]}
    >
      <LinearGradient
        colors={[gradient[0], gradient[1]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <LinearGradient
        colors={[
          isDark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.55)',
          'rgba(255,255,255,0)',
        ]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.7 }}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />

      <View style={styles.row}>
        <View style={styles.glyphHolder}>
          <CandleGlyph size={20} color={loading ? colors.textMuted : undefined} />
        </View>

        <View style={styles.textCol}>
          {loading ? (
            <>
              <View style={[styles.skeleton, { width: '70%', backgroundColor: colors.textMuted }]} />
              <View style={[styles.skeleton, { width: '45%', marginTop: 6, backgroundColor: colors.textMuted }]} />
            </>
          ) : (
            <>
              <Text style={[styles.line1, { color: colors.text }]} numberOfLines={1}>
                {vm.stripLine1.map((seg, i) => (
                  <Text
                    key={i}
                    style={
                      seg.kind === 'time'
                        ? styles.segTime
                        : seg.kind === 'sep'
                          ? [styles.segSep, { color: colors.textMuted }]
                          : undefined
                    }
                  >
                    {seg.text}
                  </Text>
                ))}
              </Text>
              <Text
                style={[styles.line2, { color: colors.textMuted }]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {vm.stripLine2}
              </Text>
            </>
          )}
        </View>

        {vm.stripAction ? (
          <Text style={[styles.action, { color: candleAmberText(isDark) }]}>{vm.stripAction}</Text>
        ) : showChevron ? (
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" opacity={0.7}>
            <Path
              d="M9 6l6 6-6 6"
              stroke={colors.text}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        ) : null}
      </View>
    </Pressable>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    marginHorizontal: SPACING.page,
    marginBottom: 12,
    height: 52,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    borderWidth: 1,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 8,
    paddingRight: 10,
  },
  glyphHolder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(229,162,58,0.13)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  skeleton: {
    height: 10,
    borderRadius: 5,
    opacity: 0.25,
  },
  line1: {
    fontFamily: FONTS.semiBold,
    fontSize: 14,
  },
  segTime: {
    fontFamily: FONTS.bold,
  },
  segSep: {
    fontFamily: FONTS.medium,
  },
  line2: {
    fontFamily: FONTS.regular,
    fontSize: 11.5,
  },
  action: {
    fontFamily: FONTS.semiBold,
    fontSize: 13,
    paddingHorizontal: 6,
  },
});

export default CandleStrip;
