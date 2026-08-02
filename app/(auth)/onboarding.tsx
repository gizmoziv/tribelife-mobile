import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuthStore } from '@/store/authStore';
import { auth, accessApi } from '@/services/api';
import { FONTS, COLORS, SPACING, RADIUS, SHADOWS } from '@/constants';
import { AnimatedEntry } from '@/components/ui/AnimatedEntry';
import { GlassCard } from '@/components/ui/GlassCard';
import { PillButton } from '@/components/ui/PillButton';
import { GlowBadge } from '@/components/ui/GlowBadge';
import Svg, { Path, Circle as SvgCircle } from 'react-native-svg';

function GlobeIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <SvgCircle cx={12} cy={12} r={10} stroke="#7A8BA8" strokeWidth={1.5} />
      <Path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" stroke="#7A8BA8" strokeWidth={1.5} />
    </Svg>
  );
}

type HandleResult = 'none' | 'invalid' | 'available' | 'taken';

// Phase 35 (T-35-03): the ONLY referral-failure copy in this file. Every
// failure path renders this identifier — never a repeated literal — so the
// failure cause can never vary by cause (D-04).
const REFERRAL_FAILURE_MESSAGE = "We couldn't verify that referral code. Check it and try again.";

// Phase 35 follow-on: two-step onboarding state machine. Profile is now the
// first step for everyone; 'referral' is the follow-up screen reached only
// when the organic Continue gate needs a code. `null` stays load-bearing —
// the attribution read below is asynchronous, so any synchronous default
// would render one frame of an editable referral field before a deep-link
// user's captured ref flips it read-only.
type OnboardingStep = 'referral' | 'profile';

export default function OnboardingScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { completeOnboarding, refreshSession } = useAuthStore();

  const [handle, setHandle] = useState('');
  const [handleResult, setHandleResult] = useState<HandleResult>('none');
  const [isChecking, setIsChecking] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const checkTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestHandleRef = useRef('');
  const handleInputRef = useRef<any>(null);
  const [showGlobeCta, setShowGlobeCta] = useState(false);

  // Referral field state
  const [recognizedRef, setRecognizedRef] = useState<string | null>(null);
  const [recognizedSource, setRecognizedSource] = useState<'handle_code' | 'profile_share' | 'group_invite' | null>(null);
  const [typedReferrer, setTypedReferrer] = useState('');

  // Phase 35 step machine — resolved inside the attribution effect below.
  const [step, setStep] = useState<OnboardingStep | null>(null);

  // Phase 35 referral-step state. attemptsRemaining is a display mirror of
  // the server's most recent response and nothing else — never derived,
  // never decremented, never seeded with a starting value (D-05, T-35-04).
  const [referralError, setReferralError] = useState<string | null>(null);
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);
  const [isValidatingReferral, setIsValidatingReferral] = useState(false);
  const [referralValidated, setReferralValidated] = useState(false);

  // Read captured attribution from AsyncStorage on mount to decide read-only vs editable.
  // Profile screen comes first for everyone now — only `recognizedRef` (set
  // below when a deep-link ref was captured) distinguishes the read-only
  // deep-link path from the organic path. The `step === null` gate above
  // stays load-bearing: this read is async, so rendering synchronously would
  // flash a one-frame editable referral field at deep-link users before it
  // flips to read-only.
  useEffect(() => {
    AsyncStorage.multiGet(['attributionRef', 'attributionSource']).then(([[, ref], [, source]]) => {
      if (ref) {
        setRecognizedRef(ref);
        setRecognizedSource((source as 'handle_code' | 'profile_share' | 'group_invite' | null) ?? null);
      }
      setStep('profile');
    }).catch(() => {
      // Storage failure: leave the user on the profile screen rather than
      // stuck on the loading indicator.
      setStep('profile');
    });
  }, []);

  const isReadOnlyRef = !!recognizedRef;

  const detectedTimezone = Localization.getCalendars()[0]?.timeZone ?? 'UTC';

  const handleChange = useCallback((text: string) => {
    const cleaned = text.toLowerCase().replace(/[^a-z0-9_]/g, '');
    setHandle(cleaned);
    latestHandleRef.current = cleaned;

    if (checkTimeoutRef.current) clearTimeout(checkTimeoutRef.current);

    if (cleaned.length === 0) {
      setHandleResult('none');
      setIsChecking(false);
      return;
    }

    if (cleaned.length < 3) {
      setHandleResult('invalid');
      setIsChecking(false);
      return;
    }

    // Clear stale "too short" result when user reaches valid length; keep real results.
    setHandleResult((prev) => (prev === 'invalid' ? 'none' : prev));
    setIsChecking(true);

    checkTimeoutRef.current = setTimeout(async () => {
      const current = latestHandleRef.current;
      if (current.length < 3) return;
      try {
        const { available } = await auth.checkHandle(current);
        if (latestHandleRef.current === current) {
          setHandleResult(available ? 'available' : 'taken');
          setIsChecking(false);
        }
      } catch {
        if (latestHandleRef.current === current) {
          setIsChecking(false);
        }
      }
    }, 600);
  }, []);

  // Phase 35 (D-03, D-05, D-06, D-07, T-35-06): fires only on an explicit
  // Continue tap — never from typing, never from a timer — so each call
  // consumes at most one of the server's three attempts.
  const handleReferralContinue = async () => {
    if (isValidatingReferral) return;

    const trimmed = typedReferrer.trim();
    if (!trimmed) {
      // Blank field: straight to the apply form, no request, no attempt
      // consumed (D-07). This branch must return before the validation
      // call below is ever reached.
      router.push('/(auth)/apply-for-access' as any);
      return;
    }

    setReferralError(null);
    setIsValidatingReferral(true);
    try {
      const result = await accessApi.validateReferral(trimmed);
      if (result.valid) {
        setReferralValidated(true);
        setStep('profile');
      } else {
        setReferralError(REFERRAL_FAILURE_MESSAGE);
        setAttemptsRemaining(result.attemptsRemaining);
        if (result.exhausted) {
          router.replace('/(auth)/apply-for-access' as any);
        }
        return;
      }
    } finally {
      setIsValidatingReferral(false);
    }

    // Valid: the profile screen's handle/timezone/terms state already lives
    // in this component, so onboarding can complete immediately without a
    // second user tap. setStep('profile') above means a failed submit here
    // leaves the user on the profile screen with the code shown read-only.
    await submitOnboarding();
  };

  // Follow-on restructure: the body of the original handleSubmit, moved
  // verbatim so it can be invoked both from the profile screen's Continue
  // button (after the organic referral gate below) and from
  // handleReferralContinue once a code is validated on the follow-up screen.
  const submitOnboarding = async () => {
    setIsSubmitting(true);
    try {
      // Resolve referral values from component state (populated on mount).
      // recognized ref → keep its captured source (handle_code/profile_share/group_invite)
      // organic typed  → use manual_entry source
      // empty organic  → omit both (same as original organic flow)
      let referralCode: string | undefined;
      let attributionSource: 'handle_code' | 'profile_share' | 'group_invite' | 'manual_entry' | undefined;

      if (recognizedRef) {
        referralCode = recognizedRef;
        attributionSource = recognizedSource ?? undefined;
      } else if (typedReferrer.trim()) {
        referralCode = typedReferrer.trim().toLowerCase();
        attributionSource = 'manual_entry';
      }

      await auth.onboarding(
        handle,
        detectedTimezone,
        true,
        referralCode,
        attributionSource,
      );
      completeOnboarding({
        handle,
        timezone: detectedTimezone,
        acceptedTermsAt: new Date().toISOString(),
      });
      await refreshSession();
      // Clear AsyncStorage attribution on success ONLY (recognized ref case).
      // For organic typed there is nothing in AsyncStorage to clear.
      // Failed submits keep the keys so a retry preserves attribution.
      if (recognizedRef) {
        await Promise.all([
          AsyncStorage.removeItem('attributionRef'),
          AsyncStorage.removeItem('attributionSource'),
        ]);
      }
      // Deferred deep-link: if a /g/:slug interstitial wrote a pending group
      // slug to the clipboard before install, recoverAttributionFromClipboard
      // (in _layout.tsx) has already persisted it to AsyncStorage. Consume it
      // here so first-onboarding lands the user on the Join Group screen
      // instead of the default beacon/globe CTA.
      const pendingGroupSlug = await AsyncStorage.getItem('pendingGroupSlug');
      if (pendingGroupSlug) {
        await AsyncStorage.removeItem('pendingGroupSlug');
        router.replace(`/g/${pendingGroupSlug}` as any);
        return;
      }
      const ctaDismissed = await AsyncStorage.getItem('globe_cta_dismissed');
      if (ctaDismissed === 'true') {
        router.replace('/(app)/beacon');
      } else {
        setShowGlobeCta(true);
      }
    } catch (err) {
      Alert.alert(
        'Setup Failed',
        err instanceof Error ? err.message : 'Please try again',
        [{ text: 'OK' }]
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (!handle.trim()) {
      Alert.alert('Handle Required', 'Please choose a handle before continuing.');
      return;
    }
    if (handleResult !== 'available' || isChecking) {
      Alert.alert('Handle Unavailable', 'Please choose an available handle before continuing.');
      return;
    }
    if (!acceptedTerms) {
      Alert.alert('Terms Required', 'Please agree to the Terms of Service and Privacy Policy to continue.');
      return;
    }

    // Organic referral gate: only applies when there is no recognized
    // deep-link ref and no code already validated on the follow-up screen.
    // Uses isValidatingReferral (not isSubmitting) so this never
    // double-toggles the submit spinner against submitOnboarding below.
    if (!recognizedRef && !referralValidated) {
      const trimmed = typedReferrer.trim();
      if (!trimmed) {
        // Blank: send to the follow-up referral screen. No request, no
        // attempt consumed.
        setStep('referral');
        return;
      }

      setIsValidatingReferral(true);
      let result: Awaited<ReturnType<typeof accessApi.validateReferral>>;
      try {
        result = await accessApi.validateReferral(trimmed);
      } finally {
        setIsValidatingReferral(false);
      }

      if (result.valid) {
        setReferralValidated(true);
        // fall through to submission below
      } else if (result.exhausted) {
        // Exhausted: routing to the follow-up screen would be a dead end —
        // every Continue there fails too.
        router.replace('/(auth)/apply-for-access' as any);
        return;
      } else {
        setReferralError(REFERRAL_FAILURE_MESSAGE);
        setAttemptsRemaining(result.attemptsRemaining);
        setStep('referral');
        return;
      }
    }

    await submitOnboarding();
  };

  const handleVisitGlobe = async () => {
    await AsyncStorage.setItem('globe_cta_dismissed', 'true');
    router.replace('/(app)/globe/town-square');
  };

  const handleSkipGlobe = async () => {
    await AsyncStorage.setItem('globe_cta_dismissed', 'true');
    router.replace('/(app)/beacon');
  };

  const resultColor = {
    none: colors.textMuted,
    available: COLORS.success,
    taken: COLORS.error,
    invalid: COLORS.error,
  }[handleResult];

  const resultText = {
    none: '',
    available: 'Available',
    taken: 'Already taken',
    invalid: handle.length < 3
      ? 'At least 3 characters required'
      : 'Letters, numbers, and underscores only',
  }[handleResult];

  const inputBorderColor = handleResult === 'available'
    ? COLORS.success
    : handleResult === 'taken' || handleResult === 'invalid'
      ? COLORS.error
      : colors.border;

  return (
    <LinearGradient
      colors={[...COLORS.gradientBackground]}
      style={styles.container}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          {showGlobeCta ? (
            <AnimatedEntry style={styles.ctaContainer}>
              <GlassCard>
                <View style={styles.ctaContent}>
                  <View style={[styles.ctaIconContainer, { backgroundColor: colors.surfaceGlass }]}>
                    <Svg width={40} height={40} viewBox="0 0 24 24" fill="none">
                      <SvgCircle cx={12} cy={12} r={10} stroke={COLORS.primary} strokeWidth={1.5} />
                      <Path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" stroke={COLORS.primary} strokeWidth={1.5} />
                    </Svg>
                  </View>
                  <Text style={[styles.ctaTitle, { color: colors.text }]}>Discover your community</Text>
                  <Text style={[styles.ctaSubtitle, { color: colors.textMuted }]}>
                    Join Town Square and connect with Jews worldwide in real-time
                  </Text>
                  <PillButton
                    title="Visit Globe"
                    onPress={handleVisitGlobe}
                    variant="primary"
                    size="lg"
                    style={{ width: '100%', marginTop: SPACING.lg }}
                  />
                  <TouchableOpacity onPress={handleSkipGlobe} style={styles.skipButton}>
                    <Text style={[styles.skipText, { color: colors.textMuted }]}>Maybe later</Text>
                  </TouchableOpacity>
                </View>
              </GlassCard>
            </AnimatedEntry>
          ) : step === null ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
          ) : step === 'profile' ? (
            <>
              <AnimatedEntry style={styles.header}>
                <View style={[styles.waveContainer, { backgroundColor: colors.surfaceGlass }]}>
                  <Text style={styles.waveEmoji}>
                    <Text style={{ fontFamily: undefined }}>{'👋'}</Text>
                  </Text>
                </View>
                <Text style={[styles.title, { color: COLORS.text }]}>One last thing</Text>
                <Text style={[styles.subtitle, { color: COLORS.textMuted }]}>
                  Choose your community handle. This is how others will find and mention you.
                </Text>
              </AnimatedEntry>

              <AnimatedEntry delay={150} style={styles.form}>
                {/* Handle input */}
                <View style={[
                  styles.inputContainer,
                  {
                    borderColor: inputBorderColor,
                    backgroundColor: colors.surfaceGlass,
                  },
                ]}>
                  <GlowBadge text="@" color={COLORS.accent} size="sm" />
                  <TextInput
                    ref={handleInputRef}
                    style={[styles.input, { color: colors.text, fontFamily: FONTS.medium }]}
                    placeholder="your_handle"
                    placeholderTextColor={colors.textMuted}
                    value={handle}
                    onChangeText={handleChange}
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={30}
                    autoFocus
                    blurOnSubmit={false}
                  />
                </View>

                <View style={styles.statusRow}>
                  <Text style={[styles.statusText, { color: resultColor }]}>
                    {resultText || ' '}
                  </Text>
                  {isChecking && (
                    <View style={styles.checkingInline}>
                      <ActivityIndicator size="small" color={colors.textMuted} />
                      <Text style={[styles.statusText, { color: colors.textMuted }]}>Checking…</Text>
                    </View>
                  )}
                </View>

                {/* Timezone card */}
                <GlassCard>
                  <View style={styles.timezoneRow}>
                    <GlobeIcon />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.timezoneLabel, { color: colors.textMuted }]}>Your timezone (auto-detected)</Text>
                      <Text style={[styles.timezoneValue, { color: colors.text }]}>{detectedTimezone}</Text>
                    </View>
                  </View>
                </GlassCard>

                {/* Referral field — read-only when ref captured, editable in organic case */}
                {(isReadOnlyRef || referralValidated) ? (
                  <GlassCard>
                    <View style={styles.referralReadOnlyRow}>
                      <Text style={styles.referralLabel}>Referred by</Text>
                      <Text style={styles.referralHandle}>@{recognizedRef ?? typedReferrer}</Text>
                    </View>
                  </GlassCard>
                ) : (
                  <View>
                    <Text style={styles.referralLabel}>Referred by</Text>
                    <View style={[styles.inputContainer, styles.referralInputContainer]}>
                      <TextInput
                        style={[styles.input, styles.referralInput]}
                        placeholder="referral code"
                        placeholderTextColor={COLORS.textMuted}
                        value={typedReferrer}
                        onChangeText={(text) => setTypedReferrer(text.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                        autoCapitalize="none"
                        autoCorrect={false}
                        maxLength={30}
                      />
                    </View>
                    <Text style={styles.referralHint}>Optional — leave blank if you don't have one</Text>
                  </View>
                )}

                <Text style={[styles.hint, { color: colors.textMuted }]}>
                  Your timezone determines which local chat room you'll be placed in. You can change this later.
                </Text>

                {/* Terms */}
                <TouchableOpacity
                  style={styles.termsRow}
                  onPress={() => setAcceptedTerms(!acceptedTerms)}
                  activeOpacity={0.7}
                >
                  <View style={[
                    styles.checkbox,
                    {
                      borderColor: acceptedTerms ? COLORS.secondary : COLORS.error,
                      backgroundColor: acceptedTerms ? COLORS.secondary : 'transparent',
                      borderWidth: acceptedTerms ? 1.5 : 2,
                    },
                  ]}>
                    {acceptedTerms && <Text style={styles.checkmark}>{'✓'}</Text>}
                  </View>
                  <Text style={[styles.termsText, { color: colors.textMuted }]}>
                    I agree to the{' '}
                    <Text style={styles.termsLink} onPress={() => Linking.openURL('https://tribelife.app/terms')}>
                      Terms of Service
                    </Text>
                    {' '}and{' '}
                    <Text style={styles.termsLink} onPress={() => Linking.openURL('https://tribelife.app/privacy')}>
                      Privacy Policy
                    </Text>
                    , including zero tolerance for objectionable content or abusive behavior.
                  </Text>
                </TouchableOpacity>
              </AnimatedEntry>

              <AnimatedEntry delay={300}>
                <PillButton
                  title="Enter TribeLife"
                  onPress={handleSubmit}
                  variant="primary"
                  size="lg"
                  loading={isSubmitting}
                  disabled={isSubmitting}
                  style={{ width: '100%' }}
                />
              </AnimatedEntry>
            </>
          ) : (
            <AnimatedEntry style={styles.header}>
              <Text style={[styles.title, { color: COLORS.text }]}>Who invited you?</Text>
              <Text style={[styles.subtitle, { color: COLORS.textMuted }]}>
                TribeLife is invite-only. Enter the referral code from the member who invited you.
              </Text>

              <View style={styles.referralStepForm}>
                <View style={[styles.inputContainer, styles.referralInputContainer]}>
                  <TextInput
                    style={[styles.input, styles.referralInput]}
                    placeholder="referral code"
                    placeholderTextColor={COLORS.textMuted}
                    value={typedReferrer}
                    onChangeText={(text) => {
                      setTypedReferrer(text.toLowerCase().replace(/[^a-z0-9_]/g, ''));
                      setReferralError(null);
                    }}
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={30}
                    autoFocus
                  />
                </View>

                {referralError !== null && (
                  <Text style={[styles.referralErrorText, { color: COLORS.error }]}>{referralError}</Text>
                )}

                {attemptsRemaining !== null && (
                  <Text style={[styles.referralAttemptsText, { color: COLORS.textMuted }]}>
                    {attemptsRemaining} attempt{attemptsRemaining === 1 ? '' : 's'} remaining
                  </Text>
                )}

                <PillButton
                  title="Continue"
                  onPress={handleReferralContinue}
                  variant="primary"
                  size="lg"
                  loading={isValidatingReferral}
                  disabled={isValidatingReferral}
                  style={{ width: '100%', marginTop: SPACING.lg }}
                />

                <TouchableOpacity
                  onPress={() => router.push('/(auth)/apply-for-access' as any)}
                  style={styles.referralSkipButton}
                >
                  <Text style={[styles.referralSkipText, { color: COLORS.textMuted }]}>
                    I don't have a referral code
                  </Text>
                </TouchableOpacity>
              </View>
            </AnimatedEntry>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 120,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: SPACING.page,
    paddingTop: 60,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  waveContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  waveEmoji: { fontSize: 36 },
  title: {
    fontSize: 32,
    fontFamily: FONTS.semiBold,
    marginBottom: 12,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    fontFamily: FONTS.regular,
    textAlign: 'center',
    lineHeight: 24,
  },
  form: { gap: 14, marginBottom: SPACING.xl },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 14,
    paddingVertical: 4,
    height: 56,
    gap: 8,
  },
  input: {
    flex: 1,
    fontSize: 18,
    height: '100%',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 16,
    minHeight: 18,
  },
  checkingInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusText: {
    fontSize: 13,
    fontFamily: FONTS.medium,
  },
  timezoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  timezoneLabel: {
    fontSize: 12,
    fontFamily: FONTS.medium,
    marginBottom: 2,
  },
  timezoneValue: {
    fontSize: 15,
    fontFamily: FONTS.semiBold,
  },
  hint: {
    fontSize: 13,
    fontFamily: FONTS.regular,
    lineHeight: 20,
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 4,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: RADIUS.sm,
    borderWidth: 1.5,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginTop: 1,
  },
  checkmark: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700' as const,
  },
  termsText: {
    flex: 1,
    fontSize: 13,
    fontFamily: FONTS.regular,
    lineHeight: 20,
  },
  termsLink: {
    color: COLORS.primary,
    textDecorationLine: 'underline' as const,
  },
  ctaContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: SPACING.xl,
  },
  ctaContent: {
    alignItems: 'center',
    paddingVertical: SPACING.lg,
  },
  ctaIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  ctaTitle: {
    fontSize: 22,
    fontFamily: FONTS.semiBold,
    textAlign: 'center',
    marginBottom: SPACING.sm,
    letterSpacing: -0.3,
  },
  ctaSubtitle: {
    fontSize: 15,
    fontFamily: FONTS.regular,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: SPACING.sm,
  },
  skipButton: {
    marginTop: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  skipText: {
    fontSize: 15,
    fontFamily: FONTS.medium,
  },
  referralReadOnlyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  referralLabel: {
    fontSize: 12,
    fontFamily: FONTS.medium,
    color: COLORS.textMuted,
    marginBottom: 6,
  },
  referralHandle: {
    fontSize: 15,
    fontFamily: FONTS.semiBold,
    color: COLORS.text,
  },
  referralInputContainer: {
    borderColor: COLORS.textMuted,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginBottom: 0,
  },
  referralInput: {
    fontSize: 16,
    color: COLORS.text,
    fontFamily: FONTS.regular,
  },
  referralHint: {
    fontSize: 12,
    fontFamily: FONTS.regular,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  referralStepForm: {
    width: '100%',
    marginTop: SPACING.xl,
    gap: 10,
  },
  referralErrorText: {
    fontSize: 13,
    fontFamily: FONTS.medium,
    paddingLeft: 16,
  },
  referralAttemptsText: {
    fontSize: 13,
    fontFamily: FONTS.regular,
    paddingLeft: 16,
  },
  referralSkipButton: {
    marginTop: SPACING.md,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
  },
  referralSkipText: {
    fontSize: 14,
    fontFamily: FONTS.medium,
  },
});
