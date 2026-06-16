import { useState, useEffect, useCallback } from 'react';
import { FlatList } from 'react-native';
import { pins, PinnedMessageRow } from '@/services/api';
import {
  onRoomPinned,
  onDmPinned,
  onGlobePinned,
} from '@/services/socket';
import type { Message, GlobeMessage } from '@/types';

/**
 * Manages the pinned message for a chat surface.
 *
 * - Fetches the current pin from the server on mount.
 * - Subscribes to the correct socket event for live updates (D-16).
 * - Exposes jumpToPinned() which reuses the screen's load-around + scrollToMessage
 *   so we never re-implement pagination (D-15/D-18).
 */
export interface UsePinnedMessageParams {
  /** Globe room ID (e.g. `globe:town-square`) — mutually exclusive with conversationId. */
  roomId?: string;
  /** DM / group conversation ID — mutually exclusive with roomId. */
  conversationId?: number;
  /** Current in-memory message list (chronological). Used to decide load-around vs direct scroll. */
  messages: Array<Message | GlobeMessage>;
  /** Ref to the screen's FlatList — forwarded to scrollToMessage. */
  flatListRef: React.RefObject<FlatList | null>;
  /**
   * Screen-provided load-around function. Called when the pinned message is
   * not in the current in-memory list (old message, requires pagination).
   */
  loadAround: (messageId: number) => Promise<void>;
  /** Screen-provided scroll+highlight for an in-memory message. */
  scrollToMessage: (messageId: number) => void;
}

export interface UsePinnedMessageResult {
  pinnedMessage: PinnedMessageRow | null;
  setPinnedMessage: React.Dispatch<React.SetStateAction<PinnedMessageRow | null>>;
  jumpToPinned: () => Promise<void>;
}

export function usePinnedMessage({
  roomId,
  conversationId,
  messages,
  loadAround,
  scrollToMessage,
}: UsePinnedMessageParams): UsePinnedMessageResult {
  const [pinnedMessage, setPinnedMessage] = useState<PinnedMessageRow | null>(null);

  // ── Fetch on mount / param change ──────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const fetchPin = async () => {
      try {
        const { pin } = await pins.getPin(
          roomId != null ? { roomId } : { conversationId },
        );
        if (!cancelled) setPinnedMessage(pin);
      } catch {
        // Non-fatal — pin bar stays hidden on network error.
      }
    };
    fetchPin();
    return () => { cancelled = true; };
  }, [roomId, conversationId]);

  // ── Live socket listener ────────────────────────────────────────────────────
  useEffect(() => {
    if (!roomId && conversationId == null) return;

    if (roomId?.startsWith('globe:')) {
      // Globe room — match on slug (e.g. `globe:town-square` → slug = `town-square`)
      const slug = roomId.replace(/^globe:/, '');
      const off = onGlobePinned((payload) => {
        if (payload.slug !== slug) return;
        setPinnedMessage(payload.action === 'pin' ? payload.pin : null);
      });
      return off;
    }

    if (roomId?.startsWith('timezone:')) {
      // Timezone room — match on roomId exact equality
      const off = onRoomPinned((payload) => {
        if (payload.roomId !== roomId) return;
        setPinnedMessage(payload.action === 'pin' ? payload.pin : null);
      });
      return off;
    }

    if (conversationId != null) {
      // DM / group
      const off = onDmPinned((payload) => {
        if (payload.conversationId !== conversationId) return;
        setPinnedMessage(payload.action === 'pin' ? payload.pin : null);
      });
      return off;
    }
  }, [roomId, conversationId]);

  // ── Jump to pinned message (D-15 / D-18) ───────────────────────────────────
  const jumpToPinned = useCallback(async () => {
    if (!pinnedMessage) return;
    const { messageId } = pinnedMessage;

    // Check if the message is already in the in-memory list.
    const inMemory = messages.some((m) => m.id === messageId);
    if (inMemory) {
      scrollToMessage(messageId);
      return;
    }

    // Not in memory — trigger load-around (the screen's existing pagination
    // with aroundMessageId) then scroll once the list has updated.
    await loadAround(messageId);
    // Give FlatList a tick to re-render with the new messages before scrolling.
    setTimeout(() => scrollToMessage(messageId), 150);
  }, [pinnedMessage, messages, loadAround, scrollToMessage]);

  return { pinnedMessage, setPinnedMessage, jumpToPinned };
}
