import React, { useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Animated,
  PanResponder,
  TouchableOpacity,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { FONTS } from '@/constants';

// ── Constants ─────────────────────────────────────────────────────────────
const BUTTON_WIDTH = 80;
// Swipe LEFT past this px → snap open (reveal button)
const OPEN_THRESHOLD = 60;
// Swipe RIGHT past this px while open → snap closed
const CLOSE_THRESHOLD = 20;

// ── Props ─────────────────────────────────────────────────────────────────
interface SwipeableChatRowProps {
  children: React.ReactNode;
  /** When false the row renders with no gesture and no button (room-type rows). */
  enabled: boolean;
  /** Label on the action button: "Archive" or "Unarchive". */
  actionLabel: string;
  /** Called when the user taps the action button. */
  onAction: () => void;
  /** Opaque background for the sliding row so the button stays hidden at rest. */
  backgroundColor: string;
}

// ── Component ─────────────────────────────────────────────────────────────
export function SwipeableChatRow({
  children,
  enabled,
  actionLabel,
  onAction,
  backgroundColor,
}: SwipeableChatRowProps) {
  // Pass-through for non-archivable rows (local_chat, town_square, etc.)
  if (!enabled) {
    return <>{children}</>;
  }

  return (
    <SwipeableChatRowInner
      actionLabel={actionLabel}
      onAction={onAction}
      backgroundColor={backgroundColor}
    >
      {children}
    </SwipeableChatRowInner>
  );
}

// Inner component holds the animated state — split out so the refs/responder
// are only created when enabled is true (avoids dead ref allocations).
function SwipeableChatRowInner({
  children,
  actionLabel,
  onAction,
  backgroundColor,
}: {
  children: React.ReactNode;
  actionLabel: string;
  onAction: () => void;
  backgroundColor: string;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  // Tracks whether the row is currently snapped open
  const isOpen = useRef(false);
  const isHorizontalSwipe = useRef(false);

  const snapOpen = () => {
    isOpen.current = true;
    Animated.spring(translateX, {
      toValue: -BUTTON_WIDTH,
      damping: 20,
      stiffness: 200,
      useNativeDriver: true,
    }).start();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const snapClosed = () => {
    isOpen.current = false;
    Animated.spring(translateX, {
      toValue: 0,
      damping: 20,
      stiffness: 200,
      useNativeDriver: true,
    }).start();
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, gestureState) => {
        // Claim the gesture only when clearly horizontal (2:1 ratio, min 10px)
        // and the direction is: left (negative dx) when closed, or right when open.
        const isHorizontal =
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 2 &&
          Math.abs(gestureState.dx) > 10;
        isHorizontalSwipe.current = isHorizontal;
        if (!isHorizontal) return false;
        // When closed: only claim left swipes
        if (!isOpen.current && gestureState.dx < 0) return true;
        // When open: only claim right swipes (to close)
        if (isOpen.current && gestureState.dx > 0) return true;
        return false;
      },
      onPanResponderGrant: () => {
        isHorizontalSwipe.current = true;
      },
      onPanResponderMove: (_evt, gestureState) => {
        if (!isHorizontalSwipe.current) return;
        // Offset relative to the open/closed base position
        const base = isOpen.current ? -BUTTON_WIDTH : 0;
        // Clamp to [-BUTTON_WIDTH, 0]
        const newVal = Math.min(0, Math.max(base + gestureState.dx, -BUTTON_WIDTH));
        translateX.setValue(newVal);
      },
      onPanResponderRelease: (_evt, gestureState) => {
        if (!isHorizontalSwipe.current) return;
        const base = isOpen.current ? -BUTTON_WIDTH : 0;
        const finalPos = base + gestureState.dx;

        if (!isOpen.current) {
          // Currently closed: open if swiped far enough left
          if (finalPos <= -OPEN_THRESHOLD) {
            snapOpen();
          } else {
            snapClosed();
          }
        } else {
          // Currently open: close if swiped far enough right
          if (finalPos >= -BUTTON_WIDTH + CLOSE_THRESHOLD) {
            snapClosed();
          } else {
            snapOpen();
          }
        }
        isHorizontalSwipe.current = false;
      },
      onPanResponderTerminate: () => {
        // Revert to current snapped position
        Animated.spring(translateX, {
          toValue: isOpen.current ? -BUTTON_WIDTH : 0,
          useNativeDriver: true,
        }).start();
        isHorizontalSwipe.current = false;
      },
    })
  ).current;

  const handleAction = () => {
    snapClosed();
    onAction();
  };

  return (
    <View style={styles.container}>
      {/* Action button sits absolutely on the right, revealed by left swipe */}
      <View style={styles.actionButton}>
        <TouchableOpacity
          style={styles.actionButtonInner}
          onPress={handleAction}
          activeOpacity={0.8}
        >
          <Text style={styles.actionButtonText}>{actionLabel}</Text>
        </TouchableOpacity>
      </View>

      {/* Row content slides left to reveal the button. Opaque background so the
          button stays fully hidden behind the row at rest (chat rows themselves
          use a translucent glass fill that would let the button show through). */}
      <Animated.View
        {...panResponder.panHandlers}
        style={{ backgroundColor, transform: [{ translateX }] }}
      >
        {children}
      </Animated.View>
    </View>
  );
}

export default SwipeableChatRow;

// ── Styles ────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'hidden',
  },
  actionButton: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: BUTTON_WIDTH,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionButtonInner: {
    // Fill the full height of the parent so the tap target is generous
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: BUTTON_WIDTH,
    backgroundColor: 'rgba(129, 140, 248, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontFamily: FONTS.semiBold,
    fontSize: 14,
  },
});
