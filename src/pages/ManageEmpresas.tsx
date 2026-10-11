import { useEffect, useState } from 'react';
import { EmpresaService } from '../services/empresaService';
import EmpresaForm from './EmpresaForm';
import '../index.css';

interface ManageEmpresasProps {
  onBack: () => void;
}

export default function ManageEmpresas({ onBack }: ManageEmpresasProps) {
  const [empresa, setEmpresa] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchEmpresa();
  }, []);

  const fetchEmpresa = async () => {
    try {
      setLoading(true);
      const data = await EmpresaService.getEmpresas();
      setEmpresa(data[0] || null);
    } catch (err: any) {
      setError(err.message || 'Error al cargar la empresa.');
    } finally {
      setLoading(false);
    }
  };

  const handleFormSaved = () => {
    fetchEmpresa();
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
    <EmpresaForm
      onCancel={onBack}
      onSaved={handleFormSaved}
      empresaToEdit={empresa}
    />
  );
}
