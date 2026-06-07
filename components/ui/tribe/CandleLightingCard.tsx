// CandleLightingCard — shows candle-lighting + havdalah times once a location is set,
// or prompts the user to set their location (via LocationPicker) when needsLocation is true.
// States:
//   needs-location: renders <LocationPicker /> with a card header
//   set:            renders times + location label + daysUntil + "Change location" link
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import {
  COLORS,
  FONTS,
  RADIUS,
  SHADOWS,
  REGION_TILE_GRADIENT_DARK,
  REGION_TILE_GRADIENT_LIGHT,
} from '@/constants';
import { useTheme } from '@/contexts/ThemeContext';
import type { TodayPayload } from '@/services/api';
import { LocationPicker } from './LocationPicker';

// ── Constants ─────────────────────────────────────────────────────────────────

const SHABBAT_ACCENT = '#E5A23A';

// ── Icons ─────────────────────────────────────────────────────────────────────

function CandleIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M12 3c1 1.5 1 3 0 4-1-1-1-2.5 0-4z" fill={SHABBAT_ACCENT} />
      <Path
        d="M10 9h4v11a2 2 0 01-2 2 2 2 0 01-2-2V9z"
        stroke={SHABBAT_ACCENT}
        strokeWidth={1.5}
      />
      <Path
        d="M9 8h6"
        stroke={SHABBAT_ACCENT}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </Svg>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

type CandleLightingCardProps = {
  /** Full today payload from tribeApi.today(); may be null while loading. */
  today: TodayPayload | null;
  /** Called after the user successfully sets a location so the parent can refetch. */
  onChanged: () => void;
};

// ── Component ─────────────────────────────────────────────────────────────────

export function CandleLightingCard({ today, onChanged }: CandleLightingCardProps) {
  const { isDark } = useTheme();
  const [changingLocation, setChangingLocation] = useState(false);

  const gradient = isDark ? REGION_TILE_GRADIENT_DARK : REGION_TILE_GRADIENT_LIGHT;
  const labelColor = isDark ? COLORS.text : COLORS.lightText;
  const mutedColor = isDark ? COLORS.textMuted : COLORS.lightTextMuted;

  const needsLocation = !today || today.needsLocation || !today.shabbat;
  const shabbat = today?.shabbat ?? null;

  const handleLocationSet = () => {
    setChangingLocation(false);
    onChanged();
  };

  const showPicker = needsLocation || changingLocation;

  // ── Render: location prompt ────────────────────────────────────────────────

  if (showPicker) {
    return (
      <View style={[styles.wrap, SHADOWS.sm]}>
        <LinearGradient
          colors={[gradient[0], gradient[1]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.surface}
        >
          <LinearGradient
            colors={[
              isDark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.55)',
              'rgba(255,255,255,0)',
            ]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 0.6 }}
            style={StyleSheet.absoluteFillObject}
            pointerEvents="none"
          />

          <View style={styles.content}>
            {/* Header */}
            <View style={styles.headerRow}>
              <View style={[styles.glyphHolder, { backgroundColor: SHABBAT_ACCENT + '22' }]}>
                <CandleIcon />
              </View>
              <View style={styles.headerText}>
                <Text style={[styles.cardTitle, { color: labelColor }]}>Candle lighting</Text>
                <Text style={[styles.cardSubtitle, { color: mutedColor }]}>
                  Set your location to see times
                </Text>
              </View>
              {changingLocation ? (
                <TouchableOpacity onPress={() => setChangingLocation(false)} hitSlop={8}>
                  <Text style={[styles.changeLink, { color: mutedColor }]}>Cancel</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Picker */}
            <LocationPicker onLocationSet={handleLocationSet} />
          </View>

          <View style={[styles.accentStripe, { backgroundColor: SHABBAT_ACCENT }]} pointerEvents="none" />
        </LinearGradient>
      </View>
    );
  }

  // ── Render: times + label + change ────────────────────────────────────────

  const daysLabel = shabbat!.daysUntil === 0
    ? 'Tonight'
    : `in ${shabbat!.daysUntil} day${shabbat!.daysUntil === 1 ? '' : 's'}`;

  return (
    <View style={[styles.wrap, SHADOWS.sm]}>
      <LinearGradient
        colors={[gradient[0], gradient[1]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.surface}
      >
        <LinearGradient
          colors={[
            isDark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.55)',
            'rgba(255,255,255,0)',
          ]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 0.6 }}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />

        <View style={styles.content}>
          <View style={styles.headerRow}>
            <View style={[styles.glyphHolder, { backgroundColor: SHABBAT_ACCENT + '22' }]}>
              <CandleIcon />
            </View>
            <View style={styles.headerText}>
              <Text style={[styles.eyebrow, { color: mutedColor }]}>
                {'SHABBAT · ' + daysLabel.toUpperCase()}
              </Text>
              <Text style={[styles.cardTitle, { color: labelColor }]}>Candle lighting</Text>
            </View>
            <TouchableOpacity
              onPress={() => setChangingLocation(true)}
              hitSlop={8}
              style={styles.changeButton}
            >
              <Text style={[styles.changeLink, { color: SHABBAT_ACCENT }]}>Change</Text>
            </TouchableOpacity>
          </View>

          {/* Times row */}
          <View style={styles.timesRow}>
            <View style={styles.timeBlock}>
              <Text style={[styles.timeLabel, { color: mutedColor }]}>Candles</Text>
              <Text style={[styles.timeValue, { color: labelColor }]}>{shabbat!.candleLightingTime}</Text>
            </View>
            <View style={[styles.timeDivider, { backgroundColor: mutedColor + '40' }]} />
            <View style={styles.timeBlock}>
              <Text style={[styles.timeLabel, { color: mutedColor }]}>Havdalah</Text>
              <Text style={[styles.timeValue, { color: labelColor }]}>{shabbat!.havdalahTime}</Text>
            </View>
          </View>

          {/* Location label */}
          <Text style={[styles.locationLabel, { color: mutedColor }]} numberOfLines={1}>
            {shabbat!.locationLabel}
          </Text>
        </View>

        <View style={[styles.accentStripe, { backgroundColor: SHABBAT_ACCENT }]} pointerEvents="none" />
      </LinearGradient>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  wrap: {
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
  },
  surface: {
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 20,
    gap: 12,
  },
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
  cardTitle: {
    fontFamily: FONTS.bold,
    fontSize: 17,
    letterSpacing: 0.2,
  },
  cardSubtitle: {
    fontFamily: FONTS.regular,
    fontSize: 13,
  },
  changeButton: {
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  changeLink: {
    fontFamily: FONTS.semiBold,
    fontSize: 13,
  },
  timesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
  },
  timeBlock: {
    flex: 1,
    gap: 3,
  },
  timeDivider: {
    width: 1,
    height: 36,
    marginHorizontal: 16,
  },
  timeLabel: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    letterSpacing: 0.3,
  },
  timeValue: {
    fontFamily: FONTS.bold,
    fontSize: 22,
    letterSpacing: 0.2,
  },
  locationLabel: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    marginTop: -4,
  },
  accentStripe: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    opacity: 0.85,
  },
});

export default CandleLightingCard;
