import { C, FONT } from '../../App';
import PageHeader from '../../components/layout/PageHeader';

export default function MembersPage({ members, expenses }: { members: any[]; expenses: any[] }) {
  const totalTWD  = expenses.reduce((s: number, e: any) => s + (e.amountTWD || 0), 0);
  const perPerson = members.length > 0 ? Math.round(totalTWD / members.length) : 0;

  return (
    <div style={{ fontFamily: FONT }}>
      <PageHeader title="旅伴" subtitle={`沖繩 ${members.length || 2} 人小隊 🌊`} emoji="👥" color={C.earth}>
        <div style={{ marginTop: 12, background: 'rgba(255,255,255,0.22)', borderRadius: 14, padding: '10px 14px', display: 'flex', justifyContent: 'space-between' }}>
          {[
            ['總支出', `NT$ ${totalTWD.toLocaleString()}`],
            ['人數', `${members.length || 2} 人`],
            ['每人均攤', `NT$ ${perPerson.toLocaleString()}`],
          ].map(([label, val]) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)', margin: 0 }}>{label}</p>
              <p style={{ fontSize: 15, fontWeight: 700, color: 'white', margin: '2px 0 0' }}>{val}</p>
            </div>
          ))}
        </div>
      </PageHeader>

      <div style={{ padding: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {(members.length > 0 ? members : [
          { id: 'uu',    name: 'uu',    color: '#ebcef5', role: '行程規劃' },
          { id: 'brian', name: 'brian', color: '#aaa9ab', role: '交通達人' },
        ]).map((m: any) => {
          const paid    = expenses.filter((e: any) => e.payer === m.name).reduce((s: number, e: any) => s + (e.amountTWD || 0), 0);
          const balance = paid - perPerson;
          return (
            <div key={m.id} style={{ background: 'white', borderRadius: 22, padding: '18px 14px', textAlign: 'center', boxShadow: C.shadow }}>
              {/* 頭像 */}
              <div style={{ width: 60, height: 60, borderRadius: '50%', background: m.color || C.sageLight, margin: '0 auto 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 700, color: C.bark, border: `3px solid white`, boxShadow: '0 2px 8px rgba(107,92,78,0.15)' }}>
                {m.name?.[0]?.toUpperCase()}
              </div>
              <p style={{ fontSize: 16, fontWeight: 700, color: C.bark, margin: 0 }}>{m.name}</p>
              <p style={{ fontSize: 11, color: C.barkLight, margin: '2px 0 12px' }}>{m.role || '旅伴'}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ background: C.cream, borderRadius: 10, padding: '6px 10px' }}>
                  <p style={{ fontSize: 10, color: C.barkLight, margin: 0 }}>已付出</p>
                  <p style={{ fontSize: 13, fontWeight: 700, color: C.earth, margin: '2px 0 0' }}>NT$ {paid.toLocaleString()}</p>
                </div>
                <div style={{ background: balance >= 0 ? '#EAF3DE' : '#FAE0E0', borderRadius: 10, padding: '6px 10px' }}>
                  <p style={{ fontSize: 10, color: C.barkLight, margin: 0 }}>{balance >= 0 ? '應收回' : '應補繳'}</p>
                  <p style={{ fontSize: 13, fontWeight: 700, color: balance >= 0 ? '#4A7A35' : '#9A3A3A', margin: '2px 0 0' }}>NT$ {Math.abs(balance).toLocaleString()}</p>
                </div>
              </div>
            </div>
          );
        })}

        {/* 新增成員佔位 */}
        <div style={{ background: 'white', borderRadius: 22, padding: '18px 14px', textAlign: 'center', border: `2px dashed ${C.creamDark}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', minHeight: 160 }}>
          <span style={{ fontSize: 28, color: C.creamDark }}>＋</span>
          <span style={{ fontSize: 12, color: C.barkLight, fontWeight: 600 }}>新增成員</span>
        </div>
      </div>
    </div>
  );
}
