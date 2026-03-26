import { create } from 'zustand';
import type { GlobeRoom, GlobeMessage } from '@/types';

interface GlobeState {
  rooms: GlobeRoom[];
  activeRoomSlug: string | null;
  messages: GlobeMessage[];
  typingHandles: Set<string>;
  newMessageCount: number;
  isAtBottom: boolean;
  isLoadingRooms: boolean;
  isLoadingMessages: boolean;
  hasMoreMessages: boolean;

  setRooms: (rooms: GlobeRoom[]) => void;
  setActiveRoom: (slug: string | null) => void;
  setMessages: (messages: GlobeMessage[]) => void;
  addMessage: (message: GlobeMessage) => void;
  prependMessages: (messages: GlobeMessage[], hasMore: boolean) => void;
  updateParticipantCount: (slug: string, count: number) => void;
  setTyping: (handle: string, isTyping: boolean) => void;
  setIsAtBottom: (isAtBottom: boolean) => void;
  resetNewMessageCount: () => void;
  setLoadingRooms: (loading: boolean) => void;
  setLoadingMessages: (loading: boolean) => void;
  clearRoom: () => void;
}

export const useGlobeStore = create<GlobeState>((set) => ({
  rooms: [],
  activeRoomSlug: null,
  messages: [],
  typingHandles: new Set<string>(),
  newMessageCount: 0,
  isAtBottom: true,
  isLoadingRooms: false,
  isLoadingMessages: false,
  hasMoreMessages: true,

  setRooms: (rooms) => set({ rooms }),

  setActiveRoom: (slug) => set({ activeRoomSlug: slug }),

  setMessages: (messages) => set({ messages, hasMoreMessages: true }),

  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message],
      newMessageCount: state.isAtBottom ? 0 : state.newMessageCount + 1,
    })),

  prependMessages: (messages, hasMore) =>
    set((state) => ({
      messages: [...messages, ...state.messages],
      hasMoreMessages: hasMore,
    })),

  updateParticipantCount: (slug, count) =>
    set((state) => ({
      rooms: state.rooms.map((r) =>
        r.slug === slug ? { ...r, participantCount: count } : r
      ),
    })),

  setTyping: (handle, isTyping) =>
    set((state) => {
      const next = new Set(state.typingHandles);
      if (isTyping) {
        next.add(handle);
      } else {
        next.delete(handle);
      }
      return { typingHandles: next };
    }),

  setIsAtBottom: (isAtBottom) =>
    set(isAtBottom ? { isAtBottom, newMessageCount: 0 } : { isAtBottom }),

  resetNewMessageCount: () => set({ newMessageCount: 0 }),

  setLoadingRooms: (isLoadingRooms) => set({ isLoadingRooms }),

  setLoadingMessages: (isLoadingMessages) => set({ isLoadingMessages }),

  clearRoom: () =>
    set({
      messages: [],
      typingHandles: new Set<string>(),
      newMessageCount: 0,
      activeRoomSlug: null,
      hasMoreMessages: true,
    }),
}));
