import { useState } from 'react';
import { C, FONT, cardStyle, inputStyle, btnPrimary } from '../../App';
import PageHeader from '../../components/layout/PageHeader';
import { collection, doc, addDoc, Timestamp } from 'firebase/firestore';

export default function JournalPage({ journals, members, db, TRIP_ID }: any) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ content: '', author: 'uu' });
  const [saving, setSaving] = useState(false);

  const memberNames = members.length > 0 ? members.map((m: any) => m.name) : ['uu', 'brian'];
  const memberColorMap = members.reduce((acc: any, m: any) => { acc[m.name] = m.color; return acc; }, {});

  const handleAdd = async () => {
    if (!form.content.trim()) return;
    setSaving(true);
    await addDoc(collection(doc(db, 'trips', TRIP_ID), 'journals'), {
      content: form.content,
      author: form.author,
      date: new Date().toISOString().split('T')[0],
      time: new Date().toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      photoUrl: '',
      createdAt: Timestamp.now(),
    });
    setForm({ content: '', author: 'uu' });
    setShowForm(false);
    setSaving(false);
  };

  return (
    <div style={{ fontFamily: FONT }}>
      <PageHeader title="旅行日誌" subtitle="記錄每一個珍貴時刻 ✨" emoji="📖" color={C.blush} />

      <div style={{ padding: 16 }}>
        <button onClick={() => setShowForm(!showForm)}
          style={{ ...btnPrimary('#D4768A'), width: '100%', marginBottom: 12 }}>
          <span style={{ fontSize: 16 }}>✏️</span> 寫下此刻
        </button>

        {/* 新增日誌表單 */}
        {showForm && (
          <div style={{ ...cardStyle, marginBottom: 16 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: C.bark, margin: '0 0 12px' }}>✏️ 寫日誌</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <select style={inputStyle} value={form.author}
                onChange={e => setForm(p => ({ ...p, author: e.target.value }))}>
                {memberNames.map((name: string) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
              <textarea
                style={{ ...inputStyle, minHeight: 110, resize: 'vertical', lineHeight: 1.6 }}
                placeholder="寫下你的旅行感受、有趣的事、美食心得..."
                value={form.content}
                onChange={e => setForm(p => ({ ...p, content: e.target.value }))}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setShowForm(false)}
                  style={{ flex: 1, padding: 12, borderRadius: 12, border: `1.5px solid ${C.creamDark}`, background: 'white', color: C.barkLight, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>
                  取消
                </button>
                <button onClick={handleAdd} disabled={saving}
                  style={{ ...btnPrimary('#D4768A'), flex: 2, opacity: saving ? 0.7 : 1 }}>
                  {saving ? '儲存中...' : '發布日誌'}
                </button>
              </div>
            </div>
          </div>
        )}

        {journals.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: C.barkLight }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>📖</div>
            <p style={{ fontSize: 14, fontWeight: 600 }}>還沒有日誌</p>
            <p style={{ fontSize: 12, marginTop: 4 }}>出發後來記錄美好瞬間吧！</p>
          </div>
        )}

        {[...journals]
          .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
          .map((note: any) => {
            const color = memberColorMap[note.author] || C.sageLight;
            return (
              <div key={note.id} style={{ ...cardStyle, padding: 0, overflow: 'hidden', marginBottom: 14 }}>
                {note.photoUrl && (
                  <div style={{ height: 200, background: '#E8E4DB', overflow: 'hidden' }}>
                    <img src={note.photoUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                  </div>
                )}
                {!note.photoUrl && (
                  <div style={{ height: 80, background: `linear-gradient(135deg, ${color}66, ${C.honey}44)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 }}>
                    📸
                  </div>
                )}
                <div style={{ padding: '14px 16px', position: 'relative' }}>
                  <span style={{ position: 'absolute', top: 12, right: 14, fontSize: 36, color: '#F0EDE6', lineHeight: 1 }}>❝</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <div style={{ width: 34, height: 34, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: C.bark, flexShrink: 0 }}>
                      {note.author?.[0]?.toUpperCase()}
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.bark }}>{note.author}</span>
                    <span style={{ fontSize: 11, color: C.barkLight, marginLeft: 'auto' }}>{note.time || note.date}</span>
                  </div>
                  <p style={{ fontSize: 13, color: C.bark, lineHeight: 1.75, margin: 0 }}>{note.content}</p>
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}
