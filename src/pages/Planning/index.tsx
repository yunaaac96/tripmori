import { useState } from 'react';
import { C, FONT } from '../../App';
import PageHeader from '../../components/layout/PageHeader';

export default function PlanningPage({ lists, members, firestore }: any) {
  const { db, TRIP_ID, updateDoc, doc } = firestore;
  const [filterBy, setFilterBy]     = useState<string>('all');
  const [activeSection, setActiveSection] = useState<string>('todo');

  const memberNames: string[] = members.length > 0 ? members.map((m: any) => m.name) : ['uu', 'brian'];

  const packing  = lists.filter((l: any) => l.listType === 'packing');
  const todos    = lists.filter((l: any) => l.listType === 'todo');

  const MEMBER_COLORS: Record<string, string> = { uu: '#ebcef5', brian: '#aaa9ab', all: '#E0F0D8' };

  const toggleItem = async (itemId: string, current: boolean) => {
    try {
      const ref = doc(db, 'trips', TRIP_ID, 'lists', itemId);
      await updateDoc(ref, { checked: !current });
    } catch (e) { console.error(e); }
  };

  const applyFilter = (items: any[]) => {
    if (filterBy === 'all') return items;
    return items.filter((i: any) => i.assignedTo === filterBy || i.assignedTo === 'all');
  };

  const renderList = (items: any[], emptyMsg: string) => {
    const filtered = applyFilter(items);
    if (filtered.length === 0) return (
      <div style={{ textAlign: 'center', padding: '20px 0', color: C.barkLight, fontSize: 13 }}>{emptyMsg}</div>
    );
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.map((item: any) => {
          const color = MEMBER_COLORS[item.assignedTo] || C.creamDark;
          return (
            <div key={item.id}
              onClick={() => toggleItem(item.id, item.checked)}
              style={{ background: 'white', borderRadius: 16, padding: '12px 14px', boxShadow: C.shadowSm, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', opacity: item.checked ? 0.55 : 1, transition: 'opacity 0.2s' }}>
              {/* 勾選框 */}
              <div style={{ width: 24, height: 24, borderRadius: 8, border: `2px solid ${item.checked?C.sageDark:C.creamDark}`, background: item.checked?C.sage:'white', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
                {item.checked && <span style={{ color: 'white', fontSize: 14, fontWeight: 700, lineHeight: 1 }}>✓</span>}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: C.bark, margin: 0, textDecoration: item.checked?'line-through':'none' }}>{item.text}</p>
                {item.dueDate && <p style={{ fontSize: 10, color: C.barkLight, margin: '2px 0 0' }}>截止：{item.dueDate}</p>}
              </div>
              <div style={{ background: color, borderRadius: 8, padding: '3px 8px', fontSize: 10, fontWeight: 700, color: C.bark, flexShrink: 0, minWidth: 28, textAlign: 'center' }}>
                {item.assignedTo === 'all' ? '全體' : (item.assignedTo || '—')}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const allDone  = lists.filter((l: any) => l.checked).length;
  const allTotal = lists.length;

  const SECTIONS = [
    { id: 'todo',    label: '✅ 待辦', items: todos   },
    { id: 'packing', label: '🧳 行李', items: packing },
  ];

  return (
    <div style={{ fontFamily: FONT }}>
      <PageHeader title="旅行準備" subtitle="待辦清單 · 行李清單" emoji="📋" color={C.earth}>
        {allTotal > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>{allDone} / {allTotal} 完成</span>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>{Math.round((allDone/allTotal)*100)}%</span>
            </div>
            <div style={{ height: 6, background: 'rgba(255,255,255,0.3)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${(allDone/allTotal)*100}%`, background: 'white', borderRadius: 3, transition: 'width 0.4s' }} />
            </div>
          </div>
        )}
      </PageHeader>

      <div style={{ padding: '12px 16px 80px' }}>
        {/* 漏斗篩選 */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 2 }}>
          {[{ id: 'all', label: '🌿 全部' }, ...memberNames.map((n: string) => ({ id: n, label: `👤 ${n}` }))].map(opt => (
            <button key={opt.id} onClick={() => setFilterBy(opt.id)}
              style={{ flexShrink: 0, padding: '6px 14px', borderRadius: 20, border: `1.5px solid ${filterBy===opt.id?C.sageDark:C.creamDark}`, background: filterBy===opt.id?C.sage:'white', color: filterBy===opt.id?'white':C.bark, fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: FONT, transition: 'all 0.2s' }}>
              {opt.label}
            </button>
          ))}
        </div>

        {/* 分區 Tab */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {SECTIONS.map(s => (
            <button key={s.id} onClick={() => setActiveSection(s.id)}
              style={{ flex: 1, padding: '9px 4px', borderRadius: 12, border: `1.5px solid ${activeSection===s.id?C.earth:C.creamDark}`, background: activeSection===s.id?C.earth:'white', color: activeSection===s.id?'white':C.barkLight, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: FONT, transition: 'all 0.2s' }}>
              {s.label}
            </button>
          ))}
        </div>

        {SECTIONS.map(s => s.id === activeSection && (
          <div key={s.id}>
            {renderList(s.items, `沒有${s.label}項目`)}
          </div>
        ))}

        {lists.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: C.barkLight }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
            <p style={{ fontSize: 13 }}>清單資料載入中...</p>
          </div>
        )}
      </div>
    </div>
  );
}
