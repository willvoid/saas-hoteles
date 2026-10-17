import { useCallback, useEffect, useState } from 'react';
import {
  createTenant,
  getTenant,
  listTenants,
  setTenantEstado,
  setTenantPlan,
} from '../services/superadminService';
import type {
  CreateTenantInput,
  CreateTenantResult,
  SetPlanInput,
  TenantDetail,
  TenantEstado,
  TenantSummary,
} from '../services/superadminService';
import { isManageable } from '../utils/tenantFilters';

export interface ActionFeedback {
  ok: boolean;
  message: string;
}

export const toErrorMessage = (err: unknown, fallback: string): string =>
  err instanceof Error && err.message ? err.message : fallback;

// Runs one mutation and turns the outcome into user feedback. The template
// tenant is refused here too, so no caller can reach it by mistake.
export async function runTenantAction(
  tenant: { plan: string },
  action: () => Promise<unknown>,
  successMessage: string,
): Promise<ActionFeedback> {
  if (!isManageable(tenant)) {
    return { ok: false, message: 'El hotel plantilla no se puede modificar.' };
  }
  try {
    await action();
    return { ok: true, message: successMessage };
  } catch (err) {
    return { ok: false, message: toErrorMessage(err, 'No se pudo completar la operación.') };
  }
}

export function useTenantsList() {
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listTenants()
      .then((rows) => {
        if (!cancelled) setTenants(rows);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(toErrorMessage(err, 'No se pudieron cargar los hoteles.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const refetch = useCallback(() => setAttempt((n) => n + 1), []);
  return { tenants, loading, error, refetch };
}

export function useTenantDetail(tenantId: number | null) {
  const [detail, setDetail] = useState<TenantDetail | null>(null);
  const [loading, setLoading] = useState(tenantId !== null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (tenantId === null) {
      setDetail(null);
      setLoading(false);
      setError('Hotel no válido.');
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getTenant(tenantId)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(toErrorMessage(err, 'No se pudo cargar el hotel.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId, attempt]);

  const refetch = useCallback(() => setAttempt((n) => n + 1), []);

  const mutate = useCallback(
    async (action: () => Promise<unknown>, successMessage: string): Promise<boolean> => {
      if (!detail || busy) return false;
      setBusy(true);
      setFeedback(null);
      const result = await runTenantAction(detail.tenant, action, successMessage);
      setFeedback(result);
      setBusy(false);
      if (result.ok) refetch();
      return result.ok;
    },
    [detail, busy, refetch],
  );

  const changeEstado = useCallback(
    (estado: TenantEstado) =>
      mutate(
        () => setTenantEstado(detail!.tenant.id, estado),
        estado === 'suspendido' ? 'El hotel fue suspendido.' : 'El hotel fue reactivado.',
      ),
    [mutate, detail],
  );

  const changePlan = useCallback(
    (input: SetPlanInput) =>
      mutate(() => setTenantPlan(detail!.tenant.id, input), 'El plan fue actualizado.'),
    [mutate, detail],
  );

  const clearFeedback = useCallback(() => setFeedback(null), []);

  return { detail, loading, error, busy, feedback, refetch, changeEstado, changePlan, clearFeedback };
}

export function useCreateTenant() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(async (input: CreateTenantInput): Promise<CreateTenantResult | null> => {
    setSubmitting(true);
    setError(null);
    try {
      return await createTenant(input);
    } catch (err) {
      setError(toErrorMessage(err, 'No se pudo crear el hotel.'));
      return null;
    } finally {
      setSubmitting(false);
    }
  }, []);

  return { submitting, error, create };
}
