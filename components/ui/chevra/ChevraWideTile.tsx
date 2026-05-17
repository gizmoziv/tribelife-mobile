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

type ChevraWideTileProps = {
  eyebrow: string;
  title: string;
  body: string;
  footer?: string;
  glyph: React.ReactNode;
  accent: string;
  onPress?: () => void;
};

export function ChevraWideTile({
  eyebrow,
  title,
  body,
  footer,
  glyph,
  accent,
  onPress,
}: ChevraWideTileProps) {
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
        pressed ? { opacity: 0.9 } : null,
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
          end={{ x: 0.5, y: 0.5 }}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />

        <View style={styles.row}>
          <View style={[styles.glyphHolder, { backgroundColor: accent + '22' }]}>
            {glyph}
          </View>
          <View style={styles.textCol}>
            <Text style={[styles.eyebrow, { color: mutedColor }]} numberOfLines={1}>
              {eyebrow.toUpperCase()}
            </Text>
            <Text style={[styles.title, { color: labelColor }]} numberOfLines={1}>
              {title}
            </Text>
            <Text style={[styles.body, { color: mutedColor }]} numberOfLines={2}>
              {body}
            </Text>
            {footer ? (
              <Text style={[styles.footer, { color: accent }]} numberOfLines={1}>
                {footer}
              </Text>
            ) : null}
          </View>
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
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 20,
  },
  glyphHolder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: {
    flex: 1,
    gap: 4,
  },
  eyebrow: {
    fontFamily: FONTS.semiBold,
    fontSize: 10,
    letterSpacing: 1.2,
  },
  title: {
    fontFamily: FONTS.semiBold,
    fontSize: 16,
    marginTop: 2,
  },
  body: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  footer: {
    fontFamily: FONTS.semiBold,
    fontSize: 11,
    letterSpacing: 0.4,
    marginTop: 6,
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
