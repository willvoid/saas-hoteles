import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Supabase URL and Key must be provided in the .env file.');
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // sessionStorage en vez del localStorage por default: localStorage es
    // compartido por todas las pestañas del mismo origen, así que loguearse
    // como otro usuario en una segunda pestaña pisaba la sesión de la
    // primera (y forzaba un re-login al refrescar). sessionStorage aísla la
    // sesión por pestaña y sigue sobreviviendo un refresh (F5) normal.
    storage: window.sessionStorage,
  },
});
