import React from 'react';
import { StatusStyle } from '../utils/roomStatus';

interface StatusBadgeProps {
  label: string;
  style: StatusStyle;
  dot?: boolean;
  size?: 'sm' | 'md';
}

export function StatusBadge({ label, style, dot = true, size = 'md' }: StatusBadgeProps) {
  return (
    <span
      className="status-badge"
      style={{
        '--badge-color': style.color,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        ...(size === 'sm' ? { padding: '3px 10px', fontSize: '11px' } : {})
      } as React.CSSProperties}
    >
      {dot && (
        <span style={{
          width: size === 'sm' ? 6 : 7,
          height: size === 'sm' ? 6 : 7,
          borderRadius: '50%',
          background: style.color,
          flexShrink: 0
        }} />
      )}
      {label}
    </span>
  );
}
