import { useEffect, useState } from 'react';
import { dashboardService } from '../services/dashboardService';
import type { HomeStats, OcupacionDia } from '../services/dashboardService';

/** Loads the home dashboard figures while the home tab is active. */
export function useHomeStats(activo: boolean) {
  const [homeStats, setHomeStats] = useState<HomeStats | null>(null);
  const [ocupacionSemana, setOcupacionSemana] = useState<OcupacionDia[] | null>(null);

  useEffect(() => {
    if (!activo) return;
    dashboardService.getHomeStats()
      .then(setHomeStats)
      .catch((err) => console.error('Error cargando estadísticas de Home:', err));
    dashboardService.getOcupacionUltimos7Dias()
      .then(setOcupacionSemana)
      .catch((err) => console.error('Error cargando ocupación semanal:', err));
  }, [activo]);

  return { homeStats, ocupacionSemana };
}
