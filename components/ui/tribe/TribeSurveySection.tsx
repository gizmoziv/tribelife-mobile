// TribeSurveySection — Community survey below the News carousel (Plan 19-03).
//
// Four state branches:
//   1. loading     — skeleton ActivityIndicator under "Coming Soon" title
//   2. error / no active survey — neutral "More coming soon" placeholder (D-10, R7)
//   3. votable     — 2×2 flexWrap chip grid, inline Other TextInput, explicit Submit (D-04–D-06)
//   4. voted       — read-only horizontal % bar results + "Your vote" highlight (D-07–D-09)
//
// On successful vote the component re-fetches so hasVoted flips server-side.
// A 409 ("Already voted" or "No active survey") is treated as already-voted → re-fetch.
// The submitting flag disables the Submit button during the in-flight request (T-19-12).
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  Pressable,
  TextInput,
  StyleSheet,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { FONTS, SPACING, COLORS, RADIUS } from '@/constants';
import { useTheme } from '@/contexts/ThemeContext';
import { tribeApi, type SurveyPayload, type VoteBody } from '@/services/api';

// ── Component ─────────────────────────────────────────────────────────────────

export function TribeSurveySection() {
  const { colors } = useTheme();

  // Server data
  const [data, setData] = useState<SurveyPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Votable-branch local UI state
  const [selectedOptionId, setSelectedOptionId] = useState<number | null>(null);
  const [otherText, setOtherText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchSurvey = useCallback(async () => {
    setError(null);
    try {
      const result = await tribeApi.survey();
      setData(result);
    } catch {
      setError("Couldn't load survey.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSurvey();
  }, [fetchSurvey]);

  // ── Submit handler ─────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    if (selectedOptionId === null) return;
    const survey = data?.survey;
    if (!survey) return;

    const chosenOption = survey.options.find(o => o.id === selectedOptionId);
    if (!chosenOption) return;

    const body: VoteBody = {
      optionId: selectedOptionId,
      ...(chosenOption.isOther ? { otherText: otherText.trim() } : {}),
    };

    setSubmitting(true);
    setSubmitError(null);

    try {
      await tribeApi.vote(body);
    } catch (err: unknown) {
      // 409 = already voted or no active survey — treat as voted, re-fetch
      const status = (err as { status?: number })?.status;
      if (status !== 409) {
        setSubmitting(false);
        setSubmitError('Something went wrong — please try again.');
        return;
      }
    }

    // On success or 409: re-fetch so the server-driven hasVoted flips the view
    setLoading(true);
    setSelectedOptionId(null);
    setOtherText('');
    setSubmitting(false);
    await fetchSurvey();
  }, [selectedOptionId, otherText, data, fetchSurvey]);

  // ── Loading state ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.section}>
        <Text style={[styles.title, { color: colors.text }]}>Coming Soon</Text>
        <View style={[styles.skeleton, { backgroundColor: colors.surface }]}>
          <ActivityIndicator color={colors.textMuted} />
        </View>
      </View>
    );
  }

  // ── Error / no active survey — neutral placeholder (D-10, R7) ─────────────

  if ((error && !data) || !data?.survey) {
    return (
      <View style={styles.section}>
        <Text style={[styles.title, { color: colors.text }]}>Coming Soon</Text>
        <View style={[styles.errorBox, { backgroundColor: colors.surface }]}>
          <Text style={[styles.errorText, { color: colors.textMuted }]}>
            More coming soon
          </Text>
        </View>
      </View>
    );
  }

  const { survey } = data;

  // ── Voted — read-only results (D-07/D-08/D-09) ────────────────────────────

  if (survey.hasVoted) {
    const totalVotes = survey.options.reduce((sum, o) => sum + o.count, 0);

    return (
      <View style={styles.section}>
        <Text style={[styles.title, { color: colors.text }]}>Coming Soon</Text>
        <View style={styles.content}>
          <Text style={[styles.resultsSubtext, { color: colors.textMuted }]}>
            Thanks for voting — here's what the Tribe wants:
          </Text>
          {survey.options.map(option => {
            const pct = totalVotes > 0
              ? Math.round((option.count / totalVotes) * 100)
              : 0;
            const isOwn = option.id === survey.votedOptionId;
            return (
              <View key={option.id} style={styles.barRow}>
                <View style={styles.barLabelRow}>
                  <Text
                    style={[
                      styles.barLabel,
                      { color: isOwn ? COLORS.primary : colors.text },
                    ]}
                    numberOfLines={2}
                  >
                    {option.label}
                  </Text>
                  {isOwn && (
                    <View style={[styles.yourVoteTag, { backgroundColor: COLORS.primaryGlow }]}>
                      <Text style={[styles.yourVoteText, { color: COLORS.primary }]}>
                        Your vote
                      </Text>
                    </View>
                  )}
                </View>
                <View style={[styles.barTrack, { backgroundColor: colors.surface }]}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        width: `${pct}%` as `${number}%`,
                        backgroundColor: isOwn ? COLORS.primary : colors.textMuted,
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.barPct, { color: colors.textMuted }]}>
                  {pct}%
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    );
  }

  // ── Votable — chip grid + Other field + Submit (D-04/D-05/D-06) ───────────

  const selectedOption = survey.options.find(o => o.id === selectedOptionId);
  const isOtherSelected = selectedOption?.isOther ?? false;
  const submitDisabled =
    submitting ||
    selectedOptionId === null ||
    (isOtherSelected && otherText.trim() === '');

  return (
    <View style={styles.section}>
      <Text style={[styles.title, { color: colors.text }]}>
        {survey.questionText}
      </Text>
      <View style={styles.content}>
        {/* 2×2 chip grid */}
        <View style={styles.chipGrid}>
          {survey.options.map(option => {
            const selected = option.id === selectedOptionId;
            return (
              <Pressable
                key={option.id}
                style={[
                  styles.chip,
                  {
                    backgroundColor: selected ? COLORS.primary : colors.surface,
                    borderColor: selected ? COLORS.primary : colors.textMuted,
                  },
                ]}
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSelectedOptionId(option.id);
                  if (!option.isOther) setOtherText('');
                  setSubmitError(null);
                }}
              >
                <Text
                  style={[
                    styles.chipLabel,
                    { color: selected ? '#FFFFFF' : colors.text },
                  ]}
                  numberOfLines={2}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Inline Other text field — shown only when Other chip is selected */}
        {isOtherSelected && (
          <TextInput
            style={[
              styles.otherInput,
              {
                backgroundColor: colors.surface,
                color: colors.text,
                borderColor: colors.textMuted,
              },
            ]}
            placeholder="Tell us…"
            placeholderTextColor={colors.textMuted}
            value={otherText}
            onChangeText={setOtherText}
            multiline
            maxLength={200}
          />
        )}

        {/* Submit error */}
        {submitError !== null && (
          <Text style={[styles.submitError, { color: COLORS.error }]}>
            {submitError}
          </Text>
        )}

        {/* Explicit Submit button (D-06) */}
        <Pressable
          style={[
            styles.submitButton,
            {
              backgroundColor: submitDisabled
                ? colors.surface
                : COLORS.primary,
              opacity: submitDisabled ? 0.5 : 1,
            },
          ]}
          onPress={() => { void handleSubmit(); }}
          disabled={submitDisabled}
        >
          <Text
            style={[
              styles.submitLabel,
              { color: submitDisabled ? colors.textMuted : '#FFFFFF' },
            ]}
          >
            {submitting ? 'Submitting…' : 'Submit'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  section: {
    marginBottom: SPACING.lg,
  },
  title: {
    fontFamily: FONTS.semiBold,
    fontSize: 18,
    paddingHorizontal: SPACING.page,
    marginBottom: SPACING.sm,
  },
  content: {
    paddingHorizontal: SPACING.page,
    gap: 12,
  },
  skeleton: {
    marginHorizontal: SPACING.page,
    height: 80,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBox: {
    marginHorizontal: SPACING.page,
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  errorText: {
    fontFamily: FONTS.regular,
    fontSize: 14,
  },

  // ── Chip grid ───────────────────────────────────────────────────────────────
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  chip: {
    width: '48%',
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  chipLabel: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    textAlign: 'center',
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

  // ── Submit ──────────────────────────────────────────────────────────────────
  submitError: {
    fontFamily: FONTS.regular,
    fontSize: 13,
  },
  submitButton: {
    borderRadius: RADIUS.sm,
    paddingVertical: 13,
    alignItems: 'center',
  },
  submitLabel: {
    fontFamily: FONTS.semiBold,
    fontSize: 15,
  },

  // ── Results bars ────────────────────────────────────────────────────────────
  resultsSubtext: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    marginBottom: 4,
  },
  barRow: {
    gap: 4,
  },
  barLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  barLabel: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    flexShrink: 1,
  },
  yourVoteTag: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  yourVoteText: {
    fontFamily: FONTS.semiBold,
    fontSize: 11,
  },
  barTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
    minWidth: 4,
  },
  barPct: {
    fontFamily: FONTS.regular,
    fontSize: 12,
  },
});
