// ── Chat draft persistence engine ────────────────────────────────────────
// Pure engine with ZERO imports (not even an '@/' alias), so plain Node can
// load this file directly through built-in TypeScript type stripping for
// scripts/verify-chat-draft.mjs. Only erasable TypeScript is used here:
// interfaces, type annotations, `as`, generics. No enums, namespaces,
// constructor parameter properties or import-equals.
//
// Keeps unsent composer text on the device (AsyncStorage), keyed per DM/group
// conversation or per room. Debounces writes, flushes the latest text on
// unmount/background, never overwrites text the user already typed, and
// never stores an empty or whitespace-only draft.

export const DRAFT_SAVE_DEBOUNCE_MS = 350;
export const CHAT_DRAFT_KEY_PREFIX = 'chatDraft:';

// Structural subset of AsyncStorage 2.2.0 (its callback params are optional,
// so the default AsyncStorage export is directly assignable to this).
export interface DraftStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  getAllKeys(): Promise<readonly string[]>;
  multiRemove(keys: readonly string[]): Promise<void>;
}

// 'chatDraft:conversation:<id>' for a finite positive integer, else null
// (covers parseInt -> NaN, 0, and negative ids).
export function conversationDraftKey(conversationId: number | null | undefined): string | null {
  if (conversationId === null || conversationId === undefined) return null;
  if (!Number.isFinite(conversationId) || conversationId <= 0) return null;
  return `${CHAT_DRAFT_KEY_PREFIX}conversation:${conversationId}`;
}

// 'chatDraft:room:<value>' for a non-empty string, value used VERBATIM (no
// trim, no extra prefix). Local's roomId already reads 'timezone:<zone>' and
// Globe's slug is bare — that split is intentional and keeps the two drafts
// separate. Do not unify them.
export function roomDraftKey(roomIdOrSlug: string | null | undefined): string | null {
  if (!roomIdOrSlug) return null;
  return `${CHAT_DRAFT_KEY_PREFIX}room:${roomIdOrSlug}`;
}

export interface DraftControllerOptions {
  storage: DraftStorage;
  onTextChange: (text: string) => void; // the hook passes its React state setter
  debounceMs?: number; // default DRAFT_SAVE_DEBOUNCE_MS; the verifier passes 20
}

export interface DraftController {
  getText(): string;
  setKey(key: string | null): void;
  setText(text: string): void;
  clear(): void;
  flush(): void;
}

// Module-level generation counter. Bumped synchronously (before any await) by
// purgeAllChatDrafts on logout, so any controller created before the purge can
// never write a draft back to storage again — even from a pending debounce
// timer or an unmount flush that fires after the bump.
let draftGeneration = 0;

export function createDraftController(options: DraftControllerOptions): DraftController {
  const { storage, onTextChange } = options;
  const debounceMs = options.debounceMs ?? DRAFT_SAVE_DEBOUNCE_MS;
  const createdGeneration = draftGeneration;

  let text = '';
  let activeKey: string | null = null;
  let loadedKey: string | null = null;
  let editSeq = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  // Gate every storage write behind the generation check. A controller
  // created before a purge is permanently disabled once the purge runs.
  function isCurrentGeneration(): boolean {
    return createdGeneration === draftGeneration;
  }

  function persist(key: string, value: string): void {
    if (!isCurrentGeneration()) return;
    try {
      const trimmed = value.trim();
      if (trimmed === '') {
        void storage.removeItem(key).catch(() => {});
      } else {
        void storage.setItem(key, value).catch(() => {});
      }
    } catch {
      // Persistence is best-effort and must never break typing or unmount.
    }
  }

  function cancelTimer(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function getText(): string {
    return text;
  }

  function setText(next: string): void {
    text = next;
    editSeq += 1;
    onTextChange(next);

    cancelTimer();
    if (activeKey !== null) {
      const keyAtSchedule = activeKey;
      timer = setTimeout(() => {
        timer = null;
        persist(keyAtSchedule, text);
      }, debounceMs);
    }
  }

  function clear(): void {
    cancelTimer();
    text = '';
    editSeq += 1;
    onTextChange('');
    if (activeKey !== null && isCurrentGeneration()) {
      try {
        void storage.removeItem(activeKey).catch(() => {});
      } catch {
        // best-effort
      }
    }
  }

  function flush(): void {
    cancelTimer();
    if (activeKey !== null) {
      persist(activeKey, text);
    }
  }

  function setKey(next: string | null): void {
    if (next === activeKey) return;

    cancelTimer();

    if (activeKey !== null) {
      // Moving away from a real key — persist what was typed under it, then
      // reset. The typed text belongs to the old chat and must never carry
      // into another one.
      persist(activeKey, text);
      text = '';
      onTextChange('');
      loadedKey = null;
    }
    // If activeKey was null, the key is resolving for the first time — leave
    // text untouched (covers the late-key, no-clobber case).

    activeKey = next;

    if (next !== null && loadedKey !== next) {
      loadedKey = next;
      const capturedEditSeq = editSeq;
      const keyToLoad = next;
      void storage
        .getItem(keyToLoad)
        .then((stored) => {
          const stillActive = activeKey === keyToLoad;
          const stillFreshEdit = editSeq === capturedEditSeq;
          const stillEmpty = text === '';
          const hasContent = typeof stored === 'string' && stored.trim() !== '';
          if (stillActive && stillFreshEdit && stillEmpty && hasContent) {
            text = stored as string;
            onTextChange(stored as string);
          }
        })
        .catch(() => {
          // Swallow — a failed load just leaves the composer empty.
        });
    }
  }

  return { getText, setKey, setText, clear, flush };
}

// Removes every chatDraft:* key from storage (logout on a shared device).
// Bumps the generation counter synchronously, before any await, so screens
// still mounted during the logout redirect cannot write a draft back on
// unmount. Never rejects — logout must never fail because of drafts.
export async function purgeAllChatDrafts(storage: DraftStorage): Promise<void> {
  draftGeneration += 1;
  try {
    const allKeys = await storage.getAllKeys();
    const draftKeys = allKeys.filter((k) => k.startsWith(CHAT_DRAFT_KEY_PREFIX));
    if (draftKeys.length > 0) {
      await storage.multiRemove(draftKeys);
    }
  } catch {
    // Swallow — purge is best-effort and must never break logout.
  }
}
