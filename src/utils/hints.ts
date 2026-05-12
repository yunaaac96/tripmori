/**
 * First-time hint tracking
 *
 * Stores which one-time `<FirstTimeHint>` banners the user has dismissed.
 * All flags live under a single localStorage key as a JSON object so the
 * full set can be reset with one `removeItem` call (used by the "重新顯示
 * 所有提示" entry in ProjectHub).
 *
 * Hint IDs follow the convention `<area>-<topic>`, e.g. `schedule-editor`,
 * `expense-features`. Bumping a hint's ID is the easy way to force-show
 * a refreshed banner to everyone (e.g. after major copy changes).
 */
const LS_KEY = 'tripmori_dismissed_hints';

type SeenMap = Record<string, boolean>;

const load = (): SeenMap => {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '{}');
  } catch {
    return {};
  }
};

export const isHintSeen = (id: string): boolean => !!load()[id];

export const markHintSeen = (id: string): void => {
  const map = load();
  map[id] = true;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(map));
  } catch {
    /* fail-soft: localStorage full / disabled */
  }
};

/** Re-show every dismissed hint. Called from the help/about modal. */
export const resetAllHints = (): void => {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    /* ignore */
  }
};
