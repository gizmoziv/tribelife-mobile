import React, { useState, useCallback, useRef } from 'react';
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
import { auth } from '@/services/api';
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

type HandleStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

export default function OnboardingScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { updateUser } = useAuthStore();

  const [handle, setHandle] = useState('');
  const [handleStatus, setHandleStatus] = useState<HandleStatus>('idle');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const checkTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestHandleRef = useRef('');
  const handleInputRef = useRef<any>(null);
  const [showGlobeCta, setShowGlobeCta] = useState(false);

  const detectedTimezone = Localization.getCalendars()[0]?.timeZone ?? 'UTC';

  const handleChange = useCallback((text: string) => {
    const cleaned = text.toLowerCase().replace(/[^a-z0-9_]/g, '');
    setHandle(cleaned);
    latestHandleRef.current = cleaned;

    if (checkTimeoutRef.current) clearTimeout(checkTimeoutRef.current);

    if (cleaned.length < 3) {
      setHandleStatus(cleaned.length > 0 ? 'invalid' : 'idle');
      return;
    }

    if (cleaned.length > 30) {
      setHandleStatus('invalid');
      return;
    }

    // Don't set 'checking' immediately — avoid re-render on every keystroke
    checkTimeoutRef.current = setTimeout(async () => {
      const current = latestHandleRef.current;
      if (current.length < 3) return;
      setHandleStatus('checking');
      try {
        const { available } = await auth.checkHandle(current);
        if (latestHandleRef.current === current) {
          setHandleStatus(available ? 'available' : 'taken');
          // Re-focus input after status change (Android loses focus on layout shift)
          setTimeout(() => handleInputRef.current?.focus(), 50);
        }
      } catch {
        if (latestHandleRef.current === current) {
          setHandleStatus('idle');
          setTimeout(() => handleInputRef.current?.focus(), 50);
        }
      }
    }, 600);
  }, []);

  const handleSubmit = async () => {
    if (handleStatus !== 'available' || !handle || !acceptedTerms) return;

    setIsSubmitting(true);
    try {
      const referralCode = await AsyncStorage.getItem('referralCode');
      await auth.onboarding(handle, detectedTimezone, true, referralCode ?? undefined);
      updateUser({ handle, timezone: detectedTimezone });
      await AsyncStorage.removeItem('referralCode');
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

  const handleVisitGlobe = async () => {
    await AsyncStorage.setItem('globe_cta_dismissed', 'true');
    router.replace('/(app)/globe/town-square');
  };

  const handleSkipGlobe = async () => {
    await AsyncStorage.setItem('globe_cta_dismissed', 'true');
    router.replace('/(app)/beacon');
  };

  const statusColor = {
    idle: colors.textMuted,
    checking: colors.textMuted,
    available: COLORS.success,
    taken: COLORS.error,
    invalid: COLORS.error,
  }[handleStatus];

  const statusText = {
    idle: '',
    checking: 'Checking...',
    available: 'Available',
    taken: 'Already taken',
    invalid: handle.length < 3 && handle.length > 0
      ? 'At least 3 characters required'
      : 'Letters, numbers, and underscores only',
  }[handleStatus];

  const inputBorderColor = handleStatus === 'available'
    ? COLORS.success
    : handleStatus === 'taken' || handleStatus === 'invalid'
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
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
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
          ) : (
            <>
              <AnimatedEntry style={styles.header}>
                <View style={[styles.waveContainer, { backgroundColor: colors.surfaceGlass }]}>
                  <Text style={styles.waveEmoji}>
                    <Text style={{ fontFamily: undefined }}>{'👋'}</Text>
                  </Text>
                </View>
                <Text style={[styles.title, { color: colors.text }]}>One last thing</Text>
                <Text style={[styles.subtitle, { color: colors.textMuted }]}>
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
                  handleStatus === 'available' && {
                    ...SHADOWS.sm,
                    shadowColor: COLORS.success,
                    shadowOpacity: 0.2,
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
                  />
                  {handleStatus === 'checking' && (
                    <ActivityIndicator size="small" color={colors.textMuted} />
                  )}
                  {handleStatus === 'available' && (
                    <GlowBadge text="Available" color={COLORS.success} glow size="sm" />
                  )}
                </View>

                {statusText && handleStatus !== 'available' ? (
                  <Text style={[styles.statusText, { color: statusColor }]}>{statusText}</Text>
                ) : null}

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
                      borderColor: acceptedTerms ? COLORS.primary : colors.border,
                      backgroundColor: acceptedTerms ? COLORS.primary : 'transparent',
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
                  disabled={handleStatus !== 'available' || !acceptedTerms || isSubmitting}
                  style={{ width: '100%' }}
                />
              </AnimatedEntry>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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
  statusText: {
    fontSize: 13,
    fontFamily: FONTS.medium,
    paddingLeft: 16,
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
});
