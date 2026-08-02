import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, FONTS, SPACING, RADIUS } from '@/constants';

export interface AccessBlockScreenProps {
  status: 'pending' | 'rejected';
}

/**
 * Phase 35 full-block gate UI (D-13/D-14/D-15).
 *
 * Renders directly inside the root layout's gate — ABOVE <Stack>, not as a
 * Modal — so no route mounts behind it. This is a UX gate only; Phase 34 owns
 * the actual server-side enforcement (D-20). Copy-only: no navigation import,
 * no touchable/button/link anywhere in this file (that is what makes the
 * block full and static — D-15). Uses COLORS.* directly rather than
 * useTheme()-resolved colors because it renders inside the same fixed dark
 * gradient as the auth screens (Pitfall 4 — theme-resolved text renders
 * near-black on near-black in light mode).
 */
export function AccessBlockScreen({ status }: AccessBlockScreenProps): React.ReactElement {
  const copy = status === 'pending'
    ? {
        title: 'Your application is under review',
        body: "Thanks for applying to TribeLife. A real person reviews every request. We'll email you as soon as there's a decision.",
      }
    : {
        title: "We couldn't approve your request",
        body: "We're not able to give you access to TribeLife right now. Check your email for the details — replying to that message is the best way to reach us.",
      };

  return (
    <LinearGradient colors={[...COLORS.gradientBackground]} style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.brand}>TribeLife</Text>
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.body}>{copy.body}</Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
  },
  content: {
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
    padding: SPACING.lg,
    borderRadius: RADIUS.lg,
  },
  brand: {
    fontFamily: FONTS.bold,
    fontSize: 28,
    color: COLORS.primary,
    marginBottom: SPACING.xl,
    letterSpacing: 0.5,
  },
  title: {
    fontFamily: FONTS.bold,
    fontSize: 24,
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  body: {
    fontFamily: FONTS.regular,
    fontSize: 16,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 24,
  },
});

export default AccessBlockScreen;
