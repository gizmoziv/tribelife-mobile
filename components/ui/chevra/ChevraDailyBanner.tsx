import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  COLORS,
  FONTS,
  RADIUS,
  SHADOWS,
  REGION_TILE_GRADIENT_DARK,
  REGION_TILE_GRADIENT_LIGHT,
} from '@/constants';
import { useTheme } from '@/contexts/ThemeContext';
import { getDailyBanner } from './dailyContent';

export function ChevraDailyBanner() {
  const { isDark } = useTheme();
  const banner = getDailyBanner();

  const gradient = isDark ? REGION_TILE_GRADIENT_DARK : REGION_TILE_GRADIENT_LIGHT;
  const accent = '#E5A23A';
  const labelColor = isDark ? COLORS.text : COLORS.lightText;
  const mutedColor = isDark ? COLORS.textMuted : COLORS.lightTextMuted;

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
            <Text style={[styles.eyebrow, { color: mutedColor }]}>
              {banner.gregorianLabel.toUpperCase()}
            </Text>
            <View style={[styles.parshaPill, { backgroundColor: 'rgba(229,162,58,0.18)' }]}>
              <Text style={[styles.parshaPillText, { color: accent }]}>{banner.parshaName}</Text>
            </View>
          </View>
          <Text style={[styles.hebrewDate, { color: labelColor }]}>
            {banner.hebrewDate}
          </Text>
          <Text style={[styles.parshaHebrew, { color: mutedColor }]}>
            {banner.parshaHebrew}
          </Text>
        </View>

        <View style={[styles.accentStripe, { backgroundColor: accent }]} pointerEvents="none" />
      </LinearGradient>
    </View>
  );
}

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
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 22,
    gap: 6,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eyebrow: {
    fontFamily: FONTS.semiBold,
    fontSize: 11,
    letterSpacing: 1.2,
  },
  parshaPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
  },
  parshaPillText: {
    fontFamily: FONTS.semiBold,
    fontSize: 11,
    letterSpacing: 0.4,
  },
  hebrewDate: {
    fontFamily: FONTS.bold,
    fontSize: 28,
    letterSpacing: 0.5,
    marginTop: 4,
  },
  parshaHebrew: {
    fontFamily: FONTS.medium,
    fontSize: 16,
    letterSpacing: 0.4,
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
