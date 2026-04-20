import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';

export type OnboardingTrack = 'creator' | 'invitee';

// LocalStorage key for "just created a trip" / "just upgraded to editor"
// signal — set by ProjectHub / App when the relevant action succeeds, picked
// up by the App-level onboarding check once the user lands in the trip view.
export const LS_ONBOARDING_PENDING = 'tripmori_onboarding_pending';

const fieldFor = (track: OnboardingTrack) =>
  track === 'creator' ? 'onboardingCreator' : 'onboardingInvitee';

/** Returns true if this uid has already finished (or skipped) the given track. */
export async function hasCompletedOnboarding(uid: string, track: OnboardingTrack): Promise<boolean> {
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

/** Fire-and-forget: record that this uid has completed / skipped this track. */
export async function markOnboardingDone(uid: string, track: OnboardingTrack): Promise<void> {
  try {
    await setDoc(
      doc(db, 'users', uid),
      { [fieldFor(track)]: true, updatedAt: serverTimestamp() },
      { merge: true },
    );
  } catch (err) {
    console.warn('[onboarding] write flag failed', err);
  }
}
