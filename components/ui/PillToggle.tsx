import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  Animated,
  ViewStyle,
  StyleSheet,
  LayoutChangeEvent,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/contexts/ThemeContext';
import { COLORS, FONTS } from '@/constants';

interface PillToggleProps {
  options: string[];
  activeIndex: number;
  onSelect: (index: number) => void;
  activeColor?: string;
  style?: ViewStyle;
}

export function PillToggle({
  options,
  activeIndex,
  onSelect,
  activeColor = COLORS.primary,
  style,
}: PillToggleProps) {
  const { colors } = useTheme();
  const translateX = useRef(new Animated.Value(0)).current;
  const widthRef = useRef(0);

  useEffect(() => {
    const segmentWidth = widthRef.current / options.length;
    Animated.spring(translateX, {
      toValue: activeIndex * segmentWidth,
      useNativeDriver: true,
      speed: 20,
      bounciness: 8,
    }).start();
  }, [activeIndex, options.length]);

  const handleLayout = (e: LayoutChangeEvent) => {
    widthRef.current = e.nativeEvent.layout.width;
    const segmentWidth = e.nativeEvent.layout.width / options.length;
    translateX.setValue(activeIndex * segmentWidth);
  };

  const handleSelect = (index: number) => {
    if (index === activeIndex) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSelect(index);
  };

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.surfaceGlass },
        style,
      ]}
      onLayout={handleLayout}
    >
      <Animated.View
        style={[
          styles.indicator,
          {
            backgroundColor: activeColor,
            width: `${100 / options.length}%` as any,
            transform: [{ translateX }],
          },
        ]}
      />
      {options.map((option, index) => (
        <Pressable
          key={option}
          style={styles.option}
          onPress={() => handleSelect(index)}
        >
          <Text
            style={[
              styles.optionText,
              {
                color: index === activeIndex ? '#FFFFFF' : colors.textMuted,
                fontFamily: index === activeIndex ? FONTS.semiBold : FONTS.medium,
              },
            ]}
          >
            {option}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: 9999,
    padding: 4,
    position: 'relative',
  },
  indicator: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    borderRadius: 9999,
  },
  option: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  optionText: {
    fontSize: 14,
  },
});

export default PillToggle;
