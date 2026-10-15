import { useCallback, useEffect, useState } from 'react';
import { getPublicPlans } from '../services/planService';
import type { PublicPlan } from '../utils/plans';

interface PublicPlansState {
  plans: PublicPlan[];
  loading: boolean;
  error: string | null;
  retry: () => void;
}

export function usePublicPlans(): PublicPlansState {
  const [plans, setPlans] = useState<PublicPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getPublicPlans()
      .then((data) => {
        if (!cancelled) setPlans(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'No se pudieron cargar los planes.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { plans, loading, error, retry };
}
