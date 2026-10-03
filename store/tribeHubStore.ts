import { create } from 'zustand';
import { tribeApi, type TodayPayload } from '@/services/api';
import type { TribeFilterKey } from '@/components/ui/tribe/TribeFilterPills';
import { TODAY_REFRESH_STALE_MS } from '@/utils/candleViewModel';

// The Tribe tab's state is shared by TribeHubScreen (candle strip, filter pills,
// details sheet) and the Tribe header chip, which renders in the Tabs header
// tree outside the screen. A store is the only way both see the same data.
//
// `fetchToday` carries a sequence number so a response that lands after
// reset() (logout) or after a newer fetch is dropped, never written.

export type CandleSheetMode = 'details' | 'location';

interface TribeHubState {
  filter: TribeFilterKey;
  today: TodayPayload | null;
  todayLoading: boolean;
  todayError: boolean;
  todayFetchedAt: number | null;
  sheetOpen: boolean;
  sheetMode: CandleSheetMode;
  _todaySeq: number;

  setFilter: (filter: TribeFilterKey) => void;
  fetchToday: () => Promise<void>;
  refreshTodayIfStale: () => void;
  openSheet: (mode: CandleSheetMode) => void;
  closeSheet: () => void;
  setSheetMode: (mode: CandleSheetMode) => void;
  reset: () => void;
}

export const useTribeHubStore = create<TribeHubState>((set, get) => ({
  filter: 'all',
  today: null,
  todayLoading: false,
  todayError: false,
  todayFetchedAt: null,
  sheetOpen: false,
  sheetMode: 'details',
  _todaySeq: 0,

  setFilter: (filter) => set({ filter }),

  fetchToday: async () => {
    const seq = get()._todaySeq + 1;
    set({ _todaySeq: seq, todayLoading: true });
    try {
      const result = await tribeApi.today();
      if (get()._todaySeq !== seq) return;
      set({ today: result, todayError: false, todayFetchedAt: Date.now(), todayLoading: false });
    } catch {
      if (get()._todaySeq !== seq) return;
      set({ todayError: true, todayLoading: false });
    }
  },

  refreshTodayIfStale: () => {
    const { todayLoading, todayFetchedAt } = get();
    if (todayLoading) return;
    if (todayFetchedAt !== null && Date.now() - todayFetchedAt < TODAY_REFRESH_STALE_MS) return;
    void get().fetchToday();
  },

  openSheet: (mode) => set({ sheetOpen: true, sheetMode: mode }),
  closeSheet: () => set({ sheetOpen: false, sheetMode: 'details' }),
  setSheetMode: (mode) => set({ sheetMode: mode }),

  reset: () =>
    set((state) => ({
      filter: 'all',
      today: null,
      todayLoading: false,
      todayError: false,
      todayFetchedAt: null,
      sheetOpen: false,
      sheetMode: 'details',
      _todaySeq: state._todaySeq + 1,
    })),
}));
