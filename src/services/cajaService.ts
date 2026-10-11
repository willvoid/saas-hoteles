import { supabase } from './supabaseClient';
import type { Turno, Caja } from '../types/factura';

// Código de Postgres para violación de índice/constraint único.
const PG_UNIQUE_VIOLATION = '23505';

export interface CajaConEstado extends Caja {
  /** true si esa caja ya tiene un turno abierto (de cualquier usuario). */
  turnoAbierto: boolean;
}

export interface TurnoAbierto {
  id_turno: number;
  /** Quién lo abrió — se compara contra el usuario logueado para no listar
   *  el propio turno acá (ese ya lo maneja CajaTurno arriba). */
  fk_usuario: number;
  usuario: string;
  caja: string;
  apertura: string;
  monto_inicial: number;
}

// Servicio de caja: apertura y cierre de turno. Toda factura exige un turno
// abierto (facturas.fk_turno es NOT NULL), así que esto es prerrequisito de la
// facturación.
export const cajaService = {
  // Turno abierto del usuario (cierre IS NULL). Null si no tiene ninguno.
  async getTurnoActivo(fk_usuario: number): Promise<Turno | null> {
    const { data, error } = await supabase
      .from('apertura_cierre_caja')
      .select('*, caja(nro_caja, descripcion_caja)')
      .eq('fk_usuario', fk_usuario)
      .is('cierre', null)
      .order('apertura', { ascending: false })
      .maybeSingle();

    if (error) throw error;
    return data as Turno | null;
  },

  // Cajas para elegir al abrir un turno, marcando cuáles ya tienen un turno
  // abierto (de cualquier usuario, no sólo el logueado) para que el
  // formulario las excluya. Es sólo conveniencia de UI — quien de verdad
  // impide dos turnos simultáneos en la misma caja es el índice único
  // parcial de la migración 20260802000000, así que aunque esta lista quede
  // desactualizada por una apertura concurrente, `abrirTurno` no lo permite.
  async getCajasConEstado(): Promise<CajaConEstado[]> {
    const [{ data: cajas, error: cajasError }, { data: turnosAbiertos, error: turnosError }] = await Promise.all([
      supabase.from('caja').select('*').order('nro_caja'),
      supabase.from('apertura_cierre_caja').select('fk_caja').is('cierre', null),
    ]);

    if (cajasError) throw cajasError;
    if (turnosError) throw turnosError;

    const ocupadas = new Set((turnosAbiertos ?? []).map((t) => t.fk_caja));
    return (cajas ?? []).map((c) => ({ ...c, turnoAbierto: ocupadas.has(c.id_caja) }));
  },

  // Abre un turno. monto_final es NOT NULL en el esquema, así que se guarda un
  // placeholder 0 que se actualiza al cerrar.
  async abrirTurno(params: {
    fk_caja: number;
    fk_usuario: number;
    monto_inicial: number;
  }): Promise<Turno> {
    const { data, error } = await supabase
      .from('apertura_cierre_caja')
      .insert({
        fk_caja: params.fk_caja,
        fk_usuario: params.fk_usuario,
        monto_inicial: params.monto_inicial,
        monto_final: 0,
      })
      .select()
      .single();

    if (error) {
      // 23505 = choca con el índice único parcial (turno_abierto_unico_por_caja):
      // otra sesión abrió un turno en esta misma caja entre que se cargó el
      // formulario y se envió. Mensaje entendible en vez del genérico de Postgres.
      if (error.code === PG_UNIQUE_VIOLATION) {
        throw new Error('Esta caja ya tiene un turno abierto. Elegí otra o esperá a que se cierre.');
      }
      throw error;
    }
    return data;
  },

  // Turnos abiertos de OTROS usuarios (no incluye `fk_usuarioActual`), para
  // que un admin/gerente pueda cerrar el de alguien que se fue, renunció, o
  // se olvidó — sin esto esa caja queda bloqueada por el índice único de
  // 20260802000000 hasta que su dueño vuelva a loguearse.
  async getTurnosAbiertos(fk_usuarioActual: number): Promise<TurnoAbierto[]> {
    const { data, error } = await supabase
      .from('apertura_cierre_caja')
      // `usuario!apertura_cierre_caja_fk_usuario_fkey` desambigua el embed:
      // desde que existe `fk_usuario_cierre` (también FK a `usuario`),
      // PostgREST tiene dos caminos posibles hacia `usuario` y rechaza
      // adivinar. Este apunta puntualmente a quién ABRIÓ el turno.
      .select('id_turno, fk_usuario, apertura, monto_inicial, usuario!apertura_cierre_caja_fk_usuario_fkey(nombre), caja(nro_caja, descripcion_caja)')
      .is('cierre', null)
      .neq('fk_usuario', fk_usuarioActual)
      .order('apertura', { ascending: true });

    if (error) throw error;

    return (data ?? []).map((t) => {
      const usuario = unwrapEmbed(t.usuario);
      const caja = unwrapEmbed(t.caja);
      return {
        id_turno: t.id_turno,
        fk_usuario: t.fk_usuario,
        usuario: usuario?.nombre ?? 'Desconocido',
        caja: caja?.descripcion_caja || `Caja #${caja?.nro_caja ?? '?'}`,
        apertura: t.apertura,
        monto_inicial: Number(t.monto_inicial) || 0,
      };
    });
  },

  // Cierra el turno: registra la hora de cierre y el monto final contado.
  // `fk_usuario_cierre` es quién hace el cierre AHORA — igual a `fk_usuario`
  // en un cierre normal, distinto cuando un admin/gerente cierra el turno de
  // otro (la policy RESTRICTIVE de la migración 20260803000000 es la que de
  // verdad lo exige; esto sólo completa el dato para el reporte de turnos).
  async cerrarTurno(id_turno: number, monto_final: number, fk_usuario_cierre: number): Promise<Turno> {
    const { data, error } = await supabase
      .from('apertura_cierre_caja')
      .update({ cierre: new Date().toISOString(), monto_final, fk_usuario_cierre })
      .eq('id_turno', id_turno)
      .select()
      .single();

    if (error) throw error;
    return data;
  },
};

interface EmbedRow {
  nombre?: string;
  nro_caja?: number | null;
  descripcion_caja?: string | null;
}

/** PostgREST devuelve el embed como objeto o como array de un elemento según
 *  la cardinalidad que infiera. Misma varianza que maneja el resto del
 *  proyecto (ver reservaBlockingState.ts, reporteService.ts). */
function unwrapEmbed<T extends EmbedRow>(value: T | T[] | null): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}
