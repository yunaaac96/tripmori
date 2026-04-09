import { useState, useEffect, useRef } from 'react';
import { getDoc } from 'firebase/firestore';
import CurrencySearch from '../../components/CurrencySearch';
import { C, FONT, CATEGORY_MAP, EMPTY_EVENT_FORM, cardStyle, inputStyle, btnPrimary } from '../../App';
import PageHeader from '../../components/layout/PageHeader';

const WEEK_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

function buildTripDates(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  if (!startDate) return dates;
  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : start;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

function buildDayOptions(dates: string[]) {
  return dates.map(date => {
    const d = new Date(date);
    const month = d.getMonth() + 1;
    const day = d.getDate();
    return { date, label: `${month}/${day}`, week: WEEK_LABELS[d.getDay()] };
  });
}

type WeatherDay = {
  max: number;
  min: number;
  emoji: string;
  desc: string;
  precipProb: number;
  outfit: string;
};

type Mode = 'view' | 'add' | 'edit';

// WMO weather code → emoji + description
function wmoToDisplay(code: number): { emoji: string; desc: string } {
  if (code === 0)  return { emoji: '☀️', desc: '晴' };
  if (code === 1)  return { emoji: '🌤', desc: '晴時多雲' };
  if (code === 2)  return { emoji: '⛅', desc: '多雲' };
  if (code === 3)  return { emoji: '☁️', desc: '陰' };
  if (code >= 61 && code <= 67) return { emoji: '🌧', desc: '小雨' };
  if (code >= 80 && code <= 82) return { emoji: '🌦', desc: '陣雨' };
  return { emoji: '⛅', desc: '多雲' };
}

function outfitForTemp(max: number): string {
  if (max < 20)  return '薄外套＋長袖';
  if (max < 24)  return '短袖＋薄外套備用';
  if (max <= 27) return '短袖＋防曬 🌞';
  return '短袖短褲＋防曬必備 ☀️';
}

// Generic fallback climate (mild/warm travel weather)
const FALLBACK_CLIMATE: WeatherDay = {
  max: 26, min: 21,
  emoji: '⛅', desc: '多雲',
  precipProb: 25,
  outfit: outfitForTemp(26),
};

export default function SchedulePage({ events, project, firestore, onProjectUpdate }: { events: any[]; members: any[]; project: any; firestore: any; onProjectUpdate?: (p: any) => void }) {
  const { db, TRIP_ID, Timestamp, addDoc, updateDoc, deleteDoc, collection, doc, isReadOnly, role } = firestore;
  const isOwner = role === 'owner';

  const TRIP_DATES = buildTripDates(project?.startDate || '2026-04-23', project?.endDate || '2026-04-26');
  const DAY_OPTIONS = buildDayOptions(TRIP_DATES.length ? TRIP_DATES : ['2026-04-23', '2026-04-24', '2026-04-25', '2026-04-26']);

  const [activeDay, setActiveDay]   = useState(() => project?.startDate || '2026-04-23');
  const [mode, setMode]             = useState<Mode>('view');
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [form, setForm]             = useState({ ...EMPTY_EVENT_FORM });
  const [saving, setSaving]         = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [countdown, setCountdown]   = useState({ d: 0, h: 0, m: 0, s: 0 });
  const [tripPhase, setTripPhase]   = useState<'before' | 'during' | 'after'>('before');
  // Flight-based countdown anchors (fetched from staticFlights)
  const [flightStartMs, setFlightStartMs] = useState<number | null>(null);
  const [flightEndMs,   setFlightEndMs]   = useState<number | null>(null);
  const [weather, setWeather]       = useState<Record<string, WeatherDay>>({});
  const [weatherSubtitle, setWeatherSubtitle] = useState('氣象資訊載入中…');
  const [weatherLocationKey, setWeatherLocationKey] = useState(0); // increments to re-trigger fetch

  // ── Location edit (double-tap weather card) ──
  const [showLocEdit, setShowLocEdit] = useState(false);
  const [locInput, setLocInput]       = useState('');
  const [locSearching, setLocSearching] = useState(false);
  const [locResults, setLocResults]   = useState<any[]>([]);
  const lastTapRef = useRef<number>(0);

  const handleWeatherTap = () => {
    if (!isOwner) return; // only owner can set location
    const now = Date.now();
    if (now - lastTapRef.current < 350) {
      lastTapRef.current = 0;
      setLocInput(''); setLocResults([]); setShowLocEdit(true);
    } else {
      lastTapRef.current = now;
    }
  };

  // country_code → IANA timezone (covers major travel destinations)
  const COUNTRY_TZ: Record<string, string> = {
    jp: 'Asia/Tokyo',         tw: 'Asia/Taipei',       kr: 'Asia/Seoul',
    cn: 'Asia/Shanghai',      hk: 'Asia/Hong_Kong',    mo: 'Asia/Macau',
    th: 'Asia/Bangkok',       vn: 'Asia/Ho_Chi_Minh',  sg: 'Asia/Singapore',
    my: 'Asia/Kuala_Lumpur',  id: 'Asia/Jakarta',      ph: 'Asia/Manila',
    au: 'Australia/Sydney',   nz: 'Pacific/Auckland',
    us: 'America/New_York',   ca: 'America/Toronto',
    gb: 'Europe/London',      fr: 'Europe/Paris',       it: 'Europe/Rome',
    de: 'Europe/Berlin',      es: 'Europe/Madrid',      gr: 'Europe/Athens',
    pt: 'Europe/Lisbon',      nl: 'Europe/Amsterdam',   at: 'Europe/Vienna',
    ch: 'Europe/Zurich',      tr: 'Europe/Istanbul',    ae: 'Asia/Dubai',
  };

  const handleLocSearch = async () => {
    const q = locInput.trim();
    if (!q) return;
    setLocSearching(true);
    setLocResults([]);

    // Step 1: Try Open-Meteo geocoding (has native timezone field, good for romanised input)
    let results: any[] = [];
    try {
      const res  = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=zh&format=json`);
      const data = await res.json();
      if (data.results?.length) {
        results = data.results.map((r: any) => ({
          name: r.name, admin1: r.admin1, country: r.country,
          latitude: r.latitude, longitude: r.longitude,
          timezone: r.timezone || 'Asia/Tokyo',
        }));
      }
    } catch {}

    // Step 2: Fallback to Nominatim (OpenStreetMap) — handles CJK characters natively
    if (results.length === 0) {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=6&addressdetails=1`,
          { headers: { 'Accept-Language': 'zh-TW,zh,en' } }
        );
        const data: any[] = await res.json();
        results = data
          .filter((r: any) => r.lat && r.lon)
          .map((r: any) => {
            const cc = (r.address?.country_code || '').toLowerCase();
            const city = r.address?.city || r.address?.town || r.address?.village
                      || r.address?.county || r.display_name.split(',')[0].trim();
            const state = r.address?.state || r.address?.province || '';
            const country = r.address?.country || '';
            return {
              name: city, admin1: state, country,
              latitude:  parseFloat(r.lat),
              longitude: parseFloat(r.lon),
              timezone:  COUNTRY_TZ[cc] || 'UTC',
            };
          });
      } catch {}
    }

    setLocResults(results);
    setLocSearching(false);
  };

  const handleLocSelect = async (result: any) => {
    try {
      await updateDoc(doc(db, 'trips', TRIP_ID), {
        locationLat:      result.latitude,
        locationLng:      result.longitude,
        locationTimezone: result.timezone || 'Asia/Tokyo',
        locationName:     result.name,
      });
      setShowLocEdit(false);
      setWeatherLocationKey(k => k + 1); // re-trigger weather useEffect
    } catch (e) { console.error(e); }
  };

  // Trip meta edit (owner only)
  const [editingMeta, setEditingMeta] = useState(false);
  const [metaForm, setMetaForm] = useState({ startDate: '', endDate: '', description: '', currency: '' });
  const [savingMeta, setSavingMeta]   = useState(false);

  // Fetch staticFlights → extract outbound departure + return arrival timestamps
  useEffect(() => {
    if (!db || !TRIP_ID || !doc) return;
    getDoc(doc(db, 'trips', TRIP_ID)).then(snap => {
      if (!snap.exists()) return;
      const flts: any[] = snap.data().staticFlights || [];
      if (!flts.length) return;
      // Outbound: direction === '去程', fallback to first flight
      const outbound = flts.find(f => f.direction === '去程') ?? flts[0];
      // Return: direction === '回程', fallback to last flight
      const inbound  = flts.find(f => f.direction === '回程') ?? flts[flts.length - 1];
      if (outbound?.date && outbound?.dep?.time) {
        setFlightStartMs(new Date(`${outbound.date}T${outbound.dep.time}:00`).getTime());
      }
      if (inbound?.date && inbound?.arr?.time) {
        setFlightEndMs(new Date(`${inbound.date}T${inbound.arr.time}:00`).getTime());
      }
    }).catch(() => {});
  }, [db, TRIP_ID]);

  // Countdown timer:
  //   before  → count down to outbound departure time
  //   during  → hidden (no countdown shown)
  //   after   → show "旅行已結束" once past return arrival time
  useEffect(() => {
    // Prefer flight times; fallback to startDate 00:00 / endDate 23:59
    const startMs = flightStartMs
      ?? new Date(`${project?.startDate || '2026-04-23'}T00:00:00`).getTime();
    const endMs = flightEndMs
      ?? new Date(`${project?.endDate || project?.startDate || '2026-04-23'}T23:59:59`).getTime();
    const tick = () => {
      const now = Date.now();
      if (now < startMs) {
        setTripPhase('before');
        const diff = startMs - now;
        setCountdown({
          d: Math.floor(diff / 86400000),
          h: Math.floor((diff % 86400000) / 3600000),
          m: Math.floor((diff % 3600000) / 60000),
          s: Math.floor((diff % 60000) / 1000),
        });
      } else if (now <= endMs) {
        setTripPhase('during');
        setCountdown({ d: 0, h: 0, m: 0, s: 0 });
      } else {
        setTripPhase('after');
        setCountdown({ d: 0, h: 0, m: 0, s: 0 });
      }
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [project?.startDate, project?.endDate, flightStartMs, flightEndMs]);

  // Weather fetch — reads project location from Firestore, then calls Open-Meteo
  useEffect(() => {
    if (!db || !TRIP_ID || !doc) return;
    const startDate = TRIP_DATES[0];
    const endDate   = TRIP_DATES[TRIP_DATES.length - 1];
    if (!startDate) return;

    const applyFallback = (locationLabel: string) => {
      const fallback: Record<string, WeatherDay> = {};
      TRIP_DATES.forEach(d => { fallback[d] = { ...FALLBACK_CLIMATE }; });
      setWeather(fallback);
      setWeatherSubtitle(`${locationLabel}　📅 氣候估算（出發前 10 天更新即時預報）`);
    };

    const fetchWeather = (lat: number, lng: number, timezone: string, locationName: string) => {
      const daysUntilTrip = Math.floor((new Date(startDate).getTime() - Date.now()) / 86400000);
      if (daysUntilTrip > 10) {
        applyFallback(locationName);
        return;
      }
      const url =
        `https://api.open-meteo.com/v1/forecast` +
        `?latitude=${lat}&longitude=${lng}` +
        `&daily=temperature_2m_max,temperature_2m_min,weathercode,precipitation_probability_max` +
        `&timezone=${encodeURIComponent(timezone)}` +
        `&start_date=${startDate}&end_date=${endDate}`;

      fetch(url)
        .then(r => r.json())
        .then(data => {
          const { time, temperature_2m_max, temperature_2m_min, weathercode, precipitation_probability_max } = data.daily;
          const result: Record<string, WeatherDay> = {};
          time.forEach((date: string, i: number) => {
            const max = Math.round(temperature_2m_max[i]);
            const { emoji, desc } = wmoToDisplay(weathercode[i]);
            result[date] = {
              max,
              min: Math.round(temperature_2m_min[i]),
              emoji, desc,
              precipProb: precipitation_probability_max[i] ?? 0,
              outfit: outfitForTemp(max),
            };
          });
          setWeather(result);
          const subtitle = daysUntilTrip <= 0
            ? `${locationName}　今日預報`
            : `${locationName}　出發當天即時天氣預報`;
          setWeatherSubtitle(subtitle);
        })
        .catch(() => applyFallback(locationName));
    };

    // Fetch trip location from Firestore; fall back to a generic default if not set
    getDoc(doc(db, 'trips', TRIP_ID))
      .then(snap => {
        if (snap.exists()) {
          const d = snap.data();
          if (d.locationLat && d.locationLng) {
            fetchWeather(
              d.locationLat,
              d.locationLng,
              d.locationTimezone || 'Asia/Tokyo',
              d.locationName || project?.title || '目的地',
            );
            return;
          }
        }
        // No location stored yet — show fallback climate + hint
        const fallback: Record<string, WeatherDay> = {};
        TRIP_DATES.forEach(d => { fallback[d] = { ...FALLBACK_CLIMATE }; });
        setWeather(fallback);
        setWeatherSubtitle('尚未設定目的地　輕點兩下設定');
      })
      .catch(() => applyFallback(project?.title || '目的地'));
  }, [TRIP_ID, weatherLocationKey]);

  const dayInfo = DAY_OPTIONS.find(d => d.date === activeDay) ?? DAY_OPTIONS[0];
  const currentWeather = weather[activeDay];

  const dayEvents = events
    .filter(e => (e.date || '').replace(/\//g, '-') === activeDay)
    .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));

  const openAdd  = () => { if (isReadOnly) return; setForm({ ...EMPTY_EVENT_FORM }); setSelectedEvent(null); setMode('add'); };
  const openEdit = (event: any) => {
    setForm({
      title: event.title || '', startTime: event.startTime || '', endTime: event.endTime || '',
      travelTime: event.travelTime || '',
      category: event.category || 'attraction', location: event.location || '',
      notes: event.notes || '', mapUrl: event.mapUrl || '',
      cost: event.cost ? String(event.cost) : '', currency: event.currency || 'JPY',
    });
    setSelectedEvent(event); setMode('edit');
  };

  const handleSave = async () => {
    if (isReadOnly) return;
    if (!form.title || !form.startTime) return;
    setSaving(true);
    const payload = {
      title: form.title, startTime: form.startTime, endTime: form.endTime || '',
      travelTime: form.travelTime || '',
      category: form.category, location: form.location || '', notes: form.notes || '',
      mapUrl: form.mapUrl || '', cost: form.cost ? Number(form.cost) : 0,
      currency: form.currency, date: activeDay,
    };
    try {
      if (mode === 'add') {
        await addDoc(collection(doc(db, 'trips', TRIP_ID), 'events'), { ...payload, createdAt: Timestamp.now() });
      } else if (mode === 'edit' && selectedEvent) {
        await updateDoc(doc(db, 'trips', TRIP_ID, 'events', selectedEvent.id), payload);
      }
    } catch (e) { console.error(e); }
    setSaving(false); setMode('view'); setSelectedEvent(null);
  };

  const handleDelete = async () => {
    if (!isOwner) return; // only owner can delete events
    if (!selectedEvent) return;
    await deleteDoc(doc(db, 'trips', TRIP_ID, 'events', selectedEvent.id));
    setShowDeleteConfirm(false); setMode('view'); setSelectedEvent(null);
  };

  const openMetaEdit = async () => {
    // Fetch latest values from Firestore
    try {
      const snap = await getDoc(doc(db, 'trips', TRIP_ID));
      const d = snap.exists() ? snap.data() : {};
      setMetaForm({
        startDate:   d.startDate   || project?.startDate   || '',
        endDate:     d.endDate     || project?.endDate     || '',
        description: d.description || project?.description || '',
        currency:    d.currency    || 'JPY',
      });
    } catch {
      setMetaForm({
        startDate:   project?.startDate   || '',
        endDate:     project?.endDate     || '',
        description: project?.description || '',
        currency:    'JPY',
      });
    }
    setEditingMeta(true);
  };

  const handleSaveMeta = async () => {
    setSavingMeta(true);
    try {
      await updateDoc(doc(db, 'trips', TRIP_ID), {
        startDate:   metaForm.startDate,
        endDate:     metaForm.endDate || metaForm.startDate,
        description: metaForm.description.trim(),
        currency:    metaForm.currency,
      });
      if (onProjectUpdate && project) {
        onProjectUpdate({
          ...project,
          startDate:   metaForm.startDate,
          endDate:     metaForm.endDate || metaForm.startDate,
          description: metaForm.description.trim(),
        });
      }
      setEditingMeta(false);
    } catch (e) { console.error(e); }
    setSavingMeta(false);
  };

  const setMeta = (key: string, val: string) => setMetaForm(p => ({ ...p, [key]: val }));

  const set = (key: string, val: string) => setForm(p => ({ ...p, [key]: val }));

  // Build a Google Maps URL: prefer explicit mapUrl, fallback to search by location name
  const getMapUrl = (event: any): string | null => {
    if (event.mapUrl) return event.mapUrl;
    if (event.location) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`;
    return null;
  };

  return (
    <div style={{ fontFamily: FONT }}>

      {/* ── Trip Meta Edit Modal (owner only) ── */}
      {editingMeta && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(107,92,78,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 300 }}>
          <div style={{ background: 'var(--tm-sheet-bg)', borderRadius: '24px 24px 0 0', padding: '24px 20px 40px', width: '100%', maxWidth: 430, fontFamily: FONT, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <p style={{ fontSize: 17, fontWeight: 700, color: C.bark, margin: 0 }}>✏️ 編輯旅行設定</p>
              <button onClick={() => setEditingMeta(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: C.barkLight }}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 4 }}>出發日期</label>
                  <input style={{ ...inputStyle, padding: '10px 8px' }} type="date" value={metaForm.startDate} onChange={e => setMeta('startDate', e.target.value)} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 4 }}>回程日期</label>
                  <input style={{ ...inputStyle, padding: '10px 8px' }} type="date" value={metaForm.endDate} onChange={e => setMeta('endDate', e.target.value)} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 4 }}>旅行簡介</label>
                <textarea style={{ ...inputStyle, minHeight: 72, resize: 'vertical' as const, lineHeight: 1.6 }} placeholder="簡單描述這趟旅行…" value={metaForm.description} onChange={e => setMeta('description', e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 4 }}>主要幣值</label>
                <CurrencySearch value={metaForm.currency} onChange={code => setMeta('currency', code)} />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button onClick={() => setEditingMeta(false)} style={{ flex: 1, padding: 12, borderRadius: 12, border: `1.5px solid ${C.creamDark}`, background: 'var(--tm-card-bg)', color: C.barkLight, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>取消</button>
                <button onClick={handleSaveMeta} disabled={savingMeta} style={{ flex: 2, padding: 12, borderRadius: 12, border: 'none', background: C.sage, color: 'white', fontWeight: 700, cursor: 'pointer', fontFamily: FONT, opacity: savingMeta ? 0.6 : 1 }}>{savingMeta ? '儲存中...' : '✓ 儲存'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Inline Event Form Modal ── */}
      {(mode === 'add' || mode === 'edit') && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(107,92,78,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 300 }}>
          <div style={{ background: 'var(--tm-sheet-bg)', borderRadius: '24px 24px 0 0', padding: '24px 20px 40px', width: '100%', maxWidth: 430, fontFamily: FONT, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <p style={{ fontSize: 17, fontWeight: 700, color: C.bark, margin: 0 }}>{mode === 'add' ? '➕ 新增行程' : '✏️ 編輯行程'}</p>
              <button onClick={() => setMode('view')} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: C.barkLight }}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div><label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 4 }}>行程名稱 *</label><input style={inputStyle} placeholder="享用早午餐 / 前往台北101 / Check-in…" value={form.title} onChange={e => set('title', e.target.value)} /></div>
              {/* 時間欄：flex 取代 grid，避免 iOS time input overflow */}
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 4 }}>開始時間 *</label>
                  <input style={{ ...inputStyle, padding: '10px 8px' }} type="time" value={form.startTime} onChange={e => set('startTime', e.target.value)} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 4 }}>結束時間</label>
                  <input style={{ ...inputStyle, padding: '10px 8px' }} type="time" value={form.endTime} onChange={e => set('endTime', e.target.value)} />
                </div>
              </div>
              {/* 預計車程 */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 4 }}>🚗 前往下一站預計車程（選填）</label>
                <input style={inputStyle} placeholder="例：約 30 分鐘" value={form.travelTime} onChange={e => set('travelTime', e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 6 }}>類別</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {Object.entries(CATEGORY_MAP).map(([key, info]) => (
                    <button key={key} onClick={() => set('category', key)} style={{ padding: '9px 10px', borderRadius: 12, border: `2px solid ${form.category === key ? info.text : '#E0D9C8'}`, background: form.category === key ? info.bg : 'var(--tm-card-bg)', color: info.text, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: FONT, display: 'flex', alignItems: 'center', gap: 5 }}>{info.emoji} {info.label}</button>
                  ))}
                </div>
              </div>
              <div><label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 4 }}>地點</label><input style={inputStyle} placeholder="地址或景點名" value={form.location} onChange={e => set('location', e.target.value)} /></div>
              <div><label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 4 }}>備註</label><textarea style={{ ...inputStyle, minHeight: 72, resize: 'vertical' as const, lineHeight: 1.6 }} placeholder="注意事項..." value={form.notes} onChange={e => set('notes', e.target.value)} /></div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 4 }}>地圖連結</label>
                <input style={inputStyle} placeholder="https://maps.app.goo.gl/..." value={form.mapUrl} onChange={e => set('mapUrl', e.target.value)} />
                <p style={{ fontSize: 10, color: C.barkLight, margin: '4px 0 0', lineHeight: 1.5 }}>選填，未填寫時將自動依「地點」欄位資訊導入地圖</p>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                {mode === 'edit' && isOwner && <button onClick={() => setShowDeleteConfirm(true)} style={{ padding: '12px 16px', borderRadius: 12, border: 'none', background: '#FAE0E0', color: '#9A3A3A', fontWeight: 700, cursor: 'pointer', fontFamily: FONT, fontSize: 13 }}>🗑</button>}
                <button onClick={() => setMode('view')} style={{ flex: 1, padding: 12, borderRadius: 12, border: `1.5px solid ${C.creamDark}`, background: 'var(--tm-card-bg)', color: C.barkLight, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>取消</button>
                <button onClick={handleSave} disabled={saving || !form.title || !form.startTime} style={{ ...btnPrimary(), flex: 2, opacity: saving || !form.title || !form.startTime ? 0.6 : 1 }}>{saving ? '儲存中...' : mode === 'add' ? '✓ 新增' : '✓ 儲存'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Inline Delete Confirm Modal ── */}
      {showDeleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(107,92,78,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400, padding: 24 }}>
          <div style={{ background: 'var(--tm-sheet-bg)', borderRadius: 24, padding: '28px 24px', width: '100%', maxWidth: 320, fontFamily: FONT, textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>🗑</div>
            <p style={{ fontSize: 16, fontWeight: 700, color: C.bark, margin: '0 0 6px' }}>刪除這筆行程？</p>
            <p style={{ fontSize: 13, color: C.barkLight, margin: '0 0 20px' }}>「{selectedEvent?.title}」將永久刪除。</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowDeleteConfirm(false)} style={{ flex: 1, padding: 12, borderRadius: 12, border: `1.5px solid ${C.creamDark}`, background: 'var(--tm-card-bg)', color: C.barkLight, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>取消</button>
              <button onClick={handleDelete} style={{ flex: 1, padding: 12, borderRadius: 12, border: 'none', background: '#E76F51', color: 'white', fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>確認刪除</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Location edit sheet ── */}
      {showLocEdit && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(107,92,78,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 300 }}
          onClick={e => { if (e.target === e.currentTarget) setShowLocEdit(false); }}>
          <div style={{ background: 'var(--tm-sheet-bg)', borderRadius: '24px 24px 0 0', padding: '24px 20px 40px', width: '100%', maxWidth: 430, fontFamily: FONT }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--tm-bark)', margin: 0 }}>📍 設定目的地</p>
              <button onClick={() => setShowLocEdit(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--tm-bark-light)' }}>✕</button>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input
                autoFocus
                value={locInput}
                onChange={e => setLocInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleLocSearch(); }}
                placeholder="搜尋城市或地名，例如：沖繩、東京"
                style={{ flex: 1, padding: '10px 14px', borderRadius: 12, border: '1.5px solid var(--tm-cream-dark)', fontSize: 15, fontFamily: FONT, color: 'var(--tm-bark)', background: 'var(--tm-input-bg)', outline: 'none' }}
              />
              <button onClick={handleLocSearch} disabled={locSearching || !locInput.trim()}
                style={{ padding: '10px 16px', borderRadius: 12, border: 'none', background: C.sage, color: 'white', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: FONT, opacity: locSearching || !locInput.trim() ? 0.5 : 1 }}>
                {locSearching ? '…' : '搜尋'}
              </button>
            </div>
            {locResults.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {locResults.map((r: any, i: number) => (
                  <button key={i} onClick={() => handleLocSelect(r)}
                    style={{ textAlign: 'left', padding: '10px 14px', borderRadius: 12, border: '1.5px solid var(--tm-cream-dark)', background: 'var(--tm-card-bg)', cursor: 'pointer', fontFamily: FONT }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--tm-bark)', margin: 0 }}>📍 {r.name}</p>
                    <p style={{ fontSize: 11, color: 'var(--tm-bark-light)', margin: '2px 0 0' }}>
                      {[r.admin1, r.country].filter(Boolean).join('・')}
                      <span style={{ marginLeft: 6, opacity: 0.6 }}>{r.latitude?.toFixed(2)}, {r.longitude?.toFixed(2)}</span>
                    </p>
                  </button>
                ))}
              </div>
            )}
            {!locSearching && locResults.length === 0 && locInput && (
              <p style={{ fontSize: 12, color: 'var(--tm-bark-light)', textAlign: 'center', padding: '12px 0 0', margin: 0 }}>
                找不到結果，請試試其他關鍵字
              </p>
            )}
          </div>
        </div>
      )}

      <PageHeader title={project?.title || '行程'} subtitle={project?.description || undefined} emoji={project?.emoji || '✈️'} color={C.sage}>
        {firestore.role === 'owner' && (
          <button onClick={openMetaEdit} style={{ marginTop: 8, fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.85)', background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.35)', borderRadius: 8, padding: '4px 12px', cursor: 'pointer', fontFamily: FONT }}>
            ✏️ 編輯旅行設定
          </button>
        )}
        {tripPhase !== 'during' && (
          <div style={{ marginTop: 14, background: tripPhase === 'after' ? '#E8F5E2' : C.honey, borderRadius: 18, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: C.shadowSm }}>
            {tripPhase === 'after' ? (
              <>
                <span style={{ fontWeight: 700, fontSize: 12, color: '#4A7A35' }}>✈️ 旅程已結束</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#4A7A35', opacity: 0.75 }}>回憶珍藏中 🌸</span>
              </>
            ) : (
              <>
                <span style={{ fontWeight: 700, fontSize: 12, color: C.bark }}>⏰ 距離出發</span>
                <div style={{ display: 'flex', gap: 4, fontWeight: 900, color: C.bark, alignItems: 'baseline' }}>
                  {([['d', '天', countdown.d], ['h', '時', countdown.h], ['m', '分', countdown.m], ['s', '秒', countdown.s]] as [string, string, number][]).map(([k, u, v], i) => (
                    <span key={k} style={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                      {i > 0 && <span style={{ opacity: 0.4, marginRight: 2 }}>:</span>}
                      <span style={{ fontSize: 18 }}>{String(v).padStart(2, '0')}</span>
                      <span style={{ fontSize: 9, opacity: 0.65 }}>{u}</span>
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </PageHeader>

      <div style={{ padding: '16px 16px 0', textAlign: 'left' }}>
        {/* Day selector */}
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none', marginBottom: 14 }}>
          {DAY_OPTIONS.map(day => {
            const active = day.date === activeDay;
            return (
              <button key={day.date} onClick={() => setActiveDay(day.date)}
                style={{ flexShrink: 0, minWidth: 58, padding: '10px 12px', textAlign: 'center', borderRadius: 16, border: `2px solid ${active ? C.sageDark : 'transparent'}`, background: active ? C.sage : 'var(--tm-card-bg)', boxShadow: C.shadowSm, cursor: 'pointer', fontFamily: FONT, transition: 'all 0.2s' }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: active ? 'white' : C.bark }}>{day.label}</div>
                <div style={{ fontSize: 10, color: active ? 'rgba(255,255,255,0.85)' : C.barkLight, fontWeight: 600 }}>{day.week}</div>
              </button>
            );
          })}
        </div>

        {/* Weather card + add button */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <div onClick={handleWeatherTap} style={{ flex: 1, background: 'linear-gradient(135deg,#D0E8F5,#E8F4E8)', borderRadius: 18, padding: '10px 14px', boxShadow: C.shadowSm, cursor: isOwner ? 'pointer' : 'default', userSelect: 'none' }}>
            {currentWeather ? (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <span style={{ fontSize: 36, lineHeight: 1, flexShrink: 0, marginTop: 2 }}>{currentWeather.emoji}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 10, color: '#6A8F5C', fontWeight: 600, margin: '0 0 3px' }}>{weatherSubtitle}</p>
                  <p style={{ fontSize: 14, color: '#3A5A3A', fontWeight: 700, margin: '0 0 3px' }}>
                    {currentWeather.desc} · {currentWeather.max}°<span style={{ fontWeight: 500, fontSize: 12 }}>/{currentWeather.min}°C</span>
                  </p>
                  <p style={{ fontSize: 11, color: '#4A7A5A', margin: '0 0 2px' }}>
                    ☂️ 降雨機率 {currentWeather.precipProb}%
                  </p>
                  <p style={{ fontSize: 11, color: '#5A7A5A', margin: 0 }}>
                    👗 {currentWeather.outfit}
                  </p>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 36, lineHeight: 1 }}>⛅</span>
                <p style={{ fontSize: 11, color: '#6A8F5C', fontWeight: 600, margin: 0 }}>載入天氣中...</p>
              </div>
            )}
          </div>
          {!isReadOnly && (
            <button onClick={openAdd}
              style={{ flexShrink: 0, width: 56, height: 56, borderRadius: 18, background: C.earth, border: 'none', color: 'white', fontSize: 26, cursor: 'pointer', boxShadow: C.shadow, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              ＋
            </button>
          )}
        </div>

        {/* Timeline */}
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', left: 54, top: 0, bottom: 0, width: 2, background: `linear-gradient(to bottom, ${C.creamDark}, ${C.sageLight}33)`, zIndex: 0 }} />

          {dayEvents.length === 0 && (
            <div style={{ textAlign: 'center', padding: '36px 0', color: C.barkLight }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>🌿</div>
              <p style={{ fontSize: 13, margin: 0 }}>這天還沒有行程</p>
              {!isReadOnly && <button onClick={openAdd} style={{ marginTop: 12, padding: '8px 20px', borderRadius: 12, border: `2px dashed ${C.creamDark}`, background: 'var(--tm-card-bg)', color: C.barkLight, fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: FONT }}>＋ 新增第一筆行程</button>}
            </div>
          )}

          {dayEvents.map((event, idx) => {
            const cat = CATEGORY_MAP[event.category] || CATEGORY_MAP.attraction;
            const isLast = idx === dayEvents.length - 1;
            const mapUrl = getMapUrl(event);
            return (
              <div key={event.id}>
              <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: event.travelTime ? 0 : (isLast ? 0 : 12), position: 'relative', zIndex: 1 }}>
                {/* Time column */}
                <div style={{ width: 50, flexShrink: 0, textAlign: 'right', paddingRight: 6, paddingTop: 14 }}>
                  <span style={{ fontSize: 11, color: C.barkLight, fontWeight: 600, whiteSpace: 'nowrap', lineHeight: 1 }}>
                    {event.startTime || ''}
                  </span>
                </div>
                {/* Dot column */}
                <div style={{ width: 16, flexShrink: 0, display: 'flex', justifyContent: 'center', paddingTop: 14 }}>
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: cat.bg, border: `2.5px solid ${cat.text}`, boxShadow: `0 0 0 3px ${C.cream}`, flexShrink: 0 }} />
                </div>
                {/* Card */}
                <div style={{ flex: 1, marginLeft: 8, background: 'var(--tm-card-bg)', borderRadius: 16, padding: '12px 14px 12px 24px', boxShadow: C.shadowSm }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, background: cat.bg, color: cat.text, borderRadius: 6, padding: '2px 7px', display: 'inline-block', marginBottom: 4 }}>{cat.emoji} {cat.label}</span>
                      <p style={{ fontSize: 14, fontWeight: 700, color: C.bark, margin: '0 0 2px', wordBreak: 'break-word' }}>{event.title}</p>
                      {event.location && <p style={{ fontSize: 11, color: C.barkLight, margin: 0 }}>📍 {event.location}</p>}
                      {event.notes   && <p style={{ fontSize: 11, color: C.barkLight, margin: '4px 0 0', fontStyle: 'italic' }}>💡 {event.notes}</p>}
                      {mapUrl && (
                        <a href={mapUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                          style={{ fontSize: 11, color: C.sky, fontWeight: 600, marginTop: 4, display: 'inline-block', textDecoration: 'none' }}>
                          🗺 查看地圖
                        </a>
                      )}
                    </div>
                    {!isReadOnly && (
                      <button onClick={() => openEdit(event)}
                        style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 10, background: C.cream, border: `1.5px solid ${C.creamDark}`, color: C.barkLight, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT }}>
                        ✏️
                      </button>
                    )}
                  </div>
                </div>
              </div>
              {/* Travel time connector between events */}
              {event.travelTime && !isLast && (
                <div style={{ display: 'flex', alignItems: 'center', margin: '4px 0 4px 58px', position: 'relative', zIndex: 1 }}>
                  <div style={{ background: 'var(--tm-note-1)', borderRadius: 8, padding: '4px 10px', fontSize: 11, color: '#9A6800', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, boxShadow: '0 1px 4px #E8C96A33' }}>
                    🚗 {event.travelTime}
                  </div>
                </div>
              )}
              </div>
            );
          })}
        </div>

        {dayEvents.length > 0 && !isReadOnly && (
          <div style={{ textAlign: 'center', padding: '12px 0 16px' }}>
            <button onClick={openAdd} style={{ padding: '8px 20px', borderRadius: 12, border: `2px dashed ${C.creamDark}`, background: 'var(--tm-card-bg)', color: C.barkLight, fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: FONT }}>＋ 繼續新增行程</button>
          </div>
        )}
      </div>
    </div>
  );
}
