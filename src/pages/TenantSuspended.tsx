import type { TenantInfo } from '../services/tenantService';
import '../index.css';

interface TenantSuspendedProps {
  tenant: TenantInfo;
  onLogout: () => void;
  // Lets an account with other hotels pick one of them.
  onSwitchHotel?: () => void;
}

export default function TenantSuspended({ tenant, onLogout, onSwitchHotel }: TenantSuspendedProps) {
  return (
    <div className="auth-page-wrapper">
      <div className="login-container">
        <div className="login-header">
          <h2 className="login-title">{tenant.nombre}</h2>
        </div>
        <div className="status-message status-error">
          La cuenta de este hotel está suspendida. Contactá al soporte.
        </div>
        {onSwitchHotel && (
          <button type="button" className="login-btn" onClick={onSwitchHotel} style={{ marginTop: '16px' }}>
            Cambiar de hotel
          </button>
        )}
        <button type="button" className="login-btn" onClick={onLogout} style={{ marginTop: '16px' }}>
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
