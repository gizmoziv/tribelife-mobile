import React, { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams } from 'expo-router';
import { useAuthStore } from '@/store/authStore';
import { accessApi, auth } from '@/services/api';
import type { SocialEntry } from '@/types';
import { FONTS, COLORS, SPACING, RADIUS } from '@/constants';
import { AnimatedEntry } from '@/components/ui/AnimatedEntry';
import { GlassCard } from '@/components/ui/GlassCard';
import { GlassInput } from '@/components/ui/GlassInput';
import { PillButton } from '@/components/ui/PillButton';
import { SocialsRepeater, isSocialEntryComplete } from '@/components/ui/SocialsRepeater';

const REASON_MAX_LENGTH = 1000;

type ReferralSource = 'handle_code' | 'profile_share' | 'group_invite' | 'manual_entry';

function isReferralSource(value: unknown): value is ReferralSource {
  return (
    value === 'handle_code' ||
    value === 'profile_share' ||
    value === 'group_invite' ||
    value === 'manual_entry'
  );
}

export default function ApplyForAccessScreen() {
  const user = useAuthStore((s) => s.user);
  const setAccessStatus = useAuthStore((s) => s.setAccessStatus);
  const refreshSession = useAuthStore((s) => s.refreshSession);
  const completeOnboarding = useAuthStore((s) => s.completeOnboarding);

  // Handed over by onboarding.tsx, which unmounts when it routes here.
  // Phase 36 (D-08): referralCode/referralSource ride along when the user's
  // referral needs the review path; params arrive as strings.
  const {
    handle: pendingHandle,
    timezone: pendingTimezone,
    referralCode: pendingReferralCode,
    referralSource: pendingReferralSourceRaw,
  } = useLocalSearchParams<{
    handle?: string;
    timezone?: string;
    referralCode?: string;
    referralSource?: string;
  }>();

  const pendingReferralSource = isReferralSource(pendingReferralSourceRaw)
    ? pendingReferralSourceRaw
    : undefined;

  const [reason, setReason] = useState('');
  const [socials, setSocials] = useState<SocialEntry[]>([{ platform: 'linkedin', handle: '' }]);
  const [submitting, setSubmitting] = useState(false);
  const [socialsError, setSocialsError] = useState<string | null>(null);

  const canSubmit =
    reason.trim().length > 0 &&
    socials.length > 0 &&
    socials.every(isSocialEntryComplete) &&
    !submitting;

  async function handleSubmit() {
    if (submitting) return;
    setSubmitting(true);
    setSocialsError(null);

    try {
      // ORDER IS LOAD-BEARING. The access request flips access_status to
      // 'pending' server-side FIRST; only then do we persist the handle, which
      // is what flips needsOnboarding false. Reversed — or persisted back on the
      // profile screen — a user would briefly be onboarded while access_status
      // is still NULL (the column has no default, and NULL means ungated
      // everywhere), and (auth)/_layout.tsx would replace the route with
      // /(app)/beacon, skipping the referral gate entirely.
      await accessApi.submitAccessRequest(
        reason.trim(),
        socials,
        pendingReferralCode || undefined,
        pendingReferralSource,
      );
      setAccessStatus('pending');

      // Persist the profile-form values carried over from onboarding.tsx, which
      // unmounted on navigation here. Without this the handle stays at the
      // account-creation placeholder (`_temp_{userId}`) forever, so an approved
      // applicant still reads as needing onboarding and is bounced back to the
      // profile screen on every launch.
      if (pendingHandle && pendingTimezone) {
        try {
          await auth.onboarding(pendingHandle, pendingTimezone, true);
          completeOnboarding({
            handle: pendingHandle,
            timezone: pendingTimezone,
            acceptedTermsAt: new Date().toISOString(),
          });
        } catch {
          // Non-fatal: the application itself is already in, and the user is
          // gated on 'pending' either way. They keep the placeholder handle and
          // are routed back to the profile screen once approved, which is the
          // pre-existing recovery path — far better than surfacing a failure
          // for an action that succeeded.
        }
      }

      await refreshSession();
      // No navigation here — the root-layout gate re-renders into the
      // pending block screen the moment the store flips (D-12, D-13).
    } catch {
      Alert.alert('Submission Failed', "We couldn't submit your application. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <LinearGradient colors={[...COLORS.gradientBackground]} style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          <AnimatedEntry style={styles.header}>
            <Text style={styles.title}>Apply for access</Text>
            <Text style={styles.subtitle}>
              {pendingReferralCode
                ? 'One more step. Tell us a bit about yourself and our team will review your request by hand.'
                : 'TribeLife is invite-based. Tell us a bit about yourself and our team will review your request by hand.'}
            </Text>
          </AnimatedEntry>

          <AnimatedEntry delay={100} style={styles.form}>
            {/* Email — read-only (D-08) */}
            <GlassCard
              style={{ ...styles.fieldSpacer, backgroundColor: COLORS.surfaceGlass, borderColor: COLORS.border }}
            >
              <View style={styles.emailRow}>
                <Text style={styles.emailLabel}>Email</Text>
                <Text style={styles.emailValue}>{user?.email}</Text>
              </View>
            </GlassCard>

            {/* Reason (D-09) */}
            <Text style={styles.fieldLabel}>Why do you want to join?</Text>
            <GlassInput
              value={reason}
              onChangeText={(text) => setReason(text.slice(0, REASON_MAX_LENGTH))}
              placeholder="Tell us why you'd like to join and who you know in the community"
              multiline
              numberOfLines={4}
              maxLength={REASON_MAX_LENGTH}
              editable={!submitting}
              style={styles.reasonInput}
              containerStyle={styles.fieldSpacer}
              backgroundColor={COLORS.surfaceGlass}
              unfocusedBorderColor={COLORS.border}
              textColor={COLORS.text}
              placeholderColor={COLORS.textMuted}
            />
            <Text style={styles.charCounter}>{reason.length}/{REASON_MAX_LENGTH}</Text>

            {/* Socials (D-10, D-11) */}
            <Text style={styles.fieldLabel}>Your socials</Text>
            <SocialsRepeater
              value={socials}
              onChange={setSocials}
              disabled={submitting}
              error={socialsError}
            />

            <PillButton
              title="Submit application"
              onPress={handleSubmit}
              variant="primary"
              size="lg"
              loading={submitting}
              disabled={!canSubmit}
              style={styles.submitButton}
            />
          </AnimatedEntry>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    padding: SPACING.page,
    paddingTop: 60,
    paddingBottom: SPACING['2xl'],
  },
  header: {
    // Matches the footprint of the onboarding profile step's icon block so
    // this title starts at the same height as "One last thing".
    paddingTop: 72 + SPACING.md,
    marginBottom: SPACING.xl,
  },
  title: {
    fontSize: 24,
    fontFamily: FONTS.bold,
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: FONTS.regular,
    color: COLORS.textMuted,
    lineHeight: 20,
  },
  form: {
    gap: 0,
  },
  fieldSpacer: {
    marginBottom: SPACING.md,
  },
  emailRow: {
    gap: 4,
  },
  emailLabel: {
    fontSize: 12,
    fontFamily: FONTS.medium,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: COLORS.textMuted,
  },
  emailValue: {
    fontSize: 15,
    fontFamily: FONTS.medium,
    color: COLORS.text,
  },
  fieldLabel: {
    fontSize: 12,
    fontFamily: FONTS.semiBold,
    letterSpacing: 0.4,
    color: COLORS.textMuted,
    marginBottom: SPACING.sm,
  },
  reasonInput: {
    minHeight: 96,
  },
  charCounter: {
    fontSize: 12,
    fontFamily: FONTS.regular,
    color: COLORS.textMuted,
    textAlign: 'right',
    marginBottom: SPACING.md,
  },
  submitButton: {
    marginTop: SPACING.lg,
  },
});
