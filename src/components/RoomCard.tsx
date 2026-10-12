import React, { ReactNode, KeyboardEvent } from 'react';
import { Sparkles, Layers, Users, FileText, Image as ImageIcon } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import {
  getStatusStyle,
  CLEAN_STATUS_STYLES,
  DEFAULT_STATUS_STYLE,
  StatusStyle
} from '../utils/roomStatus';

export interface RoomCardData {
  id: number;
  numero_habitacion: number;
  descripcion: string | null;
  fk_piso: number;
  /** Consumed by callers that resolve a tarifa from the selected room. */
  fk_tipo_habitacion: number;
  tipo_habitacion?: { nombre?: string; capacidad?: number } | null;
  pisos?: { numero?: number } | null;
  imagenes_habitacion?: { id: number; ruta_storage: string; es_principal: boolean }[];
  estadoLimpieza: string;
}

export interface RoomCardProps {
  room: RoomCardData;
  /** Caller owns the wording: "ocupado now" and "ocupada for these dates"
   *  are different claims. */
  occupancyLabel: string;
  occupancyStyle: StatusStyle;
  /** Footer slot. Omitted -> no .room-card-actions block. */
  actions?: ReactNode;
  selectable?: boolean;
  selected?: boolean;
  disabled?: boolean;
  onSelect?: (room: RoomCardData) => void;
}

export function RoomCard({
  room,
  occupancyLabel,
  occupancyStyle,
  actions,
  selectable = false,
  selected = false,
  disabled = false,
  onSelect
}: RoomCardProps) {
  // 'Ocupada' es un valor legacy dentro de estado_limpieza: mezcla ocupación con
  // limpieza, y la ocupación ya tiene su propio badge. No es un estado de limpieza.
  const esLimpiezaValida = room.estadoLimpieza !== 'Ocupada' && !!CLEAN_STATUS_STYLES[room.estadoLimpieza];
  const cleanLabel = esLimpiezaValida ? room.estadoLimpieza : 'Sin dato';
  const cleanStyle = esLimpiezaValida ? getStatusStyle(room.estadoLimpieza) : DEFAULT_STATUS_STYLE;

  const principal = room.imagenes_habitacion?.find(i => i.es_principal) || room.imagenes_habitacion?.[0];
  const piso = room.pisos?.numero ?? room.fk_piso;

  const handleClick = () => {
    if (selectable && !disabled && onSelect) onSelect(room);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!selectable || disabled || !onSelect) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(room);
    }
  };

  const classNames = [
    'room-card',
    selectable && selected ? 'is-selected' : '',
    selectable && disabled ? 'is-disabled' : ''
  ].filter(Boolean).join(' ');

  return (
    <div
      className={classNames}
      style={{ '--status-glow-color': occupancyStyle.bg } as React.CSSProperties}
      role={selectable ? 'button' : undefined}
      tabIndex={selectable ? (disabled ? -1 : 0) : undefined}
      aria-pressed={selectable ? selected : undefined}
      onClick={selectable ? handleClick : undefined}
      onKeyDown={selectable ? handleKeyDown : undefined}
    >
      <div className="room-card-glow" />

      <div className="room-card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
          {principal ? (
            <img
              src={principal.ruta_storage}
              alt={`Habitación ${room.numero_habitacion}`}
              className="room-card-thumb"
            />
          ) : (
            <div className="room-card-thumb-empty">
              <ImageIcon size={18} />
            </div>
          )}
          <div style={{ minWidth: 0 }}>
            <span className="room-number-badge">Habitación #{room.numero_habitacion}</span>
            <div className="room-type">{room.tipo_habitacion?.nombre || 'Sin Tipo'}</div>
          </div>
        </div>
        <StatusBadge label={occupancyLabel} style={occupancyStyle} />
      </div>

      <div className="room-card-body">
        <div className="info-row">
          <Sparkles size={14} />
          <span>Limpieza:</span>
          <StatusBadge label={cleanLabel} style={cleanStyle} size="sm" />
        </div>

        <div className="info-row">
          <Layers size={14} />
          <span>Piso: <span className="info-value">{piso ?? '-'}</span></span>
        </div>

        <div className="info-row">
          <Users size={14} />
          <span>Capacidad: <span className="info-value">{room.tipo_habitacion?.capacidad ?? '-'}</span></span>
        </div>

        {room.descripcion && (
          <div className="info-row" style={{ alignItems: 'flex-start' }}>
            <FileText size={14} style={{ marginTop: '2px' }} />
            <span className="room-card-desc">{room.descripcion}</span>
          </div>
        )}
      </div>

      {actions && (
        <div className="room-card-actions">
          {actions}
        </div>
      )}
    </div>
  );
}
