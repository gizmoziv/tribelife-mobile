// Phase 38.1 D-00b/D-01/D-05: pure zip of the client's parsed mention-handle
// list against the server-stored orderedMentions array. NO react/react-native
// imports — only a type-only import so this module is exercisable offline.
import type { OrderedMention } from '@/types';

export type MentionResolution =
  | { kind: 'resolved'; userId: number }
  | { kind: 'unresolved' }
  | { kind: 'legacy'; handle: string };

// Returns exactly mentionHandles.length entries, one per parsed @handle
// occurrence (in order, duplicates preserved).
//
// - orderedMentions null/undefined/empty → every entry is `legacy` (D-01:
//   pre-phase message, no stored data — fall back to raw-handle navigation).
// - Otherwise, walk a cursor forward through orderedMentions, matching each
//   mentionHandles[i] against orderedMentions[j].handle. The server's list can
//   be a superset (RESEARCH: server matches @word inside URLs; the client's
//   parseContent strips URLs first, so the client list is an in-order
//   SUBSEQUENCE of the server's) — advance the cursor past non-matching
//   entries rather than indexing blindly.
// - A found entry with userId !== null → `resolved`; userId === null → `unresolved` (D-05).
// - If the cursor runs off the end before finding a match → `legacy` for that
//   handle (and the cursor stays exhausted for any remaining handles).
export function zipMentions(
  mentionHandles: string[],
  orderedMentions: OrderedMention[] | null | undefined,
): MentionResolution[] {
  if (!orderedMentions || orderedMentions.length === 0) {
    return mentionHandles.map((handle) => ({ kind: 'legacy', handle }));
  }

  const results: MentionResolution[] = [];
  let j = 0;

  for (const handle of mentionHandles) {
    while (j < orderedMentions.length && orderedMentions[j].handle !== handle) {
      j++;
    }
    if (j >= orderedMentions.length) {
      results.push({ kind: 'legacy', handle });
      continue;
    }
    const entry = orderedMentions[j];
    j++;
    results.push(
      entry.userId !== null
        ? { kind: 'resolved', userId: entry.userId }
        : { kind: 'unresolved' },
    );
  }

  return results;
}
