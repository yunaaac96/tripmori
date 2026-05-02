import { useState, useRef, useEffect } from 'react';
import { C, FONT, cardStyle, inputStyle, btnPrimary, SmartText } from '../../App';
import PageHeader from '../../components/layout/PageHeader';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBook, faTrashCan, faLock, faCamera, faLink, faMessage, faXmark, faChevronLeft, faChevronRight, faPen, faEye, faEyeSlash, faUsers, faUserLock } from '@fortawesome/free-solid-svg-icons';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useGoogleUid } from '../../hooks/useAuth';
import { arrayUnion, arrayRemove } from 'firebase/firestore';

const LS_USER_KEY  = 'tripmori_current_user';
const MAX_PHOTOS   = 5;
const REACTION_EMOJIS = ['❤️', '😂', '😮', '🥹', '👍', '🎉'];

// Avatar helper — shows member photo when available, otherwise letter + member colour
function MemberAvatar({ name, members, size = 32, fontSize = 14 }: { name: string; members: any[]; size?: number; fontSize?: number }) {
  const member = members?.find((m: any) => m.name === name);
  const bg     = member?.color || C.blush;
  // Determine readable text colour against the member's background
  const hex = bg.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16) || 0;
  const g = parseInt(hex.slice(2, 4), 16) || 0;
  const b = parseInt(hex.slice(4, 6), 16) || 0;
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  const textColor = luma > 160 ? C.bark : 'white';
  const base: React.CSSProperties = { width: size, height: size, borderRadius: '50%', flexShrink: 0, overflow: 'hidden' };
  if (member?.avatarUrl) {
    return <div style={base}><img src={member.avatarUrl} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>;
  }
  return (
    <div style={{ ...base, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize, color: textColor }}>
      {name?.[0]?.toUpperCase()}
    </div>
  );
}

export default function JournalPage({ journals, members, journalComments, firestore, project, currentUserName: propCurrentUser, hasMoreJournals, onShowMoreJournals }: any) {
  const { db, TRIP_ID, Timestamp, addDoc, updateDoc, deleteDoc, collection, doc, isReadOnly, role } = firestore;
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving]    = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm]        = useState({ content: '', date: '', author: '', photos: [] as string[] });
  const [lightbox, setLightbox] = useState<{ photos: string[]; idx: number } | null>(null);
  // Visibility restriction form state
  const [visibleToMode, setVisibleToMode] = useState<'all' | 'restricted'>('all');
  const [formVisibleTo, setFormVisibleTo] = useState<string[]>([]);

  // Lightbox keyboard navigation: Esc closes, ←/→ swap photos.
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null);
      else if (e.key === 'ArrowLeft') setLightbox(lb => lb && { ...lb, idx: (lb.idx - 1 + lb.photos.length) % lb.photos.length });
      else if (e.key === 'ArrowRight') setLightbox(lb => lb && { ...lb, idx: (lb.idx + 1) % lb.photos.length });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);
  const fileRef    = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  // Per-journal comment state
  const [expandedJournal, setExpandedJournal] = useState<string | null>(null);
  const [journalCommentInputs, setJournalCommentInputs] = useState<Record<string, string>>({});
  const [savingComment, setSavingComment] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<string>(() => propCurrentUser || localStorage.getItem(LS_USER_KEY) || '');
  const googleUid = useGoogleUid();

  // @mention state per comment input
  const [mentionMenuFor, setMentionMenuFor] = useState<string | null>(null);

  const memberNames: string[] = members.length > 0 ? members.map((m: any) => m.name) : [];
  // @mention dropdown: current user first, then project.memberOrder
  const sortedMemberNames = [...memberNames].sort((a, b) => {
    if (a === currentUser) return -1;
    if (b === currentUser) return 1;
    const order: string[] = project?.memberOrder || [];
    const ai = order.indexOf(a);
    const bi = order.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return 0;
  });
  const set = (key: string, val: any) => setForm(p => ({ ...p, [key]: val }));

  useEffect(() => {
    if (!showForm) return;
    const t = setTimeout(() => contentRef.current?.focus(), 350);
    return () => clearTimeout(t);
  }, [showForm]);

  // 當 Google UID 或成員列表更新時，自動帶入綁定成員身份
  useEffect(() => {
    if (!googleUid || !members.length) return;
    const bound = members.find((m: any) => m.googleUid === googleUid);
    if (bound) {
      localStorage.setItem(LS_USER_KEY, bound.name);
      setCurrentUser(bound.name);
    }
  }, [googleUid, members]);

  // 編輯者且已 Google 登入但尚未綁定成員卡 → 顯示綁定提示
  const isEditorUnbound = !isReadOnly && role === 'editor' && googleUid && !members.some((m: any) => m.googleUid === googleUid);

  const openForm = () => {
    setEditingId(null);
    setForm({ content: '', date: new Date().toISOString().slice(0, 10), author: currentUser, photos: [] });
    setVisibleToMode('all');
    setFormVisibleTo([]);
    setShowForm(true);
  };

  const openEdit = (j: any) => {
    setEditingId(j.id);
    setForm({ content: j.content || '', date: j.date || '', author: j.authorName || '', photos: j.photos || [] });
    const vt: string[] = j.visibleTo || [];
    setVisibleToMode(vt.length > 0 ? 'restricted' : 'all');
    setFormVisibleTo(vt);
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
    if (isReadOnly) return;
    const authorToSave = form.author || currentUser;
    if (!form.content || !authorToSave || !googleUid) return;
    setSaving(true);
    try {
      const visibleTo = visibleToMode === 'restricted' ? formVisibleTo : [];
      if (editingId) {
        // Edit mode: update content, date, photos, visibleTo (never change author)
        await updateDoc(doc(db, 'trips', TRIP_ID, 'journals', editingId), {
          content: form.content,
          date: form.date || new Date().toISOString().slice(0, 10),
          photos: form.photos,
          visibleTo,
          updatedAt: Timestamp.now(),
        });
      } else {
        // Create mode
        await addDoc(collection(db, 'trips', TRIP_ID, 'journals'), {
          content: form.content, date: form.date || new Date().toISOString().slice(0,10),
          authorName: authorToSave, photos: form.photos,
          reactions: {},
          visibleTo,
          createdAt: Timestamp.now(),
        });
      }
    } catch(e) { console.error(e); alert('儲存失敗，請重試'); }
    setSaving(false);
    setShowForm(false);
    setEditingId(null);
    setForm({ content: '', date: '', author: '', photos: [] });
  };

  const handleDelete = async (id: string, authorName: string) => {
    if (isReadOnly) return;
    // Editor: can only delete their own journal posts
    if (role !== 'owner' && authorName !== currentUser) return;
    try {
      await deleteDoc(doc(db, 'trips', TRIP_ID, 'journals', id));
    } catch (e) { console.error(e); alert('刪除失敗，請重試'); }
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm({ content: '', date: '', author: '', photos: [] });
    setVisibleToMode('all');
    setFormVisibleTo([]);
  };

  // ── Reactions ──────────────────────────────────────────────────
  // Each user can only hold one reaction per post; clicking a new emoji
  // auto-removes the previous one in a single atomic write.
  const handleReaction = async (journalId: string, emoji: string, currentReactions: Record<string, string[]>) => {
    if (isReadOnly || !currentUser) return;
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
    try {
      await deleteDoc(doc(db, 'trips', TRIP_ID, 'journalComments', id));
    } catch (e) { console.error(e); alert('刪除留言失敗，請重試'); }
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
          <div style={{ background: 'var(--tm-sheet-bg)', borderRadius: '24px 24px 0 0', padding: '24px 20px 40px', width: '100%', maxWidth: 430, fontFamily: FONT, maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <p style={{ fontSize: 17, fontWeight: 700, color: 'var(--tm-bark)', margin: 0, display: 'flex', alignItems: 'center', gap: 7 }}><FontAwesomeIcon icon={editingId ? faPen : faBook} style={{ fontSize: 14 }} /> {editingId ? '編輯日誌' : '新增日誌'}</p>
              <button onClick={closeForm} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--tm-bark-light)', display: 'flex', alignItems: 'center' }}><FontAwesomeIcon icon={faXmark} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* 作者 */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--tm-bark-light)', display: 'block', marginBottom: 6 }}>誰的日誌 *</label>
                {editingId ? (
                  /* Edit mode: author is locked */
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 12, background: 'var(--tm-input-bg)', border: `1.5px solid var(--tm-cream-dark)` }}>
                    <MemberAvatar name={form.author} members={members} size={32} fontSize={14} />
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--tm-bark)', margin: 0 }}>{form.author}</p>
                      <p style={{ fontSize: 10, color: 'var(--tm-bark-light)', margin: 0, display: 'flex', alignItems: 'center', gap: 3 }}><FontAwesomeIcon icon={faLock} style={{ fontSize: 9 }} /> 編輯時不可更改作者</p>
                    </div>
                  </div>
                ) : (googleUid && currentUser) ? (
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
                  <div className="tm-amber-text" style={{ padding: '10px 14px', borderRadius: 12, background: 'var(--tm-note-1)', fontSize: 12, color: '#9A6800', fontWeight: 600 }}>
                    <FontAwesomeIcon icon={faLock} style={{ fontSize: 11, marginRight: 5 }} />請先至成員頁綁定 Google 帳號後即可發佈日誌
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
                    <FontAwesomeIcon icon={faCamera} style={{ fontSize: 11, marginRight: 5 }} />{uploading ? '上傳中...' : `一次選取最多 ${MAX_PHOTOS - form.photos.length} 張照片`}
                  </button>
                )}
                {form.photos.length > 0 && (
                  <div className="tm-hscroll" style={{ display: 'flex', gap: 8, marginTop: 10, overflowX: 'auto', flexWrap: 'nowrap', paddingBottom: 4, WebkitOverflowScrolling: 'touch' as any }}>
                    {form.photos.map((url, idx) => (
                      <div key={idx} style={{ position: 'relative', flexShrink: 0 }}>
                        <img src={url} alt="" onClick={() => setLightbox({ photos: form.photos, idx })}
                          style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 10, display: 'block', cursor: 'pointer' }} />
                        <button onClick={() => removePhoto(idx)}
                          style={{ position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: '50%', background: '#FAE0E0', border: 'none', color: '#9A3A3A', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><FontAwesomeIcon icon={faXmark} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {/* 觀看限制 */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--tm-bark-light)', display: 'block', marginBottom: 8 }}>
                  <FontAwesomeIcon icon={faEye} style={{ marginRight: 4 }} />觀看限制
                </label>
                <div style={{ display: 'flex', gap: 6, marginBottom: visibleToMode === 'restricted' ? 10 : 0 }}>
                  <button
                    onClick={() => setVisibleToMode('all')}
                    style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: `1.5px solid ${visibleToMode === 'all' ? C.sage : 'var(--tm-cream-dark)'}`, background: visibleToMode === 'all' ? C.sageLight : 'var(--tm-card-bg)', color: visibleToMode === 'all' ? C.sageDark : 'var(--tm-bark-light)', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: FONT, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                    <FontAwesomeIcon icon={faUsers} />所有成員
                  </button>
                  <button
                    onClick={() => {
                      setVisibleToMode('restricted');
                      // Pre-select all members (except author) so user starts from full list and deselects
                      if (visibleToMode !== 'restricted') {
                        setFormVisibleTo(memberNames.filter(n => n !== (form.author || currentUser)));
                      }
                    }}
                    style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: `1.5px solid ${visibleToMode === 'restricted' ? C.earth : 'var(--tm-cream-dark)'}`, background: visibleToMode === 'restricted' ? '#FFF5E8' : 'var(--tm-card-bg)', color: visibleToMode === 'restricted' ? C.earth : 'var(--tm-bark-light)', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: FONT, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                    <FontAwesomeIcon icon={faUserLock} />指定成員
                  </button>
                </div>
                {visibleToMode === 'restricted' && (
                  <div>
                    <p style={{ fontSize: 11, color: 'var(--tm-bark-light)', margin: '0 0 8px' }}>
                      選取可閱讀的成員（作者本人永遠可見）
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {memberNames.filter(n => n !== (form.author || currentUser)).map(name => {
                        const selected = formVisibleTo.includes(name);
                        return (
                          <button key={name}
                            onClick={() => setFormVisibleTo(prev =>
                              selected ? prev.filter(n => n !== name) : [...prev, name]
                            )}
                            style={{ padding: '6px 12px', borderRadius: 20, border: `1.5px solid ${selected ? C.sageDark : 'var(--tm-cream-dark)'}`, background: selected ? C.sageLight : 'var(--tm-card-bg)', color: selected ? C.sageDark : 'var(--tm-bark-light)', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: FONT, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ width: 18, height: 18, borderRadius: '50%', background: members.find((m: any) => m.name === name)?.color || C.blush, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: 'white', flexShrink: 0 }}>{name[0]?.toUpperCase()}</span>
                            {name}
                          </button>
                        );
                      })}
                    </div>
                    {formVisibleTo.length === 0 && (
                      <p style={{ fontSize: 11, color: 'var(--tm-bark-light)', margin: '8px 0 0', fontWeight: 600 }}>
                        <FontAwesomeIcon icon={faEyeSlash} style={{ marginRight: 4 }} />未選取任何成員，僅作者自己可見
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button onClick={closeForm} style={{ flex: 1, padding: 12, borderRadius: 12, border: `1.5px solid var(--tm-cream-dark)`, background: 'var(--tm-card-bg)', color: 'var(--tm-bark-light)', fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>取消</button>
                <button onClick={handleSave} disabled={saving || !form.content || !(form.author || currentUser)}
                  style={{ ...btnPrimary(), flex: 2, opacity: saving||!form.content||!(form.author||currentUser)?0.6:1 }}>
                  {saving ? '儲存中...' : editingId ? '✓ 儲存' : '✓ 新增'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <PageHeader title="旅行日誌" subtitle="記錄美好時刻" emoji={<FontAwesomeIcon icon={faBook} />} color={C.blush} className="tm-hero-page-blush" />

      <div style={{ padding: '12px 16px 80px' }}>

        {/* 編輯者尚未綁定成員卡 */}
        {isEditorUnbound && (
          <div style={{ background: 'var(--tm-note-2)', borderRadius: 14, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18, color: '#2A6A9A' }}><FontAwesomeIcon icon={faLink} /></span>
            <p style={{ fontSize: 12, color: 'var(--tm-bark)', fontWeight: 600, margin: 0 }}>
              請先至「成員」頁面將 Google 帳號綁定至你的成員卡，才能使用日誌及留言功能
            </p>
          </div>
        )}

        {/* 需要 Google 登入才能新增日誌 */}
        {!isReadOnly && !isEditorUnbound && googleUid && (
          <button onClick={openForm} className="tm-btn-solid-earth" style={{ ...btnPrimary(C.earth), width: '100%', marginBottom: 16 }}>
            ＋ 新增日誌
          </button>
        )}
        {!isReadOnly && !isEditorUnbound && !googleUid && (
          <div style={{ background: 'var(--tm-note-1)', borderRadius: 14, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18 }}><FontAwesomeIcon icon={faLock} /></span>
            <p className="tm-amber-text" style={{ fontSize: 12, color: '#9A6800', fontWeight: 600, margin: 0 }}>
              請先至「成員」頁面綁定 Google 帳號，即可新增日誌
            </p>
          </div>
        )}

        {/* Journal entries */}
        {journals.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--tm-bark-light)' }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}><FontAwesomeIcon icon={faBook} /></div>
            <p style={{ fontSize: 13 }}>還沒有日誌，快來記錄旅行吧！</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
            {[...journals].sort((a, b) => (b.date || '').localeCompare(a.date || '')).map((j: any) => {
              // ── Visibility gating ──────────────────────────────────────────
              const visibleTo: string[] = j.visibleTo || [];
              const isRestricted = visibleTo.length > 0;
              const canView = !isRestricted ||
                currentUser === j.authorName ||
                visibleTo.includes(currentUser);
              // Restricted journal: completely hidden for unauthorized viewers & guests
              if (isRestricted && !canView) return null;
              // Unrestricted journal shown to guest: blur content (but show card)
              const isGuestBlur = !isRestricted && isReadOnly;
              // ──────────────────────────────────────────────────────────────

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
                        <MemberAvatar name={j.authorName} members={members} size={32} fontSize={14} />
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--tm-bark)', margin: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
                            {j.authorName}
                            {isRestricted && (
                              <span title={`僅 ${visibleTo.length > 0 ? visibleTo.join('、') + '、' : ''}${j.authorName} 可見`}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 9, fontWeight: 700, color: C.earth, background: '#FFF5E8', border: `1px solid #FFCF8A`, borderRadius: 6, padding: '1px 5px' }}>
                                <FontAwesomeIcon icon={faUserLock} />指定成員
                              </span>
                            )}
                          </p>
                          <p style={{ fontSize: 10, color: 'var(--tm-bark-light)', margin: 0 }}>{j.date}</p>
                        </div>
                      </div>
                      {!isReadOnly && (role === 'owner' || j.authorName === currentUser) && (
                        <div style={{ display: 'flex', gap: 6 }}>
                          {/* 編輯：僅作者本人 */}
                          {j.authorName === currentUser && (
                            <button onClick={() => openEdit(j)}
                              title="編輯日誌"
                              style={{ width: 28, height: 28, borderRadius: 8, border: `1.5px solid var(--tm-cream-dark)`, background: 'var(--tm-card-bg)', color: 'var(--tm-bark-light)', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><FontAwesomeIcon icon={faPen} /></button>
                          )}
                          {/* 刪除：作者本人或擁有者 */}
                          <button onClick={() => handleDelete(j.id, j.authorName)}
                            title="刪除日誌"
                            style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: '#FAE0E0', color: '#9A3A3A', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><FontAwesomeIcon icon={faTrashCan} /></button>
                        </div>
                      )}
                    </div>
                    {/* Content — blurred for guests on unrestricted journals */}
                    {isGuestBlur ? (
                      <div style={{ position: 'relative', marginBottom: 8 }}>
                        <p style={{ fontSize: 14, color: 'var(--tm-bark)', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'anywhere', filter: 'blur(4px)', userSelect: 'none', pointerEvents: 'none' }}>
                          <SmartText text={j.content || ''} />
                        </p>
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ background: 'rgba(255,255,255,0.85)', border: `1px solid var(--tm-cream-dark)`, borderRadius: 20, padding: '5px 12px', fontSize: 11, fontWeight: 700, color: 'var(--tm-bark-light)', display: 'flex', alignItems: 'center', gap: 5 }}>
                            <FontAwesomeIcon icon={faLock} />取得行程邀請後即可閱讀
                          </span>
                        </div>
                      </div>
                    ) : (
                      <p style={{ fontSize: 14, color: 'var(--tm-bark)', lineHeight: 1.7, margin: '0 0 8px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'anywhere' }}><SmartText text={j.content || ''} /></p>
                    )}
                    {/* 照片 */}
                    {j.photos?.length > 0 && (
                      <div className="tm-hscroll" style={{ display: 'flex', gap: 8, overflowX: 'auto', flexWrap: 'nowrap', marginBottom: 8, paddingBottom: 4, WebkitOverflowScrolling: 'touch' as any }}>
                        {j.photos.map((url: string, i: number) => (
                          isGuestBlur
                            ? <div key={i} style={{ width: 110, height: 110, borderRadius: 12, flexShrink: 0, overflow: 'hidden', filter: 'blur(6px)', pointerEvents: 'none' }}>
                                <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              </div>
                            : <img key={i} src={url} alt="" onClick={() => setLightbox({ photos: j.photos, idx: i })}
                                style={{ width: 110, height: 110, objectFit: 'cover', borderRadius: 12, flexShrink: 0, cursor: 'pointer' }} />
                        ))}
                      </div>
                    )}

                    {/* ── Reaction bar (hidden for guests) ── */}
                    {!isGuestBlur && (
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
                    )}
                  </div>

                  {/* Comment section (toggle + expanded) — hidden for guests on blurred journals */}
                  {!isGuestBlur && <><div style={{ borderTop: `1px solid var(--tm-card-border, var(--tm-cream-dark))` }}>
                    <button
                      onClick={() => setExpandedJournal(isExpanded ? null : j.id)}
                      style={{ width: '100%', padding: '10px 16px', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: FONT, fontSize: 13, color: 'var(--tm-bark-light)', fontWeight: 600 }}
                    >
                      <FontAwesomeIcon icon={faMessage} />
                      <span>{comments.length} 則回應</span>
                      {totalReactions > 0 && (
                        <span style={{ fontSize: 11, color: C.sageDark, fontWeight: 700, marginLeft: 4 }}>· {totalReactions} 個表情</span>
                      )}
                      <span style={{ marginLeft: 'auto', fontSize: 11 }}>{isExpanded ? '▲' : '▼'}</span>
                    </button>
                  </div>

                  {/* Expanded comment section */}
                  {isExpanded && <div style={{ background: 'var(--tm-input-bg)', borderRadius: '0 0 16px 16px', padding: '12px 16px 16px' }}>
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
                                <div style={{ marginTop: 2 }}><MemberAvatar name={c.authorName} members={members} size={28} fontSize={12} /></div>
                                <div style={{ flex: 1, background: 'var(--tm-card-bg)', borderRadius: '4px 16px 16px 16px', padding: '8px 12px', minWidth: 0 }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--tm-bark)' }}>{c.authorName}</span>
                                    <span style={{ fontSize: 10, color: 'var(--tm-bark-light)' }}>{timeStr}</span>
                                  </div>
                                  <p style={{ fontSize: 13, color: 'var(--tm-bark)', margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{renderContent(c.content)}</p>
                                </div>
                                {isOwn && !isReadOnly && (
                                  <button onClick={() => handleDeleteComment(c.id)}
                                    style={{ width: 22, height: 22, borderRadius: '50%', background: '#FAE0E0', border: 'none', color: '#9A3A3A', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 4 }}><FontAwesomeIcon icon={faXmark} /></button>
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
                          {mentionMenuFor === j.id && sortedMemberNames.length > 0 && (
                            <div style={{ position: 'absolute', bottom: '100%', left: 0, marginBottom: 4, background: 'var(--tm-card-bg)', borderRadius: 12, border: `1.5px solid var(--tm-cream-dark)`, boxShadow: '0 4px 16px rgba(0,0,0,0.15)', zIndex: 50, overflow: 'hidden', minWidth: 140 }}>
                              {sortedMemberNames.map(name => (
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
                    </div>}
                  </>}
                </div>
              );
            })}
            {hasMoreJournals && (
              <button onClick={onShowMoreJournals}
                style={{ margin: '12px auto 0', padding: '10px 20px', borderRadius: 20, border: `1.5px solid ${C.creamDark}`, background: 'var(--tm-card-bg)', color: C.barkLight, fontFamily: FONT, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'block' }}>
                載入更多日誌
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Photo lightbox ── */}
      {lightbox && (
        <div onClick={() => setLightbox(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <img src={lightbox.photos[lightbox.idx]} alt=""
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8, display: 'block' }} />
          <button onClick={e => { e.stopPropagation(); setLightbox(null); }}
            aria-label="關閉"
            style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top, 0px) + 16px)', right: 16, width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.18)', color: 'white', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FontAwesomeIcon icon={faXmark} />
          </button>
          {lightbox.photos.length > 1 && (
            <>
              <button onClick={e => { e.stopPropagation(); setLightbox(lb => lb && { ...lb, idx: (lb.idx - 1 + lb.photos.length) % lb.photos.length }); }}
                aria-label="上一張"
                style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.18)', color: 'white', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <FontAwesomeIcon icon={faChevronLeft} />
              </button>
              <button onClick={e => { e.stopPropagation(); setLightbox(lb => lb && { ...lb, idx: (lb.idx + 1) % lb.photos.length }); }}
                aria-label="下一張"
                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.18)', color: 'white', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <FontAwesomeIcon icon={faChevronRight} />
              </button>
              <p style={{ position: 'absolute', bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)', left: '50%', transform: 'translateX(-50%)', color: 'white', fontSize: 13, margin: 0, background: 'rgba(0,0,0,0.45)', padding: '4px 10px', borderRadius: 12 }}>
                {lightbox.idx + 1} / {lightbox.photos.length}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
