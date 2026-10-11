import { useEffect, useState } from 'react';
import { EstablecimientoService } from '../services/establecimientoService';
import EstablecimientoForm from './EstablecimientoForm';
import '../index.css';

interface ManageEstablecimientosProps {
  onBack: () => void;
}

export default function ManageEstablecimientos({ onBack }: ManageEstablecimientosProps) {
  const [establecimiento, setEstablecimiento] = useState<any | null>(null);
  const [empresa, setEmpresa] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [establecimientos, empresas] = await Promise.all([
        EstablecimientoService.getEstablecimientos(),
        EstablecimientoService.getEmpresas()
      ]);
      setEstablecimiento(establecimientos[0] || null);
      setEmpresa(empresas[0] || null);
    } catch (err: any) {
      setError(err.message || 'Error al cargar el establecimiento.');
    } finally {
      setLoading(false);
    }
  };

  const handleFormSaved = () => {
    fetchData();
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
        <div className="loader"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="status-message status-error" style={{ margin: '20px' }}>
        {error}
      </div>
    );
  }

  return (
    <EstablecimientoForm
      onCancel={onBack}
      onSaved={handleFormSaved}
      establecimientoToEdit={establecimiento}
      empresa={empresa}
    />
  );
}
