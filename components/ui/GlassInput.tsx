import React, { useState, useRef } from 'react';
import {
  View,
  TextInput,
  Text,
  Animated,
  TextInputProps,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { COLORS, FONTS, RADIUS, SHADOWS } from '@/constants';

interface GlassInputProps extends TextInputProps {
  label?: string;
  glowOnFocus?: boolean;
  glowColor?: string;
  containerStyle?: ViewStyle;
  // Overrides for screens with a fixed (non-theme-following) background, e.g.
  // the auth flow's dark gradient — same idea as `glowColor` above. Omit to
  // keep the default theme-following behavior.
  backgroundColor?: string;
  unfocusedBorderColor?: string;
  textColor?: string;
  placeholderColor?: string;
}

export function GlassInput({
  label,
  glowOnFocus = true,
  glowColor = COLORS.accent,
  containerStyle,
  style,
  backgroundColor,
  unfocusedBorderColor,
  textColor,
  placeholderColor,
  ...inputProps
}: GlassInputProps) {
  const { colors } = useTheme();
  const [isFocused, setIsFocused] = useState(false);
  const glowAnim = useRef(new Animated.Value(0)).current;

  const handleFocus = (e: any) => {
    setIsFocused(true);
    if (glowOnFocus) {
      Animated.timing(glowAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: false,
      }).start();
    }
    inputProps.onFocus?.(e);
  };

  const handleBlur = (e: any) => {
    setIsFocused(false);
    Animated.timing(glowAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
    inputProps.onBlur?.(e);
  };

  const baseBorderColor = unfocusedBorderColor ?? colors.border;
  const borderColor = glowOnFocus
    ? glowAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [baseBorderColor, glowColor],
      })
    : baseBorderColor;

  return (
    <View style={containerStyle}>
      {label && (
        <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
      )}
      <Animated.View
        style={[
          styles.container,
          {
            backgroundColor: backgroundColor ?? colors.surfaceGlass,
            borderColor,
          },
          isFocused && glowOnFocus ? {
            ...SHADOWS.sm,
            shadowColor: glowColor,
            shadowOpacity: 0.2,
          } : {},
        ]}
      >
        <TextInput
          {...inputProps}
          style={[
            styles.input,
            { color: textColor ?? colors.text, fontFamily: FONTS.regular },
            style,
          ]}
          placeholderTextColor={placeholderColor ?? colors.textMuted}
          onFocus={handleFocus}
          onBlur={handleBlur}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 12,
    fontFamily: FONTS.medium,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  container: {
    borderWidth: 1,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
  },
  input: {
    padding: 14,
    fontSize: 15,
  },
});

export default GlassInput;
