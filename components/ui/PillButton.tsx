import React, { useRef } from 'react';
import {
  Pressable,
  Text,
  Animated,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  StyleSheet,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { COLORS, FONTS, SHADOWS } from '@/constants';

type Variant = 'primary' | 'accent' | 'outline' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

interface PillButtonProps {
  title: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

const SIZE_STYLES = {
  sm: { paddingVertical: 8, paddingHorizontal: 16, fontSize: 13 },
  md: { paddingVertical: 14, paddingHorizontal: 24, fontSize: 15 },
  lg: { paddingVertical: 18, paddingHorizontal: 32, fontSize: 17 },
} as const;

const GRADIENT_COLORS = {
  primary: COLORS.gradientPrimary,
  accent: COLORS.gradientAccent,
} as const;

export function PillButton({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  style,
  textStyle,
}: PillButtonProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const sizeStyle = SIZE_STYLES[size];

  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue: 0.96,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  };

  const handlePress = () => {
    if (disabled || loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  const isGradient = variant === 'primary' || variant === 'accent';
  const textColor = variant === 'accent' ? '#0F172A' : variant === 'outline' || variant === 'ghost' ? COLORS.primary : '#FFFFFF';

  const buttonContent = (
    <>
      {loading ? (
        <ActivityIndicator color={textColor} size="small" />
      ) : (
        <>
          {icon && <>{icon}</>}
          <Text
            style={[
              styles.text,
              { fontSize: sizeStyle.fontSize, color: textColor },
              textStyle,
            ]}
          >
            {title}
          </Text>
        </>
      )}
    </>
  );

  const baseContainerStyle: ViewStyle = {
    borderRadius: 9999,
    paddingVertical: sizeStyle.paddingVertical,
    paddingHorizontal: sizeStyle.paddingHorizontal,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    opacity: disabled ? 0.5 : 1,
    ...(variant === 'outline' ? {
      borderWidth: 1.5,
      borderColor: COLORS.primary,
    } : {}),
    ...(isGradient ? SHADOWS.md : {}),
  };

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled || loading}
      >
        {isGradient ? (
          <LinearGradient
            colors={[...GRADIENT_COLORS[variant as 'primary' | 'accent']]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={baseContainerStyle}
          >
            {buttonContent}
          </LinearGradient>
        ) : (
          <Animated.View style={baseContainerStyle}>
            {buttonContent}
          </Animated.View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  text: {
    fontFamily: FONTS.semiBold,
  },
});

export default PillButton;
