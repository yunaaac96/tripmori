/**
 * SplashScreen — 啟動等待畫面
 * 顯示 TripMori LOGO + 品牌名稱 + 載入動畫
 */

const FONT = "'M PLUS Rounded 1c', 'Noto Sans TC', sans-serif";

export default function SplashScreen() {
  return (
    <>
      <style>{`
        @keyframes tm-logo-pop {
          0%   { opacity: 0; transform: scale(0.72) translateY(12px); }
          60%  { opacity: 1; transform: scale(1.04) translateY(-2px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes tm-fade-up {
          0%   { opacity: 0; transform: translateY(14px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes tm-dot-bounce {
          0%, 80%, 100% { transform: translateY(0);   opacity: 0.4; }
          40%            { transform: translateY(-7px); opacity: 1;   }
        }
        .tm-splash-logo {
          animation: tm-logo-pop 1.1s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
        .tm-splash-title {
          animation: tm-fade-up 0.75s ease both;
          animation-delay: 0.75s;
        }
        .tm-splash-sub {
          animation: tm-fade-up 0.75s ease both;
          animation-delay: 1.1s;
        }
        .tm-splash-dots {
          animation: tm-fade-up 0.6s ease both;
          animation-delay: 1.45s;
        }
        .tm-dot {
          display: inline-block;
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #8FAF7E;
          animation: tm-dot-bounce 1.6s infinite ease-in-out;
        }
        .tm-dot:nth-child(1) { animation-delay: 0s; }
        .tm-dot:nth-child(2) { animation-delay: 0.25s; }
        .tm-dot:nth-child(3) { animation-delay: 0.5s; }

        @media (prefers-color-scheme: dark) {
          .tm-splash-root { background: #141C12 !important; }
          .tm-splash-title-text { color: #D6CEBC !important; }
          .tm-splash-sub-text   { color: #7A9070 !important; }
          .tm-dot { background: #6A8F5C !important; }
        }
      `}</style>

      <div
        className="tm-splash-root"
        style={{
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#F7F4EB',
          fontFamily: FONT,
          userSelect: 'none',
          gap: 0,
          padding: '0 24px',
          boxSizing: 'border-box',
        }}
      >
        {/* LOGO */}
        <div className="tm-splash-logo" style={{ marginBottom: 28 }}>
          <img
            src="/icons/icon-512-light.png"
            alt="TripMori"
            style={{
              width: 120,
              height: 120,
              borderRadius: 32,
              boxShadow: '0 8px 32px rgba(107,92,78,0.18), 0 2px 8px rgba(107,92,78,0.12)',
              display: 'block',
            }}
          />
        </div>

        {/* App name */}
        <p
          className="tm-splash-title"
          style={{
            margin: 0,
            opacity: 0, /* initial for animation */
          }}
        >
          <span
            className="tm-splash-title-text"
            style={{
              fontSize: 30,
              fontWeight: 900,
              color: '#6B5C4E',
              letterSpacing: 2,
              display: 'block',
              textAlign: 'center',
            }}
          >
            TripMori
          </span>
        </p>

        {/* Tagline */}
        <p
          className="tm-splash-sub"
          style={{
            margin: '6px 0 0',
            opacity: 0,
          }}
        >
          <span
            className="tm-splash-sub-text"
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: '#8FAF7E',
              letterSpacing: 3,
              display: 'block',
              textAlign: 'center',
            }}
          >
            旅　行　手　帳
          </span>
        </p>

        {/* Loading dots */}
        <div
          className="tm-splash-dots"
          style={{
            marginTop: 48,
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            opacity: 0,
          }}
        >
          <span className="tm-dot" />
          <span className="tm-dot" />
          <span className="tm-dot" />
        </div>
      </div>
    </>
  );
}
