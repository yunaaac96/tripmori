/**
 * Local backup of trip sub-collections (events / bookings / lists / members)
 * to localStorage, so the trip is readable OFFLINE even when Firestore's own
 * IndexedDB persistent cache is unavailable.
 *
 * Why this exists separately from Firestore's persistent cache:
 *   iOS Safari aggressively evicts IndexedDB for PWAs (the "7-day unused →
 *   wiped" storage policy, plus eviction under storage pressure). When that
 *   happens, an offline cold-start gets `fromCache=true, size=0` from
 *   Firestore — i.e. "I have no cached data" — and the 行程 / 預訂 tabs
 *   render blank exactly when the traveller needs them (abroad, no signal).
 *
 *   localStorage survives that eviction far better and is fully under our
 *   control, so we mirror the small text collections here as a belt-and-
 *   suspenders fallback. We deliberately do NOT back up journals (they embed
 *   base64 image data and would blow the ~5MB localStorage quota).
 *
 * Firestore Timestamp handling:
 *   Timestamps don't survive JSON.stringify (they serialise to {}), so we
 *   tag them as {__fsts__: millis} on write and revive them into a duck-typed
 *   shim (toMillis/toDate/seconds/nanoseconds) on read, so downstream code
 *   that calls `.toMillis()` keeps working.
 */

const KEY = (tripId: string, col: string) => `tripmori_backup_${tripId}_${col}`;

// JSON replacer — convert Firestore Timestamp-like objects to a tagged form.
const replacer = (_k: string, v: any) => {
  if (v && typeof v === 'object' && typeof v.toMillis === 'function' && typeof v.seconds === 'number') {
    return { __fsts__: v.toMillis() };
  }
  return v;
};

// JSON reviver — turn tagged timestamps back into a Timestamp-compatible shim.
const reviver = (_k: string, v: any) => {
  if (v && typeof v === 'object' && typeof v.__fsts__ === 'number') {
    const ms = v.__fsts__;
    return {
      toMillis: () => ms,
      toDate: () => new Date(ms),
      seconds: Math.floor(ms / 1000),
      nanoseconds: (ms % 1000) * 1e6,
    };
  }
  return v;
};

/** Persist data for a trip (an array for sub-collections, or any object —
 *  e.g. the static-booking blob from the trip doc). Fails silently on quota. */
export const saveTripBackup = (tripId: string, col: string, data: any): void => {
  if (!tripId) return;
  try {
    localStorage.setItem(KEY(tripId, col), JSON.stringify(data, replacer));
  } catch {
    // Quota exceeded / storage disabled — non-fatal, just skip this backup.
  }
};

/** Load previously-backed-up data. Returns null if none / unparseable. */
export const loadTripBackup = <T = any>(tripId: string, col: string): T | null => {
  if (!tripId) return null;
  try {
    const raw = localStorage.getItem(KEY(tripId, col));
    if (!raw) return null;
    return JSON.parse(raw, reviver) as T;
  } catch {
    return null;
  }
};
