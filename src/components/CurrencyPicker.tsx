import { useState } from 'react';
import CurrencySearch, { ALL_CURRENCIES } from './CurrencySearch';
import { FONT } from '../App';

interface Props {
  value: string;
  onChange: (code: string) => void;
  /** The project-level currency code (e.g. 'CNY', 'JPY'). Shown as first pill. */
  projCurrency: string;
}

export default function CurrencyPicker({ value, onChange, projCurrency }: Props) {
  const [showSearch, setShowSearch] = useState(false);

  const isCustom = value !== projCurrency && value !== 'TWD';
  const customInfo = ALL_CURRENCIES.find(c => c.code === value);
  const projInfo   = ALL_CURRENCIES.find(c => c.code === projCurrency);

  const pill = (active: boolean): React.CSSProperties => ({
    padding: '7px 14px',
    borderRadius: 20,
    border: `1.5px solid ${active ? 'var(--tm-sage)' : 'var(--tm-input-border)'}`,
    background: active ? 'var(--tm-sage)' : 'var(--tm-input-bg)',
    color: active ? 'white' : 'var(--tm-bark)',
    fontWeight: active ? 700 : 500,
    fontSize: 13,
    cursor: 'pointer',
    fontFamily: FONT,
    whiteSpace: 'nowrap' as const,
    lineHeight: 1.2,
    transition: 'background 0.15s, border-color 0.15s',
  });

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {/* Project currency pill — only shown if different from TWD */}
        {projCurrency !== 'TWD' && (
          <button
            type="button"
            style={pill(value === projCurrency && !showSearch)}
            onClick={() => { onChange(projCurrency); setShowSearch(false); }}
          >
            {projCurrency}{projInfo ? `　${projInfo.name}` : ''}
          </button>
        )}

        {/* TWD pill */}
        <button
          type="button"
          style={pill(value === 'TWD' && !showSearch)}
          onClick={() => { onChange('TWD'); setShowSearch(false); }}
        >
          TWD　新台幣
        </button>

        {/* Custom picker toggle */}
        <button
          type="button"
          style={pill(isCustom || showSearch)}
          onClick={() => setShowSearch(s => !s)}
        >
          {isCustom && customInfo
            ? `${customInfo.code}　${customInfo.name}`
            : '自訂'
          }{' '}▾
        </button>
      </div>

      {/* Inline search dropdown */}
      {showSearch && (
        <div style={{ marginTop: 8 }}>
          <CurrencySearch
            value={isCustom ? value : ''}
            onChange={code => { onChange(code); setShowSearch(false); }}
            placeholder="搜尋貨幣…"
          />
        </div>
      )}
    </div>
  );
}
