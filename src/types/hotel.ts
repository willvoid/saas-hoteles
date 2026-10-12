// One row of fn_mis_hoteles(): a hotel (tenant) the account has an active
// profile in. `es_activo` marks the hotel the current JWT points at.
export interface HotelResumen {
  tenant_id: number;
  nombre: string;
  slug: string;
  estado: string;
  trial_fin: string | null;
  id_usuario: number;
  cargo: string;
  es_activo: boolean;
}
