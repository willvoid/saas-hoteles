export interface StatusStyle {
  color: string;
  bg: string;
}

export const DEFAULT_STATUS_STYLE: StatusStyle = { color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.15)' };

/** Estados válidos de la tabla estado_limpieza. 'Ocupada' es legacy: mezcla ocupación con limpieza. */
export const CLEAN_STATUS_STYLES: Record<string, StatusStyle> = {
  'Limpia': { color: '#34d399', bg: 'rgba(16, 185, 129, 0.15)' },
  'Sucia': { color: '#fb923c', bg: 'rgba(249, 115, 22, 0.15)' },
  'En Limpieza': { color: '#60a5fa', bg: 'rgba(59, 130, 246, 0.15)' },
  'Ocupada': { color: '#c084fc', bg: 'rgba(139, 92, 246, 0.15)' },
  'Bloqueada': { color: '#f87171', bg: 'rgba(239, 68, 68, 0.15)' }
};

export const OCUPADO_STYLE: StatusStyle = { color: '#c084fc', bg: 'rgba(139, 92, 246, 0.15)' };
export const DESOCUPADO_STYLE: StatusStyle = { color: '#34d399', bg: 'rgba(16, 185, 129, 0.15)' };

export const getStatusStyle = (estado: string): StatusStyle =>
  CLEAN_STATUS_STYLES[estado] || DEFAULT_STATUS_STYLE;

/** estado_limpieza puede llegar como objeto, array o null según cómo lo embeba PostgREST. */
export const getCleanStatus = (estadoLimpieza: any): string => {
  if (!estadoLimpieza) return 'Limpia';
  const el = Array.isArray(estadoLimpieza) ? estadoLimpieza[0] : estadoLimpieza;
  return el?.estado || 'Limpia';
};
