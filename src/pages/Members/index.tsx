import { useState, useRef, useEffect } from 'react';
import { C, FONT } from '../../App';
import PageHeader from '../../components/layout/PageHeader';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';

const PRESET_COLORS = ['#ebcef5','#aaa9ab','#E0F0D8','#A8CADF','#FFF2CC','#FAE0E0','#E8C96A','#D8EDF8'];
const PRESET_ROLES  = ['行程規劃','交通達人','美食搜查','攝影師','財務長','旅伴'];
const EMPTY_FORM    = { name: '', role: '', color: PRESET_COLORS[0], avatarUrl: '' };

export default function MembersPage({ members, firestore }: any) {
  const { db, TRIP_ID, addDoc, updateDoc, collection, doc } = firestore;

  const [showAdd, setShowAdd]           = useState(false);
  const [editTarget, setEditTarget]     = useState<any | null>(null);
  const [form, setForm]                 = useState({ ...EMPTY_FORM });
  const [saving, setSaving]             = useState(false);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const fileRef                         = useRef<HTMLInputElement>(null);
  const nameInputRef                    = useRef<HTMLInputElement>(null);

  const isEdit    = !!editTarget;
  const showSheet = showAdd || isEdit;

  // Delayed focus after sheet animation (prevents iOS zoom)
  useEffect(() => {
    if (!showSheet) return;
    const t = setTimeout(() => nameInputRef.current?.focus(), 350);
    return () => clearTimeout(t);
  }, [showSheet]);

  const set = (key: string, val: string) => setForm(p => ({ ...p, [key]: val }));

  const uploadAvatar = async (file: File, memberId: string): Promise<string> => {
    const storage = getStorage();
    const path    = `avatars/${TRIP_ID}/${memberId}_${Date.now()}`;
    const sRef    = storageRef(storage, path);
    await uploadBytes(sRef, file);
    return getDownloadURL(sRef);
  };

  const handleAvatarForNew = async (file: File) => {
    setUploadingFor('new');
    try {
      const url = await uploadAvatar(file, `new_${Date.now()}`);
      set('avatarUrl', url);
    } catch (e) { console.error(e); alert('頭像上傳失敗'); }
    setUploadingFor(null);
  };

  const handleAvatarForExisting = async (file: File, member: any) => {
    setUploadingFor(member.id);
    try {
      const url = await uploadAvatar(file, member.id);
      await updateDoc(doc(db, 'trips', TRIP_ID, 'members', member.id), { avatarUrl: url });
    } catch (e) { console.error(e); alert('頭像上傳失敗'); }
    setUploadingFor(null);
  };

  const handleAdd = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'trips', TRIP_ID, 'members'), {
        name: form.name.trim(), role: form.role || '旅伴',
        color: form.color, avatarUrl: form.avatarUrl || '',
        createdAt: new Date().toISOString(),
      });
      setForm({ ...EMPTY_FORM }); setShowAdd(false);
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const handleEditSave = async () => {
    if (!editTarget || !form.name.trim()) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'trips', TRIP_ID, 'members', editTarget.id), {
        name: form.name.trim(), role: form.role || '旅伴', color: form.color,
      });
      setEditTarget(null); setForm({ ...EMPTY_FORM });
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const openEdit = (m: any) => {
    setEditTarget(m);
    setForm({ name: m.name, role: m.role || '', color: m.color || PRESET_COLORS[0], avatarUrl: m.avatarUrl || '' });
    setShowAdd(false);
  };

  const displayMembers = members.length > 0 ? members : [
    { id: 'uu',    name: 'uu',    color: '#ebcef5', role: '行程規劃', avatarUrl: '' },
    { id: 'brian', name: 'brian', color: '#aaa9ab', role: '交通達人', avatarUrl: '' },
  ];

  return (
    <div style={{ fontFamily: FONT }}>

      {/* 隱藏 file input (既有成員換頭像) */}
      <input type="file" accept="image/*" id="avatar-existing-input" style={{ display: 'none' }}
        onChange={async e => {
          const file = e.target.files?.[0];
          const mid  = (e.target as HTMLInputElement).dataset.memberId;
          if (!file || !mid) return;
          const member = members.find((m: any) => m.id === mid);
          if (member) await handleAvatarForExisting(file, member);
          (e.target as HTMLInputElement).value = '';
        }}
      />

      {/* ── 底部面板 (inlined) ── */}
      {showSheet && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(107,92,78,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 300 }}
          onClick={e => { if (e.target === e.currentTarget) { setShowAdd(false); setEditTarget(null); } }}
        >
          <div style={{ background: 'white', borderRadius: '24px 24px 0 0', padding: '24px 20px 40px', width: '100%', maxWidth: 430, fontFamily: FONT, maxHeight: '88vh', overflowY: 'auto', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <p style={{ fontSize: 17, fontWeight: 700, color: C.bark, margin: 0 }}>
                {isEdit ? '✏️ 編輯成員' : '➕ 新增旅伴'}
              </p>
              <button onClick={() => { setShowAdd(false); setEditTarget(null); }}
                style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: C.barkLight }}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* 頭像預覽 (新增時) */}
              {!isEdit && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 72, height: 72, borderRadius: '50%', background: form.color, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: '3px solid white', boxShadow: '0 2px 10px rgba(107,92,78,0.18)' }}>
                    {form.avatarUrl
                      ? <img src={form.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ fontSize: 28, fontWeight: 700, color: C.bark }}>{form.name?.[0]?.toUpperCase() || '?'}</span>
                    }
                  </div>
                  <input type="file" accept="image/*" style={{ display: 'none' }} ref={fileRef}
                    onChange={e => { if (e.target.files?.[0]) handleAvatarForNew(e.target.files[0]); }} />
                  <button onClick={() => fileRef.current?.click()} disabled={uploadingFor === 'new'}
                    style={{ padding: '6px 14px', borderRadius: 20, border: `1.5px solid ${C.creamDark}`, background: 'white', color: C.barkLight, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>
                    {uploadingFor === 'new' ? '上傳中...' : '📷 上傳頭像'}
                  </button>
                </div>
              )}

              {/* 姓名 */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 4 }}>姓名 *</label>
                <input
                  ref={nameInputRef}
                  value={form.name}
                  onChange={e => set('name', e.target.value)}
                  placeholder="旅伴名稱"
                  style={{ width: '100%', boxSizing: 'border-box', border: `1.5px solid ${C.creamDark}`, borderRadius: 10, padding: '10px 12px', fontSize: 16, fontFamily: FONT, outline: 'none', color: C.bark, background: 'white' }}
                />
              </div>

              {/* 身份 */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 6 }}>身份 / 角色</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  {PRESET_ROLES.map(r => (
                    <button key={r} onClick={() => set('role', r)}
                      style={{ padding: '6px 12px', borderRadius: 20, border: `1.5px solid ${form.role === r ? C.sageDark : C.creamDark}`, background: form.role === r ? C.sage : 'white', color: form.role === r ? 'white' : C.bark, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>
                      {r}
                    </button>
                  ))}
                </div>
                <input value={form.role} onChange={e => set('role', e.target.value)}
                  placeholder="或自訂角色..."
                  style={{ width: '100%', boxSizing: 'border-box', border: `1.5px solid ${C.creamDark}`, borderRadius: 10, padding: '8px 12px', fontSize: 16, fontFamily: FONT, outline: 'none', color: C.bark, background: 'white' }}
                />
              </div>

              {/* 顏色 */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 6 }}>標籤顏色</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {PRESET_COLORS.map(c => (
                    <div key={c} onClick={() => set('color', c)}
                      style={{ width: 32, height: 32, borderRadius: '50%', background: c, cursor: 'pointer', border: form.color === c ? `3px solid ${C.bark}` : '3px solid transparent', boxShadow: form.color === c ? '0 0 0 2px white inset' : 'none', transition: 'all 0.15s' }} />
                  ))}
                </div>
              </div>

              {/* 按鈕 */}
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button onClick={() => { setShowAdd(false); setEditTarget(null); }}
                  style={{ flex: 1, padding: 12, borderRadius: 12, border: `1.5px solid ${C.creamDark}`, background: 'white', color: C.barkLight, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>
                  取消
                </button>
                <button onClick={isEdit ? handleEditSave : handleAdd}
                  disabled={saving || !form.name.trim()}
                  style={{ flex: 2, padding: 12, borderRadius: 12, border: 'none', background: form.name.trim() ? C.earth : C.creamDark, color: 'white', fontWeight: 700, fontSize: 14, cursor: form.name.trim() ? 'pointer' : 'default', fontFamily: FONT, opacity: saving ? 0.7 : 1 }}>
                  {saving ? '儲存中...' : isEdit ? '✓ 儲存' : '➕ 新增'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <PageHeader title="旅伴" subtitle={`沖繩 ${displayMembers.length} 人小隊 🌊`} emoji="👥" color={C.earth}>
        <div style={{ marginTop: 12, background: 'rgba(255,255,255,0.22)', borderRadius: 14, padding: '10px 14px', display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)', margin: 0 }}>成員人數</p>
            <p style={{ fontSize: 15, fontWeight: 700, color: 'white', margin: '2px 0 0' }}>{displayMembers.length} 人</p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)', margin: 0 }}>出發日期</p>
            <p style={{ fontSize: 15, fontWeight: 700, color: 'white', margin: '2px 0 0' }}>4/23</p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)', margin: 0 }}>旅行天數</p>
            <p style={{ fontSize: 15, fontWeight: 700, color: 'white', margin: '2px 0 0' }}>4 天</p>
          </div>
        </div>
      </PageHeader>

      <div style={{ padding: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {displayMembers.map((m: any) => {
          const isUploading = uploadingFor === m.id;
          return (
            <div key={m.id} style={{ background: 'white', borderRadius: 22, padding: '18px 14px', textAlign: 'center', boxShadow: C.shadow, position: 'relative' }}>
              <button onClick={() => openEdit(m)}
                style={{ position: 'absolute', top: 10, right: 10, width: 26, height: 26, borderRadius: 8, border: `1.5px solid ${C.creamDark}`, background: 'white', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                ✏️
              </button>
              <div style={{ position: 'relative', width: 64, height: 64, margin: '0 auto 10px' }}>
                <div style={{ width: 64, height: 64, borderRadius: '50%', background: m.color || C.sageLight, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 700, color: C.bark, border: '3px solid white', boxShadow: '0 2px 8px rgba(107,92,78,0.15)', overflow: 'hidden' }}>
                  {m.avatarUrl
                    ? <img src={m.avatarUrl} alt={m.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : m.name?.[0]?.toUpperCase()
                  }
                </div>
                <div
                  onClick={() => {
                    const input = document.getElementById('avatar-existing-input') as HTMLInputElement;
                    if (input) { input.dataset.memberId = m.id; input.click(); }
                  }}
                  style={{ position: 'absolute', bottom: 0, right: 0, width: 22, height: 22, borderRadius: '50%', background: C.earth, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 11, boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }}>
                  {isUploading ? '…' : '📷'}
                </div>
              </div>
              <p style={{ fontSize: 16, fontWeight: 700, color: C.bark, margin: 0 }}>{m.name}</p>
              <p style={{ fontSize: 11, color: C.barkLight, margin: '4px 0 0' }}>{m.role || '旅伴'}</p>
            </div>
          );
        })}

        {/* 新增成員卡 */}
        <div
          onClick={() => { setShowAdd(true); setEditTarget(null); setForm({ ...EMPTY_FORM }); }}
          style={{ background: 'white', borderRadius: 22, padding: '18px 14px', textAlign: 'center', border: `2px dashed ${C.creamDark}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', minHeight: 130 }}>
          <span style={{ fontSize: 28, color: C.creamDark }}>＋</span>
          <span style={{ fontSize: 12, color: C.barkLight, fontWeight: 600 }}>新增成員</span>
        </div>
      </div>
    </div>
  );
}
