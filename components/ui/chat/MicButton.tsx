import React from 'react';
import { Pressable, Platform, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Svg, { Path } from 'react-native-svg';
import { COLORS, SHADOWS } from '@/constants';

// ── Mic Button (composer send-slot swap) ─────────────────────────────────────
// Drop-in replacement for the existing send button (local.tsx styles.sendButton):
// a 44×44 gradientPrimary circle. The host swaps this into the send slot when the
// composer is empty (host wiring lands in 26-04). Tapping it mounts the
// RecordingBar; permission gating lives in RecordingBar, not here.
//
// `disabled` reserves the future canSendVoiceMessages gate (recording only —
// playback is never gated). At launch the host passes disabled={false} (D-10).

function MicIcon() {
  // Lucide `mic` — 20×20 white stroke, project inline-SVG convention.
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"
        stroke="#FFF"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3"
        stroke="#FFF"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export interface MicButtonProps {
  onPress: () => void;
  disabled?: boolean;
}

export function MicButton({ onPress, disabled = false }: MicButtonProps) {
  const handlePress = () => {
    if (disabled) return;
    // Matches handleSend's haptic in the existing composers.
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel="Record voice message"
      style={({ pressed }) => [{ opacity: disabled ? 0.4 : pressed ? 0.8 : 1 }]}
    >
      <LinearGradient colors={[...COLORS.gradientPrimary]} style={styles.micButton}>
        <MicIcon />
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  micButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.md,
    // Match iOS: drop Android's Material elevation halo (same idiom as
    // local.tsx styles.sendButton).
    ...(Platform.OS === 'android' ? { elevation: 0 } : {}),
  },
});

export default MicButton;
