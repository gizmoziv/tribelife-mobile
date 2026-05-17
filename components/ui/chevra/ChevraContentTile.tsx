import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  FONTS,
  RADIUS,
  SHADOWS,
  COLORS,
  REGION_TILE_GRADIENT_DARK,
  REGION_TILE_GRADIENT_LIGHT,
} from '@/constants';
import { useTheme } from '@/contexts/ThemeContext';

type ChevraContentTileProps = {
  eyebrow: string;
  primary: string;
  secondary?: string;
  glyph: React.ReactNode;
  accent: string;
  width: number;
  onPress?: () => void;
};

export function ChevraContentTile({
  eyebrow,
  primary,
  secondary,
  glyph,
  accent,
  width,
  onPress,
}: ChevraContentTileProps) {
  const { isDark } = useTheme();
  const gradient = isDark ? REGION_TILE_GRADIENT_DARK : REGION_TILE_GRADIENT_LIGHT;
  const labelColor = isDark ? COLORS.text : COLORS.lightText;
  const mutedColor = isDark ? COLORS.textMuted : COLORS.lightTextMuted;

  const Wrapper: React.ElementType = onPress ? Pressable : View;

  return (
    <Wrapper
      onPress={onPress}
      style={({ pressed }: { pressed?: boolean }) => [
        styles.wrap,
        SHADOWS.sm,
        { width },
        pressed ? { opacity: 0.85 } : null,
      ]}
    >
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
          end={{ x: 0.5, y: 0.55 }}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />

        <View style={styles.content}>
          <View style={[styles.glyphHolder, { backgroundColor: accent + '22' }]}>
            {glyph}
          </View>
          <Text style={[styles.eyebrow, { color: mutedColor }]} numberOfLines={1}>
            {eyebrow.toUpperCase()}
          </Text>
          <Text style={[styles.primary, { color: labelColor }]} numberOfLines={1}>
            {primary}
          </Text>
          {secondary ? (
            <Text style={[styles.secondary, { color: mutedColor }]} numberOfLines={1}>
              {secondary}
            </Text>
          ) : null}
        </View>

        <View style={[styles.accentStripe, { backgroundColor: accent }]} pointerEvents="none" />
      </LinearGradient>
    </Wrapper>
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
    minHeight: 148,
  },
  content: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 18,
    gap: 4,
  },
  glyphHolder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  eyebrow: {
    fontFamily: FONTS.semiBold,
    fontSize: 10,
    letterSpacing: 1.2,
    marginTop: 2,
  },
  primary: {
    fontFamily: FONTS.bold,
    fontSize: 20,
    letterSpacing: 0.3,
    marginTop: 2,
  },
  secondary: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    marginTop: 2,
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
