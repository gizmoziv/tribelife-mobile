import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Svg, { Path } from 'react-native-svg';
import { RADIUS, SHADOWS, COLORS } from '@/constants';

// ── Viber-style "scroll to newest" FAB ───────────────────────────────────────
// Floats above the composer once the user has scrolled away from the newest
// message; tapping jumps back to it. Deliberately always a solid brand-color
// circle (not theme/glass-derived) — it floats over arbitrary message bubble/
// image content behind it, so it needs guaranteed contrast in both themes,
// unlike the app's other floating chat overlays (date pill, header back
// pill) which sit over a known, solid background.
export interface ScrollToBottomButtonProps {
  visible: boolean;
  onPress: () => void;
  bottom?: number;
}

export function ScrollToBottomButton({ visible, onPress, bottom = 88 }: ScrollToBottomButtonProps) {
  if (!visible) return null;
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      hitSlop={10}
      style={[styles.wrapper, { bottom }]}
    >
      {({ pressed }) => (
        <View style={[styles.button, SHADOWS.md, { opacity: pressed ? 0.85 : 1 }]}>
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
            <Path
              d="M6 9l6 6 6-6"
              stroke="#FFF"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </View>
      )}
    </Pressable>
  );
}

export default ScrollToBottomButton;

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    right: 16,
    zIndex: 10,
  },
  button: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
