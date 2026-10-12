import { useEffect, useMemo, useRef, useState } from 'react';
import { ReservationService } from '../services/reservationService';
import { HabitacionService } from '../services/habitacionService';
import { CleanStatusService } from '../services/cleanStatusService';
import { RoomOccupancyService } from '../services/roomOccupancyService';
import { folioService, Folio } from '../services/folioService';
import { facturaService } from '../services/facturaService';
import { DataTable, Column } from '../components/DataTable';
import { ModuleLayout } from '../components/ModuleLayout';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { getAllowedTargets, requiresConfirmation, getTransitionCopy, toCanonicalEstado, esReservaCerrada } from '../utils/reservaEstado';
import { SearchBox } from '../components/SearchBox';
import { FilterChips, ChipOption } from '../components/FilterChips';
import { RoomCard, RoomCardData } from '../components/RoomCard';
import { getCleanStatus, OCUPADO_STYLE, DESOCUPADO_STYLE } from '../utils/roomStatus';
import { verificionCiPy, validarNumeroNoNegativo, validarPasaporte } from '../utils/diccionarioValidaciones';
import { calculateNights, calculateNightsForNewDetalle, calculateRoomSubtotal, calculateReservationTotal, deriveNightsFromSubtotal } from '../utils/pricing';
import { resolveTarifaForStay } from '../utils/tarifas';
import { formatGs } from '../utils/currency';
import { ClienteRecurrenteBadge } from '../components/ClienteRecurrenteBadge';
import { isClienteRecurrente, getReservationCount } from '../utils/clienteRecurrencia';
import type { Reserva, DetalleReserva, HuespedReserva, HistorialEstancia, Tarifa, ReservaEstado } from '../types/reservation';
import type { User } from '../types/user';
import { ArrowLeft, BedDouble, Users, ClipboardList, FileText, Plus, Trash2, Pencil, UserCheck, Clock, ChevronDown } from 'lucide-react';
import '../index.css';
import { COLORS, tint } from '../constants/colors';

/** Room row for the picker grid: RoomCardData plus range-scoped occupancy. */
interface PickerRoom extends RoomCardData {
  ocupado: boolean;
}

type PickerOccFilter = 'todos' | 'ocupadas' | 'disponibles';

type TabKey = 'habitaciones' | 'huespedes' | 'historial' | 'folio';

// Validación del formulario de "Agregar Huésped": mismo criterio que el
// resto de los módulos (bloquea el tipeo, sin dobles espacios).
const MAX_NOMBRE_HUESPED = 60;
const MAX_NACIONALIDAD = 60;
const MAX_DOCUMENTO_HUESPED = 12;
const MAX_DESCRIPCION_HISTORIAL = 200;
const SOLO_LETRAS_Y_ESPACIOS = /^[a-zA-ZáéíóúüÁÉÍÓÚÜñÑ ]*$/;
const EMPIEZA_CON_LETRA = /^[a-zA-ZáéíóúüÁÉÍÓÚÜñÑ]/;

const validarDocumentoHuesped = (value: string, tipoDoc: string): string =>
  verificionCiPy(value, tipoDoc) || validarPasaporte(value, tipoDoc);

interface Props {
  reservationId: number;
  onBack: () => void;
  currentUser: User;
  /** Al hacer Check-out con consumos en el folio, ofrece facturarlo. */
  onFacturarFolio?: (fkFolio: number) => void;
  /** Abre la gestión completa del folio (agregar/editar/eliminar cargos). */
  onViewFolio?: (folioId: number) => void;
}

export default function ReservationDetail({ reservationId, onBack, currentUser, onFacturarFolio, onViewFolio }: Props) {
  const [reserva, setReserva] = useState<Reserva | null>(null);
  const [detalles, setDetalles] = useState<DetalleReserva[]>([]);
  const [historial, setHistorial] = useState<HistorialEstancia[]>([]);
  const [habitaciones, setHabitaciones] = useState<PickerRoom[]>([]);
  const [tarifas, setTarifas] = useState<Tarifa[]>([]);
  const [habSearch, setHabSearch] = useState('');
  const [habOccFilter, setHabOccFilter] = useState<PickerOccFilter>('todos');
  const [activeTab, setActiveTab] = useState<TabKey>('habitaciones');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // ── Forms state ──
  const [showAddDetalle, setShowAddDetalle] = useState(false);
  const [editingDetalleId, setEditingDetalleId] = useState<number | null>(null);
  const [detalleForm, setDetalleForm] = useState({ fk_habitacion: '', fk_tarifa: '', cantidad_adultos: '1', cantidad_ninos: '0', precio_unitario: '' });
  const [selectedDetalle, setSelectedDetalle] = useState<number | null>(null);
  const [huespedesMap, setHuespedesMap] = useState<Record<number, HuespedReserva[]>>({});
  const [showAddHuesped, setShowAddHuesped] = useState<number | null>(null);
  const [huespedForm, setHuespedForm] = useState({ nombre_completo: '', documento: '', fk_tipo_documento: '', nacionalidad: '', es_titular: false });
  const [tiposDocumento, setTiposDocumento] = useState<{ cod_tipodoc: number; descripcion_tipodoc: string }[]>([]);
  // Para huéspedes sólo se admite Cédula o RUC (no pasaporte ni otros tipos).
  const tiposDocumentoHuesped = tiposDocumento.filter(td => {
    const d = (td.descripcion_tipodoc || '').toLowerCase();
    return d.includes('cedul') || d.includes('ruc');
  });
  const [showAddHistorial, setShowAddHistorial] = useState(false);
  const [historialForm, setHistorialForm] = useState({ tipo_movimiento: 'NOTA', descripcion: '' });
  const [savingDetalle, setSavingDetalle] = useState(false);
  const [savingHuesped, setSavingHuesped] = useState(false);
  const [savingHistorial, setSavingHistorial] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [tarifaWarning, setTarifaWarning] = useState<string | null>(null);

  // ── Resumen de folio (pestaña "Folio") ──
  const [folioResumen, setFolioResumen] = useState<Folio | null>(null);
  const [folioResumenLoading, setFolioResumenLoading] = useState(false);
  const [folioResumenError, setFolioResumenError] = useState<string | null>(null);

  useEffect(() => {
    if (activeTab !== 'folio') return;
    let cancelled = false;

    (async () => {
      try {
        setFolioResumenLoading(true);
        setFolioResumenError(null);
        const data = await folioService.getUltimoFolioByReserva(reservationId);
        if (!cancelled) setFolioResumen(data);
      } catch (err: any) {
        if (!cancelled) setFolioResumenError(err.message || 'No se pudo cargar el folio.');
      } finally {
        if (!cancelled) setFolioResumenLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeTab, reservationId]);

  // Mobile hint: the tarifa/price pane stacks below the room grid, so a room
  // selection isn't obviously followed by the fields to fill. A floating arrow
  // nudges the user down; it hides itself once the detail pane scrolls into view.
  const detailPaneRef = useRef<HTMLDivElement>(null);
  const [detailInView, setDetailInView] = useState(false);

  useEffect(() => {
    if (!showAddDetalle) return;
    const el = detailPaneRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setDetailInView(entry.isIntersecting),
      { threshold: 0.35 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [showAddDetalle]);

  const clearError = (field: string) => setFormErrors(p => { const ne = { ...p }; delete ne[field]; return ne; });
  const checkRequired = (field: string, value: string) => {
    if (!value || !value.toString().trim()) setFormErrors(p => ({ ...p, [field]: 'Este campo es obligatorio.' }));
  };


  useEffect(() => { loadAll(); }, [reservationId]);

  const loadAll = async () => {
    setLoading(true);
    setError(null);

    // Load reservation (required)
    let res: Reserva | null;
    try {
      res = await ReservationService.getReservationById(reservationId);
      setReserva(res);
    } catch (err: any) {
      setError('Error al cargar la reserva: ' + (err.message || err));
      setLoading(false);
      return;
    }

    // Load detalles (important but not blocking)
    try {
      const det = await ReservationService.getDetalleReserva(reservationId);
      setDetalles(det);
      // Load huespedes for each detalle
      const hMap: Record<number, HuespedReserva[]> = {};
      for (const d of det) {
        try {
          hMap[d.id_detalle] = await ReservationService.getHuespedesDetalle(d.id_detalle);
        } catch { hMap[d.id_detalle] = []; }
      }
      setHuespedesMap(hMap);
    } catch (err: any) {
      console.warn('Error cargando detalles:', err.message);
      setDetalles([]);
    }

    // Load historial (optional)
    try {
      const hist = await ReservationService.getHistorialEstancia(reservationId);
      setHistorial(hist);
    } catch (err: any) {
      console.warn('Error cargando historial:', err.message);
      setHistorial([]);
    }

    // Load catalogs (optional - forms still work with IDs)
    // Uses HabitacionService (not ReservationService.getHabitaciones) because it
    // embeds imagenes_habitacion, needed by the RoomCard picker grid.
    try {
      const [habs, estadosMap, ocupadasEnRango] = await Promise.all([
        HabitacionService.getHabitaciones(),
        CleanStatusService.getEstadosLimpieza(),
        RoomOccupancyService.getHabitacionesOcupadasEnRango({
          fechaEntrada: res?.fecha_entrada || '',
          fechaSalida: res?.fecha_salida || '',
          excludeReservaId: reservationId,
        }),
      ]);
      setHabitaciones(habs.map((h) => ({
        ...h,
        estadoLimpieza: getCleanStatus(estadosMap.get(h.id)),
        ocupado: ocupadasEnRango.has(h.id)
      })));
    } catch (err: any) {
      console.error('Error cargando habitaciones:', err);
      setHabitaciones([]);
    }

    try {
      const tar = await ReservationService.getTarifas();
      setTarifas(tar);
    } catch (err: any) {
      console.error('Error cargando tarifas:', err);
      setTarifas([]);
    }

    // Load tipo_documento
    try {
      const data = await ReservationService.getTiposDocumento();
      setTiposDocumento(data);
    } catch { setTiposDocumento([]); }

    setLoading(false);
  };

  const clearMessages = () => { setError(null); setSuccess(null); };

  // Tras el Check-out la estancia está cerrada: habitaciones y huéspedes pasan
  // a ser sólo de consulta. La bitácora sigue abierta, que es donde queda el
  // registro de lo que pasó después.
  const soloLectura = esReservaCerrada(reserva?.estado);

  /** Cupo de huéspedes de una habitación: lo declarado en adultos + niños. */
  const cupoHuespedes = (d: DetalleReserva) =>
    (d.cantidad_adultos ?? 0) + (d.cantidad_ninos ?? 0);

  // ── Cambio de estado (máquina de estados) ──
  const [confirmTarget, setConfirmTarget] = useState<ReservaEstado | null>(null);
  const [facturarFolioId, setFacturarFolioId] = useState<number | null>(null);
  const [changingEstado, setChangingEstado] = useState(false);

  const handleEstadoAction = (target: ReservaEstado) => {
    // No se puede ingresar a un huésped sin una habitación asignada.
    if (target === 'Check-in' && detalles.length === 0) {
      clearMessages();
      setError('No se puede hacer Check-in sin habitaciones cargadas. Agregá al menos una habitación.');
      return;
    }
    if (requiresConfirmation(target)) {
      setConfirmTarget(target);
    } else {
      applyEstadoChange(target);
    }
  };

  const applyEstadoChange = async (target: ReservaEstado) => {
    if (!reserva) return;
    setChangingEstado(true);
    clearMessages();
    try {
      // Efecto de Check-out: obtener el folio antes de cambiar el estado de la reserva,
      // para evitar que el trigger de base de datos lo cierre y no lo encontremos como 'abierto'.
      let folioToInvoice = null;
      if (target === 'Check-out' && onFacturarFolio) {
        folioToInvoice = await folioService.getFolioByReserva(reserva.id_reserva);
      }

      await ReservationService.changeEstado(reserva.id_reserva, reserva.estado, target);
      
      // Efecto de Check-in: abrir folio si aún no existe (antes vivía en ReservationForm)
      // y cargarle automáticamente el alojamiento (noches * precio) de cada habitación,
      // sólo la primera vez que se abre el folio, para no duplicar el cargo si el
      // check-in se reintenta.
      if (target === 'Check-in') {
        const existingFolio = await folioService.getFolioByReserva(reserva.id_reserva);
        if (!existingFolio) {
          const nuevoFolio = await folioService.createFolio({
            fk_reserva: reserva.id_reserva,
            estado: 'abierto',
            total_acumulado: 0,
          });
          const nights = calculateNights(reserva.fecha_entrada, reserva.fecha_salida);
          const fkUsuario = currentUser?.id_usuario || currentUser?.id || 0;
          for (const d of detalles) {
            await folioService.ajustarCargoAlojamiento(nuevoFolio.id_folio, nights, d.subtotal, fkUsuario);
          }
        }
      }
      
      // Efecto de Check-out: si el folio tiene consumos, ofrecer facturarlo.
      if (target === 'Check-out' && onFacturarFolio && folioToInvoice) {
        const cargos = await facturaService.getCargosFacturablesByFolio(folioToInvoice.id_folio);
        if (cargos.length > 0) setFacturarFolioId(folioToInvoice.id_folio);
      }
      
      setConfirmTarget(null);
      await loadAll();
      setSuccess(`Estado actualizado a "${target}".`);
    } catch (e: any) {
      setError(e.message || 'No se pudo cambiar el estado.');
    } finally {
      setChangingEstado(false);
    }
  };

  // Re-sums total_estimado from freshly-fetched server rows and persists it.
  // Runs before loadAll() so the refreshed header reflects the new total in
  // the same render. Failures are non-blocking: the room mutation already
  // succeeded, so swallowing this would risk a duplicate on retry.
  const syncReservationTotal = async () => {
    try {
      const rows = await ReservationService.getDetalleReserva(reservationId);
      const total = calculateReservationTotal(rows);
      await ReservationService.updateReservation(reservationId, { total_estimado: total });
    } catch (err: any) {
      console.warn('Error sincronizando el total estimado:', err.message);
    }
  };

  // ── Detalle CRUD ──
  const EMPTY_DETALLE_FORM = { fk_habitacion: '', fk_tarifa: '', cantidad_adultos: '1', cantidad_ninos: '0', precio_unitario: '' };

  /** Número visible de una habitación por id (fallback al id si no está en el catálogo). */
  const roomNumberFor = (id: number) => habitaciones.find(h => h.id === id)?.numero_habitacion ?? id;

  const handleOpenAddDetalle = () => {
    setEditingDetalleId(null);
    setDetalleForm(EMPTY_DETALLE_FORM);
    setFormErrors({});
    setTarifaWarning(null);
    setHabSearch('');
    setHabOccFilter('todos');
    setShowAddDetalle(true);
  };

  const handleOpenEditDetalle = (d: DetalleReserva) => {
    setEditingDetalleId(d.id_detalle);
    setDetalleForm({
      fk_habitacion: d.fk_habitacion?.toString() || '',
      fk_tarifa: d.fk_tarifa?.toString() || '',
      cantidad_adultos: (d.cantidad_adultos ?? 1).toString(),
      cantidad_ninos: (d.cantidad_ninos ?? 0).toString(),
      precio_unitario: (d.precio_unitario ?? '').toString(),
    });
    setFormErrors({});
    setTarifaWarning(null);
    setHabSearch('');
    setHabOccFilter('todos');
    setShowAddDetalle(true);
  };

  const closeDetalleModal = () => {
    setShowAddDetalle(false);
    setEditingDetalleId(null);
  };

  // Sincroniza el cargo automático de "Alojamiento" del folio cuando se
  // agrega, edita o quita una habitación después del check-in (antes de eso
  // no hay folio ni cargo que ajustar). Best-effort: si falla, no bloquea la
  // acción sobre la habitación, sólo avisa por consola.
  const sincronizarCargoAlojamiento = async (deltaCantidad: number, deltaMontoTotal: number) => {
    if (toCanonicalEstado(reserva?.estado) !== 'Check-in') return;
    try {
      const folio = await folioService.getFolioByReserva(reservationId);
      if (!folio) return;
      const fkUsuario = currentUser?.id_usuario || currentUser?.id || 0;
      await folioService.ajustarCargoAlojamiento(folio.id_folio, deltaCantidad, deltaMontoTotal, fkUsuario);
    } catch (e: any) {
      console.warn('No se pudo sincronizar el cargo de alojamiento:', e.message);
    }
  };

  const handleSaveDetalle = async () => {
    clearMessages();
    if (soloLectura) {
      setError('La reserva ya hizo Check-out: las habitaciones no se pueden modificar.');
      return;
    }
    const errors: Record<string, string> = {};
    if (!detalleForm.fk_habitacion) errors.fk_habitacion = 'Obligatorio.';
    // Respaldo del bloqueo ya aplicado en el grid (RoomCard deshabilitada):
    // una habitación no puede tener dos detalles en la misma reserva.
    else if (idsHabitacionesAsignadas.has(parseInt(detalleForm.fk_habitacion))) {
      errors.fk_habitacion = 'Esta habitación ya está asignada a esta reserva.';
    }
    if (!detalleForm.fk_tarifa) errors.fk_tarifa = 'Obligatorio.';
    if (!detalleForm.precio_unitario) errors.precio_unitario = 'Obligatorio.';

    const precioError = validarNumeroNoNegativo(detalleForm.precio_unitario, "El precio");
    if (precioError) errors.precio_unitario = precioError;

    const adultosError = validarNumeroNoNegativo(detalleForm.cantidad_adultos, "Adultos");
    if (adultosError) errors.cantidad_adultos = adultosError;

    const ninosError = validarNumeroNoNegativo(detalleForm.cantidad_ninos, "Niños");
    if (ninosError) errors.cantidad_ninos = ninosError;

    // La habitación no puede quedar sin un adulto responsable.
    const adultosNum = parseInt(detalleForm.cantidad_adultos) || 0;
    if (adultosNum < 1) {
      errors.cantidad_adultos = 'Debe haber al menos un adulto en la habitación.';
    }

    // El tipeo ya lo impide, pero se revalida acá porque la capacidad depende
    // de la habitación y ésta puede cambiarse después de cargar los huéspedes.
    const ninosNum = parseInt(detalleForm.cantidad_ninos) || 0;
    if (
      capacidadHabitacionSeleccionada > 0 &&
      adultosNum + ninosNum > capacidadHabitacionSeleccionada
    ) {
      errors.cantidad_adultos =
        `La habitación admite hasta ${capacidadHabitacionSeleccionada} huésped${capacidadHabitacionSeleccionada > 1 ? 'es' : ''} en total (hay ${adultosNum + ninosNum}).`;
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    setFormErrors({});

    setSavingDetalle(true);
    try {
      const adultos = parseInt(detalleForm.cantidad_adultos) || 1;
      const ninos = parseInt(detalleForm.cantidad_ninos) || 0;
      const precio = parseFloat(detalleForm.precio_unitario) || 0;
      const isCreatingDetalle = !editingDetalleId;
      const isCheckIn = toCanonicalEstado(reserva?.estado) === 'Check-in';
      const today = new Date().toISOString().split('T')[0];
      const nights = reserva
        ? (isCreatingDetalle
            ? calculateNightsForNewDetalle(reserva.fecha_entrada, reserva.fecha_salida, isCheckIn, today)
            : calculateNights(reserva.fecha_entrada, reserva.fecha_salida))
        : 0;
      const fkHabitacion = parseInt(detalleForm.fk_habitacion);
      const fkTarifa = parseInt(detalleForm.fk_tarifa);
      const subtotal = calculateRoomSubtotal(precio, nights);

      if (editingDetalleId) {
        // UPDATE en su lugar: preserva los huéspedes atados a este id_detalle.
        const original = detalles.find(d => d.id_detalle === editingDetalleId);
        await ReservationService.updateDetalleReserva(editingDetalleId, {
          fk_habitacion: fkHabitacion,
          fk_tarifa: fkTarifa,
          cantidad_adultos: adultos,
          cantidad_ninos: ninos,
          precio_unitario: precio,
          subtotal,
        });
        // Registrar en historial solo si cambió la habitación.
        if (original && original.fk_habitacion !== fkHabitacion) {
          try {
            await ReservationService.addHistorialEntry({
              fk_reserva: reservationId,
              tipo_movimiento: 'CAMBIO_HABITACION',
              descripcion: `Habitación: #${roomNumberFor(original.fk_habitacion)} → #${roomNumberFor(fkHabitacion)}`,
              fk_usuario: currentUser?.id_usuario || currentUser?.id || 0,
            });
          } catch (e: any) { console.warn('No se pudo registrar el cambio de habitación en historial:', e.message); }
        }
        // Las noches no cambian (fechas de la reserva, compartidas por todas
        // las habitaciones); sólo puede variar el monto (precio/tarifa nueva).
        if (original) {
          await sincronizarCargoAlojamiento(0, subtotal - Number(original.subtotal));
        }
        setSuccess('Habitación actualizada.');
      } else {
        await ReservationService.createDetalleReserva({
          fk_reserva: reservationId,
          fk_habitacion: fkHabitacion,
          fk_tarifa: fkTarifa,
          cantidad_adultos: adultos,
          cantidad_ninos: ninos,
          precio_unitario: precio,
          subtotal,
          estado: 'Activo',
        });
        // Auditoría del alta, igual que el cambio y la baja de habitación.
        try {
          await ReservationService.addHistorialEntry({
            fk_reserva: reservationId,
            tipo_movimiento: 'ALTA_HABITACION',
            descripcion: `Habitación #${roomNumberFor(fkHabitacion)} agregada a la reserva (${adultos} adulto${adultos === 1 ? '' : 's'}, ${ninos} niño${ninos === 1 ? '' : 's'})`,
            fk_usuario: currentUser?.id_usuario || currentUser?.id || 0,
          });
        } catch (e: any) { console.warn('No se pudo registrar el alta de habitación en historial:', e.message); }
        // Habitación agregada después del check-in: suma su alojamiento al folio.
        await sincronizarCargoAlojamiento(nights, subtotal);
        setSuccess('Habitación agregada.');
      }

      setShowAddDetalle(false);
      setEditingDetalleId(null);
      setDetalleForm(EMPTY_DETALLE_FORM);
      setTarifaWarning(null);
      await syncReservationTotal();
      await loadAll();
    } catch (err: any) { setError(err.message); }
    finally { setSavingDetalle(false); }
  };

  const handleDeleteDetalle = async (id: number) => {
    clearMessages();
    if (soloLectura) {
      setError('La reserva ya hizo Check-out: las habitaciones no se pueden modificar.');
      return;
    }
    // Una reserva en Check-in no puede quedar sin habitaciones: el huésped
    // está físicamente en una. Cambiar de habitación sí se permite (editar);
    // lo que se bloquea es quitar la última.
    if (toCanonicalEstado(reserva?.estado) === 'Check-in' && detalles.length <= 1) {
      setError('No se puede quitar la última habitación de una reserva en Check-in. Cambiala en vez de quitarla.');
      return;
    }
    if (!confirm('¿Quitar esta habitación de la reserva?')) return;
    try {
      const original = detalles.find(d => d.id_detalle === id);
      await ReservationService.deleteDetalleReserva(id);
      // Auditoría de la baja (soft-delete).
      if (original) {
        try {
          await ReservationService.addHistorialEntry({
            fk_reserva: reservationId,
            tipo_movimiento: 'BAJA_HABITACION',
            descripcion: `Habitación #${roomNumberFor(original.fk_habitacion)} quitada de la reserva`,
            fk_usuario: currentUser?.id_usuario || currentUser?.id || 0,
          });
        } catch (e: any) { console.warn('No se pudo registrar la baja en historial:', e.message); }
      }
      if (original) {
        // Deriva las noches reales cobradas a esta habitación (puede ser
        // menos que el rango completo si se agregó a mitad de estadía en
        // Check-in) en vez de asumir el rango completo de la reserva.
        const nights = deriveNightsFromSubtotal(Number(original.subtotal), Number(original.precio_unitario));
        await sincronizarCargoAlojamiento(-nights, -Number(original.subtotal));
      }
      setSuccess('Habitación quitada.');
      await syncReservationTotal();
      await loadAll();
    } catch (err: any) { setError(err.message); }
  };

  // ── Huéspedes CRUD ──
  // Nombre y nacionalidad: sólo letras y espacios, arranca con letra, sin
  // dobles espacios, tope de caracteres. Corta el tipeo con mensaje al toque.
  const handleHuespedNombreChange = (value: string) => {
    if (value.length > MAX_NOMBRE_HUESPED) {
      setFormErrors(p => ({ ...p, nombre_completo: `El nombre completo permite un máximo de ${MAX_NOMBRE_HUESPED} caracteres.` }));
      return;
    }
    if (!SOLO_LETRAS_Y_ESPACIOS.test(value)) {
      setFormErrors(p => ({ ...p, nombre_completo: 'El nombre completo sólo puede contener letras y espacios.' }));
      return;
    }
    if (value.length > 0 && !EMPIEZA_CON_LETRA.test(value)) {
      setFormErrors(p => ({ ...p, nombre_completo: 'El primer carácter debe ser una letra.' }));
      return;
    }
    if (/ {2}/.test(value)) {
      setFormErrors(p => ({ ...p, nombre_completo: 'El nombre completo no puede tener dos espacios seguidos.' }));
      return;
    }
    setHuespedForm(p => ({ ...p, nombre_completo: value }));
    clearError('nombre_completo');
  };

  const handleHuespedNacionalidadChange = (value: string) => {
    if (value.length > MAX_NACIONALIDAD) {
      setFormErrors(p => ({ ...p, nacionalidad: `La nacionalidad permite un máximo de ${MAX_NACIONALIDAD} caracteres.` }));
      return;
    }
    if (!SOLO_LETRAS_Y_ESPACIOS.test(value)) {
      setFormErrors(p => ({ ...p, nacionalidad: 'La nacionalidad sólo puede contener letras y espacios.' }));
      return;
    }
    if (value.length > 0 && !EMPIEZA_CON_LETRA.test(value)) {
      setFormErrors(p => ({ ...p, nacionalidad: 'El primer carácter debe ser una letra.' }));
      return;
    }
    if (/ {2}/.test(value)) {
      setFormErrors(p => ({ ...p, nacionalidad: 'La nacionalidad no puede tener dos espacios seguidos.' }));
      return;
    }
    setHuespedForm(p => ({ ...p, nacionalidad: value }));
    clearError('nacionalidad');
  };

  // Documento: cédula (tipo 1) sólo dígitos; otros documentos (pasaporte, etc.)
  // admiten alfanumérico con guiones. Tope de caracteres común a ambos casos.
  const handleHuespedDocumentoChange = (value: string) => {
    const esCedula = huespedForm.fk_tipo_documento === '1';
    if (esCedula ? /[^\d]/.test(value) : !/^[A-Za-z0-9-]*$/.test(value)) {
      setFormErrors(p => ({
        ...p,
        documento: esCedula
          ? 'Para Cédula de Identidad sólo se permiten números.'
          : 'El documento sólo admite letras, números y guiones.',
      }));
      return;
    }
    if (value.length > MAX_DOCUMENTO_HUESPED) {
      setFormErrors(p => ({ ...p, documento: `El documento permite un máximo de ${MAX_DOCUMENTO_HUESPED} caracteres.` }));
      return;
    }
    setHuespedForm(p => ({ ...p, documento: value }));
    clearError('documento');
  };

  const handleAddHuesped = async (idDetalle: number) => {
    clearMessages();
    if (soloLectura) {
      setError('La reserva ya hizo Check-out: los huéspedes no se pueden modificar.');
      return;
    }

    // El cupo lo fija la cantidad de personas declarada para esa habitación
    // (adultos + niños). El botón ya se deshabilita al llenarse; esto cubre el
    // caso de que el cupo se haya reducido con el modal abierto.
    const detalle = detalles.find(d => d.id_detalle === idDetalle);
    const cupo = detalle ? cupoHuespedes(detalle) : 0;
    const cargados = (huespedesMap[idDetalle] || []).length;
    if (cupo > 0 && cargados >= cupo) {
      setError(
        `La habitación #${detalle ? roomNumberFor(detalle.fk_habitacion) : ''} se declaró para ${cupo} huésped${cupo > 1 ? 'es' : ''} y ya tiene ${cargados}. Ajustá adultos/niños en la pestaña "Habitaciones" para poder cargar más.`,
      );
      return;
    }

    const errors: Record<string, string> = {};
    if (!huespedForm.nombre_completo) errors.nombre_completo = 'Obligatorio.';
    if (!huespedForm.fk_tipo_documento) errors.fk_tipo_documento = 'Obligatorio.';
    if (!huespedForm.documento) errors.documento = 'Obligatorio.';

    if (huespedForm.documento && huespedForm.fk_tipo_documento) {
      const validationError = validarDocumentoHuesped(huespedForm.documento, huespedForm.fk_tipo_documento);
      if (validationError) errors.documento = validationError;
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    setFormErrors({});

    setSavingHuesped(true);
    try {
      await ReservationService.createHuesped({
        fk_detalle_reserva: idDetalle,
        nombre_completo: huespedForm.nombre_completo,
        documento: huespedForm.documento || null,
        fk_tipo_documento: parseInt(huespedForm.fk_tipo_documento),
        nacionalidad: huespedForm.nacionalidad || null,
        es_titular: huespedForm.es_titular
      });
      // Auditoría del alta: queda quién se sumó y a qué habitación.
      try {
        await ReservationService.addHistorialEntry({
          fk_reserva: reservationId,
          tipo_movimiento: 'ALTA_HUESPED',
          descripcion: `Huésped "${huespedForm.nombre_completo}" agregado a la habitación #${detalle ? roomNumberFor(detalle.fk_habitacion) : ''}${huespedForm.es_titular ? ' (titular)' : ''}`,
          fk_usuario: currentUser?.id_usuario || currentUser?.id || 0,
        });
      } catch (e: any) { console.warn('No se pudo registrar el alta de huésped en historial:', e.message); }
      setSuccess('Huésped agregado.');
      setShowAddHuesped(null);
      setHuespedForm({ nombre_completo: '', documento: '', fk_tipo_documento: '', nacionalidad: '', es_titular: false });
      await loadAll();
    } catch (err: any) { setError(err.message); }
    finally { setSavingHuesped(false); }
  };

  const handleDeleteHuesped = async (id: number) => {
    clearMessages();
    if (soloLectura) {
      setError('La reserva ya hizo Check-out: los huéspedes no se pueden modificar.');
      return;
    }
    if (!confirm('¿Eliminar este huésped?')) return;
    try {
      await ReservationService.deleteHuesped(id);
      setSuccess('Huésped eliminado.');
      await loadAll();
    } catch (err: any) { setError(err.message); }
  };

  // ── Historial ──
  // Descripción de la bitácora: texto libre (admite números, puntuación),
  // igual que "Observaciones" en Nueva Reserva. Corta el tipeo con mensaje al
  // toque: arranca con letra, sin dobles espacios, tope de 200 caracteres.
  const handleHistorialDescripcionChange = (value: string) => {
    if (value.length > MAX_DESCRIPCION_HISTORIAL) {
      setFormErrors(p => ({ ...p, descripcion: `La descripción permite un máximo de ${MAX_DESCRIPCION_HISTORIAL} caracteres.` }));
      return;
    }
    if (value.length > 0 && !EMPIEZA_CON_LETRA.test(value)) {
      setFormErrors(p => ({ ...p, descripcion: 'El primer carácter debe ser una letra.' }));
      return;
    }
    if (/ {2}/.test(value)) {
      setFormErrors(p => ({ ...p, descripcion: 'La descripción no puede tener dos espacios seguidos.' }));
      return;
    }
    setHistorialForm(p => ({ ...p, descripcion: value }));
    clearError('descripcion');
  };

  const handleAddHistorial = async () => {
    clearMessages();
    if (!historialForm.descripcion.trim()) {
      setFormErrors(p => ({ ...p, descripcion: 'Este campo es obligatorio.' }));
      return;
    }
    setSavingHistorial(true);
    try {
      await ReservationService.addHistorialEntry({
        fk_reserva: reservationId,
        tipo_movimiento: historialForm.tipo_movimiento,
        descripcion: historialForm.descripcion.trim(),
        fk_usuario: currentUser?.id_usuario || currentUser?.id || 0
      });
      setSuccess('Entrada registrada.');
      setShowAddHistorial(false);
      setHistorialForm({ tipo_movimiento: 'NOTA', descripcion: '' });
      await loadAll();
    } catch (err: any) { setError(err.message); }
    finally { setSavingHistorial(false); }
  };

  // Tarifa change auto-fills price
  const handleTarifaChange = (val: string) => {
    setDetalleForm(p => ({ ...p, fk_tarifa: val }));
    if (val) clearError('fk_tarifa');
    const t = tarifas.find(t => t.id.toString() === val);
    if (t) {
      setDetalleForm(p => ({ ...p, precio_unitario: t.precio_base.toString() }));
      clearError('precio_unitario');
    }
  };

  // Habitaciones que ya tienen su propio detalle en esta reserva (excluyendo
  // el que se está editando, para no bloquear su propia habitación actual).
  const idsHabitacionesAsignadas = new Set(
    detalles.filter(d => d.id_detalle !== editingDetalleId).map(d => d.fk_habitacion)
  );

  // Capacidad del tipo de la habitación elegida (0 = sin dato, no se valida).
  const capacidadHabitacionSeleccionada = (() => {
    const room = habitaciones.find(h => h.id.toString() === detalleForm.fk_habitacion);
    return Number(room?.tipo_habitacion?.capacidad) || 0;
  })();

  // Adultos y niños: sólo dígitos, cortando el tipeo ante cualquier otro
  // carácter, y sin exceder la capacidad de la habitación entre ambos.
  const handleHuespedesChange = (campo: 'cantidad_adultos' | 'cantidad_ninos', value: string) => {
    if (/[^\d]/.test(value)) {
      setFormErrors(p => ({
        ...p,
        [campo]: campo === 'cantidad_adultos'
          ? 'Sólo puede ingresar números para los adultos.'
          : 'Sólo puede ingresar números para los niños.',
      }));
      return;
    }
    if (value.length > 2) {
      setFormErrors(p => ({ ...p, [campo]: 'Permite un máximo de 2 dígitos.' }));
      return;
    }

    const otroCampo = campo === 'cantidad_adultos' ? 'cantidad_ninos' : 'cantidad_adultos';
    const otros = parseInt(detalleForm[otroCampo]) || 0;
    const propuesto = parseInt(value) || 0;
    if (capacidadHabitacionSeleccionada > 0 && propuesto + otros > capacidadHabitacionSeleccionada) {
      setFormErrors(p => ({
        ...p,
        [campo]: `La habitación admite hasta ${capacidadHabitacionSeleccionada} huésped${capacidadHabitacionSeleccionada > 1 ? 'es' : ''} en total.`,
      }));
      return;
    }

    setDetalleForm(p => ({ ...p, [campo]: value }));
    clearError(campo);
  };

  const handleHabitacionChange = (val: string) => {
    setDetalleForm(p => ({ ...p, fk_habitacion: val }));
    if (!val) {
      setTarifaWarning(null);
      return;
    }
    clearError('fk_habitacion');
    const room = habitaciones.find(h => h.id.toString() === val);

    // Los huéspedes ya cargados pueden no caber en la habitación nueva: se
    // avisa al momento en vez de esperar al guardado.
    const capacidadNueva = Number(room?.tipo_habitacion?.capacidad) || 0;
    const huespedesCargados =
      (parseInt(detalleForm.cantidad_adultos) || 0) + (parseInt(detalleForm.cantidad_ninos) || 0);
    if (capacidadNueva > 0 && huespedesCargados > capacidadNueva) {
      setFormErrors(p => ({
        ...p,
        cantidad_adultos: `Esta habitación admite hasta ${capacidadNueva} huésped${capacidadNueva > 1 ? 'es' : ''} y tenés ${huespedesCargados} cargados. Ajustá las cantidades.`,
      }));
    } else {
      clearError('cantidad_adultos');
      clearError('cantidad_ninos');
    }

    if (!room || !room.fk_tipo_habitacion) {
      setTarifaWarning(null);
      return;
    }

    const matchingTarifa = resolveTarifaForStay(tarifas, room.fk_tipo_habitacion, reserva?.fecha_entrada || '');
    if (matchingTarifa) {
      setTarifaWarning(null);
      setDetalleForm(p => ({
        ...p,
        fk_habitacion: val,
        fk_tarifa: matchingTarifa.id.toString(),
        precio_unitario: matchingTarifa.precio_base.toString()
      }));
      clearError('fk_tarifa');
      clearError('precio_unitario');
    } else {
      // Silent no-op fix: switching from a room that matched to one that
      // doesn't must not leave the previous room's tarifa/price attached.
      setDetalleForm(p => ({ ...p, fk_habitacion: val, fk_tarifa: '', precio_unitario: '' }));
      setTarifaWarning(
        `No hay una tarifa activa para el tipo "${room.tipo_habitacion?.nombre || 'seleccionado'}" en las fechas de esta reserva. Selecciona una tarifa manualmente.`
      );
    }
  };

  // Faceted counts mirror ManageHabitaciones: each option is counted against the
  // *other* active filter so the chip labels never contradict the visible grid.
  const { filteredPickerRooms, habOccOptions } = useMemo(() => {
    const bySearch = habitaciones.filter(h => h.numero_habitacion?.toString().includes(habSearch));

    const habOccOptions: ChipOption<PickerOccFilter>[] = [
      { value: 'todos', label: `Todas (${bySearch.length})` },
      { value: 'disponibles', label: `Disponibles (${bySearch.filter(h => !h.ocupado).length})` },
      { value: 'ocupadas', label: `Ocupadas (${bySearch.filter(h => h.ocupado).length})` },
    ];

    const filteredPickerRooms = bySearch.filter(h =>
      habOccFilter === 'todos' || (habOccFilter === 'ocupadas' ? h.ocupado : !h.ocupado)
    );

    return { filteredPickerRooms, habOccOptions };
  }, [habitaciones, habSearch, habOccFilter]);

  const getStatusColor = (e: string) => {
    switch (e?.toLowerCase()) {
      case 'confirmada': case 'check-in': return COLORS.success;
      case 'pendiente': return COLORS.warning;
      case 'cancelada': return COLORS.error;
      case 'check-out': return COLORS.indigo;
      default: return COLORS.textSecondary;
    }
  };

  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'habitaciones', label: 'Habitaciones', icon: <BedDouble size={16} /> },
    { key: 'huespedes', label: 'Huéspedes', icon: <Users size={16} /> },
    { key: 'historial', label: 'Historial', icon: <ClipboardList size={16} /> },
    { key: 'folio', label: 'Folio', icon: <FileText size={16} /> },
  ];

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}><div className="loader"></div></div>;
  if (!reserva) return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Reserva no encontrada.</div>;

  const detalleColumns: Column<DetalleReserva>[] = [
    { header: 'Habitación', render: (d) => <span style={{ fontWeight: 600 }}>#{d.habitaciones?.numero_habitacion || d.fk_habitacion}</span> },
    { header: 'Tipo', render: (d) => <span style={{ color: 'var(--text-secondary)' }}>{d.habitaciones?.tipo_habitacion?.nombre || '-'}</span> },
    { header: 'Tarifa', render: (d) => d.tarifas?.nombre || '-' },
    { header: 'Adultos', render: (d) => d.cantidad_adultos, align: 'center' },
    { header: 'Niños', render: (d) => d.cantidad_ninos, align: 'center' },
    { header: 'Precio', render: (d) => <span style={{ fontWeight: 600 }}>{formatGs(d.precio_unitario)}</span> },
    { header: 'Subtotal', render: (d) => <span style={{ fontWeight: 700, color: COLORS.success }}>{formatGs(d.subtotal)}</span> },
    {
      header: '', align: 'center', render: (d) => soloLectura ? (
        <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>—</span>
      ) : (
        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
          <button
            onClick={() => handleOpenEditDetalle(d)}
            title="Cambiar habitación"
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: '30px', height: '30px', borderRadius: '8px',
              border: '1px solid var(--glass-border)', background: COLORS.glassBg,
              color: 'var(--text-secondary)', cursor: 'pointer', transition: 'all 0.2s ease',
            }}
          >
            <Pencil size={16} />
          </button>
          <button onClick={() => handleDeleteDetalle(d.id_detalle)} className="icon-btn-danger" title="Quitar"><Trash2 size={16} /></button>
        </div>
      )
    }
  ];

  return (
    <ModuleLayout
      title={`Reserva ${reserva.codigo_reserva || `#${reserva.id_reserva}`}`}
      description={
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span>{reserva.clientes?.razon_social || 'Sin cliente'}</span>
          {reserva.clientes && (
            <ClienteRecurrenteBadge
              isRecurrente={isClienteRecurrente(reserva.clientes)}
              count={getReservationCount(reserva.clientes)}
              showCount
              size="sm"
            />
          )}
          <span style={{ opacity: 0.6 }}>·</span>
          <span>
            {reserva.fecha_entrada ? new Date(reserva.fecha_entrada + 'T12:00:00').toLocaleDateString() : ''} → {reserva.fecha_salida ? new Date(reserva.fecha_salida + 'T12:00:00').toLocaleDateString() : ''}
          </span>
        </div>
      }
      actions={
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button onClick={onBack} className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ArrowLeft size={16} /> Volver a Reservas
          </button>
          <span className="status-badge" style={{ '--badge-color': getStatusColor(reserva.estado) } as React.CSSProperties}>
            {reserva.estado}
          </span>
          {getAllowedTargets(reserva.estado).map(target => {
            const copy = getTransitionCopy(target);
            return (
              <button
                key={target}
                onClick={() => handleEstadoAction(target)}
                disabled={changingEstado}
                className={copy.variant === 'danger' ? 'btn-ghost' : 'btn-primary-sm'}
                style={copy.variant === 'danger' ? { color: COLORS.error, borderColor: tint('error', 0.4) } : undefined}
              >
                {copy.actionLabel}
              </button>
            );
          })}
          <span style={{ fontWeight: 700, color: COLORS.success }}>
            Total: {formatGs(reserva.total_estimado || 0)}
          </span>
        </div>
      }
    >
      {/* Messages */}
      {error && <div className="status-message status-error" style={{ marginBottom: '16px' }}>{error}</div>}
      {success && <div className="status-message status-success" style={{ marginBottom: '16px' }}>{success}</div>}

      {soloLectura && (
        <div
          className="status-message"
          style={{ marginBottom: '16px', color: 'var(--text-secondary)', border: '1px solid var(--glass-border)' }}
        >
          Esta reserva ya hizo Check-out: sólo se puede visualizar. Las habitaciones y los huéspedes
          no se pueden modificar; la bitácora sigue disponible para dejar registro.
        </div>
      )}

      {/* Confirmación de transición de estado crítica */}
      {confirmTarget && (
        <ConfirmDialog
          isOpen={true}
          title={getTransitionCopy(confirmTarget).title}
          message={getTransitionCopy(confirmTarget).message}
          confirmLabel={getTransitionCopy(confirmTarget).confirmLabel}
          variant={getTransitionCopy(confirmTarget).variant}
          loading={changingEstado}
          onConfirm={() => applyEstadoChange(confirmTarget)}
          onCancel={() => setConfirmTarget(null)}
        />
      )}

      {/* Ofrecer facturar el folio tras el Check-out */}
      {facturarFolioId != null && (
        <ConfirmDialog
          isOpen={true}
          title="Facturar folio"
          message="El huésped tiene consumos cargados. ¿Querés generar la factura del folio ahora?"
          confirmLabel="Facturar folio"
          cancelLabel="Más tarde"
          onConfirm={() => {
            const id = facturarFolioId;
            setFacturarFolioId(null);
            if (id != null) onFacturarFolio?.(id);
          }}
          onCancel={() => setFacturarFolioId(null)}
        />
      )}

      {/* Tabs */}
      <div className="tabs-bar">
        {tabs.map(t => (
          <button key={t.key} className={`tab-btn ${activeTab === t.key ? 'active' : ''}`} onClick={() => { setActiveTab(t.key); clearMessages(); }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ═══ TAB: HABITACIONES ═══ */}
      {activeTab === 'habitaciones' && (
        <div className="tab-content">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '18px' }}>Habitaciones Asignadas</h3>
            {!soloLectura && (
              <button className="btn-primary-sm" onClick={handleOpenAddDetalle}><Plus size={16} /> Agregar</button>
            )}
          </div>
          <Modal
            isOpen={showAddDetalle}
            onClose={closeDetalleModal}
            title={editingDetalleId ? 'Cambiar Habitación' : 'Agregar Habitación'}
            maxWidth={760}
            footer={
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button className="btn-ghost" onClick={closeDetalleModal}>Cancelar</button>
                <button className="btn-primary-sm" onClick={handleSaveDetalle} disabled={savingDetalle}>{savingDetalle ? 'Guardando...' : 'Guardar'}</button>
              </div>
            }
          >
            <div className="room-picker-modal">
              {/* LEFT: room selector (master) */}
              <div className="room-picker-selector">
                <label>Habitación *</label>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', margin: '8px 0 12px' }}>
                  <SearchBox value={habSearch} onChange={setHabSearch} placeholder="Buscar por número..." maxWidth={220} />
                  <FilterChips options={habOccOptions} value={habOccFilter} onChange={setHabOccFilter} icon={<BedDouble size={16} />} />
                </div>
                {filteredPickerRooms.length === 0 ? (
                  <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '24px' }}>No se encontraron habitaciones.</p>
                ) : (
                  <div
                    className="rooms-grid"
                    style={{ maxHeight: '440px', overflowY: 'auto', gap: '12px', marginTop: 0, paddingRight: '10px', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))' }}
                  >
                    {filteredPickerRooms.map(room => (
                      <RoomCard
                        key={room.id}
                        room={room}
                        occupancyLabel={
                          room.ocupado
                            ? 'OCUPADA'
                            : idsHabitacionesAsignadas.has(room.id)
                            ? 'YA ASIGNADA'
                            : 'DISPONIBLE'
                        }
                        occupancyStyle={
                          room.ocupado || idsHabitacionesAsignadas.has(room.id)
                            ? OCUPADO_STYLE
                            : DESOCUPADO_STYLE
                        }
                        selectable
                        selected={detalleForm.fk_habitacion === room.id.toString()}
                        disabled={room.ocupado || idsHabitacionesAsignadas.has(room.id)}
                        onSelect={r => handleHabitacionChange(r.id.toString())}
                      />
                    ))}
                  </div>
                )}
                {formErrors.fk_habitacion && <span className="field-error">{formErrors.fk_habitacion}</span>}
              </div>

              {/* RIGHT: tarifa + price detail for the selected room, always in view */}
              <div className="room-picker-detail" ref={detailPaneRef}>
                <div className="input-group">
                  <label>Tarifa *</label>
                  <select
                    className={`input-field ${formErrors.fk_tarifa ? 'input-error' : ''}`}
                    value={detalleForm.fk_tarifa}
                    onChange={e => handleTarifaChange(e.target.value)}
                    onBlur={e => checkRequired('fk_tarifa', e.target.value)}
                  >
                    <option value="">Seleccionar...</option>
                    {tarifas.map(t => <option key={t.id} value={t.id} style={{ color: COLORS.black }}>{t.nombre} - ${t.precio_base}</option>)}
                  </select>
                  {formErrors.fk_tarifa && <span className="field-error">{formErrors.fk_tarifa}</span>}
                </div>
                {tarifaWarning && (
                  <div className="status-message status-error">{tarifaWarning}</div>
                )}
                <div className="input-group">
                  <label>Precio Unit.</label>
                  {/* Sólo lectura: el precio siempre se deriva de la tarifa elegida. */}
                  <input
                    className="input-field"
                    type="text"
                    value={detalleForm.precio_unitario ? formatGs(Number(detalleForm.precio_unitario)) : '—'}
                    readOnly
                    title="Se toma de la tarifa seleccionada"
                    style={{ cursor: 'default' }}
                  />
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px', display: 'block' }}>
                    Se toma de la tarifa seleccionada.
                  </span>
                  {formErrors.precio_unitario && (
                    <span className="field-error">{formErrors.precio_unitario}</span>
                  )}
                </div>
                <div className="room-picker-counts">
                  <div className="input-group">
                    <label>Adultos *</label>
                    <input
                      className={`input-field ${formErrors.cantidad_adultos ? 'input-error' : ''}`}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={detalleForm.cantidad_adultos}
                      onChange={e => handleHuespedesChange('cantidad_adultos', e.target.value)}
                    />
                    {formErrors.cantidad_adultos && (
                      <span className="field-error">{formErrors.cantidad_adultos}</span>
                    )}
                  </div>
                  <div className="input-group">
                    <label>Niños</label>
                    <input
                      className={`input-field ${formErrors.cantidad_ninos ? 'input-error' : ''}`}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={detalleForm.cantidad_ninos}
                      onChange={e => handleHuespedesChange('cantidad_ninos', e.target.value)}
                    />
                    {formErrors.cantidad_ninos && (
                      <span className="field-error">{formErrors.cantidad_ninos}</span>
                    )}
                  </div>
                </div>
                {capacidadHabitacionSeleccionada > 0 && (
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    Capacidad de la habitación: {capacidadHabitacionSeleccionada} huésped{capacidadHabitacionSeleccionada > 1 ? 'es' : ''}
                    {' · '}cargados: {(parseInt(detalleForm.cantidad_adultos) || 0) + (parseInt(detalleForm.cantidad_ninos) || 0)}
                  </span>
                )}
              </div>
            </div>
            {detalleForm.fk_habitacion && !detailInView && (
              <button
                type="button"
                className="scroll-hint-btn"
                onClick={() => detailPaneRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                aria-label="Bajar para completar tarifa y precio"
              >
                <ChevronDown size={22} />
              </button>
            )}
          </Modal>

          <DataTable data={detalles} columns={detalleColumns} emptyMessage="No hay habitaciones asignadas." keyExtractor={d => d.id_detalle} />
        </div>
      )}

      {/* ═══ TAB: HUÉSPEDES ═══ */}
      {activeTab === 'huespedes' && (
        <div className="tab-content">
          <h3 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>Huéspedes por Habitación</h3>
          {detalles.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '30px' }}>Primero agrega habitaciones en la pestaña "Habitaciones".</p>
          ) : (
            detalles.map(det => {
              // El cupo lo fija lo declarado al asignar la habitación: no se
              // pueden cargar más huéspedes que adultos + niños.
              const cupo = cupoHuespedes(det);
              const cargados = (huespedesMap[det.id_detalle] || []).length;
              const lleno = cupo > 0 && cargados >= cupo;
              return (
              <div key={det.id_detalle} className="huesped-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <BedDouble size={16} color={COLORS.primaryLight} />
                    Hab. #{det.habitaciones?.numero_habitacion || det.fk_habitacion}
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 400 }}>({det.habitaciones?.tipo_habitacion?.nombre || 'N/A'})</span>
                    {cupo > 0 && (
                      <span style={{ fontSize: '12px', color: lleno ? COLORS.warning : 'var(--text-secondary)', fontWeight: 400 }}>
                        · {cargados}/{cupo} huésped{cupo > 1 ? 'es' : ''}
                      </span>
                    )}
                  </h4>
                  {!soloLectura && (
                    <button
                      className="btn-primary-sm"
                      disabled={lleno}
                      title={lleno ? `La habitación se declaró para ${cupo} huésped${cupo > 1 ? 'es' : ''}. Ajustá adultos/niños en "Habitaciones" para cargar más.` : undefined}
                      style={lleno ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
                      onClick={() => { setShowAddHuesped(det.id_detalle); setFormErrors({}); setHuespedForm({ nombre_completo: '', documento: '', fk_tipo_documento: '', nacionalidad: '', es_titular: false }); }}
                    >
                      <Plus size={14} /> Huésped
                    </button>
                  )}
                </div>
                {(huespedesMap[det.id_detalle] || []).length === 0 ? (
                  <p style={{ color: 'var(--text-secondary)', fontSize: '13px', padding: '8px 0' }}>Sin huéspedes registrados.</p>
                ) : (
                  <div className="huesped-list">
                    {(huespedesMap[det.id_detalle] || []).map(h => (
                      <div key={h.id_huesped} className="huesped-item">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                          <UserCheck size={16} color={h.es_titular ? COLORS.success : COLORS.textMuted} />
                          <div>
                            <span style={{ fontWeight: 600 }}>{h.nombre_completo}</span>
                            {h.es_titular && <span className="badge-titular">Titular</span>}
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                              {h.documento || 'Sin doc.'} {h.nacionalidad ? `· ${h.nacionalidad}` : ''}
                            </div>
                          </div>
                        </div>
                        {!soloLectura && (
                          <button onClick={() => handleDeleteHuesped(h.id_huesped)} className="icon-btn-danger" title="Eliminar"><Trash2 size={14} /></button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              );
            })
          )}
          
          <Modal 
            isOpen={showAddHuesped !== null} 
            onClose={() => setShowAddHuesped(null)} 
            title={`Agregar Huésped a Hab. #${detalles.find(d => d.id_detalle === showAddHuesped)?.habitaciones?.numero_habitacion || ''}`}
          >
            <div className="form-grid" style={{ gap: '10px' }}>
              <div className="input-group" style={{ marginBottom: '6px' }}>
                <label>Nombre Completo *</label>
                <input
                  className={`input-field ${formErrors.nombre_completo ? 'input-error' : ''}`}
                  value={huespedForm.nombre_completo}
                  onChange={e => handleHuespedNombreChange(e.target.value)}
                  onBlur={e => checkRequired('nombre_completo', e.target.value)}
                  placeholder="Nombre y Apellido"
                />
                {formErrors.nombre_completo && <span className="field-error">{formErrors.nombre_completo}</span>}
              </div>
              <div className="input-group" style={{ marginBottom: '6px' }}>
                <label>Tipo Doc. *</label>
                <select
                  className={`input-field ${formErrors.fk_tipo_documento ? 'input-error' : ''}`}
                  value={huespedForm.fk_tipo_documento}
                  onChange={e => { setHuespedForm(p => ({ ...p, fk_tipo_documento: e.target.value })); if (e.target.value) clearError('fk_tipo_documento'); }}
                  onBlur={e => checkRequired('fk_tipo_documento', e.target.value)}
                >
                  <option value="" disabled hidden>Seleccionar...</option>
                  {tiposDocumentoHuesped.map(td => <option key={td.cod_tipodoc} value={td.cod_tipodoc} style={{ color: COLORS.black }}>{td.descripcion_tipodoc}</option>)}
                </select>
                {formErrors.fk_tipo_documento && <span className="field-error">{formErrors.fk_tipo_documento}</span>}
              </div>
              <div className="input-group" style={{ marginBottom: '6px' }}>
                <label>Documento *</label>
                <input
                  className={`input-field ${(formErrors.documento || validarDocumentoHuesped(huespedForm.documento, huespedForm.fk_tipo_documento)) ? 'input-error' : ''}`}
                  value={huespedForm.documento}
                  onChange={e => handleHuespedDocumentoChange(e.target.value)}
                  onBlur={e => checkRequired('documento', e.target.value)}
                  placeholder="CI / Pasaporte"
                />
                {(formErrors.documento || validarDocumentoHuesped(huespedForm.documento, huespedForm.fk_tipo_documento)) && (
                  <span className="field-error">
                    {formErrors.documento || validarDocumentoHuesped(huespedForm.documento, huespedForm.fk_tipo_documento)}
                  </span>
                )}
              </div>
              <div className="input-group" style={{ marginBottom: '6px' }}>
                <label>Nacionalidad</label>
                <input
                  className={`input-field ${formErrors.nacionalidad ? 'input-error' : ''}`}
                  value={huespedForm.nacionalidad}
                  onChange={e => handleHuespedNacionalidadChange(e.target.value)}
                  placeholder="Ej: Paraguaya"
                />
                {formErrors.nacionalidad && <span className="field-error">{formErrors.nacionalidad}</span>}
              </div>
              <div className="input-group" style={{ marginBottom: '6px', display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={huespedForm.es_titular} onChange={e => setHuespedForm(p => ({ ...p, es_titular: e.target.checked }))} />
                  Es Titular
                </label>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px', justifyContent: 'flex-end' }}>
              <button className="btn-ghost" onClick={() => setShowAddHuesped(null)}>Cancelar</button>
              <button className="btn-primary-sm" onClick={() => showAddHuesped && handleAddHuesped(showAddHuesped)} disabled={savingHuesped}>{savingHuesped ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </Modal>
        </div>
      )}

      {/* ═══ TAB: HISTORIAL ═══ */}
      {activeTab === 'historial' && (
        <div className="tab-content">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '18px' }}>Bitácora de Estancia</h3>
            <button className="btn-primary-sm" onClick={() => { setShowAddHistorial(true); setFormErrors({}); }}><Plus size={16} /> Nueva Entrada</button>
          </div>
          
          <Modal isOpen={showAddHistorial} onClose={() => setShowAddHistorial(false)} title="Nueva Entrada de Bitácora">
            <div className="form-grid" style={{ gap: '12px' }}>
              <div className="input-group" style={{ marginBottom: '8px' }}>
                <label>Tipo de Movimiento</label>
                <select className="input-field" value={historialForm.tipo_movimiento} onChange={e => setHistorialForm(p => ({ ...p, tipo_movimiento: e.target.value }))}>
                  {['NOTA', 'MODIFICACION', 'CAMBIO_ESTADO', 'CHECK_IN', 'CHECK_OUT', 'CANCELACION'].map(t => (
                    <option key={t} value={t} style={{ color: COLORS.black }}>{t.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>
              <div className="input-group span-2" style={{ marginBottom: '8px' }}>
                <label>Descripción *</label>
                <textarea
                  className={`input-field ${formErrors.descripcion ? 'input-error' : ''}`}
                  rows={3}
                  value={historialForm.descripcion}
                  onChange={e => handleHistorialDescripcionChange(e.target.value)}
                  onBlur={e => checkRequired('descripcion', e.target.value)}
                  placeholder="Describe el evento..."
                  style={{ resize: 'vertical' }}
                />
                {formErrors.descripcion && <span className="field-error">{formErrors.descripcion}</span>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px', justifyContent: 'flex-end' }}>
              <button className="btn-ghost" onClick={() => setShowAddHistorial(false)}>Cancelar</button>
              <button className="btn-primary-sm" onClick={handleAddHistorial} disabled={savingHistorial}>{savingHistorial ? 'Guardando...' : 'Registrar'}</button>
            </div>
          </Modal>

          {historial.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '30px' }}>No hay registros en la bitácora.</p>
          ) : (
            <div className="timeline">
              {historial.map(h => (
                <div key={h.id_historial} className="timeline-item">
                  <div className="timeline-dot"><Clock size={12} /></div>
                  <div className="timeline-content">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                      <span className="timeline-type">{h.tipo_movimiento.replace(/_/g, ' ')}</span>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {h.fecha_movimiento ? new Date(h.fecha_movimiento).toLocaleString() : 'Sin fecha'} · {h.usuario?.nombre || 'Sistema'}
                      </span>
                    </div>
                    <p style={{ margin: '6px 0 0 0', color: 'var(--text-secondary)', fontSize: '14px' }}>{h.descripcion || '-'}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ TAB: FOLIO ═══ */}
      {activeTab === 'folio' && (
        <div className="tab-content">
          {folioResumenLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
              <div className="loader"></div>
            </div>
          ) : folioResumenError ? (
            <div className="status-message status-error">{folioResumenError}</div>
          ) : !folioResumen ? (
            <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '30px' }}>
              Todavía no se generó un folio para esta reserva. Se crea automáticamente al hacer check-in.
            </p>
          ) : (
            <div
              style={{
                background: 'var(--glass-bg)',
                border: '1px solid var(--glass-border)',
                borderRadius: 16,
                padding: 24,
                maxWidth: 480,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <FileText size={22} color={COLORS.successLight} />
                <span style={{ fontSize: 18, fontWeight: 600 }}>Folio #{folioResumen.id_folio}</span>
                <span
                  className="status-badge"
                  style={{ '--badge-color': folioResumen.estado === 'abierto' ? COLORS.success : COLORS.textSecondary } as React.CSSProperties}
                >
                  {folioResumen.estado?.toUpperCase()}
                </span>
              </div>
              <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 16px', margin: 0 }}>
                <dt style={{ color: 'var(--text-secondary)' }}>Total acumulado</dt>
                <dd style={{ margin: 0, fontWeight: 700 }}>{formatGs(folioResumen.total_acumulado)}</dd>
                <dt style={{ color: 'var(--text-secondary)' }}>Apertura</dt>
                <dd style={{ margin: 0 }}>{folioResumen.created_at ? new Date(folioResumen.created_at).toLocaleString() : '-'}</dd>
              </dl>
              <button
                className="btn-primary-sm"
                style={{ marginTop: 20, display: 'inline-flex', alignItems: 'center', gap: 8 }}
                onClick={() => onViewFolio?.(folioResumen.id_folio)}
                disabled={!onViewFolio}
              >
                <FileText size={16} /> Ver folio completo
              </button>
            </div>
          )}
        </div>
      )}
    </ModuleLayout>
  );
}
