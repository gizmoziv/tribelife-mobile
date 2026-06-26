import type { AudioPlayer } from 'expo-audio';

// ── Single-player enforcement (VOICE-12) ─────────────────────────────────────
// A module-level ref to the currently-playing voice player. Every
// VoicePlayerBubble shares this singleton so that starting playback on one
// bubble pauses any other bubble that was playing.

let activePlayer: AudioPlayer | null = null;

/**
 * Mark `player` as the active voice player. Pauses the previously-active player
 * first (if it is a different instance) so only one voice clip plays at a time.
 * Call this from a bubble's play tap, immediately before player.play().
 */
export function setActiveVoicePlayer(player: AudioPlayer): void {
  if (activePlayer && activePlayer !== player) {
    try {
      activePlayer.pause();
    } catch {
      // The previous player may already be released; ignore.
    }
  }
  activePlayer = player;
}

/**
 * Clear the active ref, but ONLY if `player` is the one currently held. This
 * guards against an unmounting bubble clobbering a newer active player: if
 * bubble A stops and bubble B has since become active, A's cleanup must not
 * null out B. Call this from a bubble's unmount/stop cleanup.
 */
export function clearActiveVoicePlayer(player: AudioPlayer): void {
  if (activePlayer === player) {
    activePlayer = null;
  }
}
