import type { ReactNode } from 'react';
import { FONT } from '../../App';

interface Props {
  title: string;
  subtitle?: string;
  subtitleAction?: ReactNode;
  emoji?: ReactNode;
  color: string;
  children?: ReactNode;
}

export default function PageHeader({ title, subtitle, subtitleAction, emoji, color, children }: Props) {
  return (
    <div style={{
      background: color,
      padding: '52px 16px 20px',
      borderRadius: '0 0 28px 28px',
      boxShadow: '0 4px 16px rgba(107,92,78,0.14)',
      fontFamily: FONT,
    }}>
      <h1 style={{ fontSize: 22, fontWeight: 900, color: 'white', margin: 0 }}>
        {emoji && <span style={{ marginRight: 8 }}>{emoji}</span>}{title}
      </h1>
      {(subtitle || subtitleAction) && (
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', margin: '4px 0 0', display: 'flex', alignItems: 'center', gap: 6 }}>
          {subtitle}{subtitleAction}
        </p>
      )}
      {children}
    </div>
  );
}
