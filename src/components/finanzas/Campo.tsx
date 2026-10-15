import type { ReactNode } from 'react';

interface CampoProps {
  label: string;
  htmlFor?: string;
  error?: string;
  /** Extra class on the group, e.g. `span-2` inside a `form-grid`. */
  className?: string;
  children: ReactNode;
}

/** Label + control + inline error, built on the shared `input-group` styles. */
export function Campo({ label, htmlFor, error, className = '', children }: CampoProps) {
  return (
    <div className={`input-group ${className}`.trim()}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}

interface CampoMontoProps {
  id: string;
  label: string;
  value: string;
  onChange: (valor: string) => void;
  error?: string;
  disabled?: boolean;
  className?: string;
}

/** Whole-guaraní amount field. `type="text"` with a digit filter: a numeric
 *  input would let "+", "-", "." and "," through. */
export function CampoMonto({ id, label, value, onChange, error, disabled, className }: CampoMontoProps) {
  return (
    <Campo label={label} htmlFor={id} error={error} className={className}>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        className={`input-field ${error ? 'input-error' : ''}`}
        value={value}
        disabled={disabled}
        placeholder="0"
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
      />
    </Campo>
  );
}
