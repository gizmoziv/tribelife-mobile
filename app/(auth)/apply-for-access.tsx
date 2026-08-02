import React, { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuthStore } from '@/store/authStore';
import { accessApi } from '@/services/api';
import type { SocialEntry } from '@/types';
import { FONTS, COLORS, SPACING, RADIUS } from '@/constants';
import { AnimatedEntry } from '@/components/ui/AnimatedEntry';
import { GlassCard } from '@/components/ui/GlassCard';
import { GlassInput } from '@/components/ui/GlassInput';
import { PillButton } from '@/components/ui/PillButton';
import { SocialsRepeater, isSocialEntryComplete } from '@/components/ui/SocialsRepeater';

const REASON_MAX_LENGTH = 1000;

export default function ApplyForAccessScreen() {
  const user = useAuthStore((s) => s.user);
  const setAccessStatus = useAuthStore((s) => s.setAccessStatus);
  const refreshSession = useAuthStore((s) => s.refreshSession);

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
      await accessApi.submitAccessRequest(reason.trim(), socials);
      setAccessStatus('pending');
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
              TribeLife is invite-based. Tell us a bit about yourself and our team will review your request by hand.
            </Text>
          </AnimatedEntry>

          <AnimatedEntry delay={100} style={styles.form}>
            {/* Email — read-only (D-08) */}
            <GlassCard style={styles.fieldSpacer}>
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
