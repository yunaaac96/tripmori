import { C, FONT } from '../../App';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCalendarDays, faPlane, faMoneyBill1, faBook, faClipboardList, faUserGroup } from '@fortawesome/free-solid-svg-icons';
import type { IconDefinition } from '@fortawesome/free-solid-svg-icons';

const TABS: { id: string; icon: IconDefinition }[] = [
  { id: "行程", icon: faCalendarDays },
  { id: "預訂", icon: faPlane },
  { id: "記帳", icon: faMoneyBill1 },
  { id: "日誌", icon: faBook },
  { id: "準備", icon: faClipboardList },
  { id: "成員", icon: faUserGroup },
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
      height: 'calc(56px + env(safe-area-inset-bottom))',
      background: 'var(--tm-nav-bg)',
      borderTop: `2px solid var(--tm-nav-border)`,
      display: 'flex',
      flexDirection: 'column',
      zIndex: 100,
      boxShadow: '0 -2px 16px rgba(0,0,0,0.12)',
    }}>
      <div style={{ display: 'flex', flex: 1 }}>
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
              <span style={{ fontSize: 18, color: active ? C.sageDark : 'var(--tm-bark-light)' }}><FontAwesomeIcon icon={tab.icon} /></span>
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
      {/* Safe area spacer for iOS home indicator */}
      <div style={{ height: 'env(safe-area-inset-bottom)', flexShrink: 0 }} />
    </div>
  );
}
