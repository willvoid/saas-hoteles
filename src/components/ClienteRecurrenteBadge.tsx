import React from 'react';
import { RotateCw, User } from 'lucide-react';
import { COLORS, tint } from '../constants/colors';

interface ClienteRecurrenteBadgeProps {
  isRecurrente: boolean;
  count?: number;
  showCount?: boolean;
  size?: 'sm' | 'md';
  className?: string;
  style?: React.CSSProperties;
}

export function ClienteRecurrenteBadge({
  isRecurrente,
  count,
  showCount = false,
  size = 'sm',
  className = '',
  style = {}
}: ClienteRecurrenteBadgeProps) {
  const isSm = size === 'sm';

  const badgeStyle: React.CSSProperties = isRecurrente
    ? {
        backgroundColor: tint('success', 0.14),
        color: COLORS.success,
        border: `1px solid ${tint('success', 0.35)}`,
        boxShadow: `0 0 10px ${tint('success', 0.1)}`,
      }
    : {
        backgroundColor: tint('textSecondary', 0.12),
        color: COLORS.textSecondary,
        border: `1px solid ${tint('textSecondary', 0.25)}`,
      };

  const displayText = isRecurrente
    ? showCount && typeof count === 'number' && count > 1
      ? `Recurrente (${count})`
      : 'Recurrente'
    : showCount && typeof count === 'number' && count === 1
      ? 'No recurrente (1)'
      : 'No recurrente';

  return (
    <span
      className={`cliente-recurrente-badge ${className}`}
      title={
        typeof count === 'number'
          ? `${isRecurrente ? 'Cliente Recurrente' : 'Cliente No Recurrente'}: ${count} ${count === 1 ? 'reserva' : 'reservas'} registradas`
          : isRecurrente ? 'Cliente Recurrente' : 'Cliente No Recurrente'
      }
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: isSm ? '4px' : '6px',
        padding: isSm ? '2px 8px' : '4px 12px',
        borderRadius: '20px',
        fontSize: isSm ? '11px' : '12px',
        fontWeight: '600',
        letterSpacing: '0.01em',
        lineHeight: 1.2,
        verticalAlign: 'middle',
        whiteSpace: 'nowrap',
        userSelect: 'none',
        transition: 'all 0.2s ease',
        ...badgeStyle,
        ...style
      }}
    >
      {isRecurrente ? (
        <RotateCw size={isSm ? 10 : 12} style={{ flexShrink: 0, strokeWidth: 2.4 }} />
      ) : (
        <User size={isSm ? 10 : 12} style={{ flexShrink: 0, strokeWidth: 2.2, opacity: 0.85 }} />
      )}
      <span>{displayText}</span>
    </span>
  );
}

export default ClienteRecurrenteBadge;
