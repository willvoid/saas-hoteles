import { useCallback, useEffect, useState } from 'react';
import { horarioService } from '../services/horarioService';
import {
  DEFAULT_CONFIG_HORARIOS,
  validarConfigHorarios,
  type ConfigHorarios,
} from '../utils/recargoHorario';

/**
 * Loads and edits the hours / surcharge settings of one establishment.
 * Without an establishment (not created yet) nothing is loaded and saving is a no-op.
 */
export function useConfigHorarios(fkEstablecimiento: number | null) {
  const [config, setConfig] = useState<ConfigHorarios>(DEFAULT_CONFIG_HORARIOS);
  const [existe, setExiste] = useState(false);
  const [dirty, setDirty] = useState(false);
  // Establishment whose settings are loaded (or failed to load): while it
  // differs from the requested one, the hook is loading.
  const [cargadoPara, setCargadoPara] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loading = fkEstablecimiento !== null && cargadoPara !== fkEstablecimiento;

  useEffect(() => {
    if (fkEstablecimiento === null) return;
    let cancelled = false;
    horarioService
      .getConfig(fkEstablecimiento)
      .then(({ existe: hay, ...cfg }) => {
        if (cancelled) return;
        setConfig(cfg);
        setExiste(hay);
        setDirty(false);
        setError(null);
        setCargadoPara(fkEstablecimiento);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'No se pudo cargar la configuración de horarios.');
        setCargadoPara(fkEstablecimiento);
      });
    return () => {
      cancelled = true;
    };
  }, [fkEstablecimiento]);

  const actualizar = useCallback((patch: Partial<ConfigHorarios>) => {
    setConfig((prev) => ({ ...prev, ...patch }));
    setDirty(true);
    setSuccess(null);
    setError(null);
  }, []);

  const guardar = async (): Promise<boolean> => {
    if (fkEstablecimiento === null) return false;
    const invalido = validarConfigHorarios(config);
    if (invalido) {
      setError(invalido);
      return false;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await horarioService.guardarConfig(fkEstablecimiento, config);
      setExiste(true);
      setDirty(false);
      setSuccess('Horarios y recargos guardados.');
      return true;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la configuración de horarios.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  return { config, existe, dirty, loading, saving, error, success, actualizar, guardar };
}
