import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Bell, CheckCheck, DoorClosed } from 'lucide-react';
import { NotificacionRow } from '../services/notificacionService';

interface NotificationBellProps {
  items: NotificacionRow[];
  noLeidas: number;
  onMarcarLeida: (id: number) => void;
  onMarcarTodasLeidas: () => void;
  onVerHabitacion: () => void;
}

const PANEL_WIDTH = 340;
const PANEL_MAX_HEIGHT = 420;
const VIEWPORT_MARGIN = 8;

interface PanelPosition {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
  maxHeight: number;
}

// The bell is mounted both in the mobile topbar (top-right) and the sidebar
// footer (bottom-left), so a plain `position: absolute` anchored to the
// button clips against the viewport in one of the two spots (dropdown
// opening below a bottom-of-screen button, or overflowing past the right
// edge on narrow screens). Instead the panel is `position: fixed` and its
// coordinates are computed from the button's own bounding rect, flipping
// above/below and clamping horizontally so it always stays on-screen.
function computePanelPosition(rect: DOMRect): PanelPosition {
  const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_MARGIN;
  const spaceAbove = rect.top - VIEWPORT_MARGIN;
  const openBelow = spaceBelow >= 200 || spaceBelow >= spaceAbove;

  const maxHeight = Math.min(PANEL_MAX_HEIGHT, Math.max(200, openBelow ? spaceBelow : spaceAbove));

  const width = Math.min(PANEL_WIDTH, window.innerWidth - 2 * VIEWPORT_MARGIN);

  const left = Math.min(
    Math.max(VIEWPORT_MARGIN, rect.right - width),
    window.innerWidth - width - VIEWPORT_MARGIN
  );

  return openBelow
    ? { top: rect.bottom + VIEWPORT_MARGIN, left, width, maxHeight }
    : { bottom: window.innerHeight - rect.top + VIEWPORT_MARGIN, left, width, maxHeight };
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return 'Ahora';
  if (diffMin < 60) return `Hace ${diffMin} min`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `Hace ${diffHr} h`;
  const diffDay = Math.round(diffHr / 24);
  return `Hace ${diffDay} d`;
}

export function NotificationBell({
  items,
  noLeidas,
  onMarcarLeida,
  onMarcarTodasLeidas,
  onVerHabitacion
}: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const [panelPosition, setPanelPosition] = useState<PanelPosition | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const recomputePosition = useCallback(() => {
    if (!buttonRef.current) return;
    setPanelPosition(computePanelPosition(buttonRef.current.getBoundingClientRect()));
  }, []);

  useLayoutEffect(() => {
    if (open) recomputePosition();
  }, [open, recomputePosition]);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current && !containerRef.current.contains(target) &&
        !document.getElementById('notification-bell-panel')?.contains(target)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('resize', recomputePosition);
    window.addEventListener('scroll', recomputePosition, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('resize', recomputePosition);
      window.removeEventListener('scroll', recomputePosition, true);
    };
  }, [open, recomputePosition]);

  const handleItemClick = (n: NotificacionRow) => {
    if (!n.leida) onMarcarLeida(n.id_notificacion);
    setOpen(false);
    onVerHabitacion();
  };

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        ref={buttonRef}
        className="menu-toggle"
        onClick={() => setOpen((prev) => !prev)}
        style={{ position: 'relative' }}
        aria-label="Notificaciones"
      >
        <Bell size={20} />
        {noLeidas > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '-2px',
              right: '-2px',
              minWidth: '16px',
              height: '16px',
              padding: '0 4px',
              borderRadius: '999px',
              background: '#ef4444',
              color: '#fff',
              fontSize: '10px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1
            }}
          >
            {noLeidas > 9 ? '9+' : noLeidas}
          </span>
        )}
      </button>

      {open && panelPosition && (
        <div
          id="notification-bell-panel"
          style={{
            position: 'fixed',
            top: panelPosition.top,
            bottom: panelPosition.bottom,
            left: panelPosition.left,
            width: `${panelPosition.width}px`,
            maxHeight: `${panelPosition.maxHeight}px`,
            overflowY: 'auto',
            background: 'rgba(15, 23, 42, 0.98)',
            border: '1px solid var(--glass-border)',
            borderRadius: '14px',
            boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
            zIndex: 200
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 14px',
              borderBottom: '1px solid var(--glass-border)'
            }}
          >
            <strong style={{ fontSize: '14px', color: 'var(--text-primary)' }}>Notificaciones</strong>
            {noLeidas > 0 && (
              <button
                onClick={onMarcarTodasLeidas}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                <CheckCheck size={14} /> Marcar todas
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>
              No tenés notificaciones.
            </div>
          ) : (
            items.map((n) => (
              <button
                key={n.id_notificacion}
                onClick={() => handleItemClick(n)}
                style={{
                  display: 'flex',
                  gap: '10px',
                  width: '100%',
                  textAlign: 'left',
                  padding: '12px 14px',
                  background: n.leida ? 'transparent' : 'rgba(59, 130, 246, 0.08)',
                  border: 'none',
                  borderBottom: '1px solid var(--glass-border)',
                  cursor: 'pointer'
                }}
              >
                <DoorClosed size={16} style={{ marginTop: '2px', color: 'var(--text-secondary)', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {!n.leida && (
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#3b82f6', flexShrink: 0 }} />
                    )}
                    <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: n.leida ? 400 : 600 }}>
                      {n.titulo}
                    </span>
                  </div>
                  {n.cuerpo && (
                    <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>{n.cuerpo}</p>
                  )}
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', opacity: 0.7 }}>
                    {formatRelativeTime(n.created_at)}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
