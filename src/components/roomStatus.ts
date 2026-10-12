import { COLORS, tint, type TintName } from '../constants/colors';

export interface StatusStyle {
  color: string;
  bg: string;
}

/** Text color + translucent background (15% of the base color) for a status badge. */
const statusStyle = (color: string, base: TintName): StatusStyle => ({ color, bg: tint(base, 0.15) });

export const DEFAULT_STATUS_STYLE: StatusStyle = statusStyle(COLORS.textSecondary, 'textSecondary');

/** Estados válidos de la tabla estado_limpieza. 'Ocupada' es legacy: mezcla ocupación con limpieza. */
export const CLEAN_STATUS_STYLES: Record<string, StatusStyle> = {
  'Limpia': statusStyle(COLORS.successLight, 'success'),
  'Sucia': statusStyle(COLORS.orangeLight, 'orange'),
  'En Limpieza': statusStyle(COLORS.primaryLight, 'primary'),
  'Ocupada': statusStyle(COLORS.purpleLighter, 'purple'),
  'Bloqueada': statusStyle(COLORS.errorLight, 'error')
};

export const OCUPADO_STYLE: StatusStyle = statusStyle(COLORS.purpleLighter, 'purple');
export const DESOCUPADO_STYLE: StatusStyle = statusStyle(COLORS.successLight, 'success');

export const getStatusStyle = (estado: string): StatusStyle =>
  CLEAN_STATUS_STYLES[estado] || DEFAULT_STATUS_STYLE;

/** estado_limpieza puede llegar como objeto, array o null según cómo lo embeba PostgREST. */
export const getCleanStatus = (estadoLimpieza: any): string => {
  if (!estadoLimpieza) return 'Limpia';
  const el = Array.isArray(estadoLimpieza) ? estadoLimpieza[0] : estadoLimpieza;
  return el?.estado || 'Limpia';
};
