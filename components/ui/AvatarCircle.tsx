import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/contexts/ThemeContext';
import { COLORS, FONTS } from '@/constants';

const AVATAR_COLORS = [
  '#E53E3E', // red
  '#38A169', // green
  '#3182CE', // blue
  '#D69E2E', // gold
  '#805AD5', // purple
  '#DD6B20', // orange
  '#319795', // teal
  '#D53F8C', // pink
  '#2B6CB0', // navy
  '#C05621', // brown
  '#00B5D8', // cyan
  '#9F7AEA', // violet
  '#276749', // forest
  '#E53E9F', // magenta
  '#B7791F', // amber
  '#2C7A7B', // dark teal
  '#6B46C1', // deep purple
  '#C53030', // crimson
  '#2F855A', // emerald
  '#4C51BF', // indigo
  '#ED8936', // tangerine
  '#667EEA', // periwinkle
  '#48BB78', // lime green
  '#ED64A6', // hot pink
  '#4FD1C5', // aqua
  '#F56565', // coral
  '#68D391', // mint
  '#FC8181', // salmon
  '#76E4F7', // sky blue
  '#F6AD55', // peach
  '#B794F4', // lavender
  '#63B3ED', // steel blue
  '#FBD38D', // sand
  '#F687B3', // rose
  '#81E6D9', // seafoam
  '#FEB2B2', // blush
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

interface AvatarCircleProps {
  name: string;
  size?: number;
  imageUrl?: string;
  showRing?: boolean;
}

export function AvatarCircle({
  name,
  size = 44,
  imageUrl,
  showRing = true,
}: AvatarCircleProps) {
  const { colors } = useTheme();
  const ringWidth = 2;
  const outerSize = showRing ? size + ringWidth * 2 + 4 : size;
  const letter = name.charAt(0).toUpperCase();

  const avatar = imageUrl ? (
    <Image
      source={{ uri: imageUrl }}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
      }}
    />
  ) : (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: getAvatarColor(name),
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          fontSize: size * 0.4,
          fontFamily: FONTS.semiBold,
          color: colors.text,
        }}
      >
        {letter}
      </Text>
    </View>
  );

  if (!showRing) return avatar;

  return (
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
        {avatar}
      </View>
    </LinearGradient>
  );
}

export default AvatarCircle;
