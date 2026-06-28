import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { COLORS } from '@/constants';
import type { useTheme } from '@/contexts/ThemeContext';
import type { ReceiptTick } from '@/types';

// ThemeColors is not exported from ThemeContext; derive it from useTheme's
// return so the tick color stays in lockstep with the theme without an
// out-of-scope export change.
type ThemeColors = ReturnType<typeof useTheme>['colors'];

// ── Phase 29: MessageTicks (D-02) ───────────────────────────────────────────
// Pure presentational read-receipt tick. Renders the three-rung ladder; the
// derivation (which rung) lives in MessageBubble (Task 2), never here.
//
//   'none'      → nothing (received messages, rooms, or ineligible)
//   'sent'      → single ✓  (server-stored, not yet delivered)
//   'delivered' → double ✓✓ in colors.textMuted (theme grey)
//   'read'      → double ✓✓ in COLORS.primary (brand accent — NOT WhatsApp blue)
//
// Single-vs-double carries Sent→Delivered; color carries Delivered→Read (D-02).
// Glyphs are Unicode in <Text>, theme-aware via the passed `colors` object so
// the grey Delivered rung tracks light/dark mode.

interface MessageTicksProps {
  status: ReceiptTick;
  colors: ThemeColors;
}

export function MessageTicks({ status, colors }: MessageTicksProps) {
  if (status === 'none') return null;

  const glyph = status === 'sent' ? '✓' : '✓✓';
  const isRead = status === 'read';
  // Read must be unmistakably distinct from Delivered. The brand indigo
  // (#818CF8) sits too close to the muted blue-grey timestamp tone (#7A8BA8) to
  // read as "changed" at this size — so Read gets a brighter, more saturated
  // accent AND heavier weight, while Sent/Delivered stay dim + light.
  const color = isRead ? READ_COLOR : colors.textMuted;

  return (
    <Text
      style={[
        styles.ticks,
        { color, fontWeight: isRead ? '800' : '400', opacity: isRead ? 1 : 0.65 },
      ]}
      accessibilityLabel={`Message ${status}`}
    >
      {glyph}
    </Text>
  );
}

// Bright, saturated "read/seen" accent — deliberately distinct from the muted
// blue-grey Delivered tone. Brand-aligned (emerald confirmation), not WhatsApp
// blue. Tweak here if a different read cue is preferred.
const READ_COLOR = COLORS.secondary; // #34D399 emerald

export default MessageTicks;

const styles = StyleSheet.create({
  ticks: {
    fontSize: 11,
    marginLeft: 4,
    // Tighten the double-tick so ✓✓ reads as one mark rather than two spaced
    // checks (Android kerns the pair loosely otherwise).
    letterSpacing: -1.5,
  },
});
