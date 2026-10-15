import { Campo } from './Campo';

interface RangoFechasProps {
  desde: string;
  hasta: string;
  onChange: (rango: { desde: string; hasta: string }) => void;
}

/** From/to date inputs for the list filters (ISO 'YYYY-MM-DD' strings). */
export function RangoFechas({ desde, hasta, onChange }: RangoFechasProps) {
  return (
    <>
      <Campo label="Desde" htmlFor="fin-desde">
        <input
          id="fin-desde"
          type="date"
          className="input-field"
          value={desde}
          max={hasta || undefined}
          onChange={(e) => onChange({ desde: e.target.value, hasta })}
        />
      </Campo>
      <Campo label="Hasta" htmlFor="fin-hasta">
        <input
          id="fin-hasta"
          type="date"
          className="input-field"
          value={hasta}
          min={desde || undefined}
          onChange={(e) => onChange({ desde, hasta: e.target.value })}
        />
      </Campo>
    </>
  );
}
