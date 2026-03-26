import { useState } from 'react';
import { C, FONT, CATEGORY_MAP, EMPTY_EVENT_FORM, cardStyle, inputStyle, btnPrimary } from '../../App';
import PageHeader from '../../components/layout/PageHeader';

const DAY_OPTIONS = [
  { date: '2026-04-23', label: '4/23', week: '四', weather: { icon: '⛅', temp: '24°C', desc: '多雲轉晴' } },
  { date: '2026-04-24', label: '4/24', week: '五', weather: { icon: '☀️', temp: '26°C', desc: '晴時多雲' } },
  { date: '2026-04-25', label: '4/25', week: '六', weather: { icon: '🌤', temp: '25°C', desc: '晴'       } },
  { date: '2026-04-26', label: '4/26', week: '日', weather: { icon: '⛅', temp: '23°C', desc: '多雲'     } },
];

type Mode = 'view' | 'add' | 'edit';

export default function SchedulePage({ events, firestore }: { events: any[]; members: any[]; firestore: any }) {
  const { db, TRIP_ID, Timestamp, addDoc, updateDoc, deleteDoc, collection, doc } = firestore;

  const [activeDay, setActiveDay]       = useState('2026-04-23');
  const [mode, setMode]                 = useState<Mode>('view');
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [form, setForm]                 = useState({ ...EMPTY_EVENT_FORM });
  const [saving, setSaving]             = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [countdown, setCountdown]       = useState({ d: 0, h: 0, m: 0, s: 0 });

  // 倒數計時
  useState(() => {
    const target = new Date('2026-04-23T00:00:00').getTime();
    const t = setInterval(() => {
      const diff = target - Date.now();
      if (diff > 0) setCountdown({
        d: Math.floor(diff / 86400000),
        h: Math.floor((diff % 86400000) / 3600000),
        m: Math.floor((diff % 3600000) / 60000),
        s: Math.floor((diff % 60000) / 1000),
      });
    }, 1000);
    return () => clearInterval(t);
  });

  const dayInfo = DAY_OPTIONS.find(d => d.date === activeDay)!;
  const dayEvents = events
    .filter(e => (e.date || '').replace(/\//g, '-') === activeDay)
    .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));

  // ── 新增事件 ────────────────────────────────────
  const openAdd = () => {
    setForm({ ...EMPTY_EVENT_FORM });
    setSelectedEvent(null);
    setMode('add');
  };

  // ── 編輯事件 ────────────────────────────────────
  const openEdit = (event: any) => {
    setForm({
      title:     event.title     || '',
      startTime: event.startTime || '',
      endTime:   event.endTime   || '',
      category:  event.category  || 'attraction',
      location:  event.location  || '',
      notes:     event.notes     || '',
      mapUrl:    event.mapUrl    || '',
      cost:      event.cost      ? String(event.cost) : '',
      currency:  event.currency  || 'JPY',
    });
    setSelectedEvent(event);
    setMode('edit');
  };

  // ── 儲存（新增 or 更新）──────────────────────────
  const handleSave = async () => {
    if (!form.title || !form.startTime) return;
    setSaving(true);
    const payload = {
      title:     form.title,
      startTime: form.startTime,
      endTime:   form.endTime   || '',
      category:  form.category,
      location:  form.location  || '',
      notes:     form.notes     || '',
      mapUrl:    form.mapUrl    || '',
      cost:      form.cost ? Number(form.cost) : 0,
      currency:  form.currency,
      date:      activeDay,
    };
    try {
      if (mode === 'add') {
        await addDoc(collection(doc(db, 'trips', TRIP_ID), 'events'), {
          ...payload, createdAt: Timestamp.now(),
        });
      } else if (mode === 'edit' && selectedEvent) {
        await updateDoc(doc(db, 'trips', TRIP_ID, 'events', selectedEvent.id), payload);
      }
    } catch (e) { console.error(e); }
    setSaving(false);
    setMode('view');
    setSelectedEvent(null);
  };

  // ── 刪除 ────────────────────────────────────────
  const handleDelete = async () => {
    if (!selectedEvent) return;
    await deleteDoc(doc(db, 'trips', TRIP_ID, 'events', selectedEvent.id));
    setShowDeleteConfirm(false);
    setMode('view');
    setSelectedEvent(null);
  };

  // ── 表單欄位更新 ────────────────────────────────
  const set = (key: string, val: string) => setForm(p => ({ ...p, [key]: val }));

  // ── 表單 UI ─────────────────────────────────────
  const EventForm = () => (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(107,92,78,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 300 }}>
      <div style={{ background: 'white', borderRadius: '24px 24px 0 0', padding: '24px 20px 40px', width: '100%', maxWidth: 430, boxShadow: '0 -4px 24px rgba(107,92,78,0.18)', fontFamily: FONT, maxHeight: '90vh', overflowY: 'auto' }}>

        {/* 標題列 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <p style={{ fontSize: 17, fontWeight: 700, color: C.bark, margin: 0 }}>
            {mode === 'add' ? '➕ 新增行程' : '✏️ 編輯行程'}
          </p>
          <button onClick={() => setMode('view')} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: C.barkLight, lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* 名稱 */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 4 }}>行程名稱 *</label>
            <input style={inputStyle} placeholder="例：嵐山竹林散步" value={form.title} onChange={e => set('title', e.target.value)} />
          </div>

          {/* 時間 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 4 }}>開始時間 *</label>
              <input style={inputStyle} type="time" value={form.startTime} onChange={e => set('startTime', e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 4 }}>結束時間</label>
              <input style={inputStyle} type="time" value={form.endTime} onChange={e => set('endTime', e.target.value)} />
            </div>
          </div>

          {/* 類別 */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 6 }}>類別</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {Object.entries(CATEGORY_MAP).map(([key, info]) => (
                <button key={key} onClick={() => set('category', key)}
                  style={{
                    padding: '9px 10px', borderRadius: 12, border: `2px solid ${form.category === key ? info.text : '#E0D9C8'}`,
                    background: form.category === key ? info.bg : 'white',
                    color: info.text, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: FONT,
                    display: 'flex', alignItems: 'center', gap: 5,
                  }}>
                  {info.emoji} {info.label}
                </button>
              ))}
            </div>
          </div>

          {/* 地點 */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 4 }}>地點 / 地址</label>
            <input style={inputStyle} placeholder="例：京都市右京區嵯峨" value={form.location} onChange={e => set('location', e.target.value)} />
          </div>

          {/* 備註 */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 4 }}>備註</label>
            <textarea style={{ ...inputStyle, minHeight: 72, resize: 'vertical', lineHeight: 1.6 }}
              placeholder="特別注意事項、推薦事項..."
              value={form.notes} onChange={e => set('notes', e.target.value)} />
          </div>

          {/* 地圖連結 */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 4 }}>地圖連結（Google Maps）</label>
            <input style={inputStyle} placeholder="https://maps.app.goo.gl/..." value={form.mapUrl} onChange={e => set('mapUrl', e.target.value)} />
          </div>

          {/* 費用 */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 4 }}>預估費用</label>
              <input style={inputStyle} type="number" inputMode="numeric" placeholder="0" value={form.cost} onChange={e => set('cost', e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 4 }}>幣別</label>
              <select style={inputStyle} value={form.currency} onChange={e => set('currency', e.target.value)}>
                <option value="JPY">JPY ¥</option>
                <option value="TWD">TWD $</option>
                <option value="USD">USD $</option>
              </select>
            </div>
          </div>

          {/* 操作按鈕 */}
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            {mode === 'edit' && (
              <button onClick={() => setShowDeleteConfirm(true)}
                style={{ padding: '12px 16px', borderRadius: 12, border: 'none', background: '#FAE0E0', color: '#9A3A3A', fontWeight: 700, cursor: 'pointer', fontFamily: FONT, fontSize: 13 }}>
                🗑 刪除
              </button>
            )}
            <button onClick={() => setMode('view')}
              style={{ flex: 1, padding: 12, borderRadius: 12, border: `1.5px solid ${C.creamDark}`, background: 'white', color: C.barkLight, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>
              取消
            </button>
            <button onClick={handleSave} disabled={saving || !form.title || !form.startTime}
              style={{ ...btnPrimary(), flex: 2, opacity: saving || !form.title || !form.startTime ? 0.65 : 1 }}>
              {saving ? '儲存中...' : mode === 'add' ? '✓ 新增' : '✓ 儲存'}
            </button>
          </div>

        </div>
      </div>
    </div>
  );

  // ── 刪除確認 Dialog ─────────────────────────────
  const DeleteConfirm = () => (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(107,92,78,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400, padding: 24 }}>
      <div style={{ background: 'white', borderRadius: 24, padding: '28px 24px', width: '100%', maxWidth: 320, fontFamily: FONT, textAlign: 'center' }}>
        <div style={{ fontSize: 36, marginBottom: 10 }}>🗑</div>
        <p style={{ fontSize: 16, fontWeight: 700, color: C.bark, margin: '0 0 6px' }}>刪除這筆行程？</p>
        <p style={{ fontSize: 13, color: C.barkLight, margin: '0 0 20px' }}>「{selectedEvent?.title}」將會永久刪除，無法復原。</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowDeleteConfirm(false)}
            style={{ flex: 1, padding: 12, borderRadius: 12, border: `1.5px solid ${C.creamDark}`, background: 'white', color: C.barkLight, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>
            取消
          </button>
          <button onClick={handleDelete}
            style={{ flex: 1, padding: 12, borderRadius: 12, border: 'none', background: '#E76F51', color: 'white', fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>
            確認刪除
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ fontFamily: FONT }}>
      {/* 表單 Modal */}
      {(mode === 'add' || mode === 'edit') && <EventForm />}
      {showDeleteConfirm && <DeleteConfirm />}

      {/* 頁首 */}
      <PageHeader title="日本沖繩之旅" subtitle="2026.04.23 – 04.26　那霸 · 北谷 · 本部" emoji="🗾" color={C.sage}>
        <div style={{ marginTop: 14, background: C.honey, borderRadius: 18, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: C.shadowSm }}>
          <span style={{ fontWeight: 700, fontSize: 12, color: C.bark }}>⏰ 距離出發還有</span>
          <div style={{ display: 'flex', gap: 5, fontWeight: 900, color: C.bark }}>
            {[['d', '天', countdown.d], ['h', '時', countdown.h], ['m', '分', countdown.m], ['s', '秒', countdown.s]].map(([k, u, v], i) => (
              <span key={k} style={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                {i > 0 && <span style={{ opacity: 0.35, marginRight: 3 }}>:</span>}
                <span style={{ fontSize: 18 }}>{String(v).padStart(2, '0')}</span>
                <span style={{ fontSize: 9, opacity: 0.65, fontWeight: 600 }}>{u}</span>
              </span>
            ))}
          </div>
        </div>
      </PageHeader>

      <div style={{ padding: '16px 16px 0' }}>

        {/* 日期選擇器 */}
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none', marginBottom: 14 }}>
          {DAY_OPTIONS.map(day => {
            const active = day.date === activeDay;
            return (
              <button key={day.date} onClick={() => setActiveDay(day.date)}
                style={{
                  flexShrink: 0, minWidth: 58, padding: '10px 12px', textAlign: 'center',
                  borderRadius: 16, border: `2px solid ${active ? C.sageDark : 'transparent'}`,
                  background: active ? C.sage : 'white', boxShadow: C.shadowSm,
                  cursor: 'pointer', fontFamily: FONT, transition: 'all 0.2s',
                }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: active ? 'white' : C.bark }}>{day.label}</div>
                <div style={{ fontSize: 10, color: active ? 'rgba(255,255,255,0.85)' : C.barkLight, fontWeight: 600 }}>{day.week}</div>
              </button>
            );
          })}
        </div>

        {/* 天氣 + 新增按鈕 並排 */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <div style={{ flex: 1, background: 'linear-gradient(135deg, #D0E8F5 0%, #E8F4E8 100%)', borderRadius: 18, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, boxShadow: C.shadowSm }}>
            <span style={{ fontSize: 22 }}>{dayInfo.weather.icon}</span>
            <div>
              <p style={{ fontSize: 11, color: '#6A8F5C', fontWeight: 600, margin: 0 }}>那霸市 模擬天氣</p>
              <p style={{ fontSize: 13, color: '#3A5A3A', fontWeight: 700, margin: '2px 0 0' }}>{dayInfo.weather.desc} · {dayInfo.weather.temp}</p>
            </div>
          </div>
          {/* ➕ 新增行程按鈕 */}
          <button onClick={openAdd}
            style={{
              flexShrink: 0, width: 56, height: 56, borderRadius: 18,
              background: C.earth, border: 'none', color: 'white',
              fontSize: 26, cursor: 'pointer', boxShadow: C.shadow,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'transform 0.15s',
            }}
            onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.9)')}
            onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
            title="新增行程"
          >
            ＋
          </button>
        </div>

        {/* 時間軸 */}
        <div style={{ position: 'relative', paddingLeft: 8 }}>
          <div style={{ position: 'absolute', left: 28, top: 16, bottom: 0, width: 2, background: C.creamDark }} />

          {dayEvents.length === 0 && (
            <div style={{ textAlign: 'center', padding: '36px 0', color: C.barkLight }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>🌿</div>
              <p style={{ fontSize: 13, margin: 0 }}>這天還沒有行程</p>
              <button onClick={openAdd}
                style={{ marginTop: 12, padding: '8px 20px', borderRadius: 12, border: `2px dashed ${C.creamDark}`, background: 'white', color: C.barkLight, fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: FONT }}>
                ＋ 新增第一筆行程
              </button>
            </div>
          )}

          {dayEvents.map(event => {
            const cat = CATEGORY_MAP[event.category] || CATEGORY_MAP.attraction;
            return (
              <div key={event.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', paddingBottom: 14 }}>
                {/* 時間 */}
                <div style={{ minWidth: 40, paddingTop: 14, textAlign: 'right' }}>
                  <span style={{ fontSize: 10, color: C.barkLight, fontWeight: 600 }}>{event.startTime}</span>
                </div>
                {/* 圓點 */}
                <div style={{ width: 14, height: 14, borderRadius: '50%', background: cat.bg, border: `3px solid ${cat.text}`, flexShrink: 0, marginTop: 14, position: 'relative', zIndex: 1, boxShadow: `0 0 0 3px ${C.cream}` }} />
                {/* 卡片 */}
                <div style={{ flex: 1, background: 'white', borderRadius: 16, padding: '10px 14px', boxShadow: C.shadowSm }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, background: cat.bg, color: cat.text, borderRadius: 6, padding: '2px 8px', display: 'inline-block', marginBottom: 4 }}>
                        {cat.emoji} {cat.label}
                      </span>
                      <p style={{ fontSize: 14, fontWeight: 700, color: C.bark, margin: '0 0 2px' }}>{event.title}</p>
                      {event.location && <p style={{ fontSize: 11, color: C.barkLight, margin: 0 }}>📍 {event.location}</p>}
                      {event.notes   && <p style={{ fontSize: 11, color: C.barkLight, margin: '4px 0 0', fontStyle: 'italic' }}>💡 {event.notes}</p>}
                      {event.mapUrl  && (
                        <a href={event.mapUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                          style={{ fontSize: 11, color: C.sky, fontWeight: 600, marginTop: 4, display: 'inline-block', textDecoration: 'none' }}>
                          🗺 查看地圖
                        </a>
                      )}
                    </div>
                    {/* ✏️ 編輯按鈕 */}
                    <button onClick={() => openEdit(event)}
                      style={{
                        flexShrink: 0, width: 30, height: 30, borderRadius: 10,
                        background: C.cream, border: `1.5px solid ${C.creamDark}`,
                        color: C.barkLight, fontSize: 13, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: FONT, transition: 'background 0.15s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = C.creamDark)}
                      onMouseLeave={e => (e.currentTarget.style.background = C.cream)}
                      title="編輯"
                    >
                      ✏️
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 底部新增行程提示 */}
        {dayEvents.length > 0 && (
          <div style={{ textAlign: 'center', paddingBottom: 16 }}>
            <button onClick={openAdd}
              style={{ padding: '8px 20px', borderRadius: 12, border: `2px dashed ${C.creamDark}`, background: 'white', color: C.barkLight, fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: FONT }}>
              ＋ 繼續新增行程
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
