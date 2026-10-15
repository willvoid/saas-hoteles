import { useCallback, useEffect, useState } from 'react';
import { finanzasService } from '../services/finanzasService';
import type { CategoriaFinanzas, CuentaFondo, Proveedor } from '../types/finanzas';

interface FinanzasCatalogos {
  proveedores: Proveedor[];
  categorias: CategoriaFinanzas[];
  fondos: CuentaFondo[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

// Loads the catalogs every finance form needs (suppliers, categories, funds),
// inactive ones included so historical rows can still show their names; forms
// filter on `activo` themselves.
export function useFinanzasCatalogos(): FinanzasCatalogos {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [categorias, setCategorias] = useState<CategoriaFinanzas[]>([]);
  const [fondos, setFondos] = useState<CuentaFondo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      finanzasService.getProveedores(),
      finanzasService.getCategorias(),
      finanzasService.getFondos(),
    ])
      .then(([p, c, f]) => {
        if (cancelled) return;
        setProveedores(p);
        setCategorias(c);
        setFondos(f);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'No se pudieron cargar los catálogos.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const refetch = useCallback(() => setAttempt((n) => n + 1), []);

  return { proveedores, categorias, fondos, loading, error, refetch };
}
