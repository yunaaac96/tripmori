import { useState, useRef, useEffect } from 'react';
import { C, FONT, cardStyle, inputStyle, btnPrimary } from '../../App';
import PageHeader from '../../components/layout/PageHeader';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth } from '../../config/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { arrayUnion, arrayRemove } from 'firebase/firestore';

const LS_USER_KEY  = 'tripmori_current_user';
const MAX_PHOTOS   = 5;
const REACTION_EMOJIS = ['❤️', '😂', '😮', '🥹', '👍', '🎉'];

export default function JournalPage({ journals, members, journalComments, firestore, currentUserName: propCurrentUser }: any) {
  const { db, TRIP_ID, Timestamp, addDoc, updateDoc, deleteDoc, collection, doc, isReadOnly, role } = firestore;
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
  const [currentUser, setCurrentUser] = useState<string>(() => propCurrentUser || localStorage.getItem(LS_USER_KEY) || '');
  const [googleUid, setGoogleUid]     = useState<string | null>(null);

  // @mention state per comment input
  const [mentionMenuFor, setMentionMenuFor] = useState<string | null>(null);

  const memberNames: string[] = members.length > 0 ? members.map((m: any) => m.name) : [];
  const set = (key: string, val: any) => setForm(p => ({ ...p, [key]: val }));

  useEffect(() => {
    if (!showForm) return;
    const t = setTimeout(() => contentRef.current?.focus(), 350);
    return () => clearTimeout(t);
  }, [showForm]);

  // 追蹤 Google 登入狀態＋自動帶入綁定成員身份
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, user => {
      if (user && !user.isAnonymous) {
        setGoogleUid(user.uid);
        if (members.length > 0) {
          const bound = members.find((m: any) => m.googleUid === user.uid);
          if (bound) {
            localStorage.setItem(LS_USER_KEY, bound.name);
            setCurrentUser(bound.name);
          }
        }
      } else {
        setGoogleUid(null);
      }
    });
    return unsub;
  }, [members]);

  // 編輯者且已 Google 登入但尚未綁定成員卡 → 顯示綁定提示
  const isEditorUnbound = !isReadOnly && role === 'editor' && googleUid && !members.some((m: any) => m.googleUid === googleUid);

  const openForm = () => {
    setForm({ content: '', date: '', author: currentUser, photos: [] });
    setShowForm(true);
  };

  const handlePhotoUpload = async (files: FileList | File[]) => {
    const fileArr = Array.from(files);
    const remaining = MAX_PHOTOS - form.photos.length;
    const toUpload = fileArr.slice(0, remaining);
    if (fileArr.length > remaining) {
      alert(`最多只能上傳 ${MAX_PHOTOS} 張照片，已自動截取前 ${remaining} 張`);
    }
    if (toUpload.length === 0) return;
    setUploading(true);
    try {
      const storage = getStorage();
      const urls = await Promise.all(toUpload.map(async file => {
        const path  = `journals/${TRIP_ID}/${Date.now()}_${Math.random().toString(36).slice(2)}_${file.name}`;
        const sRef  = storageRef(storage, path);
        await uploadBytes(sRef, file);
        return getDownloadURL(sRef);
      }));
      setForm(p => ({ ...p, photos: [...p.photos, ...urls] }));
    } catch (e) {
      console.error('上傳失敗:', e);
      alert('圖片上傳失敗，請確認 Firebase Storage 設定');
    }
    setUploading(false);
  };

  const removePhoto = (idx: number) =>
    setForm(p => ({ ...p, photos: p.photos.filter((_, i) => i !== idx) }));

  const handleSave = async () => {
    const authorToSave = form.author || currentUser;
    if (!form.content || !authorToSave || !googleUid) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'trips', TRIP_ID, 'journals'), {
        content: form.content, date: form.date || new Date().toISOString().slice(0,10),
        authorName: authorToSave, photos: form.photos,
        reactions: {},
        createdAt: Timestamp.now(),
      });
    } catch(e) { console.error(e); }
    setSaving(false);
    setShowForm(false);
    setForm({ content: '', date: '', author: '', photos: [] });
  };

  const handleDelete = async (id: string, authorName: string) => {
    if (isReadOnly) return;
    // Editor: can only delete their own journal posts
    if (role !== 'owner' && authorName !== currentUser) return;
    await deleteDoc(doc(db,'trips',TRIP_ID,'journals',id));
  };

  const closeForm = () => {
    setShowForm(false);
    setForm({ content: '', date: '', author: '', photos: [] });
  };

  // ── Reactions ──────────────────────────────────────────────────
  // Each user can only hold one reaction per post; clicking a new emoji
  // auto-removes the previous one in a single atomic write.
  const handleReaction = async (journalId: string, emoji: string, currentReactions: Record<string, string[]>) => {
    if (!currentUser) return;
    const existing = (currentReactions[emoji] || []) as string[];
    const hasReacted = existing.includes(currentUser);

    // Build atomic update: remove user from any other emoji they already picked
    const update: Record<string, any> = {};
    for (const [e, reactors] of Object.entries(currentReactions)) {
      if (e !== emoji && (reactors as string[]).includes(currentUser)) {
        update[`reactions.${e}`] = arrayRemove(currentUser);
      }
    }
    // Toggle the clicked emoji
    update[`reactions.${emoji}`] = hasReacted
      ? arrayRemove(currentUser)
      : arrayUnion(currentUser);

    try {
      await updateDoc(doc(db, 'trips', TRIP_ID, 'journals', journalId), update);
    } catch (e) { console.error(e); }
  };

  // ── Comments ───────────────────────────────────────────────────
  const getCommentsFor = (journalId: string) =>
    [...(journalComments || [])]
      .filter((c: any) => c.journalId === journalId)
      .sort((a: any, b: any) => {
        const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return ta - tb;
      });

  // Extract @mentions from text
  const extractMentions = (text: string): string[] => {
    const matches = text.match(/@([^\s@]+)/g) || [];
    return matches
      .map(m => m.slice(1))
      .filter(name => memberNames.includes(name));
  };

  // Create notification in Firestore
  const createNotif = async (recipientName: string, type: string, message: string, journalId?: string) => {
    if (!recipientName || recipientName === currentUser) return;
    try {
      await addDoc(collection(db, 'trips', TRIP_ID, 'notifications'), {
        recipientName,
        senderName: currentUser,
        type,
        message,
        journalId: journalId || '',
        read: false,
        createdAt: Timestamp.now(),
      });
    } catch (e) { console.error(e); }
  };

  const handleAddComment = async (journalId: string, journalAuthor: string) => {
    const text = (journalCommentInputs[journalId] || '').trim();
    if (!text || !currentUser || isReadOnly) return;
    setSavingComment(journalId);
    const mentions = extractMentions(text);
    try {
      await addDoc(collection(db, 'trips', TRIP_ID, 'journalComments'), {
        journalId,
        authorName: currentUser,
        content: text,
        mentions,
        createdAt: Timestamp.now(),
      });
      setJournalCommentInputs(prev => ({ ...prev, [journalId]: '' }));
      setMentionMenuFor(null);
      // 通知被標記的成員
      for (const name of mentions) {
        await createNotif(name, 'mention', `${currentUser} 在日誌留言中標記了你`, journalId);
      }
      // 通知日誌作者（若非自己）
      if (journalAuthor && journalAuthor !== currentUser && !mentions.includes(journalAuthor)) {
        await createNotif(journalAuthor, 'journal_comment', `${currentUser} 在你的日誌留言`, journalId);
      }
    } catch (e) { console.error(e); }
    setSavingComment(null);
  };

  const handleDeleteComment = async (id: string) => {
    if (isReadOnly) return;
    await deleteDoc(doc(db, 'trips', TRIP_ID, 'journalComments', id));
  };

  // Insert @name into comment input
  const insertMention = (journalId: string, name: string) => {
    const current = journalCommentInputs[journalId] || '';
    // Replace trailing @-fragment with @name + space
    const replaced = current.replace(/@\w*$/, '') + `@${name} `;
    setJournalCommentInputs(prev => ({ ...prev, [journalId]: replaced }));
    setMentionMenuFor(null);
  };

  return (
    <div style={{ fontFamily: FONT }}>

      {/* ── Inline Form Modal ── */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 300 }}
          onClick={e => { if (e.target === e.currentTarget) closeForm(); }}>
          <div style={{ background: 'var(--tm-sheet-bg)', borderRadius: '24px 24px 0 0', padding: '24px 20px 40px', width: '100%', maxWidth: 430, fontFamily: FONT, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <p style={{ fontSize: 17, fontWeight: 700, color: 'var(--tm-bark)', margin: 0 }}>📖 新增日誌</p>
              <button onClick={closeForm} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--tm-bark-light)' }}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* 作者 */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--tm-bark-light)', display: 'block', marginBottom: 6 }}>誰的日誌 *</label>
                {(googleUid && currentUser) ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 12, background: C.sage }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, color: 'white', flexShrink: 0 }}>
                      {currentUser[0]?.toUpperCase()}
                    </div>
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 700, color: 'white', margin: 0 }}>{currentUser}</p>
                      <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)', margin: 0 }}>Google 帳號已驗證</p>
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: '10px 14px', borderRadius: 12, background: 'var(--tm-note-1)', fontSize: 12, color: '#9A6800', fontWeight: 600 }}>
                    🔐 請先至成員頁綁定 Google 帳號後即可發佈日誌
                  </div>
                )}
              </div>
              {/* 日期 */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--tm-bark-light)', display: 'block', marginBottom: 4 }}>日期</label>
                <input style={inputStyle} type="date" value={form.date} onChange={e => set('date', e.target.value)} />
              </div>
              {/* 內容 */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--tm-bark-light)', display: 'block', marginBottom: 4 }}>日誌內容 *</label>
                <textarea ref={contentRef}
                  style={{ ...inputStyle, minHeight: 120, resize: 'vertical' as const, lineHeight: 1.7 }}
                  placeholder="今天去了..."
                  value={form.content}
                  onChange={e => set('content', e.target.value)}
                />
              </div>
              {/* 照片 */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--tm-bark-light)', display: 'block', marginBottom: 6 }}>
                  照片（{form.photos.length}/{MAX_PHOTOS}）
                </label>
                <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
                  onChange={e => { if (e.target.files && e.target.files.length > 0) handlePhotoUpload(e.target.files); e.target.value = ''; }} />
                {form.photos.length < MAX_PHOTOS && (
                  <button onClick={() => fileRef.current?.click()} disabled={uploading}
                    style={{ padding: '10px 16px', borderRadius: 12, border: `2px dashed var(--tm-cream-dark)`, background: 'var(--tm-input-bg)', color: 'var(--tm-bark-light)', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: FONT, display: 'flex', alignItems: 'center', gap: 6, opacity: uploading ? 0.6 : 1 }}>
                    📷 {uploading ? '上傳中...' : `一次選取最多 ${MAX_PHOTOS - form.photos.length} 張照片`}
                  </button>
                )}
                {form.photos.length > 0 && (
                  <div className="tm-hscroll" style={{ display: 'flex', gap: 8, marginTop: 10, overflowX: 'auto', flexWrap: 'nowrap', paddingBottom: 4, WebkitOverflowScrolling: 'touch' as any }}>
                    {form.photos.map((url, idx) => (
                      <div key={idx} style={{ position: 'relative', flexShrink: 0 }}>
                        <img src={url} alt="" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 10, display: 'block' }} />
                        <button onClick={() => removePhoto(idx)}
                          style={{ position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: '50%', background: '#FAE0E0', border: 'none', color: '#9A3A3A', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button onClick={closeForm} style={{ flex: 1, padding: 12, borderRadius: 12, border: `1.5px solid var(--tm-cream-dark)`, background: 'var(--tm-card-bg)', color: 'var(--tm-bark-light)', fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>取消</button>
                <button onClick={handleSave} disabled={saving || !form.content || !(form.author || currentUser)}
                  style={{ ...btnPrimary(), flex: 2, opacity: saving||!form.content||!(form.author||currentUser)?0.6:1 }}>
                  {saving ? '儲存中...' : '✓ 新增'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <PageHeader title="旅行日誌" subtitle="記錄美好時刻 📸" emoji="📖" color={C.blush} />

      <div style={{ padding: '12px 16px 80px' }}>

        {/* 編輯者尚未綁定成員卡 */}
        {isEditorUnbound && (
          <div style={{ background: 'var(--tm-note-2)', borderRadius: 14, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>🔗</span>
            <p style={{ fontSize: 12, color: 'var(--tm-bark)', fontWeight: 600, margin: 0 }}>
              請先至「成員」頁面將 Google 帳號綁定至你的成員卡，才能使用日誌及留言功能
            </p>
          </div>
        )}

        {/* 需要 Google 登入才能新增日誌 */}
        {!isReadOnly && !isEditorUnbound && googleUid && (
          <button onClick={openForm} style={{ ...btnPrimary(C.earth), width: '100%', marginBottom: 16 }}>
            ＋ 新增日誌
          </button>
        )}
        {!isReadOnly && !isEditorUnbound && !googleUid && (
          <div style={{ background: 'var(--tm-note-1)', borderRadius: 14, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18 }}>🔒</span>
            <p style={{ fontSize: 12, color: '#9A6800', fontWeight: 600, margin: 0 }}>
              請先至「成員」頁面綁定 Google 帳號，即可新增日誌
            </p>
          </div>
        )}

        {/* Journal entries */}
        {journals.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--tm-bark-light)' }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>📖</div>
            <p style={{ fontSize: 13 }}>還沒有日誌，快來記錄旅行吧！</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
            {[...journals].sort((a, b) => (b.date || '').localeCompare(a.date || '')).map((j: any) => {
              const comments = getCommentsFor(j.id);
              const isExpanded = expandedJournal === j.id;
              const commentInput = journalCommentInputs[j.id] || '';
              const reactions: Record<string, string[]> = j.reactions || {};
              const totalReactions = Object.values(reactions).reduce((s, arr) => s + arr.length, 0);

              return (
                <div key={j.id} style={{ ...cardStyle, padding: 0, overflow: 'visible' }}>
                  {/* Card body */}
                  <div style={{ padding: '16px 16px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: C.blush, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, color: C.bark }}>
                          {j.authorName?.[0]?.toUpperCase()}
                        </div>
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--tm-bark)', margin: 0 }}>{j.authorName}</p>
                          <p style={{ fontSize: 10, color: 'var(--tm-bark-light)', margin: 0 }}>{j.date}</p>
                        </div>
                      </div>
                      {!isReadOnly && (role === 'owner' || j.authorName === currentUser) && (
                        <button onClick={() => handleDelete(j.id, j.authorName)}
                          style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: '#FAE0E0', color: '#9A3A3A', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🗑</button>
                      )}
                    </div>
                    <p style={{ fontSize: 14, color: 'var(--tm-bark)', lineHeight: 1.7, margin: '0 0 8px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{j.content}</p>
                    {/* 照片 */}
                    {j.photos?.length > 0 && (
                      <div className="tm-hscroll" style={{ display: 'flex', gap: 8, overflowX: 'auto', flexWrap: 'nowrap', marginBottom: 8, paddingBottom: 4, WebkitOverflowScrolling: 'touch' as any }}>
                        {j.photos.map((url: string, i: number) => (
                          <img key={i} src={url} alt="" style={{ width: 110, height: 110, objectFit: 'cover', borderRadius: 12, flexShrink: 0 }} />
                        ))}
                      </div>
                    )}

                    {/* ── Reaction bar ── */}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                      {REACTION_EMOJIS.map(emoji => {
                        const reactors = reactions[emoji] || [];
                        const hasMyReact = reactors.includes(currentUser);
                        return (
                          <button key={emoji} onClick={() => !isReadOnly && currentUser && handleReaction(j.id, emoji, reactions)}
                            style={{
                              padding: '4px 8px', borderRadius: 20,
                              border: `1.5px solid ${hasMyReact ? C.sageDark : 'var(--tm-cream-dark)'}`,
                              background: hasMyReact ? C.sageLight : 'var(--tm-card-bg)',
                              fontSize: 14, cursor: (!isReadOnly && currentUser) ? 'pointer' : 'default',
                              display: 'flex', alignItems: 'center', gap: 4, fontFamily: FONT,
                              opacity: (!isReadOnly && currentUser) ? 1 : 0.6,
                            }}>
                            {emoji}
                            {reactors.length > 0 && (
                              <span style={{ fontSize: 11, color: hasMyReact ? C.sageDark : 'var(--tm-bark-light)', fontWeight: 600 }}>
                                {reactors.length}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Comment toggle button */}
                  <div style={{ borderTop: `1px solid var(--tm-card-border, var(--tm-cream-dark))` }}>
                    <button
                      onClick={() => setExpandedJournal(isExpanded ? null : j.id)}
                      style={{ width: '100%', padding: '10px 16px', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: FONT, fontSize: 13, color: 'var(--tm-bark-light)', fontWeight: 600 }}
                    >
                      <span>💬</span>
                      <span>{comments.length} 則回應</span>
                      {totalReactions > 0 && (
                        <span style={{ fontSize: 11, color: C.sageDark, fontWeight: 700, marginLeft: 4 }}>· {totalReactions} 個表情</span>
                      )}
                      <span style={{ marginLeft: 'auto', fontSize: 11 }}>{isExpanded ? '▲' : '▼'}</span>
                    </button>
                  </div>

                  {/* Expanded comment section */}
                  {isExpanded && (
                    <div style={{ background: 'var(--tm-input-bg)', borderRadius: '0 0 16px 16px', padding: '12px 16px 16px' }}>
                      {comments.length === 0 ? (
                        <p style={{ fontSize: 12, color: 'var(--tm-bark-light)', textAlign: 'center', padding: '8px 0 12px', fontStyle: 'italic', margin: 0 }}>
                          還沒有回應，來說說你的感受吧！
                        </p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                          {comments.map((c: any) => {
                            const isOwn = c.authorName === currentUser;
                            const ts = c.createdAt?.toDate ? c.createdAt.toDate() : null;
                            const timeStr = ts ? `${ts.getMonth()+1}/${ts.getDate()} ${String(ts.getHours()).padStart(2,'0')}:${String(ts.getMinutes()).padStart(2,'0')}` : '';
                            // Highlight @mentions
                            const renderContent = (text: string) => {
                              const parts = text.split(/(@\w+)/g);
                              return parts.map((part, i) =>
                                part.startsWith('@') && memberNames.includes(part.slice(1))
                                  ? <span key={i} style={{ color: C.sageDark, fontWeight: 700 }}>{part}</span>
                                  : part
                              );
                            };
                            return (
                              <div key={c.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                                <div style={{ width: 28, height: 28, borderRadius: '50%', background: C.blush, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12, color: C.bark, flexShrink: 0, marginTop: 2 }}>
                                  {c.authorName?.[0]?.toUpperCase()}
                                </div>
                                <div style={{ flex: 1, background: 'var(--tm-card-bg)', borderRadius: '4px 16px 16px 16px', padding: '8px 12px', minWidth: 0 }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--tm-bark)' }}>{c.authorName}</span>
                                    <span style={{ fontSize: 10, color: 'var(--tm-bark-light)' }}>{timeStr}</span>
                                  </div>
                                  <p style={{ fontSize: 13, color: 'var(--tm-bark)', margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{renderContent(c.content)}</p>
                                </div>
                                {isOwn && !isReadOnly && (
                                  <button onClick={() => handleDeleteComment(c.id)}
                                    style={{ width: 22, height: 22, borderRadius: '50%', background: '#FAE0E0', border: 'none', color: '#9A3A3A', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 4 }}>✕</button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Comment input */}
                      {isReadOnly ? (
                        <p style={{ fontSize: 12, color: 'var(--tm-bark-light)', textAlign: 'center', fontStyle: 'italic', margin: 0 }}>訪客模式無法留言</p>
                      ) : isEditorUnbound ? (
                        <p style={{ fontSize: 12, color: 'var(--tm-bark-light)', textAlign: 'center', fontStyle: 'italic', margin: 0 }}>請先綁定成員卡才能留言</p>
                      ) : (googleUid && currentUser) ? (
                        <div style={{ position: 'relative' }}>
                          {/* @mention dropdown */}
                          {mentionMenuFor === j.id && memberNames.length > 0 && (
                            <div style={{ position: 'absolute', bottom: '100%', left: 0, marginBottom: 4, background: 'var(--tm-card-bg)', borderRadius: 12, border: `1.5px solid var(--tm-cream-dark)`, boxShadow: '0 4px 16px rgba(0,0,0,0.15)', zIndex: 50, overflow: 'hidden', minWidth: 140 }}>
                              {memberNames.map(name => (
                                <button key={name} onClick={() => insertMention(j.id, name)}
                                  style={{ width: '100%', padding: '9px 14px', border: 'none', background: 'transparent', textAlign: 'left', fontSize: 14, fontFamily: FONT, color: 'var(--tm-bark)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
                                  onMouseOver={e => (e.currentTarget.style.background = 'var(--tm-input-bg)')}
                                  onMouseOut={e => (e.currentTarget.style.background = 'transparent')}>
                                  <span style={{ width: 24, height: 24, borderRadius: '50%', background: C.blush, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 11, color: C.bark, flexShrink: 0 }}>{name[0]?.toUpperCase()}</span>
                                  {name}
                                </button>
                              ))}
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                            <div style={{ flex: 1, background: 'var(--tm-card-bg)', borderRadius: 14, padding: '8px 12px' }}>
                              <textarea
                                value={commentInput}
                                onChange={e => {
                                  const val = e.target.value;
                                  setJournalCommentInputs(prev => ({ ...prev, [j.id]: val }));
                                  // Show mention menu when user types @
                                  if (/@\w*$/.test(val)) setMentionMenuFor(j.id);
                                  else setMentionMenuFor(null);
                                }}
                                onBlur={() => setTimeout(() => setMentionMenuFor(null), 200)}
                                placeholder={`${currentUser} 說... （@name 標記成員）`}
                                rows={2}
                                style={{ width: '100%', border: 'none', outline: 'none', background: 'transparent', fontSize: 14, fontFamily: FONT, color: 'var(--tm-bark)', resize: 'none', lineHeight: 1.5, boxSizing: 'border-box' }}
                                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddComment(j.id, j.authorName); } }}
                              />
                            </div>
                            <button onClick={() => handleAddComment(j.id, j.authorName)} disabled={savingComment === j.id || !commentInput.trim()}
                              style={{ padding: '10px 14px', borderRadius: 12, border: 'none', background: C.earth, color: 'white', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: FONT, opacity: commentInput.trim() ? 1 : 0.5, flexShrink: 0 }}>
                              {savingComment === j.id ? '...' : '送出'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p style={{ fontSize: 12, color: 'var(--tm-bark-light)', textAlign: 'center', fontStyle: 'italic', margin: 0 }}>
                          請先登入 Google 並綁定成員卡後即可留言
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
