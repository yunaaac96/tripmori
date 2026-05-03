import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlaneDeparture, faCalendarPlus, faKey, faCompass, faHandshakeAngle, faSquareCheck, faMoneyBillWave, faMessage, faAngleLeft, faAngleRight, faXmark } from '@fortawesome/free-solid-svg-icons';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { C, FONT } from '../App';
import type { OnboardingTrack } from '../utils/onboarding';

interface Step {
  icon: IconDefinition;
  iconColor: string;
  title: string;
  body: string;
}

const creatorSteps = (tripTitle: string): Step[] => [
  {
    icon: faPlaneDeparture,
    iconColor: C.sage,
    title: `準備好啟程囉，${tripTitle}！`,
    body: '一切就緒，你的旅行手帳開張了 🎉。先別急著收拾行李，讓我們一起把腦海裡的那趟旅行，放進這裡一點一點變成現實！',
  },
  {
    icon: faCalendarPlus,
    iconColor: C.earth,
    title: '第一站：填第一筆行程',
    body: '切到「行程」頁，點當天日期下方的「＋ 新增第一筆行程」就能加入景點、餐廳、活動。每新增一筆，所有旅伴都能同步看到。試試看，從早午餐開始規劃吧！',
  },
  {
    icon: faKey,
    iconColor: '#9A6800',
    title: '邀請夥伴一起規劃',
    body: '到「成員」頁可以複製【協作金鑰】傳給朋友，他們輸入金鑰就能一起編輯。越多人一起規劃，旅行越熱鬧！',
  },
  {
    icon: faCompass,
    iconColor: C.sky,
    title: '其他功能逛一圈',
    body: '底部導覽列還有：預訂（機票住宿）、記帳（自動分帳）、日誌（每日回顧）、準備（待辦＆行李）、成員（旅伴留言板）。有空就點進去探索，讓旅行計畫越來越完整！',
  },
];

const inviteeSteps = (tripTitle: string): Step[] => [
  {
    icon: faHandshakeAngle,
    iconColor: C.sage,
    title: `歡迎加入 ${tripTitle}！`,
    body: '這是你們的共同規劃空間 🎊。大家正在一起打造這趟難忘的旅行，你的加入讓整個團隊更完整。一起讓這趟旅行發光吧！',
  },
  {
    icon: faSquareCheck,
    iconColor: C.earth,
    title: '先看看你的「準備」事項',
    body: '切到「準備」頁，確認自己的行李清單和待辦，完成後記得勾選 ✓。有些任務可能已經被指派給你，提早準備不慌張。',
  },
  {
    icon: faMoneyBillWave,
    iconColor: '#9A6800',
    title: '共同記帳超輕鬆',
    body: '旅行中的開銷都可以在「記帳」頁登記，系統會自動換算台幣並分帳。隨時看得到誰墊了多少、誰還沒結清，出門前就能講好規則。',
  },
  {
    icon: faMessage,
    iconColor: C.sky,
    title: '到留言板打個招呼',
    body: '到「成員」頁找到自己的卡片，展開留言板貼一張便條給大家。讓旅伴知道你到位了，順便為旅行聊出更多期待！',
  },
];

interface Props {
  track: OnboardingTrack;
  tripTitle: string;
  onDone: () => void;
  onSkip: () => void;
}

export default function OnboardingModal({ track, tripTitle, onDone, onSkip }: Props) {
  const [idx, setIdx] = useState(0);
  const steps = track === 'creator' ? creatorSteps(tripTitle) : inviteeSteps(tripTitle);
  const step = steps[idx];
  const isFirst = idx === 0;
  const isLast  = idx === steps.length - 1;

  const next = () => {
    if (isLast) onDone();
    else setIdx(i => i + 1);
  };
  const prev = () => setIdx(i => Math.max(0, i - 1));

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(107,92,78,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 2000, padding: 'calc(env(safe-area-inset-top,0px) + 16px) 20px calc(env(safe-area-inset-bottom,0px) + 16px)',
        fontFamily: FONT,
      }}
    >
      <div style={{
        width: '100%', maxWidth: 380,
        background: 'var(--tm-sheet-bg)',
        borderRadius: 24,
        padding: '28px 24px 20px',
        boxShadow: '0 20px 48px rgba(0,0,0,0.32)',
        boxSizing: 'border-box',
        display: 'flex', flexDirection: 'column', gap: 18,
        maxHeight: 'calc(100dvh - 40px)',
        overflowY: 'auto',
      }}>
        {/* Skip — top right */}
        <button onClick={onSkip}
          aria-label="跳過引導"
          style={{
            position: 'absolute', top: 'calc(env(safe-area-inset-top,0px) + 28px)', right: 32,
            background: 'none', border: 'none', padding: 6,
            color: C.barkLight, fontSize: 14, cursor: 'pointer', fontFamily: FONT,
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
          跳過 <FontAwesomeIcon icon={faXmark} />
        </button>

        {/* Icon bubble */}
        <div style={{
          width: 72, height: 72, borderRadius: '50%',
          background: `${step.iconColor}22`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          alignSelf: 'center',
          marginTop: 6,
        }}>
          <FontAwesomeIcon icon={step.icon} style={{ fontSize: 32, color: step.iconColor }} />
        </div>

        {/* Title */}
        <h2 style={{ fontSize: 18, fontWeight: 900, color: C.bark, margin: 0, textAlign: 'center', lineHeight: 1.4 }}>
          {step.title}
        </h2>

        {/* Body */}
        <p style={{ fontSize: 14, color: C.barkLight, margin: 0, lineHeight: 1.7, textAlign: 'center' }}>
          {step.body}
        </p>

        {/* Progress dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 4 }}>
          {steps.map((_, i) => (
            <span key={i} style={{
              width: i === idx ? 22 : 7, height: 7, borderRadius: 4,
              background: i === idx ? C.sage : C.creamDark,
              transition: 'all 0.25s ease',
            }} />
          ))}
        </div>

        {/* Nav buttons */}
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button onClick={prev} disabled={isFirst}
            style={{
              flex: 1, padding: '12px', borderRadius: 14,
              border: `1.5px solid ${C.creamDark}`,
              background: 'var(--tm-card-bg)', color: C.barkLight,
              fontWeight: 700, fontSize: 14, fontFamily: FONT,
              cursor: isFirst ? 'default' : 'pointer',
              opacity: isFirst ? 0.4 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
            <FontAwesomeIcon icon={faAngleLeft} />上一步
          </button>
          <button onClick={next}
            style={{
              flex: 2, padding: '12px', borderRadius: 14, border: 'none',
              background: C.sage, color: 'white',
              fontWeight: 700, fontSize: 14, fontFamily: FONT, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
            {isLast ? '開始使用' : <>下一步 <FontAwesomeIcon icon={faAngleRight} /></>}
          </button>
        </div>
      </div>
    </div>
  );
}
