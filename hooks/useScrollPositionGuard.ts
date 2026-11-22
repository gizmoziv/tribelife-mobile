import { useCallback, useMemo, useRef, type RefObject } from 'react';
import type { FlatList, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

// ── Scroll-position guard for in-place message updates ───────────────────────
// Chat lists render `inverted`: contentOffset.y === 0 is the newest message
// (the visual bottom), so a native offset reset to 0 looks like "the chat just
// jumped to the bottom". Reacting to a message (own tap on the context menu /
// reaction chip, or someone else's `reaction:update`) only swaps one message
// object inside the data array — there is no JS scroll call on that path — yet
// it was reported to throw the reader from mid-history to the newest message.
//
// This guard pins the reader's offset around those updates. Two ways to arm it:
//   • holdPosition()      — right before applying an in-place update; pins the
//                           offset for a short tail after it.
//   • setOverlayOpen(...) — while the context menu / emoji picker is up (the
//                           list is untouchable, so ANY movement is spurious).
// If the list then moves away from the pinned offset WITHOUT the user touching
// it, the guard puts it back. It is inert unless the reader is genuinely
// scrolled up (offset >= MIN_OFFSET_TO_PROTECT) and stands down the instant the
// user drags the list, or a caller `release()`s it (scroll-to-bottom button,
// sending a message — explicit "take me down" intents).

/** Below this the reader is at (or within a thumb of) the bottom — nothing to protect. */
const MIN_OFFSET_TO_PROTECT = 150;
/** Movement smaller than this is layout noise (a reaction pill row grows the cell ~26px). */
const RESTORE_TOLERANCE = 60;
/** Tail after an in-place update. Covers the keyboard handler's 300ms second-pass snap. */
const DEFAULT_HOLD_MS = 1200;
/** Safety valve so a clamped/failed restore can never turn into a scroll-event loop. */
const MAX_RESTORES_PER_HOLD = 12;
const MIN_RESTORE_INTERVAL_MS = 40;
/** Longest we assume a finger-lifted fling keeps coasting; also unsticks a missed momentum-end. */
const MOMENTUM_GRACE_MS = 3000;

interface Hold {
  /** Offset to restore. */
  target: number;
  /** Context menu / emoji picker currently open. */
  overlayOpen: boolean;
  /** End of the post-update tail. */
  updateUntil: number;
  restores: number;
  lastRestoreAt: number;
}

const isActive = (hold: Hold, now: number) => hold.overlayOpen || now <= hold.updateUntil;

export function useScrollPositionGuard(listRef: RefObject<FlatList<any> | null>) {
  const lastOffsetRef = useRef(0);
  const holdRef = useRef<Hold | null>(null);
  // Timestamp until which the USER is considered to be moving the list (finger
  // down, or coasting after a flick). A coasting flick must never be mistaken
  // for a spurious jump. Infinity while the finger is down.
  const userScrollingUntilRef = useRef(0);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      const hold = holdRef.current;
      if (!hold) {
        lastOffsetRef.current = y;
        return;
      }
      const now = Date.now();
      if (!isActive(hold, now) || now < userScrollingUntilRef.current) {
        holdRef.current = null;
        lastOffsetRef.current = y;
        return;
      }
      if (Math.abs(y - hold.target) <= RESTORE_TOLERANCE) {
        lastOffsetRef.current = y;
        return;
      }
      // Moved without the user: put the reader back where they were.
      if (
        hold.restores < MAX_RESTORES_PER_HOLD &&
        now - hold.lastRestoreAt >= MIN_RESTORE_INTERVAL_MS
      ) {
        hold.restores += 1;
        hold.lastRestoreAt = now;
        if (__DEV__) {
          console.log('[scroll-guard] restoring offset', { from: Math.round(y), to: Math.round(hold.target) });
        }
        listRef.current?.scrollToOffset({ offset: hold.target, animated: false });
      }
      // Keep the pinned value as "where the reader is" — the restore is in flight.
      lastOffsetRef.current = hold.target;
    },
    [listRef],
  );

  /** Returns the live hold, or a fresh one pinned at the reader's current offset (null when at the bottom). */
  const acquire = useCallback((now: number): Hold | null => {
    const existing = holdRef.current;
    if (existing && isActive(existing, now)) return existing;
    const target = lastOffsetRef.current;
    if (target < MIN_OFFSET_TO_PROTECT || now < userScrollingUntilRef.current) {
      holdRef.current = null;
      return null;
    }
    const created: Hold = { target, overlayOpen: false, updateUntil: 0, restores: 0, lastRestoreAt: 0 };
    if (__DEV__) console.log('[scroll-guard] pinning offset', { target: Math.round(target) });
    holdRef.current = created;
    return created;
  }, []);

  /**
   * Pin the reader's offset for a short tail. Call immediately BEFORE applying
   * an in-place message update (own optimistic reaction, remote reaction:update).
   */
  const holdPosition = useCallback(
    (ms: number = DEFAULT_HOLD_MS) => {
      const now = Date.now();
      const hold = acquire(now);
      if (hold) hold.updateUntil = Math.max(hold.updateUntil, now + ms);
    },
    [acquire],
  );

  /**
   * Context menu / emoji picker opened (true) or fully closed (false). While
   * open the hold has no expiry; on close only an already-armed post-update
   * tail (a reaction that was just applied) keeps protecting the reader.
   */
  const setOverlayOpen = useCallback(
    (open: boolean) => {
      if (open) {
        const hold = acquire(Date.now());
        if (hold) hold.overlayOpen = true;
        return;
      }
      const hold = holdRef.current;
      if (!hold) return;
      hold.overlayOpen = false;
      if (Date.now() > hold.updateUntil) holdRef.current = null;
    },
    [acquire],
  );

  /** Drop any hold — the user (or the app, on purpose) is about to move the list. */
  const release = useCallback(() => {
    holdRef.current = null;
  }, []);

  const onScrollBeginDrag = useCallback(() => {
    userScrollingUntilRef.current = Number.POSITIVE_INFINITY;
    holdRef.current = null;
  }, []);

  const onScrollEndDrag = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    // A drag that ends with no fling velocity never gets a momentum phase.
    const vy = e.nativeEvent.velocity?.y ?? 0;
    userScrollingUntilRef.current = Math.abs(vy) < 0.05 ? 0 : Date.now() + MOMENTUM_GRACE_MS;
  }, []);

  const onMomentumScrollEnd = useCallback(() => {
    userScrollingUntilRef.current = 0;
  }, []);

  // Memoized so the returned object is referentially stable and safe to list in
  // hook dependency arrays.
  return useMemo(
    () => ({
      onScroll,
      holdPosition,
      setOverlayOpen,
      release,
      /** Spread onto the FlatList so the guard knows when the USER is moving it. */
      dragProps: { onScrollBeginDrag, onScrollEndDrag, onMomentumScrollEnd },
    }),
    [onScroll, holdPosition, setOverlayOpen, release, onScrollBeginDrag, onScrollEndDrag, onMomentumScrollEnd],
  );
}
