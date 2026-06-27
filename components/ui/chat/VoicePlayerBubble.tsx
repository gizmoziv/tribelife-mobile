import React, { useEffect, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useTheme } from '@/contexts/ThemeContext';
import { COLORS, FONTS, SPACING } from '@/constants';
import { WAVEFORM_BARS, formatDuration } from '@/constants/voice';
import {
  setActiveVoicePlayer,
  clearActiveVoicePlayer,
} from '@/services/activeVoicePlayer';

// ── Voice Player Bubble (VOICE-10..14) ───────────────────────────────────────
// Self-contained playback row + transcript section rendered INSIDE MessageBubble
// when message.voiceUrl is present. The surrounding bubble chrome (avatar, sender
// handle, reply preview, timestamp, reactions) stays in MessageBubble — this
// component only owns the player row and the transcript reveal.
//
// - 36pt play/pause circle (single-player enforced via activeVoicePlayer ref).
// - 40-bar waveform rendered from the precomputed voiceWaveform peaks, resampled
//   to exactly 40 bars so every recipient device shows an identical waveform.
// - Live remaining-time countdown derived from the player status.
// - "Show transcript" toggle rendered ONLY when voiceTranscript is non-empty.
//   When showTranslation is true, the parent passes the translated text in via
//   transcriptOverride, reusing the existing translation flow (no new logic).
//
// Scrubbing is intentionally NOT implemented (VOICE-FUT-02 deferred).

// ── Bar geometry (UI-SPEC 3b) ────────────────────────────────────────────────
const BAR_WIDTH = 2;
const BAR_GAP = 2;
const BAR_MIN_HEIGHT = 4;
const BAR_AMPLITUDE_RANGE = 20; // height = 4 + amplitude*20 → 4..24pt
const PLAY_BUTTON_SIZE = 36;
// Fixed width of the 40-bar track. The waveform uses a FIXED width (not flex:1)
// so the voice bubble sizes to contain it exactly — flex:1 in a content-sized
// bubble either collapsed the track to a sliver (no transcript) or pushed it
// past the bubble's edge.
const WAVEFORM_WIDTH = WAVEFORM_BARS * BAR_WIDTH + (WAVEFORM_BARS - 1) * BAR_GAP;

// Hebrew/Arabic RTL detection — mirrors MessageBubble.renderContent.
function isRTLText(text: string): boolean {
  return /[֐-׿؀-ۿ]/.test(text);
}

/**
 * Resample/pad an arbitrary-length normalized (0–1) peaks array to EXACTLY
 * WAVEFORM_BARS bars (Pitfall 5). Stored arrays may differ in length per
 * recording (the recorder samples at 250ms over a variable duration), so the
 * display bars must be derived deterministically here. Averages adjacent bins
 * when longer, repeats values when shorter.
 */
function resampleToBars(peaks: number[]): number[] {
  if (peaks.length === 0) {
    return Array(WAVEFORM_BARS).fill(0.05);
  }
  if (peaks.length === WAVEFORM_BARS) {
    return peaks;
  }
  const result: number[] = [];
  const ratio = peaks.length / WAVEFORM_BARS;
  for (let i = 0; i < WAVEFORM_BARS; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.floor((i + 1) * ratio);
    const slice = peaks.slice(start, Math.max(start + 1, end));
    const avg = slice.reduce((a, b) => a + b, 0) / slice.length;
    result.push(avg);
  }
  return result;
}

function PlayIcon({ color }: { color: string }) {
  // Lucide `play` — filled triangle.
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill={color}>
      <Path d="M6 4v16l13-8z" />
    </Svg>
  );
}

function PauseIcon({ color }: { color: string }) {
  // Lucide `pause` — two filled bars.
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill={color}>
      <Path d="M6 4h4v16H6zM14 4h4v16h-4z" />
    </Svg>
  );
}

export interface VoicePlayerBubbleProps {
  voiceUrl: string;
  voiceDurationMs?: number | null;
  voiceWaveform?: number[] | null;
  voiceTranscript?: string | null;
  isMe: boolean;
  /**
   * When the parent has a premium translation active (showTranslation &&
   * translatedContent), it passes the translated transcript here so the revealed
   * transcript shows the translation instead of the original. Reuses the existing
   * translation flow — no new translation logic in this component.
   */
  transcriptOverride?: string | null;
  /** Transcript expanded state — controlled by MessageBubble so the translation
   * toggle can be gated on it and translating can auto-reveal it. */
  showTranscript: boolean;
  /** Toggle the transcript open/closed. */
  onToggleTranscript: () => void;
}

export function VoicePlayerBubble({
  voiceUrl,
  voiceDurationMs,
  voiceWaveform,
  voiceTranscript,
  isMe,
  transcriptOverride,
  showTranscript,
  onToggleTranscript,
}: VoicePlayerBubbleProps) {
  const { colors } = useTheme();

  const player = useAudioPlayer(voiceUrl);
  const status = useAudioPlayerStatus(player);

  // Release the native player + clear the single-player ref on unmount so native
  // AudioPlayer instances don't accumulate across a long message list (Pitfall 7,
  // T-26-13).
  useEffect(() => {
    return () => {
      // Only clear the single-player ref. Do NOT call player.remove(): useAudioPlayer
      // (useReleasingSharedObject) already releases the native player on unmount, so a
      // manual remove() double-frees it → NativeSharedObjectNotFoundException log spam
      // on every chat exit / Fast Refresh.
      clearActiveVoicePlayer(player);
    };
    // Mount/unmount only — `player` is stable for this bubble's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // currentTime/duration are in SECONDS (expo-audio). Prefer the player's loaded
  // duration; fall back to the stored voiceDurationMs (ms) before the source
  // loads so the countdown shows the right full duration at idle.
  const fullDurationSec =
    status.duration && status.duration > 0
      ? status.duration
      : (voiceDurationMs ?? 0) / 1000;

  const playing = status.playing;
  const elapsedSec = status.currentTime ?? 0;

  // Remaining countdown: counts down while playing, full duration at idle/end.
  const remainingMs = playing
    ? Math.max(0, (fullDurationSec - elapsedSec) * 1000)
    : fullDurationSec * 1000;

  const playbackFraction =
    fullDurationSec > 0 ? Math.min(1, elapsedSec / fullDurationSec) : 0;
  const playedBars = playing || elapsedSec > 0
    ? Math.floor(playbackFraction * WAVEFORM_BARS)
    : 0;

  const bars = useMemo(
    () => resampleToBars(voiceWaveform && voiceWaveform.length ? voiceWaveform : []),
    [voiceWaveform],
  );

  const handlePlayPause = () => {
    if (playing) {
      player.pause();
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // If playback already finished, restart from the beginning.
    if (status.didJustFinish || elapsedSec >= fullDurationSec) {
      player.seekTo(0).catch(() => {});
    }
    setActiveVoicePlayer(player); // pauses any other playing bubble (VOICE-12)
    player.play();
  };

  // ── Colors (me gradient bubble vs others' surface bubble) ──────────────────
  // The "me" bubble is a dark gradient in BOTH light and dark themes, so its
  // player chrome must be white-based for contrast. The "others" bubble sits on
  // the theme surface, so it uses primary/theme tokens that already adapt to
  // light vs dark.
  const playBg = isMe ? 'rgba(255,255,255,0.2)' : COLORS.primaryGlow;
  const playIconColor = isMe ? '#FFFFFF' : COLORS.primary;
  const playedColor = isMe ? '#FFFFFF' : COLORS.primary;
  const unplayedColor = isMe ? 'rgba(255,255,255,0.4)' : colors.textMuted;
  const countdownColor = isMe
    ? 'rgba(255,255,255,0.9)'
    : playing
      ? COLORS.primary
      : colors.textMuted;
  const toggleColor = isMe ? 'rgba(255,255,255,0.7)' : COLORS.primary;
  const transcriptColor = isMe ? '#FFFFFF' : colors.text;

  // The transcript to display: translated value when the parent supplies one,
  // else the original voiceTranscript. The toggle is gated on voiceTranscript
  // existing (the sender's own echo may have a null transcript — Pitfall 2).
  const transcriptText = transcriptOverride ?? voiceTranscript ?? '';
  const hasTranscript =
    typeof voiceTranscript === 'string' && voiceTranscript.trim().length > 0;

  return (
    <View>
      {/* ── Player row ──────────────────────────────────────────────────── */}
      <View style={styles.playerRow}>
        <Pressable
          onPress={handlePlayPause}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={playing ? 'Pause voice message' : 'Play voice message'}
          style={({ pressed }) => [
            styles.playButton,
            { backgroundColor: playBg, opacity: pressed ? 0.75 : 1 },
          ]}
        >
          {playing ? (
            <PauseIcon color={playIconColor} />
          ) : (
            <PlayIcon color={playIconColor} />
          )}
        </Pressable>

        <View
          style={styles.waveform}
          accessibilityRole="image"
          accessibilityLabel="Voice message waveform"
        >
          {bars.map((amp, i) => (
            <View
              key={i}
              style={{
                width: BAR_WIDTH,
                marginRight: i === bars.length - 1 ? 0 : BAR_GAP,
                height: BAR_MIN_HEIGHT + amp * BAR_AMPLITUDE_RANGE,
                borderRadius: 1,
                backgroundColor: i < playedBars ? playedColor : unplayedColor,
              }}
            />
          ))}
        </View>

      </View>

      {/* Countdown sits below the play/pause button so the waveform gets the
          full row width (VOICE-10). */}
      <Text
        style={[styles.countdown, { color: countdownColor }]}
        numberOfLines={1}
      >
        {formatDuration(remainingMs)}
      </Text>

      {/* ── Transcript section (D-03) — only when a transcript exists ────── */}
      {hasTranscript && (
        <>
          {showTranscript && (
            <Text
              style={[
                styles.transcript,
                {
                  color: transcriptColor,
                  writingDirection: isRTLText(transcriptText) ? 'rtl' : 'ltr',
                },
              ]}
            >
              {transcriptText}
            </Text>
          )}
          <TouchableOpacity
            onPress={onToggleTranscript}
            style={styles.transcriptToggle}
            accessibilityRole="button"
          >
            <Text style={[styles.transcriptToggleText, { color: toggleColor }]}>
              {showTranscript ? 'Hide transcript' : 'Show transcript'}
            </Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

export default VoicePlayerBubble;

const styles = StyleSheet.create({
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  playButton: {
    width: PLAY_BUTTON_SIZE,
    height: PLAY_BUTTON_SIZE,
    borderRadius: PLAY_BUTTON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waveform: {
    width: WAVEFORM_WIDTH,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  countdown: {
    marginTop: 4,
    fontSize: 11,
    fontFamily: FONTS.medium,
    fontVariant: ['tabular-nums'],
  },
  transcript: {
    fontSize: 15,
    fontFamily: FONTS.regular,
    lineHeight: 22,
    marginTop: SPACING.sm,
  },
  transcriptToggle: {
    marginTop: 4,
  },
  transcriptToggleText: {
    fontSize: 12,
    fontFamily: FONTS.regular,
  },
});
