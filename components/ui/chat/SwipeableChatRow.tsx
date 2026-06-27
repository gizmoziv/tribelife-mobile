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
import Svg, { Path } from 'react-native-svg';
import { FONTS } from '@/constants';

// ── Constants ─────────────────────────────────────────────────────────────
const BUTTON_WIDTH = 80;
const TOTAL_WIDTH = 160;
// Swipe LEFT past this px → snap open (reveal buttons)
const OPEN_THRESHOLD = 60;
// Swipe RIGHT past this px while open → snap closed
const CLOSE_THRESHOLD = 20;

// ── Inline icon ───────────────────────────────────────────────────────────
function BellOffIcon({ size = 20, color = '#FFFFFF' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M13.73 21a2 2 0 01-3.46 0M18.63 13A17.89 17.89 0 0118 8M6.26 6.26A5.86 5.86 0 006 8c0 7-3 9-3 9h14M18 8a6 6 0 00-9.33-5M1 1l22 22"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────
interface SwipeableChatRowProps {
  children: React.ReactNode;
  /** When false the row renders with no gesture and no button (room-type rows). */
  enabled: boolean;
  /** Label on the archive action button: "Archive" or "Unarchive". */
  actionLabel: string;
  /** Called when the user taps the archive action button. */
  onAction: () => void;
  /** Label on the mute action button: "Mute" or "Unmute". */
  muteLabel: string;
  /** Called when the user taps the mute action button. */
  onMuteAction: () => void;
  /** Opaque background for the sliding row so the button stays hidden at rest. */
  backgroundColor: string;
}

// ── Component ─────────────────────────────────────────────────────────────
export function SwipeableChatRow({
  children,
  enabled,
  actionLabel,
  onAction,
  muteLabel,
  onMuteAction,
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
      muteLabel={muteLabel}
      onMuteAction={onMuteAction}
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
  muteLabel,
  onMuteAction,
  backgroundColor,
}: {
  children: React.ReactNode;
  actionLabel: string;
  onAction: () => void;
  muteLabel: string;
  onMuteAction: () => void;
  backgroundColor: string;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  // Tracks whether the row is currently snapped open
  const isOpen = useRef(false);
  const isHorizontalSwipe = useRef(false);

  const snapOpen = () => {
    isOpen.current = true;
    Animated.spring(translateX, {
      toValue: -TOTAL_WIDTH,
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
        const base = isOpen.current ? -TOTAL_WIDTH : 0;
        // Clamp to [-TOTAL_WIDTH, 0]
        const newVal = Math.min(0, Math.max(base + gestureState.dx, -TOTAL_WIDTH));
        translateX.setValue(newVal);
      },
      onPanResponderRelease: (_evt, gestureState) => {
        if (!isHorizontalSwipe.current) return;
        const base = isOpen.current ? -TOTAL_WIDTH : 0;
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
          if (finalPos >= -TOTAL_WIDTH + CLOSE_THRESHOLD) {
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
          toValue: isOpen.current ? -TOTAL_WIDTH : 0,
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

  const handleMuteAction = () => {
    snapClosed();
    onMuteAction();
  };

  return (
    <View style={styles.container}>
      {/* Two-button reveal sits absolutely on the right, revealed by left swipe.
          Inner (left) = Mute (slate); outer (right) = Archive (indigo). */}
      <View style={styles.actionButton}>
        {/* Mute button — inner (left), slate fill */}
        <TouchableOpacity
          style={styles.muteButtonInner}
          onPress={handleMuteAction}
          activeOpacity={0.8}
        >
          <BellOffIcon size={20} color="#FFFFFF" />
          <Text style={styles.actionButtonText}>{muteLabel}</Text>
        </TouchableOpacity>
        {/* Archive button — outer (right), indigo fill */}
        <TouchableOpacity
          style={styles.actionButtonInner}
          onPress={handleAction}
          activeOpacity={0.8}
        >
          <Text style={styles.actionButtonText}>{actionLabel}</Text>
        </TouchableOpacity>
      </View>

      {/* Row content slides left to reveal the buttons. Opaque background so the
          buttons stay fully hidden behind the row at rest (chat rows themselves
          use a translucent glass fill that would let the buttons show through). */}
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
    width: TOTAL_WIDTH,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  muteButtonInner: {
    // Fill the full height of the parent so the tap target is generous
    position: 'absolute',
    right: BUTTON_WIDTH,
    top: 0,
    bottom: 0,
    width: BUTTON_WIDTH,
    backgroundColor: 'rgba(100, 116, 139, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'column',
    gap: 4,
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
