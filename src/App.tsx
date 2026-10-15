import { useState, useEffect, useCallback } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import LandingPage from './pages/LandingPage';
import Home from './pages/Home';
import TenantSuspended from './pages/TenantSuspended';
import HotelSelect from './pages/HotelSelect';
import { getCurrentSession, onAuthStateChange, signOut, resolveSession } from './services/authService';
import type { SessionUser } from './services/authService';
import type { TenantInfo } from './services/tenantService';
import { UsuarioService } from './services/usuarioService';
import './index.css';

const esInactivo = (estado?: string | null) =>
  (estado || 'Activo').trim().toLowerCase() === 'inactivo';

const MENSAJE_DESACTIVADO =
  'Tu cuenta fue desactivada por un administrador. Contactá al administrador si creés que es un error.';

function App() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [suspendedTenant, setSuspendedTenant] = useState<TenantInfo | null>(null);
  // A signed-in account may have no resolvable hotel yet (it is choosing one).
  const [hasSession, setHasSession] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const applySession = useCallback(async (session: Session | null) => {
    if (!session?.user) {
      setHasSession(false);
      setUser(null);
      setSuspendedTenant(null);
      return;
    }

    setHasSession(true);
    try {
      const result = await resolveSession(session.user.id);
      setUser(result.status === 'ok' ? result.user : null);
      setSuspendedTenant(result.status === 'suspended' ? result.tenant : null);
    } catch {
      setUser(null);
      setSuspendedTenant(null);
    }
  }, []);

  // Reloads the profile after the active hotel changed (switch or create).
  const reloadSession = useCallback(async () => {
    await applySession(await getCurrentSession());
  }, [applySession]);

  useEffect(() => {
    // The profile is awaited before dropping the loader: otherwise a reload on
    // /administracion would redirect to /login while `user` is still null.
    getCurrentSession().then(async (session) => {
      await applySession(session);
      setLoading(false);
    });

    // Deferred with setTimeout to avoid the auth callback lock when calling
    // other supabase methods from inside onAuthStateChange.
    const { data: sub } = onAuthStateChange((_event, session) => {
      setTimeout(() => applySession(session), 0);
    });

    return () => sub.subscription.unsubscribe();
  }, [applySession]);

  // Desactivación en caliente: si un admin marca la cuenta como Inactiva, la
  // sesión abierta se cierra al instante (evento realtime) en vez de esperar al
  // próximo login. Al volver a la pestaña se revalida por si el evento se
  // perdió con la app en segundo plano.
  useEffect(() => {
    const idUsuario = user?.id_usuario;
    if (!idUsuario) return;

    let cerrado = false;
    const cerrarSesion = async () => {
      if (cerrado) return;
      cerrado = true;
      await signOut();
      setUser(null);
      setHasSession(false);
      navigate('/login', { replace: true, state: { mensaje: MENSAJE_DESACTIVADO } });
    };

    const unsubscribe = UsuarioService.subscribeEstado(idUsuario, (estado) => {
      if (esInactivo(estado)) cerrarSesion();
    });

    const revalidar = () => {
      if (document.visibilityState !== 'visible') return;
      UsuarioService.getEstado(idUsuario)
        .then((estado) => {
          if (esInactivo(estado)) cerrarSesion();
        })
        .catch(() => {/* sin conexión: se reintenta en el próximo foco */});
    };
    document.addEventListener('visibilitychange', revalidar);

    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', revalidar);
    };
  }, [user?.id_usuario, navigate]);

  const handleLogout = async () => {
    await signOut();
    setUser(null);
    setSuspendedTenant(null);
    setHasSession(false);
    navigate('/login');
  };

  if (loading) {
    return (
      <div className="auth-page-wrapper" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <div className="loader"></div>
      </div>
    );
  }

  const goToHotels = () => navigate('/hoteles');

  return (
    <Routes>
      <Route path="/" element={<Home isSignedIn={hasSession} />} />
      <Route path="/h/:slug" element={<LandingPage />} />
      <Route
        path="/login"
        element={<Login setUser={setUser} setSuspendedTenant={setSuspendedTenant} setHasSession={setHasSession} />}
      />
      <Route path="/recuperar-clave" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route
        path="/hoteles"
        element={
          hasSession ? (
            <HotelSelect user={user} onEntered={reloadSession} onLogout={handleLogout} />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/administracion"
        element={
          user ? (
            // key: a different hotel starts from a clean dashboard (tabs, drafts, subscriptions).
            <Dashboard key={user.tenant.id} user={user} onLogout={handleLogout} onSwitchHotel={goToHotels} />
          ) : suspendedTenant ? (
            <TenantSuspended tenant={suspendedTenant} onLogout={handleLogout} onSwitchHotel={goToHotels} />
          ) : hasSession ? (
            <Navigate to="/hoteles" replace />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
    </Routes>
  );
}

export default App;
