import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../config/firebase';

export type OnboardingTrack = 'creator' | 'invitee';

// LocalStorage key for "just created a trip" / "just upgraded to editor"
// signal — set by ProjectHub / App when the relevant action succeeds, picked
// up by the App-level onboarding check once the user lands in the trip view.
export const LS_ONBOARDING_PENDING = 'tripmori_onboarding_pending';

const fieldFor = (track: OnboardingTrack) =>
  track === 'creator' ? 'onboardingCreator' : 'onboardingInvitee';

/** True iff the current Firebase user is signed in and NOT anonymous.
 *  /users/{uid} writes/reads are blocked for anonymous users by firestore.rules,
 *  so we must early-return for them instead of silently failing. */
function isRealGoogleUser(uid: string): boolean {
  const u = auth.currentUser;
  return !!u && !u.isAnonymous && u.uid === uid;
}

/** Returns true if this uid has already finished (or skipped) the given track. */
export async function hasCompletedOnboarding(uid: string, track: OnboardingTrack): Promise<boolean> {
  // Anonymous users can't read /users/{uid} — skip (treat as "completed" so
  // the modal never shows for a user who has no way to persist its state).
  if (!isRealGoogleUser(uid)) return true;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return false;
    const data = snap.data() as Record<string, unknown>;
    return data[fieldFor(track)] === true;
  } catch (err) {
    console.warn('[onboarding] read flag failed', err);
    return false;
  }
}

/** Record that this uid has completed / skipped this track. Returns true on
 *  successful Firestore write so callers can decide whether to keep the LS
 *  pending flag (will retry) or clear it. Includes an in-call 2-retry loop
 *  with short backoff for transient network flakes before surfacing failure. */
export async function markOnboardingDone(uid: string, track: OnboardingTrack): Promise<boolean> {
  if (!isRealGoogleUser(uid)) return false;
  const payload = { [fieldFor(track)]: true, updatedAt: serverTimestamp() };
  const delays = [0, 400, 1500]; // 3 attempts: immediate, then backoff
  for (let i = 0; i < delays.length; i++) {
    if (delays[i] > 0) await new Promise(r => setTimeout(r, delays[i]));
    try {
      await setDoc(doc(db, 'users', uid), payload, { merge: true });
      return true;
    } catch (err) {
      if (i === delays.length - 1) {
        console.warn('[onboarding] write flag failed after retries', err);
        return false;
      }
    }
  }
  return false;
}
