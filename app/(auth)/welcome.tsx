import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  Alert,
} from 'react-native';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { useRouter } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuthStore } from '@/store/authStore';
import { auth } from '@/services/api';
import { FONTS, COLORS } from '@/constants';

export default function WelcomeScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { setAuth } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    GoogleSignin.configure({
      iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
      webClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID,
    });
  }, []);

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    try {
      await GoogleSignin.hasPlayServices();
      const response = await GoogleSignin.signIn();

      const idToken = response.data?.idToken;
      if (!idToken) {
        throw new Error('No ID token received from Google');
      }

      const { token, user, needsOnboarding } = await auth.googleSignIn(idToken);
      await setAuth(token, user, needsOnboarding);

      if (needsOnboarding) {
        router.replace('/(auth)/onboarding');
      } else {
        router.replace('/(app)/beacon');
      }
    } catch (err: any) {
      if (err.code === 'SIGN_IN_CANCELLED') {
        // User cancelled — do nothing
        return;
      }
      Alert.alert(
        'Sign-in Failed',
        err instanceof Error ? err.message : 'Something went wrong. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Hero Section */}
      <View style={styles.hero}>
        <Image source={require('@/assets/tribelife-logo.png')} style={styles.logoImage} />

        <Text style={[styles.title, { color: colors.text }]}>TribeLife</Text>
        <Text style={[styles.tagline, { color: colors.textMuted }]}>
          Your community.{'\n'}Always within reach.
        </Text>
      </View>

      {/* Feature highlights */}
      <View style={styles.features}>
        {[
          { icon: '💬', text: 'Chat with people in your area' },
          { icon: '✨', text: 'Beacon — smart community matching' },
          { icon: '🤝', text: 'Connect one-on-one' },
        ].map((f) => (
          <View key={f.text} style={styles.featureRow}>
            <Text style={styles.featureIcon}>{f.icon}</Text>
            <Text style={[styles.featureText, { color: colors.textMuted }]}>{f.text}</Text>
          </View>
        ))}
      </View>

      {/* CTA */}
      <View style={styles.cta}>
        <TouchableOpacity
          style={[styles.googleButton, isLoading && styles.buttonDisabled]}
          onPress={handleGoogleSignIn}
          disabled={isLoading}
          activeOpacity={0.85}
        >
          {isLoading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Text style={styles.googleIcon}>G</Text>
              <Text style={styles.googleButtonText}>Continue with Google</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={[styles.terms, { color: colors.textMuted }]}>
          By continuing, you agree to our Terms of Service{'\n'}and Privacy Policy
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
  },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 40,
  },
  logoImage: {
    width: 100,
    height: 100,
    borderRadius: 28,
    marginBottom: 20,
  },
  title: {
    fontSize: 42,
    fontFamily: FONTS.bold,
    letterSpacing: -1,
    marginBottom: 12,
  },
  tagline: {
    fontSize: 18,
    fontFamily: FONTS.regular,
    textAlign: 'center',
    lineHeight: 26,
  },
  features: {
    paddingVertical: 32,
    paddingLeft: 16,
    gap: 16,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureIcon: {
    fontSize: 24,
    width: 36,
  },
  featureText: {
    fontSize: 16,
    fontFamily: FONTS.medium,
  },
  cta: {
    paddingBottom: 40,
    gap: 16,
    alignItems: 'center',
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 24,
    width: '100%',
    gap: 10,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  googleIcon: {
    fontSize: 18,
    fontFamily: FONTS.bold,
    backgroundColor: '#FFF',
    color: COLORS.primary,
    width: 24,
    height: 24,
    borderRadius: 12,
    textAlign: 'center',
    lineHeight: 24,
  },
  googleButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontFamily: FONTS.semiBold,
  },
  terms: {
    fontSize: 12,
    fontFamily: FONTS.regular,
    textAlign: 'center',
    lineHeight: 18,
  },
});
