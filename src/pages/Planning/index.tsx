import { C, FONT, cardStyle } from '../../App';
import PageHeader from '../../components/layout/PageHeader';
import { SectionTitle } from '../../components/ui/index';
import { doc, updateDoc } from 'firebase/firestore';

export default function PlanningPage({ lists, members, db, TRIP_ID }: any) {
  const packing = lists.filter((l: any) => l.listType === 'packing');
  const todos   = lists.filter((l: any) => l.listType === 'todo');
  const shopping= lists.filter((l: any) => l.listType === 'shopping');

  const toggleItem = async (itemId: string, current: boolean) => {
    const ref = doc(db, 'trips', TRIP_ID, 'lists', itemId);
    await updateDoc(ref, { checked: !current });
  };

  const memberColorMap = members.reduce((acc: any, m: any) => { acc[m.name] = m.color; return acc; }, {});

  const renderList = (items: any[], emptyMsg: string) => (
    <>
      {items.length === 0 && (
        <div style={{ textAlign: 'center', padding: '16px 0', color: C.barkLight, fontSize: 12 }}>{emptyMsg}</div>
      )}
      {items.map((item: any) => (
        <div key={item.id}
          onClick={() => toggleItem(item.id, item.checked)}
          style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', opacity: item.checked ? 0.55 : 1, transition: 'opacity 0.2s' }}>
          <div style={{
            width: 24, height: 24, borderRadius: 8, border: `2px solid ${item.checked ? C.sageDark : C.creamDark}`,
            background: item.checked ? C.sage : 'white', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.2s',
          }}>
            {item.checked && <span style={{ color: 'white', fontSize: 13, fontWeight: 700 }}>✓</span>}
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: C.bark, margin: 0, textDecoration: item.checked ? 'line-through' : 'none' }}>
              {item.text}
            </p>
            {item.dueDate && <p style={{ fontSize: 10, color: C.barkLight, margin: '2px 0 0' }}>截止：{item.dueDate}</p>}
          </div>
          {item.assignedTo && item.assignedTo !== 'all' && (
            <div style={{
              background: memberColorMap[item.assignedTo] || C.creamDark,
              borderRadius: 8, padding: '3px 8px', fontSize: 10, fontWeight: 600, color: C.bark, flexShrink: 0,
            }}>
              {item.assignedTo}
            </div>
          )}
          {item.assignedTo === 'all' && (
            <div style={{ background: C.cream, borderRadius: 8, padding: '3px 8px', fontSize: 10, color: C.barkLight, flexShrink: 0 }}>全體</div>
          )}
        </div>
      ))}
    </>
  );

  const doneCount = lists.filter((l: any) => l.checked).length;
  const totalCount = lists.length;

  return (
    <div style={{ fontFamily: FONT }}>
      <PageHeader title="旅行準備" subtitle="清單完成度" emoji="📋" color={C.earth}>
        {totalCount > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>{doneCount} / {totalCount} 完成</span>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>{Math.round((doneCount / totalCount) * 100)}%</span>
            </div>
            <div style={{ height: 6, background: 'rgba(255,255,255,0.3)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${(doneCount / totalCount) * 100}%`, background: 'white', borderRadius: 3, transition: 'width 0.4s' }} />
            </div>
          </div>
        )}
      </PageHeader>

      <div style={{ padding: 16 }}>
        <SectionTitle>✅ 出發前待辦</SectionTitle>
        {renderList(todos, '沒有待辦事項')}

        <div style={{ height: 8 }} />
        <SectionTitle>🧳 行李清單</SectionTitle>
        {renderList(packing, '沒有行李清單項目')}

        {shopping.length > 0 && (
          <>
            <div style={{ height: 8 }} />
            <SectionTitle>🛍 購物清單</SectionTitle>
            {renderList(shopping, '')}
          </>
        )}
      </div>
    </div>
  );
}
