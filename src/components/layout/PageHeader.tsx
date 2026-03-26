import { FONT } from '../../App';

interface Props {
  title: string;
  subtitle?: string;
  emoji?: string;
  color: string;
  children?: React.ReactNode;
}

export default function PageHeader({ title, subtitle, emoji, color, children }: Props) {
  return (
    <div style={{
      background: color,
      padding: '52px 20px 20px',
      borderRadius: '0 0 28px 28px',
      boxShadow: '0 4px 16px rgba(107,92,78,0.14)',
      fontFamily: FONT,
    }}>
      <h1 style={{ fontSize: 22, fontWeight: 900, color: 'white', margin: 0 }}>
        {emoji && <span style={{ marginRight: 8 }}>{emoji}</span>}{title}
      </h1>
      {subtitle && <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', margin: '4px 0 0' }}>{subtitle}</p>}
      {children}
    </div>
  );
}
