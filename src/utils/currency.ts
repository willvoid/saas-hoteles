/**
 * Formateo de moneda para el módulo de facturación. El proyecto no tenía un
 * formateador compartido (se mezclaban 'Gs.' y '$'); acá se centraliza en
 * guaraníes, que es la moneda operativa.
 *
 * Módulo puro (sin React/Supabase) para poder testearlo en entorno node.
 */

/** Formatea un monto en guaraníes: 150000 → "Gs. 150.000". */
export function formatGs(value: number | null | undefined): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return 'Gs. 0';
  // El guaraní no usa decimales; se redondea y se agrupa con punto (es-PY).
  return `Gs. ${Math.round(n).toLocaleString('es-PY')}`;
}
