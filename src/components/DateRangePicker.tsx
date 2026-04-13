import { useState } from 'react';
import { C, FONT } from '../App';

const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

function toYMD(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function buildCalendarDays(year: number, month: number): (string | null)[] {
  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month + 1, 0);
  // Week starts Monday: Sun=0 → pad 6, Mon=1 → pad 0, …
  const startPad = (firstDay.getDay() + 6) % 7;
  const days: (string | null)[] = Array(startPad).fill(null);
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push(toYMD(new Date(year, month, d)));
  }
  return days;
}

interface Props {
  startDate: string; // YYYY-MM-DD or ''
  endDate:   string; // YYYY-MM-DD or ''
  onChange:  (start: string, end: string) => void;
}

export default function DateRangePicker({ startDate, endDate, onChange }: Props) {
  const init = startDate ? new Date(startDate) : new Date();
  const [viewYear,  setViewYear]  = useState(init.getFullYear());
  const [viewMonth, setViewMonth] = useState(init.getMonth());
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  // 'start' = waiting for user to click a start date
  // 'end'   = start is set, waiting for end date
  const [phase, setPhase] = useState<'start' | 'end'>(startDate ? 'end' : 'start');

  const days = buildCalendarDays(viewYear, viewMonth);
  const monthLabel = new Date(viewYear, viewMonth, 1)
    .toLocaleDateString('zh-TW', { year: 'numeric', month: 'long' });

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };

  const handleDayClick = (date: string) => {
    if (phase === 'start' || date < startDate) {
      // Set (or reset) start date
      onChange(date, '');
      setPhase('end');
    } else if (date === startDate) {
      // Clicking start again resets
      onChange('', '');
      setPhase('start');
    } else {
      // Set end date
      onChange(startDate, date);
      setPhase('end');
    }
  };

  // Preview range while hovering (only in 'end' phase)
  const previewEnd = phase === 'end' && hoverDate && startDate && hoverDate > startDate
    ? hoverDate : null;
  const effectiveEnd = previewEnd ?? endDate;

  const isStart   = (d: string) => d === startDate;
  const isEnd     = (d: string) => !!effectiveEnd && d === effectiveEnd;
  const isInRange = (d: string) => !!(startDate && effectiveEnd && d > startDate && d < effectiveEnd);
  const todayStr  = toYMD(new Date());

  const sageMid = '#8BAF7A'; // between C.sage and C.sageDark for range fill

  return (
    <div style={{ fontFamily: FONT, userSelect: 'none' }}>

      {/* ── Month navigation ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <button onClick={prevMonth}
          style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: C.bark, padding: '4px 10px', lineHeight: 1 }}>
          ‹
        </button>
        <span style={{ fontWeight: 700, fontSize: 14, color: C.bark }}>{monthLabel}</span>
        <button onClick={nextMonth}
          style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: C.bark, padding: '4px 10px', lineHeight: 1 }}>
          ›
        </button>
      </div>

      {/* ── Week-day headers ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 4 }}>
        {WEEK_LABELS.map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: C.barkLight, padding: '2px 0' }}>{d}</div>
        ))}
      </div>

      {/* ── Calendar grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px 0' }}>
        {days.map((d, i) => {
          if (!d) return <div key={`pad-${i}`} />;
          const start   = isStart(d);
          const end     = isEnd(d);
          const inRange = isInRange(d);
          const today   = d === todayStr;

          // Range highlight: continuous bar between start and end
          const rangeLeft  = start && effectiveEnd ? '50%'    : inRange ? '0'   : undefined;
          const rangeRight = end   && startDate    ? '50%'    : inRange ? '0'   : undefined;
          const showBar    = (start && !!effectiveEnd) || end || inRange;

          return (
            <div key={d} style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '2px 0' }}>
              {/* Range bar (behind button) */}
              {showBar && (
                <div style={{
                  position: 'absolute', top: 4, bottom: 4,
                  left: rangeLeft ?? '0', right: rangeRight ?? '0',
                  background: sageMid + '33',
                  borderRadius: start ? '0 6px 6px 0' : end ? '6px 0 0 6px' : undefined,
                  pointerEvents: 'none',
                }} />
              )}
              <button
                onClick={() => handleDayClick(d)}
                onMouseEnter={() => phase === 'end' && startDate && setHoverDate(d)}
                onMouseLeave={() => setHoverDate(null)}
                style={{
                  position: 'relative',
                  zIndex: 1,
                  width: 34, height: 34,
                  border: today && !start && !end ? `1.5px solid ${C.sageDark}` : 'none',
                  borderRadius: 10,
                  background: start || end ? C.sageDark : 'transparent',
                  color: start || end ? 'white' : today ? C.sageDark : C.bark,
                  fontWeight: start || end || today ? 700 : 400,
                  fontSize: 13,
                  cursor: 'pointer',
                  fontFamily: FONT,
                  outline: 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background 0.15s',
                }}
              >
                {parseInt(d.slice(8), 10)}
              </button>
            </div>
          );
        })}
      </div>

      {/* ── Range summary ── */}
      <p style={{ fontSize: 11, color: C.barkLight, margin: '10px 0 0', textAlign: 'center', minHeight: 16 }}>
        {!startDate
          ? '請點選出發日期'
          : phase === 'end' && !endDate
          ? `出發：${startDate}　← 請點選回程日期`
          : startDate && endDate && endDate !== startDate
          ? `${startDate} → ${endDate}`
          : startDate
          ? `出發：${startDate}（單日行程）`
          : ''}
      </p>
    </div>
  );
}
