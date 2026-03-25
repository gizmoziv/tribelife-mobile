import React from 'react';
import { View, ViewStyle, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from '@/contexts/ThemeContext';
import { SHADOWS, RADIUS } from '@/constants';

interface GlassCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  glowColor?: string;
  intensity?: number;
  borderRadius?: number;
  useBlur?: boolean;
}

export function GlassCard({
  children,
  style,
  glowColor,
  intensity = 40,
  borderRadius = RADIUS.lg,
  useBlur = false,
}: GlassCardProps) {
  const { colors } = useTheme();

  const containerStyle: ViewStyle = {
    backgroundColor: colors.surfaceGlass,
    borderWidth: 1,
    borderColor: glowColor ?? colors.border,
    borderRadius,
    overflow: 'hidden',
    ...SHADOWS.lg,
    ...(glowColor ? {
      shadowColor: glowColor,
      shadowOpacity: 0.3,
      shadowRadius: 16,
    } : {}),
    ...style,
  };

  if (useBlur) {
    return (
      <View style={containerStyle}>
        <BlurView intensity={intensity} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={styles.content}>{children}</View>
      </View>
    );
  }

  return (
    <View style={containerStyle}>
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
  },
});

export default GlassCard;
