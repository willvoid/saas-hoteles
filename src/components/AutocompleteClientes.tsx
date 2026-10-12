import { useState, useRef, useEffect } from 'react';
import { ClienteRecurrenteBadge } from './ClienteRecurrenteBadge';
import { isClienteRecurrente, getReservationCount, ClienteConReservas } from '../utils/clienteRecurrencia';
import '../index.css';
import { COLORS, tint } from '../constants/colors';

interface Client extends ClienteConReservas {
  id_cliente: number;
  razon_social: string;
  documento?: string;
}

interface AutocompleteClientesProps {
  clients: Client[];
  value: string | number;
  onChange: (value: string | number) => void;
  /**
   * Con un cliente ya elegido, deja el campo de sólo lectura y ofrece un botón
   * "Cambiar" para volver a buscar. Evita que al arrastrar o tipear encima se
   * altere accidentalmente el texto de una selección válida.
   */
  lockOnSelect?: boolean;
}

export default function AutocompleteClientes({ clients, value, onChange, lockOnSelect = false }: AutocompleteClientesProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Marca que el desbloqueo lo pidió el usuario, para devolverle el foco.
  const pidioCambiar = useRef(false);

  // Cliente seleccionado actual
  const selectedClient = clients.find(c => c.id_cliente.toString() === value?.toString());

  // Se bloquea sólo cuando el nombre ya se resolvió contra `clients`; si la
  // lista todavía no cargó, se mantiene el buscador normal en vez de mostrar
  // un campo de sólo lectura vacío.
  const bloqueado = lockOnSelect && !!value && !!searchTerm;

  // Initialize search term if value exists
  useEffect(() => {
    if (value) {
      const client = clients.find(c => c.id_cliente.toString() === value.toString());
      if (client) {
        setSearchTerm(`${client.razon_social} ${client.documento ? `(${client.documento})` : ''}`);
      } else {
        setSearchTerm('');
      }
    } else {
      setSearchTerm('');
    }
  }, [value, clients]);

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

  const filteredClients = clients.filter(c => {
    if (!searchTerm) return true;
    const searchLow = searchTerm.toLowerCase();
    const nameMatch = (c.razon_social || '').toLowerCase().includes(searchLow);
    const docMatch = c.documento ? c.documento.toLowerCase().includes(searchLow) : false;
    const isRec = isClienteRecurrente(c);
    const recMatch = (isRec ? 'recurrente' : 'no recurrente').includes(searchLow);
    return nameMatch || docMatch || recMatch;
  });

  const handleSelect = (client: Client) => {
    setSearchTerm(`${client.razon_social} ${client.documento ? `(${client.documento})` : ''}`);
    onChange(client.id_cliente);
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
        <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
          <input
            type="text"
            className="input-field"
            value={searchTerm}
            readOnly
            title={searchTerm}
            style={{ 
              width: '100%', 
              cursor: 'default',
              paddingRight: selectedClient ? '140px' : undefined 
            }}
          />
          {selectedClient && (
            <div style={{ position: 'absolute', right: '10px', pointerEvents: 'none' }}>
              <ClienteRecurrenteBadge 
                isRecurrente={isClienteRecurrente(selectedClient)} 
                count={getReservationCount(selectedClient)} 
                size="sm" 
              />
            </div>
          )}
        </div>
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
        placeholder="Buscar cliente por nombre o documento..."
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
          backgroundColor: COLORS.bgEnd,
          border: `1px solid ${COLORS.glassBorder}`,
          borderRadius: '8px',
          marginTop: '4px',
          maxHeight: '220px',
          overflowY: 'auto',
          zIndex: 50,
          boxShadow: `0 10px 15px -3px ${tint('black', 0.5)}`
        }}>
          {filteredClients.length > 0 ? (
            filteredClients.map(client => (
              <div
                key={client.id_cliente}
                onClick={() => handleSelect(client)}
                style={{
                  padding: '10px 16px',
                  cursor: 'pointer',
                  borderBottom: `1px solid ${COLORS.glassBg}`,
                  color: COLORS.textPrimary,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = tint('primary', 0.15))}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', minWidth: 0 }}>
                  <span style={{ fontWeight: 500 }}>{client.razon_social}</span>
                  <ClienteRecurrenteBadge 
                    isRecurrente={isClienteRecurrente(client)} 
                    count={getReservationCount(client)} 
                    size="sm" 
                  />
                </div>
                {client.documento && (
                  <span style={{ color: COLORS.textSecondary, fontSize: '0.85em', flexShrink: 0 }}>
                    ({client.documento})
                  </span>
                )}
              </div>
            ))
          ) : (
            <div style={{ padding: '10px 16px', color: COLORS.textSecondary, fontStyle: 'italic' }}>
              No se encontraron clientes...
            </div>
          )}
        </div>
      )}
    </div>
  );
}
