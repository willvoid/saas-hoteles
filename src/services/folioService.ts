import { supabase } from './supabaseClient';
import { Database } from '../types/supabase';

export type Folio = Database['public']['Tables']['folios']['Row'];
export type FolioInsert = Database['public']['Tables']['folios']['Insert'];
export type FolioUpdate = Database['public']['Tables']['folios']['Update'];

export type CargoFolio = Database['public']['Tables']['cargos_folio']['Row'];
export type CargoFolioInsert = Database['public']['Tables']['cargos_folio']['Insert'];

export type Concepto = Database['public']['Tables']['conceptos']['Row'];

// Suma (o resta, si monto es negativo) al total_acumulado de un folio.
// Usa el RPC incrementar_total_folio si existe; si no, hace el update a mano.
async function incrementarTotalFolio(fk_folio: number, monto: number) {
  const { error: folioError } = await supabase.rpc('incrementar_total_folio', {
    p_folio_id: fk_folio,
    p_monto: monto
  });

  if (folioError && folioError.message.includes('Could not find the function')) {
    const { data: folio, error: errFolio } = await supabase
      .from('folios')
      .select('total_acumulado')
      .eq('id_folio', fk_folio)
      .single();

    if (!errFolio && folio) {
      const nuevoTotal = Number(folio.total_acumulado || 0) + Number(monto);
      await supabase
        .from('folios')
        .update({ total_acumulado: nuevoTotal })
        .eq('id_folio', fk_folio);
    }
  }
}

export const folioService = {
  // Obtener todos los folios (generalmente abiertos)
  async getFolios(estado?: string) {
    let query = supabase
      .from('folios')
      .select('*, reserva:reservas(id_reserva, fk_cliente, clientes(razon_social))')
      .order('created_at', { ascending: false });

    if (estado) {
      query = query.eq('estado', estado);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  // Obtener un folio por ID con sus cargos
  async getFolioById(id_folio: number) {
    const { data, error } = await supabase
      .from('folios')
      .select(`
        *,
        reserva:reservas(*, cliente:clientes(*)),
        cargos_folio(*, concepto:conceptos(*))
      `)
      .eq('id_folio', id_folio)
      .single();

    if (error) throw error;
    return data;
  },

  // Folios cerrados de un cliente puntual, para facturarlos retroactivamente.
  // El !inner convierte el embed en INNER JOIN: sin él, el filtro sobre
  // reserva.fk_cliente no restringe las filas de nivel superior (folios).
  // Se excluyen los que ya tienen una factura EMITIDA (evita duplicar el
  // cobro); si esa factura se anula, el folio vuelve a 'abierto'
  // (facturaService.anularFactura), así que este filtro no esconde folios
  // realmente facturables.
  async getFoliosCerradosPorCliente(fk_cliente: number) {
    type FolioConFacturas = Folio & {
      facturas: { id_factura: number; estado: string }[] | null;
    };

    const { data, error } = await supabase
      .from('folios')
      .select(`
        *,
        reserva:reservas!inner(id_reserva, fk_cliente, fecha_entrada, fecha_salida),
        facturas(id_factura, estado)
      `)
      .eq('estado', 'cerrado')
      .eq('reserva.fk_cliente', fk_cliente)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return ((data || []) as unknown as FolioConFacturas[]).filter(
      (f) => !(f.facturas || []).some((fac) => fac.estado === 'EMITIDA'),
    );
  },

  // Ids de los clientes que tienen al menos un folio cerrado facturable, con
  // el mismo criterio que getFoliosCerradosPorCliente (se descartan los folios
  // ya cobrados con una factura EMITIDA). El buscador de clientes de
  // "Facturar folio existente" se limita a estos: elegir a cualquier otro sólo
  // llevaría a un selector de folios vacío.
  async getClientesConFoliosCerrados(): Promise<number[]> {
    type FolioDeCliente = {
      reserva: { fk_cliente: number } | null;
      facturas: { id_factura: number; estado: string }[] | null;
    };

    const { data, error } = await supabase
      .from('folios')
      .select(`
        id_folio,
        reserva:reservas!inner(fk_cliente),
        facturas(id_factura, estado)
      `)
      .eq('estado', 'cerrado');

    if (error) throw error;

    const ids = new Set<number>();
    for (const folio of (data || []) as unknown as FolioDeCliente[]) {
      if ((folio.facturas || []).some((f) => f.estado === 'EMITIDA')) continue;
      const cliente = folio.reserva?.fk_cliente;
      if (cliente != null) ids.add(Number(cliente));
    }
    return Array.from(ids);
  },

  // Obtener un folio activo por ID de reserva
  async getFolioByReserva(fk_reserva: number) {
    const { data, error } = await supabase
      .from('folios')
      .select('*')
      .eq('fk_reserva', fk_reserva)
      .eq('estado', 'abierto')
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  // Folio más reciente de una reserva, sin importar su estado (a diferencia
  // de getFolioByReserva, que sólo busca uno 'abierto'). Sirve para mostrar
  // un resumen del folio en la reserva incluso después del check-out.
  async getUltimoFolioByReserva(fk_reserva: number) {
    const { data, error } = await supabase
      .from('folios')
      .select('*')
      .eq('fk_reserva', fk_reserva)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  // Crear un nuevo folio (usado automáticamente al hacer check-in)
  async createFolio(folio: FolioInsert) {
    const { data, error } = await supabase
      .from('folios')
      .insert(folio)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Cerrar un folio
  async closeFolio(id_folio: number) {
    const { data, error } = await supabase
      .from('folios')
      .update({ estado: 'cerrado' })
      .eq('id_folio', id_folio)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Reabrir un folio cerrado (sólo admin/gerente, gateado además por la
  // policy RESTRICTIVE folios_reapertura_admin_gerente). Deliberadamente NO
  // toca el estado de la reserva ni el check-in/check-out: es sólo
  // administración de facturación/consumos.
  async reopenFolio(id_folio: number, fk_usuario_reapertura: number) {
    const { data, error } = await supabase
      .from('folios')
      .update({
        estado: 'abierto',
        fk_usuario_reapertura,
        reabierto_at: new Date().toISOString(),
      })
      .eq('id_folio', id_folio)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Agregar un cargo a un folio.
  //
  // Con `rechazarDuplicado` (lo que usa "Cargar Consumo") un concepto ya
  // cargado no se suma solo: se corta con un error para que el usuario decida
  // si edita el cargo existente o elige otro producto. La UI ya avisa antes de
  // llegar acá; esto lo garantiza igual si la pantalla quedó desactualizada.
  //
  // Sin esa opción, un concepto repetido no genera una fila nueva: suma la
  // cantidad y combina el monto en la fila existente, recalculando el precio
  // unitario como promedio ponderado (para no romper el invariante
  // cantidad * monto_unitario = monto_total que usa handleUpdateCargo).
  async addCargo(cargo: CargoFolioInsert, opciones?: { rechazarDuplicado?: boolean }) {
    const { data: existente, error: findError } = await supabase
      .from('cargos_folio')
      .select('*, concepto:conceptos(nombre)')
      .eq('fk_folio', cargo.fk_folio)
      .eq('fk_concepto', cargo.fk_concepto)
      .eq('estado', 'ACTIVO')
      .maybeSingle();

    if (findError) throw findError;

    if (existente && opciones?.rechazarDuplicado) {
      const nombre = (existente as any).concepto?.nombre || 'Ese producto';
      throw new Error(
        `"${nombre}" ya está cargado en este folio (cantidad ${existente.cantidad}). Editá ese cargo en vez de volver a agregarlo.`,
      );
    }

    let data;
    if (existente) {
      const cantidad = Number(existente.cantidad) + Number(cargo.cantidad);
      const monto_total = Number(existente.monto_total) + Number(cargo.monto_total);
      const monto_unitario = monto_total / cantidad;

      const { data: actualizado, error } = await supabase
        .from('cargos_folio')
        .update({ cantidad, monto_unitario, monto_total })
        .eq('id_cargo', existente.id_cargo)
        .select()
        .single();

      if (error) throw error;
      data = actualizado;
    } else {
      const { data: insertado, error } = await supabase
        .from('cargos_folio')
        .insert({ ...cargo, estado: 'ACTIVO' })
        .select()
        .single();

      if (error) throw error;
      data = insertado;
    }

    // El total_acumulado del folio crece en lo recién cargado, ya sea que
    // haya generado una fila nueva o se haya combinado con una existente.
    await incrementarTotalFolio(cargo.fk_folio, cargo.monto_total);

    return { ...data, merged: !!existente };
  },

  // Actualizar un cargo en un folio. fk_concepto es opcional: se manda cuando
  // el usuario cambia el producto del cargo (el precio unitario ya no se edita
  // a mano, se deriva del producto elegido en FolioDetail.tsx).
  async updateCargo(
    id_cargo: number,
    updatedCargo: { fk_concepto?: number; cantidad: number; monto_unitario: number; monto_total: number },
    oldMontoTotal: number,
    fk_folio: number
  ) {
    const { data, error } = await supabase
      .from('cargos_folio')
      .update(updatedCargo)
      .eq('id_cargo', id_cargo)
      .select()
      .single();

    if (error) throw error;

    // Calcular la diferencia y actualizar el total_acumulado en el folio
    const diferencia = Number(updatedCargo.monto_total) - Number(oldMontoTotal);
    if (diferencia !== 0) {
      await incrementarTotalFolio(fk_folio, diferencia);
    }

    return data;
  },

  // Eliminar lógicamente un cargo de un folio (Soft Delete)
  async deleteCargoLogic(id_cargo: number, fk_folio: number, monto_total: number) {
    const { data, error } = await supabase
      .from('cargos_folio')
      .update({ estado: 'INACTIVO' })
      .eq('id_cargo', id_cargo)
      .select()
      .single();

    if (error) throw error;

    // Restar el monto_total del total_acumulado en el folio
    const { error: folioError } = await supabase.rpc('incrementar_total_folio', {
      p_folio_id: fk_folio,
      p_monto: -Number(monto_total)
    });

    if (folioError && folioError.message.includes('Could not find the function')) {
      // Fallback manual si no hay rpc
      const { data: folio, error: errFolio } = await supabase
        .from('folios')
        .select('total_acumulado')
        .eq('id_folio', fk_folio)
        .single();

      if (!errFolio && folio) {
        const nuevoTotal = Number(folio.total_acumulado || 0) - Number(monto_total);
        await supabase
          .from('folios')
          .update({ total_acumulado: nuevoTotal })
          .eq('id_folio', fk_folio);
      }
    }

    return data;
  },

  // Obtener todos los conceptos disponibles
  async getConceptos() {
    const { data, error } = await supabase
      .from('conceptos')
      .select('*')
      .order('nombre');

    if (error) throw error;
    return data;
  },

  // Crear un nuevo concepto (producto) en la tabla existente
  async createConcepto(concepto: { nombre: string; arancel: number; descripcion?: string; fk_iva?: number; fk_unidad_medida?: number }) {
    // Para obtener valores por defecto de llaves foráneas seguras, consultamos el primer concepto existente
    const { data: existentes, error: errExistentes } = await supabase
      .from('conceptos')
      .select('fk_iva, fk_unidad_medida')
      .limit(1);

    const defaultIva = existentes && existentes.length > 0 ? existentes[0].fk_iva : 1;
    const defaultUnidad = existentes && existentes.length > 0 ? existentes[0].fk_unidad_medida : 1;

    const { data, error } = await supabase
      .from('conceptos')
      .insert({
        nombre: concepto.nombre,
        arancel: concepto.arancel,
        descripcion: concepto.descripcion || concepto.nombre,
        estado: 'ACTIVO',
        fk_iva: concepto.fk_iva || defaultIva,
        fk_unidad_medida: concepto.fk_unidad_medida || defaultUnidad
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Concepto fijo usado para el cargo automático de alojamiento (noches). Se
  // busca por nombre y se crea una única vez si todavía no existe; el arancel
  // queda en 0 porque el precio real varía por habitación/tarifa y siempre se
  // pasa explícito en cada cargo (ver ajustarCargoAlojamiento).
  async getOrCrearConceptoAlojamiento() {
    const { data: existente, error: findError } = await supabase
      .from('conceptos')
      .select('*')
      .ilike('nombre', 'Alojamiento')
      .limit(1)
      .maybeSingle();

    if (findError) throw findError;
    if (existente) return existente;

    return this.createConcepto({
      nombre: 'Alojamiento',
      arancel: 0,
      descripcion: 'Cargo automático por noches de estadía',
    });
  },

  // Mantiene sincronizado el cargo automático de "Alojamiento" de un folio
  // ante altas, bajas o ediciones de habitaciones. Todas las habitaciones de
  // la reserva comparten un único cargo de Alojamiento (mismo concepto): se
  // ajusta por diferencia (delta) en vez de rastrear un cargo por habitación,
  // porque cargos_folio no tiene una columna que lo vincule a un detalle de
  // reserva puntual.
  //
  // - Sin cargo activo todavía y delta positivo: lo crea (caso check-in o
  //   habitación agregada al primer cargo del folio).
  // - Con cargo activo: suma el delta a cantidad/monto_total y recalcula el
  //   precio unitario como promedio, preservando cantidad * monto_unitario =
  //   monto_total (el mismo invariante que respeta addCargo).
  // - Si el delta lo deja en cantidad o monto <= 0 (se fueron todas las
  //   noches que cubría), se da de baja el cargo en vez de dejarlo en cero.
  //
  // Asunción: las noches de una habitación sólo cambian si se le quita del
  // todo (no hay forma de editar las fechas de una habitación individual sin
  // tocar las fechas de la reserva completa, que son compartidas).
  async ajustarCargoAlojamiento(
    fk_folio: number,
    deltaCantidad: number,
    deltaMontoTotal: number,
    fk_usuario: number,
  ) {
    if (deltaCantidad === 0 && deltaMontoTotal === 0) return null;

    const concepto = await this.getOrCrearConceptoAlojamiento();

    const { data: existente, error: findError } = await supabase
      .from('cargos_folio')
      .select('*')
      .eq('fk_folio', fk_folio)
      .eq('fk_concepto', concepto.id_concepto)
      .eq('estado', 'ACTIVO')
      .maybeSingle();

    if (findError) throw findError;

    if (!existente) {
      if (deltaMontoTotal <= 0) return null;
      const cantidad = Math.max(1, deltaCantidad);
      return this.addCargo({
        fk_folio,
        fk_concepto: concepto.id_concepto,
        cantidad,
        monto_unitario: deltaMontoTotal / cantidad,
        monto_total: deltaMontoTotal,
        fk_usuario,
        estado: 'ACTIVO',
      });
    }

    const nuevaCantidad = Number(existente.cantidad) + deltaCantidad;
    const nuevoMontoTotal = Number(existente.monto_total) + deltaMontoTotal;

    if (nuevaCantidad <= 0 || nuevoMontoTotal <= 0) {
      return this.deleteCargoLogic(existente.id_cargo, fk_folio, Number(existente.monto_total));
    }

    const { data, error } = await supabase
      .from('cargos_folio')
      .update({
        cantidad: nuevaCantidad,
        monto_unitario: nuevoMontoTotal / nuevaCantidad,
        monto_total: nuevoMontoTotal,
      })
      .eq('id_cargo', existente.id_cargo)
      .select()
      .single();

    if (error) throw error;

    await incrementarTotalFolio(fk_folio, deltaMontoTotal);

    return data;
  },

  // Live updates de un folio puntual: el cargo automático de Alojamiento se
  // actualiza desde ReservationForm (al editar las fechas), en otra pantalla
  // y potencialmente otra sesión. Si el folio está abierto acá, debe verse el
  // monto nuevo sin que el usuario tenga que recargar la página. Mismo patrón
  // que cleanStatusService.subscribeToChanges.
  subscribeToFolioChanges: (idFolio: number, onChange: () => void): (() => void) => {
    const channel = supabase
      .channel(`folio-${idFolio}-cambios`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cargos_folio', filter: `fk_folio=eq.${idFolio}` },
        onChange,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'folios', filter: `id_folio=eq.${idFolio}` },
        onChange,
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },
};

