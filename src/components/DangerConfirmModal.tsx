import { useState, useCallback, useRef, type ReactNode } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { C, FONT } from '../App';

export interface DangerConfirmOpts {
  /** Heading at the top of the modal (e.g. "刪除成員「Alice」?"). */
  title: string;
  /** Long-form description shown below the title. Optional. */
  body?: ReactNode;
  /** Text on the destructive confirm button (e.g. "確認刪除"). */
  confirmLabel: string;
  /** When true, gates the confirm button behind a checkbox the user must tick. */
  requireAcknowledge?: boolean;
  /** Override the default checkbox text ("我了解此操作無法復原"). */
  acknowledgeLabel?: string;
}

/**
 * Promise-based replacement for window.confirm() with a tone that matches the
 * rest of the app. Returns true when the user confirms, false on cancel /
 * escape / outside click.
 *
 * Usage:
 *   const { confirmDanger, modal } = useDangerConfirm();
 *   // ...
 *   if (!await confirmDanger({ title: '刪除…', confirmLabel: '確認刪除' })) return;
 *   // ...do delete
 *   // In JSX:
 *   {modal}
 */
export function useDangerConfirm() {
  const [opts, setOpts] = useState<DangerConfirmOpts | null>(null);
  const [acked, setAcked] = useState(false);
  const resolverRef = useRef<((ok: boolean) => void) | null>(null);

  const close = (ok: boolean) => {
    const resolver = resolverRef.current;
    resolverRef.current = null;
    setOpts(null);
    setAcked(false);
    resolver?.(ok);
  };

  const confirmDanger = useCallback((nextOpts: DangerConfirmOpts) => {
    // If a previous prompt is somehow still open, resolve it as cancelled
    // before opening the new one — avoids dangling promises on rapid taps.
    if (resolverRef.current) resolverRef.current(false);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setAcked(false);
      setOpts(nextOpts);
    });
  }, []);

  const ackLabel = opts?.acknowledgeLabel ?? '我了解此操作無法復原';
  const canConfirm = !!opts && (!opts.requireAcknowledge || acked);

  const modal = opts ? (
    <div
      onClick={ev => { if (ev.target === ev.currentTarget) close(false); }}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(107,92,78,0.55)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        zIndex: 700,
      }}
    >
      <div style={{
        background: 'var(--tm-sheet-bg)',
        borderRadius: '24px 24px 0 0',
        padding: '22px 20px 32px',
        width: '100%', maxWidth: 430,
        fontFamily: FONT,
        boxSizing: 'border-box',
      }}>
        <p style={{
          fontSize: 17, fontWeight: 700, color: '#9A3A3A',
          margin: '0 0 8px',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <FontAwesomeIcon icon={faTriangleExclamation} style={{ fontSize: 16 }} />
          {opts.title}
        </p>
        {opts.body && (
          <div style={{ fontSize: 13, color: C.bark, lineHeight: 1.6, margin: '0 0 16px' }}>
            {opts.body}
          </div>
        )}
        {opts.requireAcknowledge && (
          <label style={{
            display: 'flex', alignItems: 'flex-start', gap: 8,
            background: '#FFF6F0', border: '1px solid #E8B96A',
            borderRadius: 10, padding: '10px 12px',
            margin: '0 0 16px',
            cursor: 'pointer',
            fontSize: 12, fontWeight: 600, color: '#7A4A0A',
          }}>
            <input type="checkbox" checked={acked} onChange={e => setAcked(e.target.checked)}
              style={{ marginTop: 2, accentColor: '#9A3A3A', flexShrink: 0 }}
            />
            <span>{ackLabel}</span>
          </label>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => close(false)}
            style={{
              flex: 1, padding: 12, borderRadius: 12,
              border: `1.5px solid ${C.creamDark}`,
              background: 'var(--tm-card-bg)',
              color: C.barkLight,
              fontWeight: 700,
              cursor: 'pointer', fontFamily: FONT, fontSize: 14,
            }}>
            取消
          </button>
          <button
            disabled={!canConfirm}
            onClick={() => close(true)}
            style={{
              flex: 2, padding: 12, borderRadius: 12,
              border: 'none',
              background: canConfirm ? '#9A3A3A' : '#C8A8A8',
              color: 'white',
              fontWeight: 700,
              cursor: canConfirm ? 'pointer' : 'not-allowed',
              fontFamily: FONT, fontSize: 14,
            }}>
            {opts.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { confirmDanger, modal };
}
