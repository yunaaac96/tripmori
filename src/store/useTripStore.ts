import { create } from 'zustand';

interface TripStore {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const useTripStore = create<TripStore>((set) => ({
  activeTab: '行程',
  setActiveTab: (tab) => set({ activeTab: tab }),
}));
