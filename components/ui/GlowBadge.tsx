import React from 'react';
import { View, Text, ViewStyle, StyleSheet } from 'react-native';
import { COLORS, FONTS } from '@/constants';

interface GlowBadgeProps {
  text: string;
  color?: string;
  glow?: boolean;
  size?: 'sm' | 'md';
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function GlowBadge({
  text,
  color = COLORS.accent,
  glow = false,
  size = 'md',
}: GlowBadgeProps) {
  const isSmall = size === 'sm';

  const containerStyle: ViewStyle = {
    backgroundColor: hexToRgba(color, 0.12),
    borderRadius: 9999,
    paddingHorizontal: isSmall ? 8 : 12,
    paddingVertical: isSmall ? 2 : 4,
    alignSelf: 'flex-start',
    ...(glow ? {
      shadowColor: color,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.4,
      shadowRadius: 12,
      elevation: 4,
    } : {}),
  };

  return (
    <View style={containerStyle}>
      <Text
        style={{
          color,
          fontSize: isSmall ? 10 : 12,
          fontFamily: FONTS.semiBold,
        }}
      >
        {text}
      </Text>
    </View>
  );
}

export default GlowBadge;
