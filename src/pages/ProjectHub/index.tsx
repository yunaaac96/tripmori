/**
 * ProjectHub — 多專案選擇 / 建立 / 加入 畫面
 * 進入 App 時如果沒有 active project 就顯示此頁。
 */
import { useState, useEffect } from 'react';
import { db, auth } from '../../config/firebase';
import { collection, doc, setDoc, addDoc, Timestamp } from 'firebase/firestore';
import { GoogleAuthProvider, signInWithPopup, signInAnonymously, onAuthStateChanged, User } from 'firebase/auth';
import { C, FONT } from '../../App';

export type TripRole = 'owner' | 'editor' | 'visitor';

export interface StoredProject {
  id: string;
  title: string;
  emoji: string;
  role: TripRole;
  collaboratorKey: string;
  shareCode: string;
  addedAt: number;
}

const LS_PROJECTS  = 'tripmori_projects';
const LS_ACTIVE    = 'tripmori_active_project';

// ── persistence helpers ──────────────────────────────────────────
export const loadProjects = (): StoredProject[] => {
  try { return JSON.parse(localStorage.getItem(LS_PROJECTS) || '[]'); }
  catch { return []; }
};

export const saveProject = (p: StoredProject) => {
  const list = loadProjects().filter(x => x.id !== p.id);
  localStorage.setItem(LS_PROJECTS, JSON.stringify([...list, p]));
};

export const removeProject = (id: string) => {
  localStorage.setItem(LS_PROJECTS, JSON.stringify(loadProjects().filter(p => p.id !== id)));
};

export const setActiveProject = (id: string) => localStorage.setItem(LS_ACTIVE, id);
export const getActiveProject = () => localStorage.getItem(LS_ACTIVE);

// ── random string helper ─────────────────────────────────────────
const rand = (n: number) => Math.random().toString(36).slice(2, 2 + n).toUpperCase();
export const makeCollabKey  = (id: string) => `COLLAB-${id.slice(0,6).toUpperCase()}-${rand(4)}`;
export const makeShareCode  = (id: string) => `SHARE-${id.slice(0,6).toUpperCase()}-${rand(3)}`;

// ── Default trip (pre-existing Okinawa trip) ─────────────────────
const DEFAULT_TRIP_ID  = '74pfE7RXyEIusEdRV0rZ';
const DEFAULT_COLLAB   = `COLLAB-${DEFAULT_TRIP_ID.slice(0,6).toUpperCase()}-TRIP`;
const DEFAULT_SHARE    = `SHARE-${DEFAULT_TRIP_ID.slice(0,6).toUpperCase()}-OKI`;

export const ensureDefaultProject = () => {
  const existing = loadProjects().find(p => p.id === DEFAULT_TRIP_ID);
  if (!existing) {
    saveProject({
      id: DEFAULT_TRIP_ID,
      title: '沖繩之旅 2026',
      emoji: '🌸',
      role: 'owner',
      collaboratorKey: DEFAULT_COLLAB,
      shareCode: DEFAULT_SHARE,
      addedAt: Date.now(),
    });
  }
};

// ── Firestore: write trip metadata doc ───────────────────────────
const writeTripMeta = async (id: string, data: object) => {
  await setDoc(doc(db, 'trips', id), data, { merge: true });
};

// ─────────────────────────────────────────────────────────────────
interface Props {
  onEnterProject: (project: StoredProject) => void;
}

const ROLE_LABEL: Record<TripRole, { label: string; color: string; bg: string }> = {
  owner:   { label: '擁有者', color: '#4A7A35', bg: '#E0F0D8' },
  editor:  { label: '編輯者', color: '#9A6800', bg: '#FFF2CC' },
  visitor: { label: '訪客',   color: '#2A6A9A', bg: '#D8EDF8' },
};

type View = 'hub' | 'create' | 'join-collab';

const googleProvider = new GoogleAuthProvider();

export default function ProjectHub({ onEnterProject }: Props) {
  const projects = loadProjects();
  const [view, setView]       = useState<View>('hub');
  const [busy, setBusy]       = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError]     = useState('');
  const [googleUser, setGoogleUser] = useState<User | null>(null);

  // Create form
  const [newTitle, setNewTitle]       = useState('');
  const [newEmoji, setNewEmoji]       = useState('✈️');
  const [newStart, setNewStart]       = useState('');
  const [newEnd, setNewEnd]           = useState('');
  const [newDesc, setNewDesc]         = useState('');

  // Join form
  const [keyInput, setKeyInput]       = useState('');

  // Track auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, user => {
      if (user && !user.isAnonymous) setGoogleUser(user);
      else setGoogleUser(null);
    });
    return unsub;
  }, []);

  const handleGoogleSignIn = async () => {
    setSigningIn(true);
    setError('');
    try {
      const result = await signInWithPopup(auth, googleProvider);
      setGoogleUser(result.user);
    } catch (e: any) {
      if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') {
        // user dismissed — no error needed
      } else if (e.code === 'auth/popup-blocked') {
        setError('彈出視窗被封鎖，請允許彈出視窗後再試');
      } else {
        console.error('Google sign-in error:', e);
        setError('登入失敗，請重試');
      }
    }
    setSigningIn(false);
  };

  // 42 emojis — 3 groups of 14: transport/nature, country flags, winter/scenery
  const EMOJI_OPTS = [
    '✈️','🚢','🚞','🌸','🏝','🌊','⛩','🍜','🍣','🎌','🌴','🏔','🎡','🗾',
    '🇯🇵','🇹🇼','🇰🇷','🇺🇸','🇫🇷','🇮🇹','🇬🇧','🇹🇭','🇦🇺','🇸🇬','🇭🇰','🇪🇸','🇩🇪','🇵🇹',
    '⛷️','🏂','❄️','🎿','🗻','🏕️','🚂','🌅','🌃','🏖️','🌄','🌉','🏯','🎯',
  ];

  const handleCreate = async () => {
    if (!newTitle.trim() || !newStart) { setError('請填寫旅行名稱和出發日期'); return; }
    const user = auth.currentUser && !auth.currentUser.isAnonymous ? auth.currentUser : null;
    if (!user) { setError('請先登入 Google 帳號後再建立旅行'); return; }
    setBusy(true); setError('');
    try {
      const ref = await addDoc(collection(db, 'trips'), {
        title: newTitle.trim(), emoji: newEmoji,
        startDate: newStart, endDate: newEnd || newStart,
        description: newDesc.trim(),
        ownerUid: user.uid,
        ownerEmail: user.email || '',
        collaboratorKey: '', shareCode: '',
        createdAt: Timestamp.now(),
      });
      const cKey = makeCollabKey(ref.id);
      const sCode = makeShareCode(ref.id);
      await writeTripMeta(ref.id, { collaboratorKey: cKey, shareCode: sCode });
      const p: StoredProject = {
        id: ref.id, title: newTitle.trim(), emoji: newEmoji,
        role: 'owner', collaboratorKey: cKey, shareCode: sCode, addedAt: Date.now(),
      };
      saveProject(p);
      onEnterProject(p);
    } catch (e: any) { console.error(e); setError('建立失敗，請重試'); }
    setBusy(false);
  };

  const handleJoinCollab = async () => {
    const key = keyInput.trim().toUpperCase();
    if (!key) { setError('請輸入協作金鑰'); return; }
    const user = auth.currentUser && !auth.currentUser.isAnonymous ? auth.currentUser : null;
    if (!user) { setError('請先登入 Google 帳號後再加入行程'); return; }
    setBusy(true); setError('');
    try {
      const existing = projects.find(p => p.collaboratorKey === key);
      if (existing) { onEnterProject({ ...existing, role: 'editor' }); return; }

      if (key === DEFAULT_COLLAB) {
        ensureDefaultProject();
        const p = loadProjects().find(x => x.id === DEFAULT_TRIP_ID)!;
        onEnterProject({ ...p, role: 'editor' });
        return;
      }

      const parts = key.split('-');
      if (parts.length < 3 || parts[0] !== 'COLLAB') { setError('金鑰格式不正確'); setBusy(false); return; }

      setError('找不到符合的專案，請確認金鑰是否正確');
    } catch (e) { setError('加入失敗，請重試'); }
    setBusy(false);
  };

  // ── Views ──────────────────────────────────────────────────────

  if (view === 'create') return (
    <Screen title="✈️ 建立新旅行" onBack={() => { setView('hub'); setError(''); }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {!googleUser && (
          <div style={{ padding: '10px 14px', borderRadius: 12, background: 'var(--tm-note-1)', fontSize: 12, color: '#9A6800', fontWeight: 600 }}>
            ⚠️ 請先返回首頁登入 Google 帳號後再建立旅行
          </div>
        )}
        {/* Emoji */}
        <div>
          <label style={labelStyle}>旅行表情</label>
          <div style={{ maxHeight: 120, overflowY: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap', padding: '4px 0' }}>
            {EMOJI_OPTS.map(e => (
              <button key={e} onClick={() => setNewEmoji(e)}
                style={{ width: 40, height: 40, fontSize: 22, borderRadius: 12, border: `2px solid ${newEmoji === e ? C.sageDark : C.creamDark}`, background: newEmoji === e ? C.sageLight : 'var(--tm-card-bg)', cursor: 'pointer', flexShrink: 0 }}>
                {e}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label style={labelStyle}>旅行名稱 *</label>
          <input style={inputSt} placeholder="例：沖繩親子遊 2026" value={newTitle} onChange={e => setNewTitle(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>出發日期 *</label>
            <input style={{ ...inputSt, padding: '10px 8px' }} type="date" value={newStart} onChange={e => setNewStart(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>回程日期</label>
            <input style={{ ...inputSt, padding: '10px 8px' }} type="date" value={newEnd} onChange={e => setNewEnd(e.target.value)} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>旅行簡介（選填）</label>
          <textarea style={{ ...inputSt, minHeight: 72, resize: 'vertical' as const, lineHeight: 1.6 }}
            placeholder="目的地、主要行程..." value={newDesc} onChange={e => setNewDesc(e.target.value)} />
        </div>
        {error && <p style={{ fontSize: 12, color: '#C0392B', margin: 0 }}>{error}</p>}
        <button onClick={handleCreate} disabled={busy}
          style={{ padding: 14, borderRadius: 14, border: 'none', background: C.earth, color: 'white', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: FONT, opacity: busy ? 0.6 : 1 }}>
          {busy ? '建立中...' : '🌸 建立旅行'}
        </button>
      </div>
    </Screen>
  );

  if (view === 'join-collab') return (
    <Screen title="🔑 輸入協作金鑰" onBack={() => { setView('hub'); setError(''); setKeyInput(''); }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ fontSize: 13, color: C.barkLight, margin: 0 }}>
          收到擁有者分享的協作金鑰後輸入，即可以「編輯者」身份加入行程。
        </p>
        <input style={inputSt} placeholder="COLLAB-XXXXXX-XXXX"
          value={keyInput} onChange={e => setKeyInput(e.target.value.toUpperCase())}
          autoCapitalize="characters" />
        {error && <p style={{ fontSize: 12, color: '#C0392B', margin: 0 }}>{error}</p>}
        <button onClick={handleJoinCollab} disabled={busy}
          style={{ padding: 14, borderRadius: 14, border: 'none', background: C.sage, color: 'white', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: FONT, opacity: busy ? 0.6 : 1 }}>
          {busy ? '驗證中...' : '✓ 加入'}
        </button>
      </div>
    </Screen>
  );

  // ── Main hub view ─────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: 'var(--tm-page-bg)', backgroundImage: 'radial-gradient(circle, var(--tm-dot-color) 1px, transparent 1px)', backgroundSize: '18px 18px', display: 'flex', justifyContent: 'center', fontFamily: FONT }}>
      <div style={{ width: '100%', maxWidth: 430, padding: '0 0 40px' }}>
        {/* Hero */}
        <div style={{ background: 'linear-gradient(150deg, #EDF5F4 0%, #F5EDE6 100%)', padding: '44px 24px 32px', textAlign: 'center', borderBottom: '1px solid #E0D9CF' }}>
          <img src="/logo.png" alt="TripMori" style={{ width: '72%', maxWidth: 260, display: 'block', margin: '0 auto 12px' }} />
          <p style={{ fontSize: 13, color: '#8B7565', margin: 0, fontFamily: FONT, fontWeight: 600, letterSpacing: 0.3 }}>你的旅行規劃小幫手</p>
        </div>

        <div style={{ padding: '24px 20px' }}>

          {/* Google sign-in / user status */}
          {googleUser ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 16, background: '#E0F0D8', marginBottom: 20, border: '1.5px solid #C2E0B4', boxShadow: C.shadowSm }}>
              {googleUser.photoURL && (
                <img src={googleUser.photoURL} alt="" style={{ width: 36, height: 36, borderRadius: '50%', border: '2px solid #A0CC88', flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#4A7A35', margin: 0 }}>已登入 Google</p>
                <p style={{ fontSize: 12, color: '#6A8F5C', margin: '1px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{googleUser.displayName || googleUser.email}</p>
              </div>
            </div>
          ) : (
            <div style={{ marginBottom: 20 }}>
              <div style={{ padding: '10px 14px', borderRadius: 12, background: '#FFF8E1', marginBottom: 10, fontSize: 12, color: '#9A6800', fontWeight: 600 }}>
                💡 建立或編輯行程需要登入 Google 帳號，訪客可直接使用分享連結進入
              </div>
              {error && <p style={{ fontSize: 12, color: '#C0392B', margin: '0 0 8px' }}>{error}</p>}
              <button onClick={handleGoogleSignIn} disabled={signingIn}
                style={{ width: '100%', padding: '13px 16px', borderRadius: 16, border: '1.5px solid #E0D9C8', background: 'var(--tm-card-bg)', cursor: signingIn ? 'default' : 'pointer', fontFamily: FONT, display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center', boxShadow: C.shadowSm, opacity: signingIn ? 0.6 : 1 }}>
                <span style={{ fontSize: 18 }}>🔐</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#1C3461' }}>{signingIn ? '登入中...' : '使用 Google 帳號登入'}</span>
              </button>
            </div>
          )}

          {/* My projects */}
          {projects.length > 0 && (
            <>
              <p style={{ fontSize: 13, fontWeight: 700, color: C.barkLight, margin: '0 0 10px', letterSpacing: 0.5 }}>MY TRIPS</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                {projects.map(p => {
                  const rl = ROLE_LABEL[p.role];
                  return (
                    <button key={p.id} onClick={() => onEnterProject(p)}
                      style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 20, background: 'var(--tm-card-bg)', border: `2px solid ${C.creamDark}`, cursor: 'pointer', fontFamily: FONT, textAlign: 'left', boxShadow: C.shadowSm }}>
                      <span style={{ fontSize: 28, flexShrink: 0 }}>{p.emoji}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 15, fontWeight: 700, color: C.bark, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</p>
                        <span style={{ fontSize: 10, fontWeight: 700, color: rl.color, background: rl.bg, borderRadius: 6, padding: '2px 8px', display: 'inline-block', marginTop: 4 }}>{rl.label}</span>
                      </div>
                      <span style={{ fontSize: 20, color: C.barkLight }}>›</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* Actions */}
          <p style={{ fontSize: 13, fontWeight: 700, color: C.barkLight, margin: '0 0 10px', letterSpacing: 0.5 }}>
            {projects.length === 0 ? '開始規劃旅行' : '加入更多'}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <ActionBtn emoji="✈️" title="建立新旅行" sub="從零開始規劃行程，成為擁有者（需登入 Google）" color={C.earth} onClick={() => { setView('create'); setError(''); }} />
            <ActionBtn emoji="🔑" title="輸入協作金鑰" sub="加入朋友的行程，可以共同編輯（需登入 Google）" color={C.sageDark} onClick={() => { setView('join-collab'); setError(''); setKeyInput(''); }} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Helper sub-components (top-level so they don't remount) ───────

function Screen({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--tm-page-bg)', backgroundImage: 'radial-gradient(circle, var(--tm-dot-color) 1px, transparent 1px)', backgroundSize: '18px 18px', display: 'flex', justifyContent: 'center', fontFamily: FONT }}>
      <div style={{ width: '100%', maxWidth: 430 }}>
        <div style={{ background: 'linear-gradient(150deg, #EDF5F4 0%, #F5EDE6 100%)', padding: '20px 20px 24px', borderBottom: '1px solid #E0D9CF' }}>
          <button onClick={onBack} style={{ background: 'rgba(28,52,97,0.08)', border: 'none', borderRadius: 10, padding: '6px 12px', color: '#1C3461', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: FONT, marginBottom: 16 }}>‹ 返回</button>
          <h2 style={{ fontSize: 20, fontWeight: 900, color: '#1C3461', margin: 0, fontFamily: FONT }}>{title}</h2>
        </div>
        <div style={{ padding: '24px 20px' }}>{children}</div>
      </div>
    </div>
  );
}

function ActionBtn({ emoji, title, sub, color, onClick }: { emoji: string; title: string; sub: string; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 20, background: 'var(--tm-card-bg)', border: `2px solid ${C.creamDark}`, cursor: 'pointer', fontFamily: FONT, textAlign: 'left', boxShadow: C.shadowSm }}>
      <div style={{ width: 44, height: 44, borderRadius: 14, background: color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>{emoji}</div>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: C.bark, margin: 0 }}>{title}</p>
        <p style={{ fontSize: 11, color: C.barkLight, margin: '2px 0 0' }}>{sub}</p>
      </div>
      <span style={{ fontSize: 20, color: C.barkLight }}>›</span>
    </button>
  );
}

const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#8C7B6E', display: 'block', marginBottom: 6 };
const inputSt: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: 12, border: '1.5px solid var(--tm-cream-dark)', background: 'var(--tm-input-bg)', fontSize: 16, color: 'var(--tm-bark)', outline: 'none', fontFamily: "'M PLUS Rounded 1c', 'Noto Sans TC', sans-serif" };
