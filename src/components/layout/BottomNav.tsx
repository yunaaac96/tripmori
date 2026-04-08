import { C, FONT } from '../../App';

const TABS = [
  { id: "行程", emoji: "🗓" },
  { id: "預訂", emoji: "✈️" },
  { id: "記帳", emoji: "💰" },
  { id: "日誌", emoji: "📖" },
  { id: "準備", emoji: "📋" },
  { id: "成員", emoji: "👥" },
];

export default function BottomNav({
  activeTab,
  onTabChange,
  notifications = {},
}: {
  activeTab: string;
  onTabChange: (t: string) => void;
  notifications?: Record<string, boolean>;
}) {
  return (
    <div style={{
      position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
      width: '100%', maxWidth: 430,
      height: 72, background: 'var(--tm-nav-bg)',
      borderTop: `2px solid var(--tm-nav-border)`,
      display: 'flex',
      zIndex: 100,
      boxShadow: '0 -2px 16px rgba(0,0,0,0.12)',
    }}>
      {TABS.map(tab => {
        const active = activeTab === tab.id;
        const hasNotif = !!notifications[tab.id];
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', gap: 3, border: 'none', background: 'transparent',
              cursor: 'pointer', fontFamily: FONT, padding: 0,
              transition: 'transform 0.15s', position: 'relative',
            }}
            onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.88)')}
            onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
            onTouchStart={e => (e.currentTarget.style.transform = 'scale(0.88)')}
            onTouchEnd={e => (e.currentTarget.style.transform = 'scale(1)')}
          >
            <div style={{ position: 'relative', display: 'inline-flex' }}>
              <span style={{ fontSize: 20 }}>{tab.emoji}</span>
              {hasNotif && (
                <span style={{
                  position: 'absolute', top: -2, right: -4,
                  width: 8, height: 8, borderRadius: '50%',
                  background: '#E76F51',
                  border: '1.5px solid var(--tm-nav-bg)',
                }} />
              )}
            </div>
            <span style={{ fontSize: 10, fontWeight: active ? 700 : 500, color: active ? C.sageDark : 'var(--tm-bark-light)' }}>{tab.id}</span>
            {active && <div style={{ width: 4, height: 4, borderRadius: '50%', background: C.sage }} />}
          </button>
        );
      })}
    </div>
  );
}
