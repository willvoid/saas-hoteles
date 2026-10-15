import { AlertTriangle } from 'lucide-react';

interface AvisoPeriodoCerradoProps {
  /** Spanish month label, e.g. "Marzo 2026". */
  periodo: string;
}

/** Inline warning shown when the chosen date falls in a locked month. */
export function AvisoPeriodoCerrado({ periodo }: AvisoPeriodoCerradoProps) {
  return (
    <div className="fin-aviso" role="alert">
      <AlertTriangle size={16} />
      <span>
        El mes {periodo} está cerrado: no se pueden registrar movimientos con esa fecha. Elegí otra
        fecha o pedí a un administrador que reabra el mes.
      </span>
    </div>
  );
}
