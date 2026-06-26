import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import {
  useAudioRecorder,
  useAudioRecorderState,
  setAudioModeAsync,
  requestRecordingPermissionsAsync,
  RecordingPresets,
} from 'expo-audio';
import { useTheme } from '@/contexts/ThemeContext';
import { COLORS, FONTS, SPACING } from '@/constants';
import {
  buildWaveform,
  formatDuration,
  VOICE_MAX_DURATION_MS,
} from '@/constants/voice';
import {
  requestVoiceUploadUrl,
  uploadVoiceToSpaces,
  confirmVoiceUpload,
} from '@/services/voiceUpload';

// ── Recording Bar ────────────────────────────────────────────────────────────
// Self-contained record → metering → upload → onSent pipeline. The host mounts
// this AFTER the mic tap; this component owns the ENTIRE lifecycle so the per-
// screen wiring (26-04) stays thin and identical across DM/timezone/globe.
//
// Lifecycle:
//   mount → request mic permission
//     denied  → native Alert (Open Settings) + onDiscard (bar never opens, D-07)
//     granted → setAudioModeAsync(allowsRecording:true) → prepare + record
//   recording → poll metering@250ms into a ref, drive M:SS timer from durationMillis
//     ✕ discard → stop+reset, nothing uploaded/emitted → onDiscard
//     ✓ / 2-min cap → stop → build 40-bar waveform → upload (presigned) → onSent
//   upload failure (D-02) → KEEP clip, show "Failed to send. Tap to retry."

const VOICE_RECORDING_OPTIONS = {
  ...RecordingPresets.HIGH_QUALITY,
  isMeteringEnabled: true,
};

// Internal phase machine for the bar's center area + right control.
type Phase = 'recording' | 'uploading' | 'failed';

function XIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M18 6 6 18M6 6l12 12" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function CheckIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M20 6 9 17l-5-5" stroke="#FFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function RetryIcon() {
  // Lucide `rotate-ccw` — reload/retry affordance, white on the gradient circle.
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M3 12a9 9 0 1 0 3-6.7L3 8" stroke="#FFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M3 3v5h5" stroke="#FFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export interface RecordingBarProps {
  /** Return the host to its idle composer (mic in the send slot). */
  onDiscard: () => void;
  /** The host emits the voice message with this precomputed payload. */
  onSent: (cdnUrl: string, durationMs: number, waveform: number[]) => void;
}

export function RecordingBar({ onDiscard, onSent }: RecordingBarProps) {
  const { colors } = useTheme();

  const recorder = useAudioRecorder(VOICE_RECORDING_OPTIONS);
  const recorderState = useAudioRecorderState(recorder, 250);

  const [phase, setPhase] = useState<Phase>('recording');
  const [errorText, setErrorText] = useState<string | null>(null);
  // Frozen at finalize so the timer label stops counting during upload/failure.
  const [finalDurationMs, setFinalDurationMs] = useState<number | null>(null);

  // dBFS metering samples collected during recording → resampled to 40 bars.
  const meteringRef = useRef<number[]>([]);
  // The recorded local uri, captured on stop — KEPT across retries (D-02).
  const recordedUriRef = useRef<string | null>(null);
  const recordedWaveformRef = useRef<number[] | null>(null);
  // Guards against double-finalize (✓ tap racing the 2-min auto-stop).
  const finalizingRef = useRef(false);
  // True once permission is granted and recording has actually started, so
  // unmount cleanup only touches a live recorder.
  const startedRef = useRef(false);
  // Avoid clobbering onDiscard/onSent across the async record start.
  const cancelledRef = useRef(false);

  // ── Permission + start ──────────────────────────────────────────────────
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { granted } = await requestRecordingPermissionsAsync();
        if (!active || cancelledRef.current) return;
        if (!granted) {
          Alert.alert(
            'Microphone access is off',
            'Enable microphone access in Settings to send voice messages.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: () => Linking.openSettings() },
            ],
          );
          onDiscard();
          return;
        }
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        if (!active || cancelledRef.current) return;
        await recorder.prepareToRecordAsync(VOICE_RECORDING_OPTIONS);
        if (!active || cancelledRef.current) return;
        recorder.record();
        startedRef.current = true;
      } catch {
        if (!active || cancelledRef.current) return;
        // Could not start recording at all — surface and bail to idle.
        Alert.alert('Recording unavailable', 'Could not start recording. Please try again.');
        onDiscard();
      }
    })();
    return () => {
      active = false;
    };
    // Mount-only: recorder/onDiscard are stable for this bar's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Collect metering samples while recording ────────────────────────────
  useEffect(() => {
    if (phase !== 'recording') return;
    if (typeof recorderState.metering === 'number') {
      meteringRef.current.push(recorderState.metering);
    }
  }, [recorderState.metering, phase]);

  // ── Restore audio mode + release recorder on unmount ────────────────────
  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      if (startedRef.current) {
        try {
          recorder.stop();
        } catch {
          // already stopped/released — ignore
        }
      }
      // Always toggle recording OFF so a later playback isn't earpiece-routed
      // (iOS Pitfall 1). Fire-and-forget; component is unmounting.
      setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Stop the recorder + compute the kept clip (uri + 40-bar waveform) ────
  const stopAndCapture = useCallback(async (): Promise<{ uri: string; durationMs: number } | null> => {
    const durationMs = recorderState.durationMillis;
    try {
      await recorder.stop();
    } catch {
      // ignore — may already be stopped
    }
    startedRef.current = false;
    // iOS earpiece Pitfall 1: drop allowsRecording before any playback.
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    const uri = recorder.uri;
    if (!uri) return null;
    recordedUriRef.current = uri;
    recordedWaveformRef.current = buildWaveform(meteringRef.current);
    return { uri, durationMs };
  }, [recorder, recorderState.durationMillis]);

  // ── Upload the already-recorded clip (reused on retry — D-02) ────────────
  const runUpload = useCallback(
    async (uri: string, durationMs: number, waveform: number[]) => {
      setPhase('uploading');
      setErrorText(null);
      try {
        const { uploadUrl, key } = await requestVoiceUploadUrl();
        await uploadVoiceToSpaces(uploadUrl, uri);
        const { cdnUrl } = await confirmVoiceUpload(key);
        if (cancelledRef.current) return;
        onSent(cdnUrl, durationMs, waveform);
      } catch (err) {
        if (cancelledRef.current) return;
        // Keep the clip; surface the message (429 rate-limit text included).
        setErrorText(err instanceof Error ? err.message : 'Failed to send. Tap to retry.');
        setPhase('failed');
      }
    },
    [onSent],
  );

  // ── Finalize (✓ or auto-stop) ────────────────────────────────────────────
  const handleConfirm = useCallback(async () => {
    if (finalizingRef.current || phase !== 'recording') return;
    finalizingRef.current = true;
    const captured = await stopAndCapture();
    if (cancelledRef.current) return;
    if (!captured) {
      finalizingRef.current = false;
      Alert.alert('Recording failed', 'No audio was captured. Please try again.');
      onDiscard();
      return;
    }
    setFinalDurationMs(captured.durationMs);
    await runUpload(captured.uri, captured.durationMs, recordedWaveformRef.current ?? []);
  }, [phase, stopAndCapture, runUpload, onDiscard]);

  // ── 2-minute cap → auto-finalize exactly as if ✓ was tapped ──────────────
  useEffect(() => {
    if (phase !== 'recording') return;
    if (recorderState.durationMillis >= VOICE_MAX_DURATION_MS) {
      handleConfirm();
    }
  }, [recorderState.durationMillis, phase, handleConfirm]);

  // ── Discard ───────────────────────────────────────────────────────────────
  const handleDiscard = useCallback(async () => {
    cancelledRef.current = true;
    if (startedRef.current) {
      try {
        await recorder.stop();
      } catch {
        // ignore
      }
      startedRef.current = false;
    }
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    onDiscard();
  }, [recorder, onDiscard]);

  // ── Retry the kept clip (D-02) ───────────────────────────────────────────
  const handleRetry = useCallback(() => {
    const uri = recordedUriRef.current;
    if (!uri || finalDurationMs == null) return;
    runUpload(uri, finalDurationMs, recordedWaveformRef.current ?? []);
  }, [runUpload, finalDurationMs]);

  // The timer label: live while recording, frozen at the final value after.
  const timerMs = finalDurationMs ?? recorderState.durationMillis;

  return (
    <View style={styles.bar}>
      {/* Left: discard ✕ — always active (recording, uploading, failed). */}
      <Pressable
        onPress={handleDiscard}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Discard recording"
        style={({ pressed }) => [styles.sideButton, { opacity: pressed ? 0.6 : 1 }]}
      >
        <XIcon color={colors.textMuted} />
      </Pressable>

      {/* Center: recording row / failure row. */}
      {phase === 'failed' ? (
        <Pressable
          onPress={handleRetry}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Retry sending voice message"
          style={styles.center}
        >
          <Text style={styles.errorText} numberOfLines={1}>
            {errorText ?? 'Failed to send. Tap to retry.'}
          </Text>
        </Pressable>
      ) : (
        <View style={styles.center}>
          {phase === 'recording' && <View style={styles.dot} />}
          <Text style={styles.timer}>{formatDuration(timerMs)}</Text>
        </View>
      )}

      {/* Right: confirm ✓ / uploading spinner / retry. */}
      {phase === 'uploading' ? (
        <View style={styles.sideButton}>
          <ActivityIndicator size="small" color={COLORS.primary} />
        </View>
      ) : phase === 'failed' ? (
        <Pressable
          onPress={handleRetry}
          accessibilityRole="button"
          accessibilityLabel="Retry sending voice message"
          style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1 }]}
        >
          <LinearGradient colors={[...COLORS.gradientPrimary]} style={styles.confirmButton}>
            <RetryIcon />
          </LinearGradient>
        </Pressable>
      ) : (
        <Pressable
          onPress={handleConfirm}
          accessibilityRole="button"
          accessibilityLabel="Send voice message"
          style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1 }]}
        >
          <LinearGradient colors={[...COLORS.gradientPrimary]} style={styles.confirmButton}>
            <CheckIcon />
          </LinearGradient>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    height: 56,
  },
  sideButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.error,
  },
  timer: {
    fontSize: 12,
    fontFamily: FONTS.regular,
    color: COLORS.primary,
  },
  errorText: {
    fontSize: 13,
    fontFamily: FONTS.regular,
    color: COLORS.error,
  },
  confirmButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default RecordingBar;
