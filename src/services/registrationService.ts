import { supabase } from './supabaseClient';
import { readFunctionError } from '../utils/functionError';

// Body of the public `register-tenant` Edge Function. Optional fields are sent
// as null when empty.
export interface RegisterTenantInput {
  email: string;
  password: string;
  turnstileToken: string;
  hotel: { nombre: string; slug: string };
  admin: { nombre: string; documento: string; fk_tipo_doc: number; telefono: string | null };
  empresa: {
    ruc: string;
    razon_social: string;
    nombre_fantasia: string | null;
    fk_contribuyente: number;
    fk_regimen: number;
  };
  establecimiento: {
    direccion: string;
    fk_barrio: number;
    denominacion: string | null;
    numero_casa: string | null;
    complemento_direccion_1: string | null;
    complemento_direccion_2: string | null;
    telefono: string | null;
    email: string | null;
  };
}

// Creates the account and its hotel (30-day trial). The user must then confirm
// the email before signing in.
export async function registerTenant(input: RegisterTenantInput): Promise<void> {
  const { data, error } = await supabase.functions.invoke('register-tenant', { body: input });
  if (error) {
    throw new Error(await readFunctionError(error, 'No se pudo crear la cuenta. Intentá de nuevo.'));
  }
  if (data?.error) throw new Error(data.error);
}
