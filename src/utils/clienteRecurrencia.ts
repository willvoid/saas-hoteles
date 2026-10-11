/**
 * Funciones puras para determinar la recurrencia y conteo de reservas de un cliente.
 */

export interface ClienteConReservas {
  id_cliente?: number;
  razon_social?: string;
  documento?: string;
  total_reservas?: number;
  reservas_count?: number;
  es_recurrente?: boolean;
  reservas?: Array<{ id_reserva?: number; count?: number } | any>;
  [key: string]: any;
}

/**
 * Obtiene la cantidad de reservas registradas para un cliente.
 */
export function getReservationCount(client: ClienteConReservas | null | undefined): number {
  if (!client) return 0;

  if (typeof client.total_reservas === 'number') {
    return client.total_reservas;
  }

  if (typeof client.reservas_count === 'number') {
    return client.reservas_count;
  }

  if (Array.isArray(client.reservas)) {
    if (client.reservas.length > 0 && typeof client.reservas[0]?.count === 'number') {
      return client.reservas[0].count;
    }
    return client.reservas.length;
  }

  if (typeof client.es_recurrente === 'boolean') {
    return client.es_recurrente ? 2 : 1;
  }

  return 0;
}

/**
 * Determina si un cliente es recurrente.
 * Se considera recurrente si tiene 2 o más reservas registradas.
 */
export function isClienteRecurrente(client: ClienteConReservas | null | undefined): boolean {
  if (!client) return false;
  if (typeof client.es_recurrente === 'boolean') return client.es_recurrente;
  return getReservationCount(client) >= 2;
}
