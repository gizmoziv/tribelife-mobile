import { create } from 'zustand';
import type { MemberReceipt } from '@/types';

// ── Phase 29: useReceiptsStore (D-01) ───────────────────────────────────────
// Single source of truth for read-receipt watermarks. Mirrors the backend
// conversationParticipants.lastDeliveredAt/lastReadAt model exactly: per
// conversation, per member, a { deliveredUpTo, readUpTo } pair of ISO strings.
//
// Why a dedicated store (not per-message fields in the screen's `messages`
// array): the socket events carry WATERMARKS, not message ids — a single
// `patchRead` correctly transitions every older own message to Read with no
// per-message bookkeeping, and the state survives screen remounts. (D-01;
// rejected alternative documented in 29-CONTEXT.)
//
// Wiring (consumed by 29-03/29-04, not here):
//   - seed(conversationId, members)  ← cold-open hydration from the participants
//                                       / members GET (D-01a).
//   - patchDelivered / patchRead     ← the onMessageDelivered / onMessageRead
//                                       socket listeners (services/socket.ts).
//   - clearConversation              ← optional cleanup when a conversation is
//                                       closed/left.
//
// Selector shape for downstream plans (29-03/29-04):
//   useReceiptsStore((s) => s.byConversation[conversationId])
//     → Record<userId, MemberReceipt> | undefined
//   A bubble derives its tick by comparing message.createdAt against the OTHER
//   participant(s)' watermarks (deliveredUpTo/readUpTo >= createdAt). Subscribe
//   to the single conversation slice so only the open thread's bubbles
//   re-render on a patch.
//
// MemberReceipt is imported from types/index.ts (single definition — W2).

// Monotonic guard: a watermark must never regress. ISO strings compare
// lexicographically because both are UTC `toISOString()` output, so `b > a`
// is a valid chronological comparison. A spoofed regressing event therefore
// cannot move a tick backward (threat T-29-03).
const maxIso = (a: string | null, b: string): string =>
  a == null || b > a ? b : a;

interface ReceiptsState {
  // conversationId → { [userId]: MemberReceipt }
  byConversation: Record<number, Record<number, MemberReceipt>>;
  // Cold-open hydration (D-01a): replaces this conversation's map wholesale.
  seed: (
    conversationId: number,
    members: Array<{ userId: number; deliveredUpTo: string | null; readUpTo: string | null }>,
  ) => void;
  // Live patch from message:delivered — monotonic (never moves backward).
  patchDelivered: (conversationId: number, userId: number, deliveredUpTo: string) => void;
  // Live patch from message:read — advances BOTH readUpTo and deliveredUpTo
  // (read implies delivered — backend invariant), both monotonically.
  patchRead: (conversationId: number, userId: number, readUpTo: string) => void;
  // Drop a conversation's entry entirely.
  clearConversation: (conversationId: number) => void;
}

export const useReceiptsStore = create<ReceiptsState>((set) => ({
  byConversation: {},

  seed: (conversationId, members) =>
    set((s) => ({
      byConversation: {
        ...s.byConversation,
        [conversationId]: Object.fromEntries(
          members.map((m) => [
            m.userId,
            { deliveredUpTo: m.deliveredUpTo, readUpTo: m.readUpTo },
          ]),
        ),
      },
    })),

  patchDelivered: (conversationId, userId, deliveredUpTo) =>
    set((s) => {
      const conv = s.byConversation[conversationId] ?? {};
      const prev = conv[userId] ?? { deliveredUpTo: null, readUpTo: null };
      return {
        byConversation: {
          ...s.byConversation,
          [conversationId]: {
            ...conv,
            [userId]: { ...prev, deliveredUpTo: maxIso(prev.deliveredUpTo, deliveredUpTo) },
          },
        },
      };
    }),

  patchRead: (conversationId, userId, readUpTo) =>
    set((s) => {
      const conv = s.byConversation[conversationId] ?? {};
      const prev = conv[userId] ?? { deliveredUpTo: null, readUpTo: null };
      // read implies delivered — advance both, monotonically.
      return {
        byConversation: {
          ...s.byConversation,
          [conversationId]: {
            ...conv,
            [userId]: {
              deliveredUpTo: maxIso(prev.deliveredUpTo, readUpTo),
              readUpTo: maxIso(prev.readUpTo, readUpTo),
            },
          },
        },
      };
    }),

  clearConversation: (conversationId) =>
    set((s) => {
      const { [conversationId]: _removed, ...rest } = s.byConversation;
      return { byConversation: rest };
    }),
}));
