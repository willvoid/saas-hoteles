import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, LogOut, Plus } from 'lucide-react';
import { listMyHotels, switchHotel } from '../services/hotelService';
import type { SessionUser } from '../services/authService';
import type { HotelResumen } from '../types/hotel';
import { describirEstadoHotel, puedeEntrarAlHotel } from '../utils/hotel';
import HotelCreateForm from './HotelCreateForm';
import '../index.css';

interface HotelSelectProps {
  // Profile in the active hotel (null when none resolved, e.g. it is suspended).
  user: SessionUser | null;
  // Reloads the session after the active hotel changed.
  onEntered: () => Promise<void>;
  onLogout: () => void;
}

export default function HotelSelect({ user, onEntered, onLogout }: HotelSelectProps) {
  const navigate = useNavigate();
  const [hotels, setHotels] = useState<HotelResumen[] | null>(null);
  const [enteringId, setEnteringId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let activo = true;
    listMyHotels()
      .then((rows) => {
        if (activo) setHotels(rows);
      })
      .catch(() => {
        if (activo) {
          setHotels([]);
          setError('No se pudieron cargar tus hoteles. Recarga la página.');
        }
      });
    return () => {
      activo = false;
    };
  }, []);

  const enter = async () => {
    await onEntered();
    navigate('/administracion');
  };

  const handleSelect = async (hotel: HotelResumen) => {
    if (enteringId !== null || !puedeEntrarAlHotel(hotel)) return;
    setError(null);

    // Already the active hotel and its profile is loaded: nothing to switch.
    if (hotel.es_activo && user?.tenant.id === hotel.tenant_id) {
      navigate('/administracion');
      return;
    }

    setEnteringId(hotel.tenant_id);
    try {
      await switchHotel(hotel.tenant_id);
      await enter();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo entrar al hotel.');
      setEnteringId(null);
    }
  };

  if (hotels === null) {
    return (
      <div className="auth-page-wrapper" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <div className="loader"></div>
      </div>
    );
  }

  return (
    <div className="hotel-select-page">
      <div className="hotel-select-inner">
        <div className="hotel-select-header">
          <div>
            <h1 className="hotel-select-title">Hoteles</h1>
            <p className="hotel-select-subtitle">
              {hotels.length > 0
                ? 'Crea un hotel o selecciona con cuál deseas trabajar.'
                : 'Tu cuenta no tiene hoteles activos. Contacta al administrador.'}
            </p>
          </div>
          <button type="button" className="btn-ghost" onClick={onLogout}>
            <LogOut size={16} style={{ marginRight: '8px', verticalAlign: 'text-bottom' }} />
            Cerrar sesión
          </button>
        </div>

        {error && <div className="status-message status-error" style={{ marginBottom: '24px' }}>{error}</div>}

        <div className="hotel-grid">
          {hotels.length > 0 && (
            <button
              type="button"
              className="hotel-card hotel-card--add"
              onClick={() => setShowCreate(true)}
              disabled={enteringId !== null}
            >
              <Plus size={44} />
              <span>Agregar un nuevo hotel</span>
            </button>
          )}

          {hotels.map((hotel) => {
            const estado = describirEstadoHotel(hotel);
            const habilitado = puedeEntrarAlHotel(hotel);
            return (
              <button
                key={hotel.tenant_id}
                type="button"
                className={`hotel-card${hotel.es_activo ? ' hotel-card--active' : ''}`}
                onClick={() => handleSelect(hotel)}
                disabled={!habilitado || enteringId !== null}
                aria-busy={enteringId === hotel.tenant_id}
              >
                <div className="hotel-card-icon">
                  <Building2 size={22} />
                </div>
                <h2 className="hotel-card-name">{hotel.nombre}</h2>
                <span className="hotel-card-meta">
                  {enteringId === hotel.tenant_id ? 'Entrando...' : hotel.cargo}
                </span>
                <div className="hotel-card-footer">
                  <span className={`hotel-badge hotel-badge--${estado.tono}`}>{estado.texto}</span>
                  {hotel.es_activo && <span className="hotel-badge hotel-badge--info">Activo ahora</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {showCreate && (
        <HotelCreateForm
          user={user}
          onCancel={() => setShowCreate(false)}
          onCreated={enter}
        />
      )}
    </div>
  );
}
