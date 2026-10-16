import { useEffect, useState } from 'react';
import { EstablecimientoService } from '../services/establecimientoService';
import { useConfigHorarios } from '../hooks/useConfigHorarios';
import { ConfigHorariosForm } from '../components/ConfigHorariosForm';
import { ModuleLayout } from '../components/ModuleLayout';
import EstablecimientoForm from './EstablecimientoForm';
import '../index.css';

interface ManageEstablecimientosProps {
  onBack: () => void;
  /**
   * Whether the user may edit "Horarios y recargos". The module itself is only
   * reachable by admin/gerente and the database enforces it too, so it defaults
   * to true; pass false to render the settings read-only.
   */
  canEditHorarios?: boolean;
}

type Vista = 'datos' | 'horarios';

export default function ManageEstablecimientos({ onBack, canEditHorarios = true }: ManageEstablecimientosProps) {
  const [establecimiento, setEstablecimiento] = useState<any | null>(null);
  const [empresa, setEmpresa] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista>('datos');

  const horarios = useConfigHorarios(establecimiento?.id_establecimiento ?? null);

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

  // Hours and surcharges hang off an existing establishment.
  const puedeVerHorarios = !!establecimiento;

  const selectorDeVista = puedeVerHorarios ? (
    <div className="tabs-bar" style={{ marginBottom: '16px' }}>
      <button className={`tab-btn ${vista === 'datos' ? 'active' : ''}`} onClick={() => setVista('datos')}>
        Datos del establecimiento
      </button>
      <button className={`tab-btn ${vista === 'horarios' ? 'active' : ''}`} onClick={() => setVista('horarios')}>
        Horarios y recargos
      </button>
    </div>
  ) : null;

  if (vista === 'horarios' && puedeVerHorarios) {
    return (
      <>
        {selectorDeVista}
        <ModuleLayout
          title="Horarios y recargos"
          description={`Check-in, check-out y recargos por salida tardía o ingreso anticipado de "${establecimiento.denominacion}"`}
          actions={
            <button onClick={onBack} className="login-btn" style={{ width: 'auto', padding: '10px 20px', backgroundColor: 'transparent', border: '1px solid var(--glass-border)' }}>
              Volver
            </button>
          }
        >
          {horarios.loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
              <div className="loader"></div>
            </div>
          ) : (
            <ConfigHorariosForm
              config={horarios.config}
              canEdit={canEditHorarios}
              saving={horarios.saving}
              dirty={horarios.dirty}
              error={horarios.error}
              success={horarios.success}
              onChange={horarios.actualizar}
              onSave={horarios.guardar}
            />
          )}
        </ModuleLayout>
      </>
    );
  }

  return (
    <>
      {selectorDeVista}
      <EstablecimientoForm
        onCancel={onBack}
        onSaved={handleFormSaved}
        establecimientoToEdit={establecimiento}
        empresa={empresa}
      />
    </>
  );
}
