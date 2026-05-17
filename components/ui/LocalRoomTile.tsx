import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import {
  COLORS,
  REGION_TILE_GRADIENT_DARK,
  REGION_TILE_GRADIENT_LIGHT,
  SHADOWS,
} from '@/constants';
import { useTheme } from '@/contexts/ThemeContext';

type LocalRoomTileProps = {
  size?: number;
  showRing?: boolean;
};

export function LocalRoomTile({ size = 44, showRing = true }: LocalRoomTileProps) {
  const { isDark, colors } = useTheme();

  const gradient = isDark ? REGION_TILE_GRADIENT_DARK : REGION_TILE_GRADIENT_LIGHT;
  const glyphColor = isDark ? '#FFFFFF' : '#1F2940';
  const glyphSize = Math.round(size * 0.5);

  const tile = (
    <LinearGradient
      colors={[gradient[0], gradient[1]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.tile,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <LinearGradient
        colors={[
          isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.55)',
          'rgba(255,255,255,0)',
        ]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.55 }}
        style={[StyleSheet.absoluteFillObject, { borderRadius: size / 2 }]}
        pointerEvents="none"
      />

      <Svg width={glyphSize} height={glyphSize} viewBox="0 0 24 24" fill="none">
        <Path
          d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
          stroke={glyphColor}
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
      </Svg>
    </LinearGradient>
  );

  if (!showRing) {
    return (
      <View style={[styles.shadowWrap, { width: size, height: size, borderRadius: size / 2 }]}>
        {tile}
      </View>
    );
  }

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
          }}
        >
          {tile}
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  shadowWrap: {
    ...SHADOWS.sm,
  },
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
