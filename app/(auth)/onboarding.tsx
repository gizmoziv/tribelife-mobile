import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Localization from 'expo-localization';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuthStore } from '@/store/authStore';
import { auth } from '@/services/api';
import { FONTS, COLORS } from '@/constants';

type HandleStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

export default function OnboardingScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { updateUser } = useAuthStore();

  const [handle, setHandle] = useState('');
  const [handleStatus, setHandleStatus] = useState<HandleStatus>('idle');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checkTimeout, setCheckTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);

  // Detect timezone from device
  const detectedTimezone = Localization.getCalendars()[0]?.timeZone ?? 'UTC';

  const handleChange = useCallback((text: string) => {
    const cleaned = text.toLowerCase().replace(/[^a-z0-9_]/g, '');
    setHandle(cleaned);

    if (checkTimeout) clearTimeout(checkTimeout);

    if (cleaned.length < 3) {
      setHandleStatus(cleaned.length > 0 ? 'invalid' : 'idle');
      return;
    }

    if (cleaned.length > 30) {
      setHandleStatus('invalid');
      return;
    }

    setHandleStatus('checking');
    const timeout = setTimeout(async () => {
      try {
        const { available } = await auth.checkHandle(cleaned);
        setHandleStatus(available ? 'available' : 'taken');
      } catch {
        setHandleStatus('idle');
      }
    }, 600);

    setCheckTimeout(timeout);
  }, [checkTimeout]);

  const handleSubmit = async () => {
    if (handleStatus !== 'available' || !handle) return;

    setIsSubmitting(true);
    try {
      await auth.onboarding(handle, detectedTimezone);
      updateUser({ handle, timezone: detectedTimezone });
      router.replace('/(app)/beacon');
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
    available: '✓ Available',
    taken: '✗ Already taken',
    invalid: handle.length < 3 && handle.length > 0
      ? 'At least 3 characters required'
      : 'Letters, numbers, and underscores only',
  }[handleStatus];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.emoji}>👋</Text>
            <Text style={[styles.title, { color: colors.text }]}>One last thing</Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              Choose your community handle. This is how others will find and mention you.
            </Text>
          </View>

          <View style={styles.form}>
            <View style={[styles.inputContainer, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <Text style={[styles.atSign, { color: colors.textMuted }]}>@</Text>
              <TextInput
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
                <ActivityIndicator size="small" color={colors.textMuted} style={{ marginRight: 12 }} />
              )}
            </View>

            {statusText ? (
              <Text style={[styles.statusText, { color: statusColor }]}>{statusText}</Text>
            ) : null}

            <View style={[styles.timezoneCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.timezoneLabel, { color: colors.textMuted }]}>Your timezone (auto-detected)</Text>
              <Text style={[styles.timezoneValue, { color: colors.text }]}>{detectedTimezone}</Text>
            </View>

            <Text style={[styles.hint, { color: colors.textMuted }]}>
              Your timezone determines which local chat room you'll be placed in. You can change this later.
            </Text>
          </View>

          <TouchableOpacity
            style={[
              styles.button,
              { opacity: handleStatus === 'available' && !isSubmitting ? 1 : 0.5 },
            ]}
            onPress={handleSubmit}
            disabled={handleStatus !== 'available' || isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.buttonText}>Enter TribeLife →</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  emoji: { fontSize: 52, marginBottom: 16 },
  title: {
    fontSize: 32,
    fontFamily: FONTS.bold,
    marginBottom: 12,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    fontFamily: FONTS.regular,
    textAlign: 'center',
    lineHeight: 24,
  },
  form: { gap: 12, marginBottom: 32 },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 56,
  },
  atSign: {
    fontSize: 20,
    fontFamily: FONTS.medium,
    marginRight: 4,
  },
  input: {
    flex: 1,
    fontSize: 18,
    height: '100%',
  },
  statusText: {
    fontSize: 13,
    fontFamily: FONTS.medium,
    paddingLeft: 4,
  },
  timezoneCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
  },
  timezoneLabel: {
    fontSize: 12,
    fontFamily: FONTS.medium,
    marginBottom: 4,
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
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFF',
    fontSize: 17,
    fontFamily: FONTS.semiBold,
  },
});
