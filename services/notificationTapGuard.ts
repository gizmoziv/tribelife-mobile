import { navTrace } from '@/services/navTrace';

// ── Notification-tap guard ────────────────────────────────────────────────
// A notification tap is the user's explicit navigation intent and must not be
// overridden by a passive navigation that resolves a moment later (the
// foreground "bump to Beacon > Matches" in app/_layout.tsx, the post-login
// landing replace). Every tap-navigation path stamps the time here; the
// passive paths ask wasNotificationTapRecent() right before they navigate.
//
// Module-scoped on purpose: the tap handler, the AppState handler and the
// Android FCM consumer live in different files and there is exactly one app
// instance per JS runtime.

const DEFAULT_TAP_WINDOW_MS = 15000;

let lastTapAt = 0;

/** Stamp "a notification tap is navigating right now". Call at the START of every tap path. */
export function markNotificationTap(source: string): void {
  lastTapAt = Date.now();
  navTrace('markNotificationTap', { source });
}

/** True when a notification-tap navigation started within the last `windowMs`. */
export function wasNotificationTapRecent(windowMs: number = DEFAULT_TAP_WINDOW_MS): boolean {
  return lastTapAt > 0 && Date.now() - lastTapAt < windowMs;
}
