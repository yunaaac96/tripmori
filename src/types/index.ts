import { Timestamp } from 'firebase/firestore';

export type EventCategory = 'transport' | 'food' | 'attraction' | 'hotel' | 'spot';

export interface TripEvent {
  id: string;
  date: string;         // '2026-04-23'
  startTime: string;   // '09:00'
  endTime?: string;
  title: string;
  location: string;
  category: EventCategory;
  notes?: string;
  mapUrl?: string;
  createdAt: Timestamp;
}

export interface DayOption {
  date: string;
  label: string; // '8/1'
  week: string;  // '五'
}