export type EventCategory = 'transport' | 'food' | 'attraction' | 'hotel' | 'spot';

export interface TripEvent {
  id: string;
  date: string;
  startTime: string;
  title: string;
  location: string;
  category: EventCategory;
  notes?: string;
  mapUrl?: string;
}

export interface DayOption {
  date: string;
  label: string;
  week: string;
}