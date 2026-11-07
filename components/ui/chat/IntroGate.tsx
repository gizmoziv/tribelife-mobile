// Phase 44 intro gate — an absolute overlay inside ChatsScreen, deliberately not a
// modal component, so the absolute tab bar stays tappable (D-01). Gate only on
// hasPostedInChat === false (D-02, D-12).
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  Platform,
  StyleSheet,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuthStore } from '@/store/authStore';
import { useChatsStore } from '@/store/chatsStore';
import { useTabBarSpace } from '@/hooks/useTabBarSpace';
import { introApi } from '@/services/api';
import { GlassCard } from '@/components/ui/GlassCard';
import { PillButton } from '@/components/ui/PillButton';
import { COLORS, FONTS, SPACING } from '@/constants';
import {
  INTRO_MIN_LENGTH,
  INTRO_MAX_LENGTH,
  INTRO_PLACEHOLDER,
} from '@/constants/intro';

const GENERIC_ERROR = "Couldn't post your intro. Check your connection and try again.";

// ── Component ─────────────────────────────────────────────────────────────────

export function IntroGate() {
  const { colors } = useTheme();
  const hasPosted = useAuthStore((s) => s.user?.hasPostedInChat);
  const tabBarSpace = useTabBarSpace();
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const len = text.trim().length;

  const markPosted = () => {
    useAuthStore.getState().updateUser({ hasPostedInChat: true });
    // The focus hydrate ran before the post and the intro changes the Local Chat row.
    void useChatsStore.getState().hydrate();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const onSubmit = async () => {
    const content = text.trim();
    if (content.length < INTRO_MIN_LENGTH) return;
    setSubmitting(true);
    setError(null);
    try {
      await introApi.post(content);
      markPosted();
    } catch {
      // Keep the typed text so the user can retry (D-03).
      setError(GENERIC_ERROR);
    } finally {
      setSubmitting(false);
    }
  };

  if (hasPosted !== false) return null;

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* Scrim — swallows touches so the dimmed list underneath is unreachable */}
      <Pressable
        style={[StyleSheet.absoluteFill, styles.scrim]}
        onPress={() => {}}
        accessible={false}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        pointerEvents="box-none"
        style={[styles.center, { paddingBottom: tabBarSpace }]}
      >
        <GlassCard style={styles.card}>
          <Text style={[styles.title, { color: colors.text }]}>Introduce yourself</Text>
          <Text style={[styles.body, { color: colors.textMuted }]}>
            Post a short hello to your Local Chat to start chatting.
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                color: colors.text,
                borderColor: colors.border,
                backgroundColor: colors.surfaceGlass,
              },
            ]}
            multiline
            maxLength={INTRO_MAX_LENGTH}
            placeholder={INTRO_PLACEHOLDER}
            placeholderTextColor={colors.textMuted}
            value={text}
            onChangeText={setText}
            textAlignVertical="top"
          />
          <View style={styles.counterRow}>
            <Text style={[styles.hint, { color: colors.textMuted }]}>
              {len < INTRO_MIN_LENGTH ? `At least ${INTRO_MIN_LENGTH} characters` : ''}
            </Text>
            <Text style={[styles.counter, { color: colors.textMuted }]}>
              {`${len}/${INTRO_MAX_LENGTH}`}
            </Text>
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <PillButton
            title={error ? 'Try again' : 'Post intro'}
            onPress={onSubmit}
            disabled={len < INTRO_MIN_LENGTH || submitting}
            loading={submitting}
          />
        </GlassCard>
      </KeyboardAvoidingView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scrim: {
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  title: {
    fontSize: 20,
    fontFamily: FONTS.bold,
  },
  body: {
    fontSize: 14,
    fontFamily: FONTS.regular,
    lineHeight: 20,
  },
  input: {
    minHeight: 110,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: 15,
    fontFamily: FONTS.regular,
  },
  counterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  hint: {
    fontSize: 12,
    fontFamily: FONTS.regular,
  },
  counter: {
    fontSize: 12,
    fontFamily: FONTS.medium,
  },
  error: {
    fontSize: 13,
    fontFamily: FONTS.medium,
    color: COLORS.error,
  },
});

export default IntroGate;
