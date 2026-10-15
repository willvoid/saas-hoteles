import { supabase } from './supabaseClient';

// Public (anon) catalogs of the sign-up wizard. Ids are the ones
// fn_provision_tenant expects (see the register-tenant body).

export interface CatalogDescription {
  id: number;
  descripcion: string;
}

export interface CatalogName {
  id: number;
  nombre: string;
}

export interface RegistrationCatalogs {
  tipos_documento: CatalogDescription[];
  contribuyentes: CatalogDescription[];
  regimenes: CatalogDescription[];
  departamentos: CatalogName[];
}

// Geographic chain below a department. The barrio id is `fk_barrio`.
export type UbicacionNivel = 'distritos' | 'ciudades' | 'barrios';

const LOAD_ERROR = 'No se pudieron cargar las opciones del formulario. Intentá de nuevo.';

export async function getRegistrationCatalogs(): Promise<RegistrationCatalogs> {
  const { data, error } = await supabase.rpc('fn_catalogos_registro');
  if (error || !data) throw new Error(LOAD_ERROR);
  const c = data as Partial<RegistrationCatalogs>;
  return {
    tipos_documento: c.tipos_documento ?? [],
    contribuyentes: c.contribuyentes ?? [],
    regimenes: c.regimenes ?? [],
    departamentos: c.departamentos ?? [],
  };
}

// Children of a geographic node: districts of a department, cities of a
// district, neighborhoods of a city.
export async function getUbicaciones(nivel: UbicacionNivel, padre: number): Promise<CatalogName[]> {
  const { data, error } = await supabase.rpc('fn_ubicaciones_registro', {
    p_nivel: nivel,
    p_padre: padre,
  });
  if (error) throw new Error(LOAD_ERROR);
  return (data ?? []) as CatalogName[];
}
