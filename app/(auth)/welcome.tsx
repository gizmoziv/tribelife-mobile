import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  Linking,
  ScrollView,
  AppState,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ClipboardPasteButton, isPasteButtonAvailable } from 'expo-clipboard';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/contexts/ThemeContext';
import { auth, extractAccessStatus } from '@/services/api';
import { getPostLoginLandingRoute } from '@/services/notificationRouting';
import {
  shouldOfferInviteClipboardClaim,
  claimInviteFromClipboard,
  parseAndStoreInvite,
  type InviteClaimResult,
} from '@/services/inviteClipboard';
import { FONTS, COLORS, SPACING, SHADOWS, RADIUS } from '@/constants';
import { AnimatedEntry } from '@/components/ui/AnimatedEntry';
import { GlassCard } from '@/components/ui/GlassCard';
import { PillButton } from '@/components/ui/PillButton';
import Svg, { Path, Circle } from 'react-native-svg';

function ChatIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"
        stroke="#818CF8"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function SparkleIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8L12 2z"
        stroke="#818CF8"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function ConnectIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 3 L19.8 16.5 L4.2 16.5 Z"
        stroke="#818CF8"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <Path
        d="M12 21 L4.2 7.5 L19.8 7.5 Z"
        stroke="#818CF8"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * Sanitize the redirect query param so it can only point to in-app paths.
 * Accepts: leading-slash internal paths only ('/org/...').
 * Rejects: empty, undefined, absolute URLs, schemes, whitespace.
 * Returns null when the input is unsafe; caller falls back to default route.
 */
function sanitizeRedirect(raw: string | string[] | undefined): string | null {
  if (!raw) return null;
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (typeof v !== 'string') return null;
  // Only allow in-app paths — single leading slash, no double-slash, no scheme, no whitespace.
  if (!v.startsWith('/')) return null;
  if (v.startsWith('//')) return null; // protocol-relative
  if (/[\s]/.test(v)) return null;
  // Only allow paths under /org for v1.5 — narrowest possible accept-list.
  if (!v.startsWith('/org/')) return null;
  return v;
}

// iOS 16+ system paste control: hands us the text with no "Allow Paste" alert.
// Plain boolean (never destructure from a Platform.OS conditional).
let usePasteControl = false;
if (Platform.OS === 'ios' && isPasteButtonAvailable) {
  usePasteControl = true;
}

export default function WelcomeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ redirect?: string }>();
  const redirectTarget = sanitizeRedirect(params.redirect);
  const { setAuth } = useAuthStore();
  const { setThemePreference } = useTheme();
  const [isLoading, setIsLoading] = useState(false);
  const [isAppleLoading, setIsAppleLoading] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [inviteOfferVisible, setInviteOfferVisible] = useState(false);
  const [isClaimingInvite, setIsClaimingInvite] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);
  const inviteClaimAttempted = useRef(false);

  useEffect(() => {
    GoogleSignin.configure({
      iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
      webClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID,
    });

    if (Platform.OS === 'ios') {
      AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
    }
  }, []);

  // Prompt-free detection only (metadata, never clipboard text). Re-checks when
  // the app returns to the foreground so a payload copied in Safari shows up.
  useEffect(() => {
    let cancelled = false;
    const check = () => {
      if (inviteClaimAttempted.current) return;
      shouldOfferInviteClipboardClaim().then((offer) => {
        if (cancelled || inviteClaimAttempted.current) return;
        setInviteOfferVisible(offer);
      });
    };
    check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  const finishInviteClaim = (result: InviteClaimResult) => {
    setInviteOfferVisible(false);
    setIsClaimingInvite(false);
    if (result.matched) {
      setInviteMessage('Invite found — continue to sign in');
    } else {
      setInviteMessage('No invite found — you can continue normally');
    }
  };

  // Android / iOS without the paste control: explicit tap, then a clipboard read.
  const handleInviteClaim = async () => {
    if (isClaimingInvite) return;
    inviteClaimAttempted.current = true;
    setIsClaimingInvite(true);
    const result = await claimInviteFromClipboard();
    finishInviteClaim(result);
  };

  // iOS paste control: the system supplies the text, so no clipboard read here.
  const handleInvitePaste = async (data: { type: string; text?: string }) => {
    if (isClaimingInvite) return;
    inviteClaimAttempted.current = true;
    setIsClaimingInvite(true);
    let pastedText = '';
    if (data.type === 'text' && typeof data.text === 'string') {
      pastedText = data.text;
    }
    const result = await parseAndStoreInvite(pastedText);
    finishInviteClaim(result);
  };

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    try {
      if (Platform.OS === 'android') {
        await GoogleSignin.hasPlayServices();
      }
      const response = await GoogleSignin.signIn();

      const idToken = response.data?.idToken;
      if (!idToken) {
        throw new Error('No ID token received from Google');
      }

      const googleResponse = await auth.googleSignIn(idToken);
      const { token, user, needsOnboarding, capabilities, isNewUser } = googleResponse;
      await setAuth(token, user, capabilities, needsOnboarding, extractAccessStatus(googleResponse));

      // First-time accounts default to the dark theme (existing users and
      // anyone with a stored preference are unaffected). Persist + apply live
      // so it takes effect this session, not only after the next launch.
      if (isNewUser) await setThemePreference('dark');

      if (needsOnboarding) {
        router.replace('/(auth)/onboarding'); // onboarding always wins
      } else {
        // Deferred deep-link: if the welcome-screen invite claim
        // (services/inviteClipboard.ts) persisted a pending group slug from a
        // fresh-install
        // /g/:slug interstitial, route to the Join Group screen on first
        // post-login navigation. Wins over `redirectTarget` and the landing
        // route — the user came in via a group invite, not a session
        // restore.
        const pendingGroupSlug = await AsyncStorage.getItem('pendingGroupSlug');
        if (pendingGroupSlug) {
          await AsyncStorage.removeItem('pendingGroupSlug');
          router.replace(`/g/${pendingGroupSlug}` as any);
        } else if (redirectTarget) {
          router.replace(redirectTarget as any); // type cast — Expo Router typed routes don't know about runtime strings
        } else {
          // Surface unread daily-matcher results immediately after re-login.
          const landing = await getPostLoginLandingRoute();
          router.replace(landing);
        }
      }
    } catch (err: any) {
      if (err.code === 'SIGN_IN_CANCELLED') {
        return;
      }
      Alert.alert(
        'Sign-in Failed',
        err instanceof Error
          ? err.message
          : 'Something went wrong. Please try again.',
        [{ text: 'OK' }],
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    setIsAppleLoading(true);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (!credential.identityToken) {
        throw new Error('No identity token received from Apple');
      }

      const appleResponse = await auth.appleSignIn(
        credential.identityToken,
        credential.fullName,
        credential.email,
      );
      const { token, user, needsOnboarding, capabilities, isNewUser } = appleResponse;
      await setAuth(token, user, capabilities, needsOnboarding, extractAccessStatus(appleResponse));

      // First-time accounts default to the dark theme (existing users and
      // anyone with a stored preference are unaffected). Persist + apply live
      // so it takes effect this session, not only after the next launch.
      if (isNewUser) await setThemePreference('dark');

      if (needsOnboarding) {
        router.replace('/(auth)/onboarding'); // onboarding always wins
      } else {
        // Deferred deep-link: if the welcome-screen invite claim
        // (services/inviteClipboard.ts) persisted a pending group slug from a
        // fresh-install
        // /g/:slug interstitial, route to the Join Group screen on first
        // post-login navigation. Wins over `redirectTarget` and the landing
        // route — the user came in via a group invite, not a session
        // restore.
        const pendingGroupSlug = await AsyncStorage.getItem('pendingGroupSlug');
        if (pendingGroupSlug) {
          await AsyncStorage.removeItem('pendingGroupSlug');
          router.replace(`/g/${pendingGroupSlug}` as any);
        } else if (redirectTarget) {
          router.replace(redirectTarget as any); // type cast — Expo Router typed routes don't know about runtime strings
        } else {
          // Surface unread daily-matcher results immediately after re-login.
          const landing = await getPostLoginLandingRoute();
          router.replace(landing);
        }
      }
    } catch (err: any) {
      if (err.code === 'ERR_REQUEST_CANCELED') {
        return;
      }
      Alert.alert(
        'Sign-in Failed',
        err instanceof Error
          ? err.message
          : 'Something went wrong. Please try again.',
        [{ text: 'OK' }],
      );
    } finally {
      setIsAppleLoading(false);
    }
  };

  const features = [
    { icon: <ChatIcon />, text: 'Chat with people locally and globally' },
    { icon: <SparkleIcon />, text: 'Beacon — smart community matching' },
    { icon: <ConnectIcon />, text: "Features you won't find anywhere else" },
  ];

  return (
    <LinearGradient
      colors={[...COLORS.gradientBackground]}
      style={styles.container}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* Hero Section */}
        <AnimatedEntry style={styles.hero} duration={500}>
          <View style={styles.logoGlow}>
            <Image
              source={require('@/assets/tribelife-logo.png')}
              style={styles.logoImage}
            />
          </View>

          <Text style={[styles.title, { color: '#FFFFFF' }]}>tribelife</Text>
          <Text style={[styles.tagline, { color: COLORS.textMuted }]}>
            Built for Our Tribe. Actually.
          </Text>
        </AnimatedEntry>

        {/* Feature highlights */}
        <View style={styles.features}>
          {features.map((f, i) => (
            <AnimatedEntry key={f.text} delay={200 + i * 80}>
              <View style={styles.featureRow}>
                <View
                  style={[
                    styles.featureIconContainer,
                    { backgroundColor: COLORS.surfaceGlass },
                  ]}
                >
                  {f.icon}
                </View>
                <Text style={[styles.featureText, { color: COLORS.textMuted }]}>
                  {f.text}
                </Text>
              </View>
            </AnimatedEntry>
          ))}
        </View>

        {/* CTA */}
        <AnimatedEntry style={styles.cta} delay={500}>
          {appleAvailable && (
            <TouchableOpacity
              style={[
                styles.appleButton,
                isAppleLoading && styles.buttonDisabled,
              ]}
              onPress={handleAppleSignIn}
              disabled={isAppleLoading}
              activeOpacity={0.85}
            >
              {isAppleLoading ? (
                <ActivityIndicator color="#000" />
              ) : (
                <>
                  <Text style={styles.appleIcon}>{'\uF8FF'}</Text>
                  <Text style={styles.appleButtonText}>
                    Continue with Apple
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}

          <PillButton
            title="Continue with Google"
            onPress={handleGoogleSignIn}
            variant="primary"
            size="lg"
            loading={isLoading}
            disabled={isLoading}
            icon={
              <View style={styles.googleIconCircle}>
                <Text style={styles.googleIconText}>G</Text>
              </View>
            }
            style={{ width: '100%' }}
          />

          {inviteMessage ? (
            <Text style={[styles.inviteText, { color: COLORS.textMuted }]}>
              {inviteMessage}
            </Text>
          ) : inviteOfferVisible && usePasteControl ? (
            <View style={styles.inviteRow}>
              <Text style={[styles.inviteText, { color: COLORS.textMuted }]}>
                Came from an invite?
              </Text>
              <ClipboardPasteButton
                acceptedContentTypes={['plain-text']}
                displayMode="iconAndLabel"
                style={styles.pasteButton}
                onPress={handleInvitePaste}
              />
            </View>
          ) : inviteOfferVisible ? (
            <TouchableOpacity
              onPress={handleInviteClaim}
              disabled={isClaimingInvite}
              activeOpacity={0.7}
              accessibilityRole="button"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[styles.inviteText, styles.inviteLink, { color: COLORS.text }]}>
                Came from an invite? Tap to continue
              </Text>
            </TouchableOpacity>
          ) : null}

          <Text style={[styles.terms, { color: COLORS.textMuted }]}>
            By continuing, you agree to our{' '}
            <Text
              style={styles.termsLink}
              onPress={() => Linking.openURL('https://tribelife.app/terms')}
            >
              Terms of Service
            </Text>{' '}
            and{' '}
            <Text
              style={styles.termsLink}
              onPress={() => Linking.openURL('https://tribelife.app/privacy')}
            >
              Privacy Policy
            </Text>
          </Text>
        </AnimatedEntry>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: SPACING.page,
    paddingTop: 60,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoGlow: {
    marginBottom: SPACING.lg,
    ...SHADOWS.glow(COLORS.accent),
  },
  logoImage: {
    width: 130,
    height: 130,
    borderRadius: 32,
  },
  title: {
    fontSize: 42,
    fontFamily: FONTS.bold,
    letterSpacing: -1.5,
    marginBottom: 12,
  },
  tagline: {
    fontSize: 18,
    fontFamily: FONTS.regular,
    textAlign: 'center',
    lineHeight: 26,
  },
  features: {
    paddingVertical: SPACING.xl,
    paddingLeft: SPACING.md,
    gap: SPACING.md,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  featureText: {
    flex: 1,
    fontSize: 16,
    fontFamily: FONTS.medium,
  },
  cta: {
    paddingBottom: 40,
    gap: SPACING.md,
    alignItems: 'center',
  },
  appleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.pill,
    paddingVertical: 18,
    paddingHorizontal: 32,
    width: '100%',
    gap: 10,
    ...SHADOWS.sm,
  },
  appleIcon: {
    fontSize: 20,
    color: '#000',
    fontWeight: '500',
  },
  appleButtonText: {
    color: '#000',
    fontSize: 17,
    fontFamily: FONTS.semiBold,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  googleIconCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleIconText: {
    fontSize: 14,
    fontFamily: FONTS.bold,
    color: COLORS.primary,
    lineHeight: 18,
  },
  inviteText: {
    fontSize: 14,
    fontFamily: FONTS.medium,
    textAlign: 'center',
  },
  inviteLink: {
    textDecorationLine: 'underline',
  },
  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  pasteButton: {
    width: 100,
    height: 36,
  },
  terms: {
    fontSize: 12,
    fontFamily: FONTS.regular,
    textAlign: 'center',
    lineHeight: 18,
  },
  termsLink: {
    color: COLORS.primary,
    textDecorationLine: 'underline' as const,
  },
});
