// Phase 18: circular country-flag avatar for timezone discovery tiles.
//
// Replaces the generic '··' RegionTile placeholder (which only had abbreviations
// for the 7 region slugs) with the flag of the representative country for each
// timezone zone. Mirrors RegionTile's gradient-ring + shadow layout so flags and
// region tiles read as the same class of avatar in the Chevra carousels.
//
// Several North-American zones share the US flag (and the two AU zones the AU
// flag) by design — the tile's text label disambiguates them. A zone slug with
// no flag mapping falls back to a derived letter tile, never '··'.
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { SvgProps } from 'react-native-svg';
import {
  Us,
  Ca,
  Br,
  Ar,
  Cl,
  Co,
  Gb,
  Fr,
  Gr,
  Il,
  Ru,
  In,
  Ae,
  Th,
  Cn,
  Jp,
  Au,
  Nz,
} from 'react-native-svg-circle-country-flags';
import { COLORS, SHADOWS, TIMEZONE_FLAG_COUNTRY } from '@/constants';
import { useTheme } from '@/contexts/ThemeContext';
import { RegionTile } from '@/components/ui/RegionTile';

type TimezoneFlagProps = {
  slug: string;
  size?: number;
  showRing?: boolean;
};

// ISO-3166 alpha-2 (uppercase) → flag component. Keys match the values in
// constants/TIMEZONE_FLAG_COUNTRY. The library exports each flag as a title-case
// component (Us, Ca, …) typed `(props: SvgProps) => JSX.Element`.
const FLAG_BY_CODE: Record<string, React.ComponentType<SvgProps>> = {
  US: Us,
  CA: Ca,
  BR: Br,
  AR: Ar,
  CL: Cl,
  CO: Co,
  GB: Gb,
  FR: Fr,
  GR: Gr,
  IL: Il,
  RU: Ru,
  IN: In,
  AE: Ae,
  TH: Th,
  CN: Cn,
  JP: Jp,
  AU: Au,
  NZ: Nz,
};

// Derive a 2–3 letter label for any zone slug missing a flag mapping — a safety
// net for future backend zones, NEVER the '··' RegionTile default.
function deriveAbbreviation(slug: string): string {
  const base = slug.replace(/-(time|standard)$/g, '');
  const letters = base
    .split('-')
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
  return (letters || slug.slice(0, 2).toUpperCase()).slice(0, 3);
}

export function TimezoneFlag({ slug, size = 56, showRing = true }: TimezoneFlagProps) {
  const { colors } = useTheme();
  const code = TIMEZONE_FLAG_COUNTRY[slug];
  const Flag = code ? FLAG_BY_CODE[code] : undefined;

  // Graceful fallback: unmapped zone → letter tile (not '··').
  if (!Flag) {
    return (
      <RegionTile
        slug={slug}
        size={size}
        showRing={showRing}
        abbreviation={deriveAbbreviation(slug)}
      />
    );
  }

  const flag = <Flag width={size} height={size} />;

  if (!showRing) {
    return (
      <View style={[styles.shadowWrap, styles.clip, { width: size, height: size, borderRadius: size / 2 }]}>
        {flag}
      </View>
    );
  }

  // Mirror RegionTile's ring: gradient outer ring + background-colored padding so
  // the flag reads as a separate disc inside the ring.
  const ringWidth = 2;
  const outerSize = size + ringWidth * 2 + 4;
  return (
    <View style={[styles.shadowWrap, { width: outerSize, height: outerSize, borderRadius: outerSize / 2 }]}>
      <LinearGradient
        colors={[...COLORS.gradientPrimary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          width: outerSize,
          height: outerSize,
          borderRadius: outerSize / 2,
          alignItems: 'center',
          justifyContent: 'center',
          padding: ringWidth,
        }}
      >
        <View
          style={{
            width: size + 2,
            height: size + 2,
            borderRadius: (size + 2) / 2,
            backgroundColor: colors.background,
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          {flag}
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  shadowWrap: {
    ...SHADOWS.sm,
  },
  clip: {
    overflow: 'hidden',
  },
});
