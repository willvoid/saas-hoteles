import { useEffect, useState } from 'react';
import type { Tables } from '../types/supabase';
import { UsuarioService } from '../services/usuarioService';
import { CargoService } from '../services/cargoService';

interface SelectOptions {
  tiposDoc: Tables<'tipo_documento'>[];
  cargos: Tables<'cargo'>[];
  error: string | null;
}

// Loads the document-type and cargo options shared by the user forms, keeping
// the fetch orchestration out of the page components.
export function useSelectOptions(): SelectOptions {
  const [tiposDoc, setTiposDoc] = useState<Tables<'tipo_documento'>[]>([]);
  const [cargos, setCargos] = useState<Tables<'cargo'>[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const [docData, cargoData] = await Promise.all([
          UsuarioService.getTiposDocumento(),
          CargoService.getCargos(),
        ]);
        if (!mounted) return;
        setTiposDoc(docData as Tables<'tipo_documento'>[]);
        setCargos(cargoData as Tables<'cargo'>[]);
      } catch {
        if (mounted) setError('Error al cargar opciones del formulario.');
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, []);

  return { tiposDoc, cargos, error };
}
