import { supabase } from './supabaseClient';
import { readFunctionError } from '../utils/functionError';
import type { HotelResumen } from '../types/hotel';
import type { CreateHotelPayload } from '../utils/hotel';

// Hotels (tenants) the signed-in account belongs to. The active hotel is the
// `app_metadata.tenant_id` claim of the JWT, which only the server writes, so
// changing it goes through Edge Functions and then a session refresh.

export async function listMyHotels(): Promise<HotelResumen[]> {
  const { data, error } = await supabase.rpc('fn_mis_hoteles');
  if (error) throw error;
  return data ?? [];
}

// Runs an Edge Function that changes the active hotel, then refreshes the
// session so the next token carries the new claim.
async function invokeAndRefresh<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw new Error(await readFunctionError(error));
  if (data?.error) throw new Error(data.error);

  const { error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError) {
    throw new Error('Se cambió de hotel pero no se pudo actualizar la sesión. Volvé a iniciar sesión.');
  }
  return data as T;
}

export async function switchHotel(tenantId: number): Promise<void> {
  await invokeAndRefresh('switch-hotel', { tenant_id: tenantId });
}

// Creates a hotel owned by the caller. The new hotel becomes the active one.
export async function createHotel(payload: CreateHotelPayload): Promise<number> {
  const result = await invokeAndRefresh<{ tenant_id: number }>('create-hotel', payload);
  return result.tenant_id;
}
