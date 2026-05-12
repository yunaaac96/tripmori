import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLightbulb, faXmark } from '@fortawesome/free-solid-svg-icons';
import { FONT } from '../App';
import { isHintSeen, markHintSeen } from '../utils/hints';

interface Props {
  /** Stable hint identifier — used as localStorage key. Choose a memorable
   *  name like `schedule-editor`, `expense-features`. */
  hintId: string;
  /** Bold first line. */
  title: string;
  /** Body — string or pre-formatted JSX (lists, bullets, etc). */
  body: ReactNode;
  /** Optional: skip rendering when this is false (e.g. role-gated banners). */
  show?: boolean;
  /** Optional: override the margin around the banner. */
  style?: React.CSSProperties;
}

/**
 * One-time dismissible info banner. The first time a viewer hits a page or
 * modal that mounts this component, they see a warm-yellow banner explaining
 * the feature. Tapping ✕ stores a flag in localStorage and the banner never
 * appears again — until the user opts back in via "重新顯示所有提示" in the
 * project hub.
 *
 * The component reads localStorage once on mount to decide whether to render,
 * so it doesn't flash on re-mounts during the same session.
 */
export default function FirstTimeHint({ hintId, title, body, show = true, style }: Props) {
  const [visible, setVisible] = useState(() => show && !isHintSeen(hintId));

  // Re-evaluate when the `show` gate or hint id changes (e.g. role-gated
  // banners that flip from hidden to allowed once `role` resolves).
  useEffect(() => {
    setVisible(show && !isHintSeen(hintId));
  }, [show, hintId]);

  if (!visible) return null;

  const dismiss = () => {
    markHintSeen(hintId);
    setVisible(false);
  };

  return (
    <div
      style={{
        position: 'relative',
        background: 'var(--tm-note-1, #FFF8C5)',
        border: '1px solid #E8C96A',
        borderRadius: 12,
        padding: '12px 36px 12px 14px',
        marginBottom: 12,
        fontFamily: FONT,
        ...style,
      }}
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="關閉提示"
        style={{
          position: 'absolute',
          top: 6,
          right: 6,
          width: 26,
          height: 26,
          borderRadius: '50%',
          border: 'none',
          background: 'transparent',
          color: '#9A6800',
          fontSize: 13,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: FONT,
          // iOS Safari hardening — see participant-chip fix for context.
          touchAction: 'manipulation',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <FontAwesomeIcon icon={faXmark} />
      </button>
      <p
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: '#7A5A20',
          margin: '0 0 6px',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          lineHeight: 1.4,
        }}
      >
        <FontAwesomeIcon icon={faLightbulb} style={{ fontSize: 11, color: '#9A6800' }} />
        {title}
      </p>
      <div style={{ fontSize: 11, color: '#7A5A20', lineHeight: 1.6 }}>{body}</div>
    </div>
  );
}
