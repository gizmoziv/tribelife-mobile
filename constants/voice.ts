// ── Voice message constants + helpers ────────────────────────────────────────
// Single source of truth for voice-message client primitives shared across the
// record path (26-02), player bubble (26-03), and per-composer wiring (26-04).

/**
 * The exact fallback content the backend stores in messages.content for voice
 * rows (Pitfall 3 / D-05). Clients match against this string to detect a voice
 * message in reply-quote previews and PinnedBar previews where no voiceUrl is
 * carried. MUST stay byte-for-byte identical to the backend constant.
 */
export const VOICE_FALLBACK_STRING = '🎤 Voice message — update to listen';

/** Clean list/preview label the new client shows for a voice message. */
export const VOICE_PREVIEW_LABEL = '🎤 Voice message';

/**
 * Override the old-client fallback string with a clean label for chat-list
 * previews. The backend stores VOICE_FALLBACK_STRING as messages.content so
 * legacy clients show something; the new client renders this clean label
 * instead (mirrors MessageBubble overriding content with the player bubble).
 * Any non-voice preview passes through untouched.
 */
export function voicePreviewLabel<T extends string | null | undefined>(text: T): T | string {
  return text === VOICE_FALLBACK_STRING ? VOICE_PREVIEW_LABEL : text;
}

/**
 * Client-side recording cap (2 minutes). Mirrors the server-side defense-in-depth
 * gate (durationMs > 120000 → rejected). The client value is untrusted by the
 * server; this just stops recording locally at the cap.
 */
export const VOICE_MAX_DURATION_MS = 120000;

/** Number of amplitude bars rendered in the waveform (UI-SPEC). */
export const WAVEFORM_BARS = 40;

/**
 * dBFS normalization bounds. metering from expo-audio is in dBFS, typically
 * -160 (silence) to 0 (full amplitude).
 *
 * MIN_DB is a TUNABLE ASSUMPTION (RESEARCH A1): -60 dBFS is treated as the
 * practical silence floor — values below this map to the minimum bar height.
 * Adjust if bars look too tall/short on real-device testing.
 */
export const MIN_DB = -60;
export const MAX_DB = 0;

/** Minimum normalized bar value so no bar disappears entirely (Pitfall 4). */
const MIN_BAR_FLOOR = 0.05;

/**
 * Normalize raw dBFS metering samples to a fixed-length 0–1 amplitude array.
 *
 * - Clamps each sample to 0–1 against [MIN_DB, MAX_DB].
 * - Applies a 0.05 minimum floor so silence still renders a visible bar.
 * - Resamples to exactly WAVEFORM_BARS values: averages adjacent bins when the
 *   input is longer than the target, repeats values when shorter (Pitfall 5).
 *
 * Pure function — no side effects — so it is trivially testable and identical
 * on every recipient device.
 */
export function buildWaveform(rawDb: number[]): number[] {
  if (rawDb.length === 0) {
    return Array(WAVEFORM_BARS).fill(MIN_BAR_FLOOR);
  }

  // 1. Normalize each dB value to 0.0–1.0 with the silence floor.
  const normalized = rawDb.map((db) => {
    const scaled = (db - MIN_DB) / (MAX_DB - MIN_DB);
    return Math.max(MIN_BAR_FLOOR, Math.min(1, scaled));
  });

  // 2. Already the right length — nothing to resample.
  if (normalized.length === WAVEFORM_BARS) {
    return normalized;
  }

  // 3. Resample to exactly WAVEFORM_BARS bars.
  const result: number[] = [];
  const ratio = normalized.length / WAVEFORM_BARS;
  for (let i = 0; i < WAVEFORM_BARS; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.floor((i + 1) * ratio);
    // Guarantee at least one sample per bar (repeat when input < target).
    const slice = normalized.slice(start, Math.max(start + 1, end));
    const avg = slice.reduce((a, b) => a + b, 0) / slice.length;
    result.push(avg);
  }
  return result;
}

/**
 * Format a millisecond duration as M:SS. Used by the recording countdown and the
 * reply/pinned voice-preview labels ("🎤 Voice message · 0:34").
 */
export function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
