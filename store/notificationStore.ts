import { create } from 'zustand';
import type { Notification } from '@/types';

export interface NotificationSummary {
  groups: number;
  dms: number;
  matches: number;
  system: number;
}

const EMPTY_SUMMARY: NotificationSummary = {
  groups: 0,
  dms: 0,
  matches: 0,
  system: 0,
};

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  summary: NotificationSummary;
  setNotifications: (notifications: Notification[], unreadCount: number) => void;
  setSummary: (summary: NotificationSummary) => void;
  addNotification: (notification: Notification) => void;
  markAllRead: () => void;
  markTypeRead: (type: Notification['type']) => void;
  markOneRead: (id: number) => void;
  markManyRead: (ids: number[]) => void;
  incrementUnread: () => void;
}

// Bell count = sum of all four tab pills.
export const selectBellCount = (s: NotificationState): number =>
  s.summary.groups + s.summary.dms + s.summary.matches + s.summary.system;

// Maps notification type → summary key.
// D-14: group rows are stored notification rows (DM-parity) — 'group' maps to
// the groups tab so an incoming group chat:notification bumps the groups dot
// locally without a /summary round-trip.
const summaryKeyForType: Record<string, keyof NotificationSummary | null> = {
  mention: 'dms',
  new_dm: 'dms',
  group: 'groups',
  beacon_match: 'matches',
  system: 'system',
  org_invite: null, // explicit no-bucket — invites surface only in raw notification list + bell unreadCount
};

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  unreadCount: 0,
  summary: EMPTY_SUMMARY,

  setNotifications: (notifications, unreadCount) =>
    set({ notifications, unreadCount }),

  setSummary: (summary) => set({ summary }),

  addNotification: (notification) =>
    set((state) => {
      const key = summaryKeyForType[notification.type];
      const nextSummary = !notification.isRead && key
        ? { ...state.summary, [key]: state.summary[key] + 1 }
        : state.summary;
      return {
        notifications: [notification, ...state.notifications],
        unreadCount: state.unreadCount + (notification.isRead ? 0 : 1),
        summary: nextSummary,
      };
    }),

  markAllRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, isRead: true })),
      unreadCount: 0,
      summary: EMPTY_SUMMARY,
    })),

  markTypeRead: (type) =>
    set((state) => {
      const key = summaryKeyForType[type];
      const cleared = state.notifications.filter((n) => n.type === type && !n.isRead).length;
      return {
        notifications: state.notifications.map((n) =>
          n.type === type ? { ...n, isRead: true } : n,
        ),
        unreadCount: Math.max(0, state.unreadCount - cleared),
        summary: key ? { ...state.summary, [key]: 0 } : state.summary,
      };
    }),

  markOneRead: (id) =>
    set((state) => {
      const target = state.notifications.find((n) => n.id === id);
      const wasUnread = target && !target.isRead;
      const key = target ? summaryKeyForType[target.type] : null;
      return {
        notifications: state.notifications.map((n) =>
          n.id === id ? { ...n, isRead: true } : n,
        ),
        unreadCount: wasUnread ? Math.max(0, state.unreadCount - 1) : state.unreadCount,
        summary: wasUnread && key
          ? { ...state.summary, [key]: Math.max(0, state.summary[key] - 1) }
          : state.summary,
      };
    }),

  // Mark a batch of notification ids as read. The IDs come from the server
  // (via /api/notifications/read-context) which has already cleared them in
  // the DB. Decrement unreadCount by ids.length — server is authoritative.
  // Phase 14 fix: previously only decremented for IDs found in the local
  // notifications[] array, which skipped fresh chat:notification mention
  // bumps that hadn't yet been hydrated into the array (bell stayed stuck
  // until app foreground triggered a /notifications fetch).
  markManyRead: (ids) =>
    set((state) => {
      if (ids.length === 0) return state;
      const idSet = new Set(ids);
      const summaryDelta: Partial<Record<keyof NotificationSummary, number>> = {};
      const next = state.notifications.map((n) => {
        if (idSet.has(n.id) && !n.isRead) {
          const key = summaryKeyForType[n.type];
          if (key) summaryDelta[key] = (summaryDelta[key] ?? 0) + 1;
          return { ...n, isRead: true };
        }
        return n;
      });
      const nextSummary: NotificationSummary = { ...state.summary };
      (Object.keys(summaryDelta) as Array<keyof NotificationSummary>).forEach((k) => {
        nextSummary[k] = Math.max(0, nextSummary[k] - (summaryDelta[k] ?? 0));
      });
      return {
        notifications: next,
        unreadCount: Math.max(0, state.unreadCount - ids.length),
        summary: nextSummary,
      };
    }),

  incrementUnread: () =>
    set((state) => ({ unreadCount: state.unreadCount + 1 })),
}));
