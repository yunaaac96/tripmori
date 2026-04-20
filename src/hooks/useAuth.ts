import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../config/firebase';

// Module-level singleton auth subscription.
// Every component that calls useGoogleAuth() / useGoogleUid() registers as a
// listener on the one subscription below, instead of each creating its own
// onAuthStateChanged watcher on mount. Tab switches no longer churn Firebase
// auth listeners.
//
// Exposed values: uid + email (null for anonymous or signed-out).

export interface GoogleAuthState {
  uid:   string | null;
  email: string | null;
  /** true once the Firebase auth listener has reported at least one state
   *  (so downstream code can distinguish "still loading" from "definitely
   *  anonymous/signed-out"). */
  ready: boolean;
}

let currentState: GoogleAuthState = { uid: null, email: null, ready: false };
let initialised = false;
const listeners = new Set<(s: GoogleAuthState) => void>();

function ensureListener() {
  if (initialised) return;
  initialised = true;
  onAuthStateChanged(auth, user => {
    currentState = user && !user.isAnonymous
      ? { uid: user.uid, email: user.email || null, ready: true }
      : { uid: null, email: null, ready: true };
    listeners.forEach(cb => cb(currentState));
  });
}

export function useGoogleAuth(): GoogleAuthState {
  const [state, setState] = useState<GoogleAuthState>(currentState);
  useEffect(() => {
    ensureListener();
    listeners.add(setState);
    // Sync in case the subscription fired before we mounted
    setState(currentState);
    return () => { listeners.delete(setState); };
  }, []);
  return state;
}

// Convenience alias for the common uid-only call site.
export function useGoogleUid(): string | null {
  return useGoogleAuth().uid;
}
