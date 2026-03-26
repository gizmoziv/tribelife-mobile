import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/contexts/ThemeContext';
import { COLORS, FONTS } from '@/constants';

const AVATAR_COLORS = [
  '#818CF8', '#34D399', '#F59E0B', '#FB7185',
  '#A78BFA', '#2DD4BF', '#FBBF24', '#F472B6',
  '#60A5FA', '#4ADE80', '#F97316', '#E879F9',
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
