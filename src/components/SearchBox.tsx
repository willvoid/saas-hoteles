import { Search } from 'lucide-react';

interface SearchBoxProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxWidth?: number;
}

export function SearchBox({ value, onChange, placeholder = 'Buscar...', maxWidth = 300 }: SearchBoxProps) {
  return (
    <div className="search-box" style={{ maxWidth: `${maxWidth}px` }}>
      <Search size={18} style={{ color: 'var(--text-secondary)' }} />
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="search-input"
      />
    </div>
  );
}
