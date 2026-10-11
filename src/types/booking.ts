export interface BookingHuesped {
  nombre_completo: string;
  documento: string;
  fk_tipo_documento: number;
  nacionalidad: string;
  es_titular: boolean;
}

export interface BookingDetalle {
  fk_tipo_habitacion: number;
  fk_tarifa: number;
  cantidad_adultos: number;
  cantidad_ninos: number;
  precio_unitario: number;
  subtotal: number;
  huespedes: BookingHuesped[];
}

export interface BookingCliente {
  razon_social: string;
  nombre_fantasia?: string;
  documento: string;
  telefono: string;
  celular?: string;
  direccion?: string;
  es_proveedor_del_estado?: boolean;
  email: string;
  nro_casa?: number;
  fk_tipo_operacion?: number;
  fk_tipo_documento?: number;
  fk_barrios?: number;
  fk_tipo_contribuyente?: number;
}

export interface BookingPayload {
  fecha_entrada: string;
  fecha_salida: string;
  origen: string;
  observaciones: string;
  cliente: BookingCliente;
  detalles: BookingDetalle[];
}

export interface LandingTipoHabitacion {
  id: number;
  nombre: string;
  descripcion: string | null;
  capacidad: number;
  imagen_url: string | null;
}

export interface LandingTarifa {
  id: number;
  nombre: string;
  precio_base: number;
  estado: string;
  fk_tipo_habitacion: number;
  fecha_inicio: string;
  fecha_fin: string | null;
}

export interface LandingCatalogo {
  tipos_habitacion: LandingTipoHabitacion[];
  tarifas: LandingTarifa[];
  habitaciones: { id: number; fk_tipo_habitacion: number }[];
  tipos_documento: { cod_tipodoc: number; descripcion_tipodoc: string }[];
}

export interface LandingReservaResult {
  id_reserva: number;
  codigo_reserva: string;
  total_estimado: number;
}
