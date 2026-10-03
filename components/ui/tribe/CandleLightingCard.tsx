// CandleLightingCard — the body of the candle-lighting details sheet.
// Renders only what the view-model (utils/candleViewModel.ts) gives it:
//   details:  eyebrow, candle + havdalah times, location with Change, parsha
//   location: the unchanged LocationPicker (no-location "Set", or Change)
//   loading / error: a short state with a retry
// It never computes day counts or eyebrow text itself.
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Pressable, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import {
  FONTS,
  RADIUS,
  REGION_TILE_GRADIENT_DARK,
  REGION_TILE_GRADIENT_LIGHT,
} from '@/constants';
import { useTheme } from '@/contexts/ThemeContext';
import { CANDLE_AMBER, candleAmberText, type CandleViewModel } from '@/utils/candleViewModel';
import type { CandleSheetMode } from '@/store/tribeHubStore';
import { LocationPicker } from './LocationPicker';

// ── Icons ─────────────────────────────────────────────────────────────────────

export function CandleGlyph({ size = 22, color = CANDLE_AMBER }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 3c1 1.5 1 3 0 4-1-1-1-2.5 0-4z" fill={color} />
      <Path d="M10 9h4v11a2 2 0 01-2 2 2 2 0 01-2-2V9z" stroke={color} strokeWidth={1.5} />
      <Path d="M9 8h6" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

function PinGlyph({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2C8.686 2 6 4.686 6 8c0 4.5 6 12 6 12s6-7.5 6-12c0-3.314-2.686-6-6-6z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Path d="M12 10a2 2 0 100-4 2 2 0 000 4z" stroke={color} strokeWidth={1.5} />
    </Svg>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

type CandleLightingCardProps = {
  vm: CandleViewModel;
  mode: CandleSheetMode;
  onModeChange: (mode: CandleSheetMode) => void;
  /** Called after the user saves a location so the sheet can refetch. */
  onLocationSaved: () => void;
  onRetry: () => void;
};

// ── Component ─────────────────────────────────────────────────────────────────

export function CandleLightingCard({
  vm,
  mode,
  onModeChange,
  onLocationSaved,
  onRetry,
}: CandleLightingCardProps) {
  const { colors, isDark } = useTheme();
  const amberText = candleAmberText(isDark);
  const gradient = isDark ? REGION_TILE_GRADIENT_DARK : REGION_TILE_GRADIENT_LIGHT;

  const showPicker = vm.state === 'no-location' || mode === 'location';
  const glyphRow = (
    <View style={styles.glyphHolder}>
      <CandleGlyph size={22} />
    </View>
  );

  // ── Picker ─────────────────────────────────────────────────────────────────
  if (showPicker) {
    return (
      <View>
        <View style={styles.headerRow}>
          {glyphRow}
          <View style={styles.headerText}>
            <Text style={[styles.title, { color: colors.text }]}>Candle lighting</Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              {vm.state === 'no-location' ? 'Set your location to see times' : 'Change location'}
            </Text>
          </View>
          {vm.state !== 'no-location' ? (
            <TouchableOpacity
              onPress={() => onModeChange('details')}
              hitSlop={12}
              accessibilityRole="button"
            >
              <Text style={[styles.cancel, { color: colors.textMuted }]}>Cancel</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <View style={styles.pickerWrap}>
          <LocationPicker onLocationSet={onLocationSaved} />
        </View>
      </View>
    );
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (vm.state === 'loading') {
    return (
      <View style={styles.headerRow}>
        {glyphRow}
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: colors.text }]}>Candle lighting</Text>
        </View>
        <ActivityIndicator color={colors.textMuted} />
      </View>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (vm.state === 'error' || !vm.sheet) {
    return (
      <View>
        <View style={styles.headerRow}>
          {glyphRow}
          <View style={styles.headerText}>
            <Text style={[styles.title, { color: colors.text }]}>Candle lighting</Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>Candle times unavailable</Text>
          </View>
        </View>
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          style={styles.retry}
        >
          <Text style={[styles.retryText, { color: amberText }]}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  // ── Details ────────────────────────────────────────────────────────────────
  const sheet = vm.sheet;
  return (
    <View>
      <View style={styles.headerRow}>
        {glyphRow}
        <View style={styles.headerText}>
          <Text style={[styles.eyebrow, { color: colors.textMuted }]}>{vm.sheet.eyebrow}</Text>
          <Text style={[styles.title, { color: colors.text }]}>Candle lighting</Text>
        </View>
      </View>

      <LinearGradient
        colors={[gradient[0], gradient[1]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.timesTile}
      >
        <View style={styles.timeBlock}>
          <Text style={[styles.timeLabel, { color: colors.textMuted }]}>{sheet.candleLabel}</Text>
          <Text style={[styles.timeValue, { color: colors.text }]}>{sheet.candleTime}</Text>
        </View>
        {sheet.havdalahTime ? (
          <>
            <View style={[styles.timeDivider, { backgroundColor: colors.textMuted + '40' }]} />
            <View style={styles.timeBlock}>
              <Text style={[styles.timeLabel, { color: colors.textMuted }]}>{sheet.havdalahLabel}</Text>
              <Text style={[styles.timeValue, { color: colors.text }]}>{sheet.havdalahTime}</Text>
            </View>
          </>
        ) : null}
      </LinearGradient>

      <View style={[styles.locationRow, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <PinGlyph color={colors.textMuted} />
        <View style={styles.locationText}>
          <Text style={[styles.locationCaption, { color: colors.textMuted }]}>Location</Text>
          <Text style={[styles.locationValue, { color: colors.text }]} numberOfLines={1}>
            {sheet.location}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => onModeChange('location')}
          hitSlop={{ top: 4, bottom: 4 }}
          style={styles.changeButton}
          accessibilityRole="button"
          accessibilityLabel="Change location"
        >
          <Text style={[styles.changeText, { color: amberText }]}>Change</Text>
        </TouchableOpacity>
      </View>

      {sheet.parshaName ? (
        <View style={styles.parshaRow}>
          <Text style={[styles.parshaName, { color: colors.text }]}>{sheet.parshaName}</Text>
          <Text style={[styles.parshaHebrew, { color: colors.textMuted }]}>{sheet.parshaHebrew}</Text>
        </View>
      ) : null}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  glyphHolder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CANDLE_AMBER + '22',
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  eyebrow: {
    fontFamily: FONTS.semiBold,
    fontSize: 10,
    letterSpacing: 1.2,
  },
  title: {
    fontFamily: FONTS.bold,
    fontSize: 19,
    letterSpacing: 0.2,
  },
  subtitle: {
    fontFamily: FONTS.regular,
    fontSize: 13,
  },
  cancel: {
    fontFamily: FONTS.semiBold,
    fontSize: 13,
  },
  pickerWrap: {
    marginTop: 12,
  },
  retry: {
    minHeight: 44,
    justifyContent: 'center',
    marginTop: 8,
  },
  retryText: {
    fontFamily: FONTS.semiBold,
    fontSize: 14,
  },
  timesTile: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: RADIUS.md,
    padding: 16,
    marginTop: 18,
  },
  timeBlock: {
    flex: 1,
    gap: 3,
  },
  timeDivider: {
    width: 1,
    height: 44,
    marginHorizontal: 16,
  },
  timeLabel: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    letterSpacing: 0.3,
  },
  timeValue: {
    fontFamily: FONTS.bold,
    fontSize: 28,
    letterSpacing: 0.2,
  },
  locationRow: {
    marginTop: 14,
    minHeight: 52,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  locationText: {
    flex: 1,
    gap: 1,
  },
  locationCaption: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    letterSpacing: 0.3,
  },
  locationValue: {
    fontFamily: FONTS.semiBold,
    fontSize: 14,
  },
  changeButton: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: RADIUS.pill,
    backgroundColor: 'rgba(229,162,58,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(229,162,58,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  changeText: {
    fontFamily: FONTS.semiBold,
    fontSize: 13,
  },
  parshaRow: {
    marginTop: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  parshaName: {
    fontFamily: FONTS.semiBold,
    fontSize: 12.5,
  },
  parshaHebrew: {
    fontFamily: FONTS.regular,
    fontSize: 12.5,
  },
});

export default CandleLightingCard;
