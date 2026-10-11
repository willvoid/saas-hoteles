import { useState, useRef, useEffect } from 'react';
import { formatGs } from '../utils/currency';
import '../index.css';

interface Concepto {
  id_concepto: number;
  nombre: string;
  arancel?: number | null;
}

interface AutocompleteConceptosProps {
  conceptos: Concepto[];
  value: string | number;
  onChange: (value: string | number) => void;
  /**
   * Con un concepto ya elegido, deja el campo de sólo lectura y ofrece un botón
   * "Cambiar" para volver a buscar. Evita que al arrastrar o tipear encima se
   * altere accidentalmente el texto de una selección válida.
   */
  lockOnSelect?: boolean;
}

export default function AutocompleteConceptos({ conceptos, value, onChange, lockOnSelect = false }: AutocompleteConceptosProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Marca que el desbloqueo lo pidió el usuario, para devolverle el foco.
  const pidioCambiar = useRef(false);

  // Se bloquea sólo cuando el nombre ya se resolvió contra `conceptos`; si la
  // lista todavía no cargó, se mantiene el buscador normal en vez de mostrar
  // un campo de sólo lectura vacío.
  const bloqueado = lockOnSelect && !!value && !!searchTerm;

  // Initialize search term if value exists
  useEffect(() => {
    if (value) {
      const selectedConcepto = conceptos.find(c => c.id_concepto.toString() === value.toString());
      if (selectedConcepto) {
        setSearchTerm(`${selectedConcepto.nombre} (Ref: ${formatGs(selectedConcepto.arancel || 0)})`);
      } else {
        setSearchTerm('');
      }
    } else {
      setSearchTerm('');
    }
  }, [value, conceptos]);

  // Handle outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [wrapperRef]);

  const filteredConceptos = conceptos.filter(c => {
    if (!searchTerm) return true;
    const searchLow = searchTerm.toLowerCase();
    return c.nombre.toLowerCase().includes(searchLow);
  });

  const handleSelect = (concepto: Concepto) => {
    setSearchTerm(`${concepto.nombre} (Ref: ${formatGs(concepto.arancel || 0)})`);
    onChange(concepto.id_concepto);
    setIsOpen(false);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setIsOpen(true);
    // Reset selection if they type
    onChange('');
  };

  // Al pedir "Cambiar" se limpia la selección; el foco vuelve al buscador
  // recién cuando el componente ya se re-renderizó desbloqueado.
  const handleCambiar = () => {
    pidioCambiar.current = true;
    onChange('');
  };

  useEffect(() => {
    if (!bloqueado && pidioCambiar.current) {
      pidioCambiar.current = false;
      inputRef.current?.focus();
      setIsOpen(true);
    }
  }, [bloqueado]);

  if (bloqueado) {
    return (
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', width: '100%' }}>
        <input
          type="text"
          className="input-field"
          value={searchTerm}
          readOnly
          title={searchTerm}
          style={{ flex: 1, cursor: 'default' }}
        />
        <button
          type="button"
          className="btn-ghost"
          onClick={handleCambiar}
          style={{ whiteSpace: 'nowrap' }}
        >
          Cambiar
        </button>
      </div>
    );
  }

  return (
    <div ref={wrapperRef} style={{ position: 'relative', width: '100%' }}>
      <input
        ref={inputRef}
        type="text"
        className="input-field"
        placeholder="Buscar concepto..."
        value={searchTerm}
        onChange={handleChange}
        onFocus={() => setIsOpen(true)}
      />
      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          backgroundColor: 'rgb(30, 41, 59)', /* slate-800 from index.css colors */
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '8px',
          marginTop: '4px',
          maxHeight: '200px',
          overflowY: 'auto',
          zIndex: 50,
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)'
        }}>
          {filteredConceptos.length > 0 ? (
            filteredConceptos.map(concepto => (
              <div
                key={concepto.id_concepto}
                onClick={() => handleSelect(concepto)}
                style={{
                  padding: '10px 16px',
                  cursor: 'pointer',
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                  color: '#f8fafc'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.15)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                {concepto.nombre} <span style={{ color: '#94a3b8', fontSize: '0.9em' }}>({formatGs(concepto.arancel || 0)})</span>
              </div>
            ))
          ) : (
            <div style={{ padding: '10px 16px', color: '#94a3b8', fontStyle: 'italic' }}>
              No se encontraron conceptos...
            </div>
          )}
        </div>
      )}
    </div>
  );
}
