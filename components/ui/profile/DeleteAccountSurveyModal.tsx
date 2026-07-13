// DeleteAccountSurveyModal — anonymous exit survey on the account-deletion flow
// (v1.13 Phase 4). This modal REPLACES the old first confirmation Alert and IS
// the confirmation: it carries the "permanent, cannot be undone" warning. Both
// buttons delete the account — "Skip & delete" (no feedback) and "Submit &
// delete" (validate → submit anonymous feedback → delete). Feedback is
// single-select (unlike TribeSurveySection's multi-select) and never blocks the
// deletion.
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  TextInput,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { FONTS, SPACING, COLORS, RADIUS } from '@/constants';
import { useTheme } from '@/contexts/ThemeContext';

// ── Options (order matters) ────────────────────────────────────────────────────
const OPTIONS: { key: string; label: string }[] = [
  { key: 'few_people', label: 'Not enough people I know here' },
  { key: 'too_many_notifs', label: 'Too many notifications' },
  { key: 'privacy', label: 'Privacy concerns' },
  { key: 'not_useful', label: 'Not useful to me right now' },
  { key: 'other', label: 'Other' },
];

interface DeleteAccountSurveyModalProps {
  visible: boolean;
  onClose: () => void;
  onSkipAndDelete: () => void;
  onSubmitAndDelete: (feedback: { reason: string; otherText?: string }) => void;
  deleting?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DeleteAccountSurveyModal({
  visible,
  onClose,
  onSkipAndDelete,
  onSubmitAndDelete,
  deleting = false,
}: DeleteAccountSurveyModalProps) {
  const { colors } = useTheme();

  const [reason, setReason] = useState<string | null>(null);
  const [otherText, setOtherText] = useState('');

  // Reset internal state whenever the modal is dismissed/reopened.
  useEffect(() => {
    if (!visible) {
      setReason(null);
      setOtherText('');
    }
  }, [visible]);

  const isOtherSelected = reason === 'other';
  const submitDisabled =
    deleting ||
    reason === null ||
    (isOtherSelected && otherText.trim() === '');

  const handleSubmit = () => {
    if (reason === null) return;
    if (isOtherSelected && otherText.trim() === '') return;
    onSubmitAndDelete({
      reason,
      otherText: reason === 'other' ? otherText.trim() : undefined,
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => {
            if (!deleting) onClose();
          }}
        />
        <View
          style={[
            styles.card,
            { backgroundColor: colors.background, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.title, { color: colors.text }]}>
            Delete Account
          </Text>
          <Text style={[styles.warning, { color: colors.textMuted }]}>
            This will permanently delete your account and all your data. This
            action cannot be undone.
          </Text>
          <Text style={[styles.prompt, { color: colors.text }]}>
            Before you go — why are you leaving? (optional)
          </Text>

          {/* Single-select radio options */}
          <View style={styles.options}>
            {OPTIONS.map((option) => {
              const selected = reason === option.key;
              return (
                <Pressable
                  key={option.key}
                  style={[
                    styles.option,
                    {
                      backgroundColor: selected
                        ? COLORS.primaryGlow
                        : colors.surface,
                      borderColor: selected ? COLORS.primary : colors.border,
                    },
                  ]}
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setReason(option.key);
                    if (option.key !== 'other') setOtherText('');
                  }}
                  disabled={deleting}
                >
                  <View
                    style={[
                      styles.radio,
                      {
                        borderColor: selected ? COLORS.primary : colors.textMuted,
                      },
                    ]}
                  >
                    {selected && (
                      <View
                        style={[
                          styles.radioDot,
                          { backgroundColor: COLORS.primary },
                        ]}
                      />
                    )}
                  </View>
                  <Text
                    style={[
                      styles.optionLabel,
                      { color: selected ? colors.text : colors.textMuted },
                    ]}
                    numberOfLines={2}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Inline Other text field — shown only when Other is selected */}
          {isOtherSelected && (
            <TextInput
              style={[
                styles.otherInput,
                {
                  backgroundColor: colors.surface,
                  color: colors.text,
                  borderColor: colors.border,
                },
              ]}
              placeholder="Tell us more…"
              placeholderTextColor={colors.textMuted}
              value={otherText}
              onChangeText={setOtherText}
              multiline
              maxLength={1000}
              editable={!deleting}
            />
          )}

          {/* Two buttons, both delete */}
          <Pressable
            style={[
              styles.submitButton,
              {
                backgroundColor: submitDisabled ? colors.surface : COLORS.error,
                opacity: submitDisabled ? 0.5 : 1,
              },
            ]}
            onPress={handleSubmit}
            disabled={submitDisabled}
          >
            {deleting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text
                style={[
                  styles.submitLabel,
                  { color: submitDisabled ? colors.textMuted : '#FFFFFF' },
                ]}
              >
                Submit & delete
              </Text>
            )}
          </Pressable>

          <Pressable
            style={[styles.skipButton, { opacity: deleting ? 0.5 : 1 }]}
            onPress={onSkipAndDelete}
            disabled={deleting}
          >
            <Text style={[styles.skipLabel, { color: COLORS.error }]}>
              Skip & delete
            </Text>
          </Pressable>

          <Pressable
            style={styles.cancelButton}
            onPress={onClose}
            disabled={deleting}
          >
            <Text style={[styles.cancelLabel, { color: colors.textMuted }]}>
              Cancel
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.page,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    gap: 12,
  },
  title: {
    fontFamily: FONTS.semiBold,
    fontSize: 20,
  },
  warning: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  prompt: {
    fontFamily: FONTS.medium,
    fontSize: 14,
    marginTop: 4,
  },

  // ── Options ─────────────────────────────────────────────────────────────────
  options: {
    gap: 8,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  optionLabel: {
    fontFamily: FONTS.medium,
    fontSize: 14,
    flexShrink: 1,
  },

  // ── Other TextInput ─────────────────────────────────────────────────────────
  otherInput: {
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontFamily: FONTS.regular,
    fontSize: 14,
    minHeight: 60,
    textAlignVertical: 'top',
  },

  // ── Buttons ─────────────────────────────────────────────────────────────────
  submitButton: {
    borderRadius: RADIUS.sm,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 4,
  },
  submitLabel: {
    fontFamily: FONTS.semiBold,
    fontSize: 15,
  },
  skipButton: {
    borderRadius: RADIUS.sm,
    paddingVertical: 13,
    alignItems: 'center',
  },
  skipLabel: {
    fontFamily: FONTS.semiBold,
    fontSize: 15,
  },
  cancelButton: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  cancelLabel: {
    fontFamily: FONTS.medium,
    fontSize: 14,
  },
});

export default DeleteAccountSurveyModal;
