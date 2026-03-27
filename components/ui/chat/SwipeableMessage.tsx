import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/contexts/ThemeContext';
import { FONTS } from '@/constants';

const SWIPE_THRESHOLD = 80;
const MAX_SWIPE = 100;

interface SwipeableMessageProps {
  children: React.ReactNode;
  onSwipeComplete: () => void;
  enabled?: boolean;
}

export function SwipeableMessage({
  children,
  onSwipeComplete,
  enabled = true,
}: SwipeableMessageProps) {
  const { colors } = useTheme();
  const translateX = useSharedValue(0);
  const hasTriggered = useSharedValue(false);

  const triggerHapticAndCallback = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onSwipeComplete();
  };

  const panGesture = Gesture.Pan()
    .activeOffsetX([10, 10000])
    .onUpdate((event) => {
      // Only allow right swipe (positive X)
      const clampedX = Math.min(Math.max(event.translationX, 0), MAX_SWIPE);
      translateX.value = clampedX;

      // Trigger when threshold crossed
      if (clampedX >= SWIPE_THRESHOLD && !hasTriggered.value) {
        hasTriggered.value = true;
        runOnJS(triggerHapticAndCallback)();
      }
    })
    .onEnd(() => {
      translateX.value = withSpring(0, { damping: 20, stiffness: 200 });
      hasTriggered.value = false;
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const replyIconStyle = useAnimatedStyle(() => ({
    opacity: Math.min(translateX.value / SWIPE_THRESHOLD, 1),
  }));

  if (!enabled) {
    return <>{children}</>;
  }

  return (
    <View style={styles.container}>
      {/* Reply icon behind the message */}
      <Animated.View style={[styles.replyIconContainer, replyIconStyle]}>
        <Text style={[styles.replyIcon, { color: colors.primary }]}>&#x21A9;</Text>
      </Animated.View>

      <GestureDetector gesture={panGesture}>
        <Animated.View style={animatedStyle}>
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

export default SwipeableMessage;

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  replyIconContainer: {
    position: 'absolute',
    left: 8,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    zIndex: -1,
  },
  replyIcon: {
    fontSize: 20,
    fontFamily: FONTS.medium,
  },
});
