import { C, FONT } from '../../App';

const TABS = [
  { id: "行程", emoji: "🗓" },
  { id: "預訂", emoji: "✈️" },
  { id: "記帳", emoji: "💰" },
  { id: "日誌", emoji: "📖" },
  { id: "準備", emoji: "📋" },
  { id: "成員", emoji: "👥" },
];

export default function BottomNav({ activeTab, onTabChange }: { activeTab: string; onTabChange: (t: string) => void }) {
  return (
    <div style={{
      position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
      width: '100%', maxWidth: 430,
      height: 72, background: 'white',
      borderTop: `2px solid ${C.creamDark}`,
      display: 'flex',
      borderRadius: '0',
      zIndex: 100,
      boxShadow: '0 -2px 16px rgba(107,92,78,0.08)',
    }}>
      {TABS.map(tab => {
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', gap: 3, border: 'none', background: 'transparent',
              cursor: 'pointer', fontFamily: FONT, padding: 0,
              transition: 'transform 0.15s',
            }}
            onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.88)')}
            onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
            onTouchStart={e => (e.currentTarget.style.transform = 'scale(0.88)')}
            onTouchEnd={e => (e.currentTarget.style.transform = 'scale(1)')}
          >
            <span style={{ fontSize: 20 }}>{tab.emoji}</span>
            <span style={{ fontSize: 10, fontWeight: active ? 700 : 500, color: active ? C.sageDark : C.barkLight }}>{tab.id}</span>
            {active && <div style={{ width: 4, height: 4, borderRadius: '50%', background: C.sage }} />}
          </button>
        );
      })}
    </div>
  );
}
