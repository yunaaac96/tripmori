import { useState, useRef, useEffect } from 'react';
import { C, FONT, cardStyle, inputStyle, btnPrimary } from '../../App';
import PageHeader from '../../components/layout/PageHeader';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';

const LS_USER_KEY = 'tripmori_current_user';

export default function JournalPage({ journals, members, journalComments, firestore }: any) {
  const { db, TRIP_ID, Timestamp, addDoc, deleteDoc, collection, doc } = firestore;
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving]    = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm]        = useState({ content: '', date: '', author: '', photos: [] as string[] });
  const fileRef    = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  // Per-journal comment state
  const [expandedJournal, setExpandedJournal] = useState<string | null>(null);
  const [journalCommentInputs, setJournalCommentInputs] = useState<Record<string, string>>({});
  const [savingComment, setSavingComment] = useState<string | null>(null);
  const [currentUser] = useState<string>(() => localStorage.getItem(LS_USER_KEY) || '');

  const memberNames: string[] = members.length > 0 ? members.map((m: any) => m.name) : ['uu', 'brian'];
  const set = (key: string, val: any) => setForm(p => ({ ...p, [key]: val }));

  useEffect(() => {
    if (!showForm) return;
    const t = setTimeout(() => contentRef.current?.focus(), 350);
    return () => clearTimeout(t);
  }, [showForm]);

  const handlePhotoUpload = async (file: File) => {
    setUploading(true);
    try {
      const storage = getStorage();
      const path    = `journals/${TRIP_ID}/${Date.now()}_${file.name}`;
      const sRef    = storageRef(storage, path);
      await uploadBytes(sRef, file);
      const url = await getDownloadURL(sRef);
      setForm(p => ({ ...p, photos: [...p.photos, url] }));
    } catch (e) {
      console.error('上傳失敗:', e);
      alert('圖片上傳失敗，請確認 Firebase Storage 設定');
    }
    setUploading(false);
  };

  const removePhoto = (idx: number) =>
    setForm(p => ({ ...p, photos: p.photos.filter((_, i) => i !== idx) }));

  const handleSave = async () => {
    if (!form.content || !form.author) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'trips', TRIP_ID, 'journals'), {
        content: form.content, date: form.date || new Date().toISOString().slice(0,10),
        authorName: form.author, photos: form.photos,
        createdAt: Timestamp.now(),
      });
    } catch(e) { console.error(e); }
    setSaving(false);
    setShowForm(false);
    setForm({ content: '', date: '', author: '', photos: [] });
  };

  const handleDelete = async (id: string) => {
    await deleteDoc(doc(db,'trips',TRIP_ID,'journals',id));
  };

  const closeForm = () => {
    setShowForm(false);
    setForm({ content: '', date: '', author: '', photos: [] });
  };

  // Per-journal comment helpers
  const getCommentsFor = (journalId: string) =>
    [...(journalComments || [])]
      .filter((c: any) => c.journalId === journalId)
      .sort((a: any, b: any) => {
        const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return ta - tb;
      });

  const handleAddComment = async (journalId: string) => {
    const text = (journalCommentInputs[journalId] || '').trim();
    if (!text || !currentUser) return;
    setSavingComment(journalId);
    try {
      await addDoc(collection(db, 'trips', TRIP_ID, 'journalComments'), {
        journalId,
        authorName: currentUser,
        content: text,
        createdAt: Timestamp.now(),
      });
      setJournalCommentInputs(prev => ({ ...prev, [journalId]: '' }));
    } catch (e) { console.error(e); }
    setSavingComment(null);
  };

  const handleDeleteComment = async (id: string) => {
    await deleteDoc(doc(db, 'trips', TRIP_ID, 'journalComments', id));
  };

  return (
    <div style={{ fontFamily: FONT }}>

      {/* ── Inline Form Modal ── */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(107,92,78,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 300 }}
          onClick={e => { if (e.target === e.currentTarget) closeForm(); }}>
          <div style={{ background: 'white', borderRadius: '24px 24px 0 0', padding: '24px 20px 40px', width: '100%', maxWidth: 430, fontFamily: FONT, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <p style={{ fontSize: 17, fontWeight: 700, color: C.bark, margin: 0 }}>📖 新增日誌</p>
              <button onClick={closeForm} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: C.barkLight }}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* 作者 */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 6 }}>誰的日誌 *</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {memberNames.map(name => (
                    <button key={name} onClick={() => set('author', name)}
                      style={{ flex: 1, padding: '10px 8px', borderRadius: 12, border: `1.5px solid ${form.author===name?C.sageDark:C.creamDark}`, background: form.author===name?C.sage:'white', color: form.author===name?'white':C.bark, fontWeight: 700, cursor: 'pointer', fontFamily: FONT, fontSize: 14 }}>
                      {name}
                    </button>
                  ))}
                </div>
              </div>
              {/* 日期 */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 4 }}>日期</label>
                <input style={inputStyle} type="date" value={form.date} onChange={e => set('date', e.target.value)} />
              </div>
              {/* 內容 */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 4 }}>日誌內容 *</label>
                <textarea ref={contentRef}
                  style={{ ...inputStyle, minHeight: 120, resize: 'vertical' as const, lineHeight: 1.7 }}
                  placeholder="今天去了..."
                  value={form.content}
                  onChange={e => set('content', e.target.value)}
                />
              </div>
              {/* 上傳照片 */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: C.barkLight, display: 'block', marginBottom: 6 }}>照片</label>
                <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
                  onChange={e => { if (e.target.files?.[0]) handlePhotoUpload(e.target.files[0]); }} />
                <button onClick={() => fileRef.current?.click()} disabled={uploading}
                  style={{ padding: '10px 16px', borderRadius: 12, border: `2px dashed ${C.creamDark}`, background: C.cream, color: C.barkLight, fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: FONT, display: 'flex', alignItems: 'center', gap: 6, opacity: uploading ? 0.6 : 1 }}>
                  📷 {uploading ? '上傳中...' : '選擇照片'}
                </button>
                {form.photos.length > 0 && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                    {form.photos.map((url, idx) => (
                      <div key={idx} style={{ position: 'relative' }}>
                        <img src={url} alt="" style={{ width: 70, height: 70, objectFit: 'cover', borderRadius: 10 }} />
                        <button onClick={() => removePhoto(idx)}
                          style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', background: '#E76F51', border: 'none', color: 'white', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button onClick={closeForm} style={{ flex: 1, padding: 12, borderRadius: 12, border: `1.5px solid ${C.creamDark}`, background: 'white', color: C.barkLight, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>取消</button>
                <button onClick={handleSave} disabled={saving||!form.content||!form.author}
                  style={{ ...btnPrimary(), flex: 2, opacity: saving||!form.content||!form.author?0.6:1 }}>
                  {saving ? '儲存中...' : '✓ 新增'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <PageHeader title="旅行日誌" subtitle="記錄美好時刻 📸" emoji="📖" color={C.blush} />

      <div style={{ padding: '12px 16px 80px' }}>
        <button onClick={() => setShowForm(true)} style={{ ...btnPrimary(C.earth), width: '100%', marginBottom: 16 }}>
          ＋ 新增日誌
        </button>

        {/* Journal entries */}
        {journals.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: C.barkLight }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>📖</div>
            <p style={{ fontSize: 13 }}>還沒有日誌，快來記錄旅行吧！</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
            {[...journals].sort((a, b) => (b.date || '').localeCompare(a.date || '')).map((j: any) => {
              const comments = getCommentsFor(j.id);
              const isExpanded = expandedJournal === j.id;
              const commentInput = journalCommentInputs[j.id] || '';

              return (
                <div key={j.id} style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
                  {/* Card body */}
                  <div style={{ padding: '16px 16px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: C.blush, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, color: C.bark }}>
                          {j.authorName?.[0]?.toUpperCase()}
                        </div>
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 700, color: C.bark, margin: 0 }}>{j.authorName}</p>
                          <p style={{ fontSize: 10, color: C.barkLight, margin: 0 }}>{j.date}</p>
                        </div>
                      </div>
                      <button onClick={() => handleDelete(j.id)}
                        style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: '#FAE0E0', color: '#9A3A3A', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🗑</button>
                    </div>
                    <p style={{ fontSize: 14, color: C.bark, lineHeight: 1.7, margin: '0 0 8px', whiteSpace: 'pre-wrap' }}>{j.content}</p>
                    {j.photos?.length > 0 && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                        {j.photos.map((url: string, i: number) => (
                          <img key={i} src={url} alt="" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 10 }} />
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Comment toggle button */}
                  <div style={{ borderTop: `1px solid ${C.creamDark}`, padding: '0' }}>
                    <button
                      onClick={() => setExpandedJournal(isExpanded ? null : j.id)}
                      style={{ width: '100%', padding: '10px 16px', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: FONT, fontSize: 13, color: C.barkLight, fontWeight: 600 }}
                    >
                      <span>💬</span>
                      <span>{comments.length} 則回應</span>
                      <span style={{ marginLeft: 'auto', fontSize: 11, color: C.barkLight }}>{isExpanded ? '▲' : '▼'}</span>
                    </button>
                  </div>

                  {/* Expanded comment section */}
                  {isExpanded && (
                    <div style={{ background: '#FAF7F2', borderRadius: '0 0 16px 16px', padding: '12px 16px 16px' }}>
                      {comments.length === 0 ? (
                        <p style={{ fontSize: 12, color: C.barkLight, textAlign: 'center', padding: '8px 0 12px', fontStyle: 'italic', margin: 0 }}>
                          還沒有回應，來說說你的感受吧！
                        </p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                          {comments.map((c: any) => {
                            const isOwn = c.authorName === currentUser;
                            const ts = c.createdAt?.toDate ? c.createdAt.toDate() : null;
                            const timeStr = ts ? `${ts.getMonth()+1}/${ts.getDate()} ${String(ts.getHours()).padStart(2,'0')}:${String(ts.getMinutes()).padStart(2,'0')}` : '';
                            return (
                              <div key={c.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                                <div style={{ width: 28, height: 28, borderRadius: '50%', background: C.blush, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12, color: C.bark, flexShrink: 0, marginTop: 2 }}>
                                  {c.authorName?.[0]?.toUpperCase()}
                                </div>
                                <div style={{ flex: 1, background: C.cream, borderRadius: '4px 16px 16px 16px', padding: '8px 12px' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                                    <span style={{ fontSize: 11, fontWeight: 700, color: C.bark }}>{c.authorName}</span>
                                    <span style={{ fontSize: 10, color: C.barkLight }}>{timeStr}</span>
                                  </div>
                                  <p style={{ fontSize: 13, color: C.bark, margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{c.content}</p>
                                </div>
                                {isOwn && (
                                  <button onClick={() => handleDeleteComment(c.id)}
                                    style={{ width: 22, height: 22, borderRadius: '50%', background: '#FAE0E0', border: 'none', color: '#9A3A3A', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 4 }}>✕</button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Comment input */}
                      {currentUser ? (
                        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                          <div style={{ flex: 1, background: C.cream, borderRadius: 14, padding: '8px 12px' }}>
                            <textarea
                              value={commentInput}
                              onChange={e => setJournalCommentInputs(prev => ({ ...prev, [j.id]: e.target.value }))}
                              placeholder={`${currentUser} 說...`}
                              rows={2}
                              style={{ width: '100%', border: 'none', outline: 'none', background: 'transparent', fontSize: 14, fontFamily: FONT, color: C.bark, resize: 'none', lineHeight: 1.5, boxSizing: 'border-box' }}
                              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddComment(j.id); } }}
                            />
                          </div>
                          <button onClick={() => handleAddComment(j.id)} disabled={savingComment === j.id || !commentInput.trim()}
                            style={{ padding: '10px 14px', borderRadius: 12, border: 'none', background: C.earth, color: 'white', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: FONT, opacity: commentInput.trim() ? 1 : 0.5, flexShrink: 0 }}>
                            {savingComment === j.id ? '...' : '送出'}
                          </button>
                        </div>
                      ) : (
                        <p style={{ fontSize: 12, color: C.barkLight, textAlign: 'center', fontStyle: 'italic', margin: 0 }}>
                          請先在成員頁選擇身份後即可留言
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
