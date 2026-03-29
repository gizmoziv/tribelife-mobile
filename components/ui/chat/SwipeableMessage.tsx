import React, { useRef } from 'react';
import { StyleSheet, View, Text, Animated, PanResponder } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/contexts/ThemeContext';
import { FONTS } from '@/constants';

const SWIPE_THRESHOLD = 60;
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
  const translateX = useRef(new Animated.Value(0)).current;
  const hasTriggered = useRef(false);
  const isHorizontalSwipe = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, gestureState) => {
        // Only claim the gesture if clearly horizontal (2:1 ratio)
        const isHorizontal = Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 2
          && Math.abs(gestureState.dx) > 10;
        isHorizontalSwipe.current = isHorizontal;
        return isHorizontal && gestureState.dx > 0; // right swipe only
      },
      onPanResponderGrant: () => {
        hasTriggered.current = false;
      },
      onPanResponderMove: (_evt, gestureState) => {
        if (!isHorizontalSwipe.current) return;
        const clampedX = Math.min(Math.max(gestureState.dx, 0), MAX_SWIPE);
        translateX.setValue(clampedX);

        if (clampedX >= SWIPE_THRESHOLD && !hasTriggered.current) {
          hasTriggered.current = true;
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onSwipeComplete();
        }
      },
      onPanResponderRelease: () => {
        Animated.spring(translateX, {
          toValue: 0,
          damping: 20,
          stiffness: 200,
          useNativeDriver: true,
        }).start();
        isHorizontalSwipe.current = false;
        hasTriggered.current = false;
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
        isHorizontalSwipe.current = false;
        hasTriggered.current = false;
      },
    })
  ).current;

  const replyOpacity = translateX.interpolate({
    inputRange: [0, SWIPE_THRESHOLD],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  if (!enabled) {
    return <>{children}</>;
  }

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.replyIconContainer, { opacity: replyOpacity }]}>
        <Text style={[styles.replyIcon, { color: colors.primary }]}>&#x21A9;</Text>
      </Animated.View>

      <Animated.View
        {...panResponder.panHandlers}
        style={{ transform: [{ translateX }] }}
      >
        {children}
      </Animated.View>
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
