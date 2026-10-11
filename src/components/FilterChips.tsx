import React from 'react';

export interface ChipOption<T> {
  value: T;
  label: string;
}

interface FilterChipsProps<T extends string | number> {
  options: ChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
  icon?: React.ReactNode;
}

export function FilterChips<T extends string | number>({ options, value, onChange, icon }: FilterChipsProps<T>) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', minWidth: 0 }}>
      {icon && <span style={{ color: 'var(--text-secondary)', flexShrink: 0, display: 'flex' }}>{icon}</span>}
      <div className="filter-chips">
        {options.map(opt => (
          <button
            key={opt.value}
            className={`chip-btn ${value === opt.value ? 'active' : ''}`}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
