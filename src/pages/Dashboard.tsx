import React, { useEffect, useRef, useState } from 'react';
import {
  Building2,
  Users,
  CalendarDays,
  LogOut,
  Menu,
  X,
  TrendingUp,
  CalendarPlus,
  UserPlus,
  FileText,
  Sparkles,
  UserCog,
  Receipt,
  Wallet,
  DoorClosed,
  Store,
  Building,
  Package,
  BarChart3,
  ArrowLeftRight,
  Landmark
} from 'lucide-react';
import ManageClients from './ManageClients';
import ManageReservations from './ManageReservations';
import ManageHabitaciones from './ManageHabitaciones';
import ManageTipoHabitacion from './ManageTipoHabitacion';
import ManageTarifas from './ManageTarifas';
import ReservationForm from './ReservationForm';
import type { ReservaBorrador } from './ReservationForm';
import type { HabitacionBorrador } from './HabitacionForm';
import type { TarifaBorrador } from './TarifaForm';
import ReservationDetail from './ReservationDetail';
import ManageFolios from './ManageFolios';
import FolioDetail from './FolioDetail';
import type { BorradorConsumo } from '../components/ConsumosFolioModal';
import CajaTurno from './CajaTurno';
import ManageFacturas from './ManageFacturas';
import FacturaForm from './FacturaForm';
import FacturaDetail from './FacturaDetail';
import CleanStatus from './CleanStatus';
import ManageUsuarios from './ManageUsuarios';
import ManageEstablecimientos from './ManageEstablecimientos';
import ManageEmpresas from './ManageEmpresas';
import ManageEdificios from './ManageEdificios';
import ManagePisos from './ManagePisos';
import ManageProductos from './ManageProductos';
import ManageReportes from './ManageReportes';
import Finanzas from './Finanzas';
import Footer from '../components/Footer';
import QuickActions from '../components/QuickActions';
import { Modal } from '../components/Modal';
import { NotificationBell } from '../components/NotificationBell';
import { useNotificaciones } from '../hooks/useNotificaciones';
import { cajaService } from '../services/cajaService';
import { dashboardService, HomeStats, OcupacionDia } from '../services/dashboardService';
import OccupancyChart from '../components/OccupancyChart';
import { formatGs } from '../utils/currency';
import { validarMontoTurno, validarTipeoMontoTurno } from '../utils/montoTurno';
import type { Turno } from '../types/factura';
import { TabId, normalizeRole, canAccessTab, canAssignCleaner, canBlockRooms, canAccessFinanzas, defaultTab } from '../utils/permissions';
import type { User } from '../types/user';
import type { TenantModulos } from '../services/tenantService';
import { COLORS, tint } from '../constants/colors';

// The session user also carries the plan modules of its tenant (see TenantInfo).
type DashboardUser = User & { tenant?: { nombre: string; modulos?: TenantModulos } };

interface DashboardProps {
  user: DashboardUser;
  onLogout: () => void;
  // Back to the hotel selector. An open caja turn stays open in this hotel.
  onSwitchHotel?: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({ user, onLogout, onSwitchHotel }) => {
  // Rol normalizado del usuario logueado: define qué módulos puede ver
  const role = normalizeRole(user.cargo);
  const showFinanzas = canAccessFinanzas(role, user.tenant?.modulos ?? { contabilidad: false });

  const [activeTab, setActiveTab] = useState<TabId>(defaultTab(role));
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isHabitacionesMenuOpen, setIsHabitacionesMenuOpen] = useState(false);
  const [isEdificiosMenuOpen, setIsEdificiosMenuOpen] = useState(false);
  const [isUsuariosMenuOpen, setIsUsuariosMenuOpen] = useState(false);
  const [isEstablecimientosMenuOpen, setIsEstablecimientosMenuOpen] = useState(false);
  const [isAddingReservation, setIsAddingReservation] = useState(false);
  const [viewingReservationId, setViewingReservationId] = useState<number | null>(null);
  const [viewingFolioId, setViewingFolioId] = useState<number | null>(null);
  const [viewingFacturaId, setViewingFacturaId] = useState<number | null>(null);
  const [isAddingFactura, setIsAddingFactura] = useState(false);
  const [facturaFolioSeed, setFacturaFolioSeed] = useState<number | null>(null);
  // Llegada directa a "Nuevo Producto" desde "Cargar Consumo" en Folios, y
  // vuelta al mismo folio con el producto recién creado ya seleccionado.
  const [productosAutoNew, setProductosAutoNew] = useState(false);
  const [folioIdParaVolver, setFolioIdParaVolver] = useState<number | null>(null);
  const [conceptoRecienCreado, setConceptoRecienCreado] = useState<unknown | null>(null);
  // Consumos que ya estaban cargados en el modal del folio cuando se salió a
  // crear un producto: se restauran al volver, se haya guardado o cancelado.
  const [consumoBorrador, setConsumoBorrador] = useState<BorradorConsumo | null>(null);
  // Vuelta al folio tras cancelar la creación (sin producto para preseleccionar).
  const [reabrirCargarConsumo, setReabrirCargarConsumo] = useState(false);
  // Llegada a Caja desde el aviso "Necesitás un turno abierto" de Nueva
  // Factura: al abrir el turno se vuelve solo al formulario, con el folio que
  // se estaba facturando (si venía de un check-out).
  const [volverAFacturaTrasAbrirTurno, setVolverAFacturaTrasAbrirTurno] = useState(false);
  const [facturaFolioSeedGuardado, setFacturaFolioSeedGuardado] = useState<number | null>(null);
  // Llegada a Clientes desde "+ Crear nuevo cliente" en Nueva Reserva: al
  // guardar (o cancelar) se vuelve al formulario con lo ya cargado, y con el
  // cliente nuevo seleccionado si se llegó a crear.
  const [clientesAutoNew, setClientesAutoNew] = useState(false);
  const [reservaBorrador, setReservaBorrador] = useState<ReservaBorrador | null>(null);
  // Llegada a Tipos de Habitación desde "+ Crear nuevo tipo de habitación",
  // tanto en Habitación como en Tarifa: al guardar (o cancelar) se vuelve al
  // formulario de origen con lo ya cargado, y con el tipo nuevo elegido si se
  // creó. Sólo uno de los dos "pendiente" está activo a la vez (navigateTo
  // limpia el que no corresponda al salir de su pestaña), así que ese es el
  // que indica a qué formulario volver.
  const [tiposAutoNew, setTiposAutoNew] = useState(false);
  const [habitacionFormPendiente, setHabitacionFormPendiente] = useState<
    { borrador: HabitacionBorrador; habitacionEnEdicion: unknown | null } | null
  >(null);
  const [tarifaFormPendiente, setTarifaFormPendiente] = useState<
    { borrador: TarifaBorrador; tarifaEnEdicion: unknown | null } | null
  >(null);
  // Reserva de origen al entrar a un folio desde "Ver folio completo" (detalle
  // de reserva): habilita el botón "Volver a Reserva" en Folios. Sólo se
  // completa por ese camino; abrir un folio desde el listado de Folios no lo
  // toca, así que ese botón no aparece ahí.
  const [reservationIdParaVolverDesdeFolio, setReservationIdParaVolverDesdeFolio] = useState<number | null>(null);

  const [homeStats, setHomeStats] = useState<HomeStats | null>(null);
  const [ocupacionSemana, setOcupacionSemana] = useState<OcupacionDia[] | null>(null);

  useEffect(() => {
    if (activeTab !== 'home') return;
    dashboardService.getHomeStats()
      .then(setHomeStats)
      .catch((err) => console.error('Error cargando estadísticas de Home:', err));
    dashboardService.getOcupacionUltimos7Dias()
      .then(setOcupacionSemana)
      .catch((err) => console.error('Error cargando ocupación semanal:', err));
  }, [activeTab]);

  const userId = user.id_usuario || user.id || 0;

  const {
    items: notificaciones,
    noLeidas: notificacionesNoLeidas,
    marcarLeida: marcarNotificacionLeida,
    marcarTodasLeidas: marcarTodasNotificacionesLeidas
  } = useNotificaciones(userId || undefined);

  // Turno de caja activo, conocido por última vez. Se usa para el aviso
  // nativo del navegador al cerrar la pestaña (beforeunload no puede esperar
  // una llamada async, así que se lee este valor cacheado en vez de
  // consultar Supabase en el momento). Se refresca en cada navegación y al
  // intentar cerrar sesión.
  const turnoActivoRef = useRef<Turno | null>(null);
  const [showCierreCajaModal, setShowCierreCajaModal] = useState(false);
  const [turnoParaCerrar, setTurnoParaCerrar] = useState<Turno | null>(null);
  const [montoFinalLogout, setMontoFinalLogout] = useState('');
  const [savingCierreCaja, setSavingCierreCaja] = useState(false);
  const [errorCierreCaja, setErrorCierreCaja] = useState<string | null>(null);

  const refreshTurnoActivo = async () => {
    try {
      turnoActivoRef.current = await cajaService.getTurnoActivo(userId);
    } catch {
      // No bloquea la navegación si falla; el peor caso es no mostrar el
      // aviso de beforeunload, no perder datos.
    }
  };

  useEffect(() => {
    refreshTurnoActivo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Advertencia nativa del navegador si se cierra la pestaña/ventana con un
  // turno de caja abierto. No se puede cerrar el turno acá: beforeunload no
  // espera llamadas async, así que sólo se puede avisar, no actuar.
  //
  // El texto de e.returnValue es ignorado por todos los navegadores actuales
  // (Chrome, Firefox, Edge) por seguridad, así que en la práctica se ve el
  // mensaje genérico del navegador, no este. Se deja igual por si corre en
  // algún navegador que sí lo respete.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (turnoActivoRef.current) {
        e.preventDefault();
        e.returnValue = 'Cerrá tu turno de caja antes de salir.';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // Botón "Cerrar Sesión": si hay un turno abierto, lo bloquea y pide
  // cerrarlo primero (con su arqueo) antes de deslogear.
  const handleLogoutClick = async () => {
    const activo = await cajaService.getTurnoActivo(userId);
    turnoActivoRef.current = activo;
    if (!activo) {
      onLogout();
      return;
    }
    setTurnoParaCerrar(activo);
    setErrorCierreCaja(null);
    setMontoFinalLogout('');
    setShowCierreCajaModal(true);
  };

  // Mismas reglas que el arqueo del módulo de Caja: corta el tipeo ante un
  // valor inválido y muestra el error al toque.
  const handleMontoFinalLogoutChange = (value: string) => {
    const mensaje = validarTipeoMontoTurno(value, 'monto final');
    if (mensaje) {
      setErrorCierreCaja(mensaje);
      return;
    }
    setErrorCierreCaja(null);
    setMontoFinalLogout(value);
  };

  const handleCerrarCajaYSalir = async () => {
    if (!turnoParaCerrar) return;
    const errorMonto = validarMontoTurno(montoFinalLogout, 'monto final');
    if (errorMonto) {
      setErrorCierreCaja(errorMonto);
      return;
    }
    try {
      setSavingCierreCaja(true);
      await cajaService.cerrarTurno(turnoParaCerrar.id_turno, Number(montoFinalLogout), userId);
      turnoActivoRef.current = null;
      setShowCierreCajaModal(false);
      onLogout();
    } catch (err: unknown) {
      setErrorCierreCaja(err instanceof Error ? err.message : 'No se pudo cerrar el turno.');
    } finally {
      setSavingCierreCaja(false);
    }
  };

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const navigateTo = (
    tab: TabId,
    opts?: {
      autoNewProducto?: boolean;
      volverAFactura?: boolean;
      autoNewCliente?: boolean;
      autoNewTipo?: boolean;
    },
  ) => {
    if (!canAccessTab(role, tab)) return;
    setActiveTab(tab);
    setIsMobileMenuOpen(false);
    refreshTurnoActivo();
    if (tab !== 'reservas') {
      setIsAddingReservation(false);
      setViewingReservationId(null);
    }
    if (tab !== 'folios') {
      setViewingFolioId(null);
    }
    if (tab !== 'facturacion') {
      setViewingFacturaId(null);
      setIsAddingFactura(false);
      setFacturaFolioSeed(null);
    }
    // Sólo se activa cuando esta navegación lo pide explícitamente (desde
    // "Cargar Consumo" en Folios); cualquier otra entrada a 'productos'
    // (menú, "Volver") lo deja en false.
    setProductosAutoNew(tab === 'productos' && !!opts?.autoNewProducto);
    // Ídem para el atajo Facturación → Caja: entrar a Caja por el menú no
    // debe hacer que abrir un turno te saque a Facturación.
    setVolverAFacturaTrasAbrirTurno(tab === 'caja' && !!opts?.volverAFactura);
    // Ídem para el atajo Nueva Reserva → Clientes.
    setClientesAutoNew(tab === 'clientes' && !!opts?.autoNewCliente);
    // El borrador de la reserva sólo tiene sentido durante ese ida y vuelta:
    // si el usuario se va a cualquier otro módulo, se descarta.
    if (tab !== 'clientes' && tab !== 'reservas') setReservaBorrador(null);
    // Ídem para el atajo Habitación → Tipos de Habitación.
    setTiposAutoNew(tab === 'tipos_habitacion' && !!opts?.autoNewTipo);
    if (tab !== 'tipos_habitacion' && tab !== 'habitaciones') setHabitacionFormPendiente(null);
    if (tab !== 'tipos_habitacion' && tab !== 'tarifas') setTarifaFormPendiente(null);
    // Ídem para "Volver a Reserva" en Folios: sólo tiene sentido mientras se
    // va y viene entre esas dos pestañas.
    if (tab !== 'folios' && tab !== 'reservas') setReservationIdParaVolverDesdeFolio(null);
  };

  return (
    <div className="dashboard-layout">
      {/* Mobile Topbar */}
      <div className="mobile-topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="sidebar-logo" style={{ width: '32px', height: '32px' }}>
            <Building2 size={18} />
          </div>
          <span className="sidebar-title">{user.tenant?.nombre ?? 'Hotel'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <NotificationBell
            items={notificaciones}
            noLeidas={notificacionesNoLeidas}
            onMarcarLeida={marcarNotificacionLeida}
            onMarcarTodasLeidas={marcarTodasNotificacionesLeidas}
            onVerHabitacion={() => navigateTo('estado-limpieza')}
          />
          <button className="menu-toggle" onClick={toggleMobileMenu}>
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Sidebar */}
      <div className={`sidebar ${isMobileMenuOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <Building2 size={24} />
          </div>
          <h2 className="sidebar-title">{user.tenant?.nombre ?? 'Hotel'}</h2>
        </div>

        <nav className="sidebar-nav">
          {canAccessTab(role, 'home') && (
            <button
              className={`nav-item ${activeTab === 'home' ? 'active' : ''}`}
              onClick={() => navigateTo('home')}
            >
              <Building2 className="icon" size={20} />
              <span>Inicio</span>
            </button>
          )}
          {canAccessTab(role, 'clientes') && (
            <button
              className={`nav-item ${activeTab === 'clientes' ? 'active' : ''}`}
              onClick={() => navigateTo('clientes')}
            >
              <Users className="icon" size={20} />
              <span>Clientes</span>
            </button>
          )}
          {canAccessTab(role, 'reservas') && (
            <button
              className={`nav-item ${activeTab === 'reservas' ? 'active' : ''}`}
              onClick={() => navigateTo('reservas')}
            >
              <CalendarDays className="icon" size={20} />
              <span>Reservas</span>
            </button>
          )}
          {canAccessTab(role, 'folios') && (
            <button
              className={`nav-item ${activeTab === 'folios' ? 'active' : ''}`}
              onClick={() => navigateTo('folios')}
            >
              <FileText className="icon" size={20} />
              <span>Folios</span>
            </button>
          )}
          {canAccessTab(role, 'facturacion') && (
            <button
              className={`nav-item ${activeTab === 'facturacion' ? 'active' : ''}`}
              onClick={() => navigateTo('facturacion')}
            >
              <Receipt className="icon" size={20} />
              <span>Facturación</span>
            </button>
          )}
          {canAccessTab(role, 'caja') && (
            <button
              className={`nav-item ${activeTab === 'caja' ? 'active' : ''}`}
              onClick={() => navigateTo('caja')}
            >
              <Wallet className="icon" size={20} />
              <span>Caja</span>
            </button>
          )}
          {canAccessTab(role, 'reportes') && (
            <button
              className={`nav-item ${activeTab === 'reportes' ? 'active' : ''}`}
              onClick={() => navigateTo('reportes')}
            >
              <BarChart3 className="icon" size={20} />
              <span>Reportes</span>
            </button>
          )}
          {showFinanzas && (
            <button
              className={`nav-item ${activeTab === 'finanzas' ? 'active' : ''}`}
              onClick={() => navigateTo('finanzas')}
            >
              <Landmark className="icon" size={20} />
              <span>Finanzas</span>
            </button>
          )}
          {canAccessTab(role, 'estado-limpieza') && (
            <button
              className={`nav-item ${activeTab === 'estado-limpieza' ? 'active' : ''}`}
              onClick={() => navigateTo('estado-limpieza')}
            >
              <Sparkles className="icon" size={20} />
              <span>Estado y Limpieza</span>
            </button>
          )}
          {canAccessTab(role, 'productos') && (
            <button
              className={`nav-item ${activeTab === 'productos' ? 'active' : ''}`}
              onClick={() => navigateTo('productos')}
            >
              <Package className="icon" size={20} />
              <span>Productos y Servicios</span>
            </button>
          )}
          {canAccessTab(role, 'habitaciones') && (
            <div className="nav-group">
              <button
                className={`nav-item ${(activeTab === 'habitaciones' || activeTab === 'tipos_habitacion' || activeTab === 'tarifas') ? 'active' : ''}`}
                onClick={() => setIsHabitacionesMenuOpen(!isHabitacionesMenuOpen)}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Building2 className="icon" size={20} />
                  <span>Habitaciones</span>
                </div>
                <span style={{ fontSize: '12px', transform: isHabitacionesMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
              </button>
              {isHabitacionesMenuOpen && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginLeft: '32px', marginTop: '4px' }}>
                  <button
                    className={`nav-item ${activeTab === 'habitaciones' ? 'active' : ''}`}
                    onClick={() => navigateTo('habitaciones')}
                    style={{ padding: '8px 12px', fontSize: '14px' }}
                  >
                    Gestión de Habitaciones
                  </button>
                  <button
                    className={`nav-item ${activeTab === 'tipos_habitacion' ? 'active' : ''}`}
                    onClick={() => navigateTo('tipos_habitacion')}
                    style={{ padding: '8px 12px', fontSize: '14px' }}
                  >
                    Tipos de Habitaciones
                  </button>
                  <button
                    className={`nav-item ${activeTab === 'tarifas' ? 'active' : ''}`}
                    onClick={() => navigateTo('tarifas')}
                    style={{ padding: '8px 12px', fontSize: '14px' }}
                  >
                    Gestión de Tarifas
                  </button>
                </div>
              )}
            </div>
          )}
          {canAccessTab(role, 'edificios') && (
            <div className="nav-group">
              <button
                className={`nav-item ${(activeTab === 'edificios' || activeTab === 'pisos') ? 'active' : ''}`}
                onClick={() => setIsEdificiosMenuOpen(!isEdificiosMenuOpen)}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Building className="icon" size={20} />
                  <span>Edificios</span>
                </div>
                <span style={{ fontSize: '12px', transform: isEdificiosMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
              </button>
              {isEdificiosMenuOpen && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginLeft: '32px', marginTop: '4px' }}>
                  <button
                    className={`nav-item ${activeTab === 'edificios' ? 'active' : ''}`}
                    onClick={() => navigateTo('edificios')}
                    style={{ padding: '8px 12px', fontSize: '14px' }}
                  >
                    Gestión de edificios
                  </button>
                  <button
                    className={`nav-item ${activeTab === 'pisos' ? 'active' : ''}`}
                    onClick={() => navigateTo('pisos')}
                    style={{ padding: '8px 12px', fontSize: '14px' }}
                  >
                    Gestión de pisos
                  </button>
                </div>
              )}
            </div>
          )}
          {canAccessTab(role, 'usuarios') && (
            <div className="nav-group">
              <button
                className={`nav-item ${activeTab === 'usuarios' ? 'active' : ''}`}
                onClick={() => setIsUsuariosMenuOpen(!isUsuariosMenuOpen)}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <UserCog className="icon" size={20} />
                  <span>Usuarios</span>
                </div>
                <span style={{ fontSize: '12px', transform: isUsuariosMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
              </button>
              {isUsuariosMenuOpen && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginLeft: '32px', marginTop: '4px' }}>
                  <button
                    className={`nav-item ${activeTab === 'usuarios' ? 'active' : ''}`}
                    onClick={() => navigateTo('usuarios')}
                    style={{ padding: '8px 12px', fontSize: '14px' }}
                  >
                    Gestión de Usuarios
                  </button>
                </div>
              )}
            </div>
          )}
          {canAccessTab(role, 'establecimientos') && (
            <div className="nav-group">
              <button
                className={`nav-item ${(activeTab === 'establecimientos' || activeTab === 'empresas') ? 'active' : ''}`}
                onClick={() => setIsEstablecimientosMenuOpen(!isEstablecimientosMenuOpen)}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Store className="icon" size={20} />
                  <span>Establecimiento y empresa</span>
                </div>
                <span style={{ fontSize: '12px', transform: isEstablecimientosMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
              </button>
              {isEstablecimientosMenuOpen && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginLeft: '32px', marginTop: '4px' }}>
                  <button
                    className={`nav-item ${activeTab === 'establecimientos' ? 'active' : ''}`}
                    onClick={() => navigateTo('establecimientos')}
                    style={{ padding: '8px 12px', fontSize: '14px' }}
                  >
                    Gestión de establecimiento
                  </button>
                  <button
                    className={`nav-item ${activeTab === 'empresas' ? 'active' : ''}`}
                    onClick={() => navigateTo('empresas')}
                    style={{ padding: '8px 12px', fontSize: '14px' }}
                  >
                    Gestión de empresa
                  </button>
                </div>
              )}
            </div>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="user-profile">
            <div className="user-avatar">
              {user.nombre ? user.nombre.charAt(0).toUpperCase() : 'U'}
            </div>
            <div className="user-info">
              <span className="user-name">{user.nombre || 'Usuario'}</span>
              <span className="user-role">{user.cargo || 'Personal'}</span>
            </div>
            <NotificationBell
              items={notificaciones}
              noLeidas={notificacionesNoLeidas}
              onMarcarLeida={marcarNotificacionLeida}
              onMarcarTodasLeidas={marcarTodasNotificacionesLeidas}
              onVerHabitacion={() => navigateTo('estado-limpieza')}
            />
          </div>
          {onSwitchHotel && (
            <button className="switch-hotel-btn" onClick={onSwitchHotel}>
              <ArrowLeftRight size={18} />
              <span>Cambiar de hotel</span>
            </button>
          )}
          <button className="logout-btn" onClick={handleLogoutClick}>
            <LogOut size={18} />
            <span>Cerrar Sesión</span>
          </button>
        </div>
      </div>

      {/* Backdrop for mobile */}
      {isMobileMenuOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, backgroundColor: tint('black', 0.5), zIndex: 15
          }}
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Main Content Area */}
      <div className="dashboard-content">
        {activeTab === 'home' && canAccessTab(role, 'home') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', animation: 'fadeIn 0.4s ease' }}>
            <div className="dashboard-header">
              <h1>¡Hola, {user.nombre}!</h1>
              <p>Bienvenido al sistema de gestión. Aquí tienes un resumen.</p>
            </div>

            <div className="stats-grid">
              <div className="stat-card" onClick={() => navigateTo('reservas')} style={{ cursor: 'pointer' }}>
                <div className="stat-card-glow"></div>
                <div className="stat-icon blue">
                  <CalendarDays size={24} />
                </div>
                <div className="stat-info">
                  <div className="stat-label">Reservas Activas</div>
                  <div className="stat-value">{homeStats?.reservasActivas ?? '—'}</div>
                </div>
              </div>

              <div className="stat-card" onClick={() => navigateTo('clientes')} style={{ cursor: 'pointer' }}>
                <div className="stat-card-glow"></div>
                <div className="stat-icon purple">
                  <Users size={24} />
                </div>
                <div className="stat-info">
                  <div className="stat-label">Total Clientes</div>
                  <div className="stat-value">{homeStats?.totalClientes ?? '—'}</div>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-card-glow"></div>
                <div className="stat-icon" style={{ background: tint('success', 0.15), color: COLORS.successLight }}>
                  <TrendingUp size={24} />
                </div>
                <div className="stat-info">
                  <div className="stat-label">Ocupación</div>
                  <div className="stat-value">{homeStats ? `${homeStats.ocupacionPct}%` : '—'}</div>
                </div>
              </div>
            </div>

            <OccupancyChart data={ocupacionSemana} />

            {/* Quick Actions Component */}
            <QuickActions
              actions={[
                {
                  label: "Nueva Reserva",
                  icon: <CalendarPlus size={20} />,
                  onClick: () => { navigateTo('reservas'); setIsAddingReservation(true); },
                  variant: 'primary'
                },
                {
                  label: "Registrar Cliente",
                  icon: <UserPlus size={20} />,
                  onClick: () => navigateTo('clientes'),
                  variant: 'secondary'
                },
                {
                  label: "Cuentas / Folios",
                  icon: <FileText size={20} />,
                  onClick: () => navigateTo('folios'),
                  variant: 'secondary'
                }
              ]}
            />
          </div>
        )}

        {activeTab === 'clientes' && canAccessTab(role, 'clientes') && (
          <div className="module-container">
            <ManageClients
              onBack={() => navigateTo('home')}
              openNewOnMount={clientesAutoNew}
              onClienteCreado={(cliente) => {
                // El borrador vuelve con el cliente nuevo ya elegido.
                setReservaBorrador((prev) => ({
                  ...(prev ?? {
                    fecha_entrada: '', fecha_salida: '', estado: 'Pendiente',
                    fk_cliente: '', origen: 'Presencial', observaciones: '',
                  }),
                  fk_cliente: cliente?.id_cliente?.toString() ?? '',
                }));
                setIsAddingReservation(true);
                navigateTo('reservas');
              }}
              onCancelarCreacion={() => {
                // Sin cliente nuevo: se vuelve con el borrador tal como estaba.
                setIsAddingReservation(true);
                navigateTo('reservas');
              }}
            />
          </div>
        )}

        {activeTab === 'reservas' && canAccessTab(role, 'reservas') && (
          <div className="module-container">
            {viewingReservationId ? (
              <ReservationDetail
                reservationId={viewingReservationId}
                onBack={() => setViewingReservationId(null)}
                currentUser={user}
                onFacturarFolio={(fkFolio: number) => {
                  setViewingReservationId(null);
                  setFacturaFolioSeed(fkFolio);
                  setIsAddingFactura(true);
                  navigateTo('facturacion');
                }}
                onViewFolio={(fkFolio: number) => {
                  // navigateTo('folios') igual limpiaría viewingReservationId
                  // al salir de 'reservas'; se guarda antes para poder volver.
                  setReservationIdParaVolverDesdeFolio(viewingReservationId);
                  setViewingReservationId(null);
                  setViewingFolioId(fkFolio);
                  navigateTo('folios');
                }}
              />
            ) : isAddingReservation ? (
              <ReservationForm
                onCancel={() => { setIsAddingReservation(false); setReservaBorrador(null); }}
                onCreated={() => { setIsAddingReservation(false); setReservaBorrador(null); }}
                currentUser={user}
                onCrearCliente={(borrador) => {
                  setReservaBorrador(borrador);
                  navigateTo('clientes', { autoNewCliente: true });
                }}
                borradorInicial={reservaBorrador}
                onBorradorInicialConsumido={() => setReservaBorrador(null)}
              />
            ) : (
              <ManageReservations
                onBack={() => navigateTo('home')}
                onNewReservation={() => setIsAddingReservation(true)}
                onViewDetail={(id: number) => setViewingReservationId(id)}
                currentUser={user}
              />
            )}
          </div>
        )}

        {activeTab === 'folios' && canAccessTab(role, 'folios') && (
          <div className="module-container">
            {viewingFolioId ? (
              <FolioDetail
                folioId={viewingFolioId}
                onBack={() => {
                  setViewingFolioId(null);
                  // Por si se sale antes de que la precarga llegue a
                  // consumirse: evita que un producto o unos consumos de este
                  // folio se filtren a otro folio que se abra después.
                  setConceptoRecienCreado(null);
                  setReabrirCargarConsumo(false);
                  setConsumoBorrador(null);
                  setFolioIdParaVolver(null);
                  setReservationIdParaVolverDesdeFolio(null);
                }}
                currentUser={user}
                onCrearProducto={(borrador) => {
                  setConsumoBorrador(borrador);
                  setFolioIdParaVolver(viewingFolioId);
                  navigateTo('productos', { autoNewProducto: true });
                }}
                conceptoPrecargado={conceptoRecienCreado}
                onConceptoPrecargadoConsumido={() => {
                  setConceptoRecienCreado(null);
                  setConsumoBorrador(null);
                }}
                reabrirCargarConsumo={reabrirCargarConsumo}
                onReabrirCargarConsumoConsumido={() => {
                  setReabrirCargarConsumo(false);
                  setConsumoBorrador(null);
                }}
                borradorConsumo={consumoBorrador}
                onVolverAReserva={
                  reservationIdParaVolverDesdeFolio
                    ? () => {
                        setViewingReservationId(reservationIdParaVolverDesdeFolio);
                        setReservationIdParaVolverDesdeFolio(null);
                        navigateTo('reservas');
                      }
                    : undefined
                }
              />
            ) : (
              <ManageFolios
                onViewFolio={(id: number) => {
                  // Entrada directa desde el listado: sin reserva de origen,
                  // así que "Volver a Reserva" no debe aparecer acá.
                  setReservationIdParaVolverDesdeFolio(null);
                  setViewingFolioId(id);
                }}
              />
            )}
          </div>
        )}

        {activeTab === 'facturacion' && canAccessTab(role, 'facturacion') && (
          <div className="module-container">
            {viewingFacturaId ? (
              <FacturaDetail
                facturaId={viewingFacturaId}
                onBack={() => setViewingFacturaId(null)}
                role={role}
                modulos={user.tenant?.modulos}
              />
            ) : isAddingFactura ? (
              <FacturaForm
                currentUser={user}
                fkFolio={facturaFolioSeed}
                modulos={user.tenant?.modulos}
                onBack={() => { setIsAddingFactura(false); setFacturaFolioSeed(null); }}
                onCreated={(id: number) => {
                  setIsAddingFactura(false);
                  setFacturaFolioSeed(null);
                  setViewingFacturaId(id);
                }}
                onGoToCaja={() => {
                  // navigateTo limpia facturaFolioSeed al salir de la pestaña;
                  // se guarda acá para restaurarlo al volver tras abrir el turno.
                  setFacturaFolioSeedGuardado(facturaFolioSeed);
                  navigateTo('caja', { volverAFactura: true });
                }}
              />
            ) : (
              <ManageFacturas
                onNewFactura={() => setIsAddingFactura(true)}
                onViewFactura={(id: number) => setViewingFacturaId(id)}
                role={role}
                modulos={user.tenant?.modulos}
              />
            )}
          </div>
        )}

        {activeTab === 'caja' && canAccessTab(role, 'caja') && (
          <div className="module-container">
            <CajaTurno
              currentUser={user}
              role={role}
              onTurnoAbierto={() => {
                // Sólo si se llegó acá desde el aviso de Nueva Factura; abrir
                // un turno entrando por el menú no debe mover al usuario.
                if (!volverAFacturaTrasAbrirTurno) return;
                setIsAddingFactura(true);
                setFacturaFolioSeed(facturaFolioSeedGuardado);
                setFacturaFolioSeedGuardado(null);
                // Entrar a 'facturacion' no toca estos estados (navigateTo sólo
                // los limpia al salir de la pestaña) y deja el flag en false.
                navigateTo('facturacion');
              }}
            />
          </div>
        )}

        {activeTab === 'reportes' && canAccessTab(role, 'reportes') && (
          <div className="module-container">
            <ManageReportes />
          </div>
        )}

        {activeTab === 'finanzas' && showFinanzas && (
          <div className="module-container">
            <Finanzas />
          </div>
        )}

        {activeTab === 'estado-limpieza' && (
          <div className="module-container">
            <CleanStatus
              onBack={() => navigateTo(defaultTab(role))}
              currentUser={user}
              canBlock={canBlockRooms(role)}
              canAssign={canAssignCleaner(role)}
            />
          </div>
        )}

        {activeTab === 'productos' && canAccessTab(role, 'productos') && (
          <div className="module-container">
            <ManageProductos
              onBack={() => navigateTo('home')}
              openNewOnMount={productosAutoNew}
              onProductoCreado={(concepto) => {
                setConceptoRecienCreado(concepto);
                setViewingFolioId(folioIdParaVolver);
                setFolioIdParaVolver(null);
                navigateTo('folios');
              }}
              onCancelarCreacion={() => {
                setReabrirCargarConsumo(true);
                setViewingFolioId(folioIdParaVolver);
                setFolioIdParaVolver(null);
                navigateTo('folios');
              }}
            />
          </div>
        )}

        {activeTab === 'habitaciones' && canAccessTab(role, 'habitaciones') && (
          <div className="module-container">
            <ManageHabitaciones
              onBack={() => navigateTo('home')}
              onCrearTipo={(borrador, habitacionEnEdicion) => {
                setHabitacionFormPendiente({ borrador, habitacionEnEdicion });
                navigateTo('tipos_habitacion', { autoNewTipo: true });
              }}
              reabrirFormulario={habitacionFormPendiente}
              onReabrirFormularioConsumido={() => setHabitacionFormPendiente(null)}
            />
          </div>
        )}

        {activeTab === 'tipos_habitacion' && canAccessTab(role, 'tipos_habitacion') && (
          <div className="module-container">
            <ManageTipoHabitacion
              onBack={() => navigateTo('home')}
              openNewOnMount={tiposAutoNew}
              onTipoCreado={(tipo) => {
                // El borrador vuelve con el tipo recién creado ya elegido, al
                // formulario del que se haya venido (Habitación o Tarifa).
                const idTipo = tipo?.id?.toString() ?? '';
                if (habitacionFormPendiente) {
                  setHabitacionFormPendiente((prev) =>
                    prev ? { ...prev, borrador: { ...prev.borrador, fk_tipo_habitacion: idTipo } } : prev
                  );
                  navigateTo('habitaciones');
                } else if (tarifaFormPendiente) {
                  setTarifaFormPendiente((prev) =>
                    prev ? { ...prev, borrador: { ...prev.borrador, fk_tipo_habitacion: idTipo } } : prev
                  );
                  navigateTo('tarifas');
                }
              }}
              onCancelarCreacion={() => {
                // Sin tipo nuevo: se vuelve con el borrador tal como estaba.
                if (habitacionFormPendiente) navigateTo('habitaciones');
                else if (tarifaFormPendiente) navigateTo('tarifas');
              }}
            />
          </div>
        )}

        {activeTab === 'tarifas' && canAccessTab(role, 'tarifas') && (
          <div className="module-container">
            <ManageTarifas
              onBack={() => navigateTo('home')}
              onCrearTipo={(borrador, tarifaEnEdicion) => {
                setTarifaFormPendiente({ borrador, tarifaEnEdicion });
                navigateTo('tipos_habitacion', { autoNewTipo: true });
              }}
              reabrirFormulario={tarifaFormPendiente}
              onReabrirFormularioConsumido={() => setTarifaFormPendiente(null)}
            />
          </div>
        )}

        {activeTab === 'edificios' && canAccessTab(role, 'edificios') && (
          <div className="module-container">
            <ManageEdificios onBack={() => navigateTo('home')} />
          </div>
        )}

        {activeTab === 'pisos' && canAccessTab(role, 'pisos') && (
          <div className="module-container">
            <ManagePisos onBack={() => navigateTo('home')} />
          </div>
        )}

        {activeTab === 'usuarios' && canAccessTab(role, 'usuarios') && (
          <div className="module-container">
            <ManageUsuarios onBack={() => navigateTo('home')} currentUser={user} />
          </div>
        )}

        {activeTab === 'establecimientos' && canAccessTab(role, 'establecimientos') && (
          <div className="module-container">
            <ManageEstablecimientos onBack={() => navigateTo('home')} />
          </div>
        )}

        {activeTab === 'empresas' && canAccessTab(role, 'empresas') && (
          <div className="module-container">
            <ManageEmpresas onBack={() => navigateTo('home')} />
          </div>
        )}

        <Footer />
      </div>

      <Modal
        isOpen={showCierreCajaModal}
        onClose={() => setShowCierreCajaModal(false)}
        title="Cerrá tu turno antes de salir"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button className="btn-ghost" onClick={() => setShowCierreCajaModal(false)} disabled={savingCierreCaja}>
              Cancelar
            </button>
            <button
              className="btn-primary-sm"
              onClick={handleCerrarCajaYSalir}
              disabled={savingCierreCaja}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
            >
              <DoorClosed size={16} /> Cerrar turno y salir
            </button>
          </div>
        }
      >
        <p style={{ color: 'var(--text-secondary)', marginTop: 0 }}>
          Tenés un turno de caja abierto. Cerralo con el arqueo final para poder cerrar sesión.
        </p>
        {turnoParaCerrar && (
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
            Monto inicial: {formatGs(turnoParaCerrar.monto_inicial)}
          </p>
        )}
        {errorCierreCaja && (
          <div className="status-message status-error" style={{ marginBottom: 16 }}>{errorCierreCaja}</div>
        )}
        <div className="input-group" style={{ marginBottom: 0 }}>
          <label htmlFor="monto-final-logout">Monto final (arqueo)</label>
          <input
            id="monto-final-logout"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            className="input-field"
            value={montoFinalLogout}
            onChange={(e) => handleMontoFinalLogoutChange(e.target.value)}
            placeholder="0"
            autoFocus
          />
        </div>
      </Modal>
    </div>
  );
};

export default Dashboard;
