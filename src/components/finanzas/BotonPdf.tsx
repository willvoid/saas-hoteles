import { Download } from 'lucide-react';

interface BotonPdfProps {
  onClick: () => void;
  disabled?: boolean;
  etiqueta?: string;
}

/** "Descargar PDF" action of a report. Presentational only. */
export function BotonPdf({ onClick, disabled, etiqueta = 'Descargar PDF' }: BotonPdfProps) {
  return (
    <button type="button" className="btn-ghost" onClick={onClick} disabled={disabled}>
      <Download size={15} /> {etiqueta}
    </button>
  );
}
