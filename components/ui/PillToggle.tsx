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
  // Optional unread count per pill — aligns 1:1 with `options`. 0/undefined
  // hides the badge. Used by ChatScreen to surface DM vs local unread counts
  // on the per-panel pills so users see activity in the inactive tab.
  badges?: (number | undefined)[];
  // Reduced vertical padding + font size variant. Used on the Chats screen
  // filter bar where the pills sit between the search input and the list
  // and need to take less vertical real-estate than the default tab-style
  // use of this component on org / beacon / chat-panel screens.
  compact?: boolean;
}

export function PillToggle({
  options,
  activeIndex,
  onSelect,
  activeColor = COLORS.primary,
  style,
  badges,
  compact = false,
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
        compact && styles.containerCompact,
        { backgroundColor: colors.surfaceGlass },
        style,
      ]}
      onLayout={handleLayout}
    >
      <Animated.View
        style={[
          styles.indicator,
          compact && styles.indicatorCompact,
          {
            backgroundColor: activeColor,
            width: `${100 / options.length}%` as any,
            transform: [{ translateX }],
          },
        ]}
      />
      {options.map((option, index) => {
        const badgeCount = badges?.[index] ?? 0;
        return (
          <Pressable
            key={option}
            style={[styles.option, compact && styles.optionCompact]}
            onPress={() => handleSelect(index)}
          >
            <Text
              style={[
                styles.optionText,
                compact && styles.optionTextCompact,
                {
                  color: index === activeIndex ? '#FFFFFF' : colors.textMuted,
                  fontFamily: index === activeIndex ? FONTS.semiBold : FONTS.medium,
                },
              ]}
            >
              {option}
            </Text>
            {badgeCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {badgeCount > 99 ? '99+' : badgeCount}
                </Text>
              </View>
            )}
          </Pressable>
        );
      })}
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
  containerCompact: {
    padding: 3,
  },
  indicator: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    borderRadius: 9999,
  },
  indicatorCompact: {
    top: 3,
    bottom: 3,
  },
  option: {
    flex: 1,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  optionCompact: {
    paddingVertical: 6,
  },
  optionText: {
    fontSize: 14,
  },
  optionTextCompact: {
    fontSize: 13,
  },
  badge: {
    marginLeft: 6,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9999,
    backgroundColor: COLORS.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontFamily: FONTS.bold,
  },
});

export default PillToggle;
