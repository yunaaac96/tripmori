import { Timestamp } from 'firebase/firestore';

// ── 旅程 ──────────────────────────────────────────
export interface Trip {
  id: string;
  name: string;
  destination: string;
  startDate: Timestamp;
  endDate: Timestamp;
  coverImage?: string;
  memberIds: string[];
  pin: string;           // 4位數隱私保護 PIN
  currency: string;      // 主要貨幣 (TWD, JPY...)
  createdAt: Timestamp;
}

// ── 行程事件 ───────────────────────────────────────
export type EventCategory = 'attraction' | 'food' | 'transport' | 'hotel';

export interface ScheduleEvent {
  id: string;
  tripId: string;
  date: string;          // YYYY-MM-DD
  startTime: string;     // HH:mm
  endTime?: string;
  title: string;
  location: string;
  category: EventCategory;
  notes?: string;
  mapUrl?: string;
  photos: string[];      // Storage URLs
  cost?: number;
  currency?: string;
  createdAt: Timestamp;
}

// ── 預訂 ──────────────────────────────────────────
export interface FlightBooking {
  id: string; tripId: string;
  airline: string; flightNo: string;
  departure: { airport: string; time: Timestamp };
  arrival:   { airport: string; time: Timestamp };
  passengers: string[];
  confirmCode: string;
  pdfUrl?: string;
}

export interface HotelBooking {
  id: string; tripId: string;
  name: string; address: string;
  checkIn: Timestamp; checkOut: Timestamp;
  roomType: string; totalCost: number;
  currency: string; coverImage?: string;
  confirmCode: string;
}

// ── 支出 ──────────────────────────────────────────
export type ExpenseCategory = 'transport' | 'food' | 'attraction' | 'shopping' | 'hotel' | 'other';

export interface Expense {
  id: string; tripId: string;
  date: string;
  amount: number; currency: string;
  category: ExpenseCategory;
  description: string;
  paidBy: string;          // memberId
  splitWith: string[];     // memberIds
  exchangeRate?: number;
  amountTWD?: number;
  createdAt: Timestamp;
}

// ── 日誌 ──────────────────────────────────────────
export interface JournalPost {
  id: string; tripId: string;
  date: string;
  authorId: string; authorName: string;
  content: string;
  photos: string[];
  createdAt: Timestamp;
}

// ── 清單 ──────────────────────────────────────────
export type ListType = 'todo' | 'packing' | 'shopping';

export interface CheckItem {
  id: string; tripId: string;
  listType: ListType;
  text: string;
  checked: boolean;
  assignedTo?: string;    // memberId | 'all'
  createdAt: Timestamp;
}

// ── 成員 ──────────────────────────────────────────
export interface Member {
  id: string; tripId: string;
  name: string;
  avatar?: string;
  color: string;          // 個人識別色
  createdAt: Timestamp;
}