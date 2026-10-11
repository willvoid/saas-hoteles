import { ReservationService } from './reservationService';
import { folioService } from './folioService';
import { calculateNights } from '../utils/pricing';
import { calcularAjusteAlojamiento } from '../utils/alojamiento';

export interface ResultadoSincronizacion {
  nochesAnteriores: number;
  nochesNuevas: number;
  /** Habitaciones cuyo subtotal se movió. */
  habitacionesAjustadas: number;
  /** Diferencia de dinero aplicada al alojamiento. */
  deltaMonto: number;
  /** Total estimado de la reserva ya recalculado. */
  totalEstimado: number;
  /** True si además se ajustó el cargo de Alojamiento de un folio abierto. */
  folioAjustado: boolean;
}

export const alojamientoService = {
  /**
   * Reacomoda el alojamiento después de mover las fechas de una reserva.
   *
   * Las fechas son de la reserva completa, así que el cambio arrastra a todas
   * sus habitaciones: se recalcula el subtotal de cada una, el total estimado
   * de la reserva y —si la estadía ya arrancó y hay un folio abierto— el cargo
   * automático de "Alojamiento", para que la cuenta del huésped refleje las
   * noches que realmente va a pagar.
   *
   * El ajuste del folio va último y a propósito: si fallara, las habitaciones
   * ya quedaron con el subtotal correcto y el error se puede reintentar sin
   * duplicar nada.
   */
  async sincronizarPorCambioDeFechas(params: {
    reservationId: number;
    fechaEntradaAnterior: string;
    fechaSalidaAnterior: string;
    fechaEntradaNueva: string;
    fechaSalidaNueva: string;
    fkUsuario: number;
  }): Promise<ResultadoSincronizacion> {
    const nochesAnteriores = calculateNights(
      params.fechaEntradaAnterior,
      params.fechaSalidaAnterior,
    );
    const nochesNuevas = calculateNights(params.fechaEntradaNueva, params.fechaSalidaNueva);

    const detalles = await ReservationService.getDetalleReserva(params.reservationId);
    const ajuste = calcularAjusteAlojamiento(detalles, nochesAnteriores, nochesNuevas);

    for (const cambio of ajuste.cambios) {
      await ReservationService.updateDetalleReserva(cambio.id_detalle, {
        subtotal: cambio.subtotal,
      });
    }

    await ReservationService.updateReservation(params.reservationId, {
      total_estimado: ajuste.totalEstimado,
    });

    // Sólo hay folio (y por lo tanto cargo de alojamiento que mover) después
    // del check-in. Antes de eso, alcanza con haber dejado bien los subtotales.
    let folioAjustado = false;
    if (ajuste.deltaCantidad !== 0 || ajuste.deltaMonto !== 0) {
      const folio = await folioService.getFolioByReserva(params.reservationId);
      if (folio) {
        await folioService.ajustarCargoAlojamiento(
          folio.id_folio,
          ajuste.deltaCantidad,
          ajuste.deltaMonto,
          params.fkUsuario,
        );
        folioAjustado = true;
      }
    }

    return {
      nochesAnteriores,
      nochesNuevas,
      habitacionesAjustadas: ajuste.cambios.length,
      deltaMonto: ajuste.deltaMonto,
      totalEstimado: ajuste.totalEstimado,
      folioAjustado,
    };
  },
};
