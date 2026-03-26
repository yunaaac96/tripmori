import { C, FONT } from '../../App';

export default function LoadingScreen() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: C.cream,
      backgroundImage: 'radial-gradient(circle, #C8C0AD 1px, transparent 1px)',
      backgroundSize: '18px 18px',
      fontFamily: FONT,
    }}>
      <div style={{ fontSize: 48, marginBottom: 16, animation: 'spin 2s linear infinite' }}>🍃</div>
      <p style={{ fontWeight: 700, color: C.sage, fontSize: 16 }}>同步資料中...</p>
      <p style={{ fontSize: 12, color: C.barkLight, marginTop: 4 }}>TripMori 旅行手帳</p>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
