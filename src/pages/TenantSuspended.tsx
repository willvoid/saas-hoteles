import type { TenantInfo } from '../services/tenantService';
import '../index.css';

interface TenantSuspendedProps {
  tenant: TenantInfo;
  onLogout: () => void;
}

export default function TenantSuspended({ tenant, onLogout }: TenantSuspendedProps) {
  return (
    <div className="auth-page-wrapper">
      <div className="login-container">
        <div className="login-header">
          <h2 className="login-title">{tenant.nombre}</h2>
        </div>
        <div className="status-message status-error">
          La cuenta de este hotel está suspendida. Contactá al soporte.
        </div>
        <button type="button" className="login-btn" onClick={onLogout} style={{ marginTop: '16px' }}>
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
