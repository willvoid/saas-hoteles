import { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { folioService, Concepto } from '../services/folioService';
import { DataTable, Column } from '../components/DataTable';
import { ModuleLayout } from '../components/ModuleLayout';
import { SearchBox } from '../components/SearchBox';
import ConsumosFolioModal from '../components/ConsumosFolioModal';
import type { BorradorConsumo, LineaConsumo } from '../components/ConsumosFolioModal';
import { construirDesgloseAlojamiento, esCargoDeAlojamiento } from '../utils/alojamiento';
import { formatGs } from '../utils/currency';
import { ReservationService } from '../services/reservationService';
import { normalizeRole } from '../utils/permissions';
import { ArrowLeft, Plus, Wallet, Receipt, AlertTriangle, BedDouble, Unlock, Lock } from 'lucide-react';
import '../index.css';

function ModalPortal({ children }: { children: React.ReactNode }) {
  return ReactDOM.createPortal(children, document.body);
}

export type { BorradorConsumo, LineaConsumo };

interface FolioDetailProps {
  folioId: number;
  onBack: () => void;
  currentUser: any;
  /**
   * Lleva al alta de un producto nuevo en Productos y Servicios. Recibe lo ya
   * cargado en el modal para poder restaurarlo al volver.
   */
  onCrearProducto?: (borrador: BorradorConsumo) => void;
  /** Producto recién creado desde "+ Crear nuevo producto": se agrega solo al
   *  volver acá, reabriendo el modal de consumos. */
  conceptoPrecargado?: any | null;
  /** Avisa que ya se aplicó `conceptoPrecargado`, para que no se reutilice. */
  onConceptoPrecargadoConsumido?: () => void;
  /** Vuelta desde "+ Crear nuevo producto" sin haber creado nada (Cancelar):
   *  reabre el modal con lo que ya estaba cargado. */
  reabrirCargarConsumo?: boolean;
  /** Avisa que ya se aplicó `reabrirCargarConsumo`, para que no se reutilice. */
  onReabrirCargarConsumoConsumido?: () => void;
  /** Lista a restaurar al volver de Productos (con o sin producto nuevo). */
  borradorConsumo?: BorradorConsumo | null;
  /**
   * Sólo se pasa cuando se llegó acá desde "Ver folio completo" en el detalle
   * de una reserva: agrega el botón "Volver a Reserva" para retomarla.
   */
  onVolverAReserva?: () => void;
}

export default function FolioDetail({
  folioId,
  onBack,
  currentUser,
  onCrearProducto,
  conceptoPrecargado,
  onConceptoPrecargadoConsumido,
  reabrirCargarConsumo,
  onReabrirCargarConsumoConsumido,
  borradorConsumo,
  onVolverAReserva,
}: FolioDetailProps) {
  const [folio, setFolio] = useState<any>(null);
  const [conceptos, setConceptos] = useState<Concepto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Reapertura manual de un folio cerrado (sólo admin/gerente). Desacoplada
  // del estado de la reserva: no dispara check-in/check-out ni ningún otro
  // trigger, es sólo para poder seguir editando consumos/facturación.
  const role = normalizeRole(currentUser?.cargo);
  const puedeReabrirFolio = role === 'admin' || role === 'gerente';
  const [showConfirmReopen, setShowConfirmReopen] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [showConfirmClose, setShowConfirmClose] = useState(false);
  const [closing, setClosing] = useState(false);

  // Modal de consumos: arranca con los cargos que el folio ya tiene y admite
  // altas, cambios y bajas. Nada se persiste hasta confirmar.
  const [showAddCargo, setShowAddCargo] = useState(false);
  const [lineas, setLineas] = useState<LineaConsumo[]>([]);
  /** Cargos ya guardados que se marcaron para dar de baja al confirmar. */
  const [cargosAQuitar, setCargosAQuitar] = useState<number[]>([]);
  const [errorModal, setErrorModal] = useState<string | null>(null);
  const [savingCargo, setSavingCargo] = useState(false);

  // Búsqueda sobre los cargos ya cargados en el folio (por nombre de concepto).
  const [cargoSearch, setCargoSearch] = useState('');

  // Habitaciones asignadas a la reserva: son las que componen el alojamiento
  // y alimentan su tabla propia.
  const [detallesReserva, setDetallesReserva] = useState<any[]>([]);

  useEffect(() => {
    loadFolio();
    loadConceptos();
  }, [folioId]);

  // Las habitaciones cuelgan de la reserva, así que hay que esperar a saber
  // cuál es. Se recargan junto con el folio para que un cambio de fechas o de
  // habitaciones se refleje también acá.
  useEffect(() => {
    const idReserva = folio?.fk_reserva;
    if (!idReserva) return;
    let cancelado = false;
    (async () => {
      try {
        const data = await ReservationService.getDetalleReserva(idReserva);
        if (!cancelado) setDetallesReserva(data || []);
      } catch (err: any) {
        console.warn('Error cargando las habitaciones de la reserva:', err.message);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [folio]);

  // Live: el cargo automático de Alojamiento lo actualiza ReservationForm al
  // editar las fechas de la reserva, desde otra pantalla o incluso otra
  // sesión. Sin esto, el monto nuevo sólo se vería recargando la página a
  // mano. `silent` evita el spinner de carga completa en cada evento.
  useEffect(() => {
    const unsubscribe = folioService.subscribeToFolioChanges(folioId, () => {
      loadFolio({ silent: true });
    });
    return unsubscribe;
  }, [folioId]);

  const loadFolio = async (opts?: { silent?: boolean }) => {
    try {
      if (!opts?.silent) setLoading(true);
      const data = await folioService.getFolioById(folioId);
      setFolio(data);
    } catch (err: any) {
      if (opts?.silent) {
        console.warn('Error al refrescar el folio en tiempo real:', err.message);
      } else {
        setError(err.message || 'Error al cargar los detalles del folio.');
      }
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  };

  const loadConceptos = async () => {
    try {
      const data = await folioService.getConceptos();
      // Solo productos activos son seleccionables al cargar un consumo; los
      // dados de baja desde "Productos y servicios" ya no deben ofrecerse.
      const activos = (data || []).filter(
        (c: any) => (c.estado || 'ACTIVO').toString().trim().toLowerCase() === 'activo'
      );
      setConceptos(activos);
    } catch (err) {
      console.error('Error cargando conceptos:', err);
    }
  };

  const clearMessages = () => {
    setError(null);
    setSuccess(null);
  };

  /** Cargos ya volcados al folio (los INACTIVO son bajas lógicas). */
  const cargosVigentes = (folio?.cargos_folio || []).filter((c: any) => c.estado !== 'INACTIVO');

  // El alojamiento tiene su propia tabla y su propia fuente de verdad (las
  // habitaciones de la reserva), así que queda fuera de la lista de consumos:
  // ni se muestra ahí, ni entra al modal de "Cargar o editar consumo".
  const cargoAlojamiento = cargosVigentes.find((c: any) => esCargoDeAlojamiento(c.concepto?.nombre));
  const cargosConsumo = cargosVigentes.filter((c: any) => !esCargoDeAlojamiento(c.concepto?.nombre));

  const desgloseAlojamiento = construirDesgloseAlojamiento(
    detallesReserva,
    folio?.reserva?.fecha_entrada || '',
    folio?.reserva?.fecha_salida || '',
  );

  /** Convierte un cargo guardado del folio en una línea editable del modal. */
  const cargoALinea = (c: any): LineaConsumo => ({
    idCargo: c.id_cargo,
    fk_concepto: Number(c.fk_concepto),
    nombre: c.concepto?.nombre || `ID: ${c.fk_concepto}`,
    cantidad: String(c.cantidad),
    precioUnitario: Number(c.monto_unitario),
    original: {
      fk_concepto: Number(c.fk_concepto),
      cantidad: Number(c.cantidad),
      montoTotal: Number(c.monto_total),
    },
  });

  /** Estado del modal, para conservarlo al ir a crear un producto nuevo. */
  const borradorActual = (): BorradorConsumo => ({ lineas, cargosAQuitar });

  const limpiarModal = () => {
    setErrorModal(null);
    setCargosAQuitar([]);
  };

  /** Abre el modal con los consumos que el folio ya tiene, listos para editar. */
  const handleOpenAddCargo = () => {
    clearMessages();
    limpiarModal();
    setLineas(cargosConsumo.map(cargoALinea));
    setShowAddCargo(true);
  };

  const handleCloseAddCargo = () => {
    setShowAddCargo(false);
    setLineas([]);
    limpiarModal();
  };

  // Vuelta desde "+ Crear nuevo producto": reabre el modal con todo lo que ya
  // estaba cargado (el borrador viaja por Dashboard), sumando el producto
  // recién creado si se guardó. Con producto, espera a que `conceptos` traiga
  // la lista fresca (incluyéndolo) antes de aplicarlo; un ref asegura que se
  // haga una sola vez aunque el efecto se re-dispare.
  const aperturaAlVolverRef = useRef(false);
  useEffect(() => {
    if (aperturaAlVolverRef.current) return;
    if (!conceptoPrecargado && !reabrirCargarConsumo) return;
    // Sin folio todavía no se sabe qué cargos tiene: se espera a que cargue
    // para no reabrir el modal con la lista vacía.
    if (!folio) return;

    const restaurar = () => {
      clearMessages();
      limpiarModal();
      setLineas(borradorConsumo?.lineas ?? cargosConsumo.map(cargoALinea));
      setCargosAQuitar(borradorConsumo?.cargosAQuitar ?? []);
      setShowAddCargo(true);
    };

    if (conceptoPrecargado) {
      if (conceptos.length === 0) return;
      aperturaAlVolverRef.current = true;
      restaurar();
      const conc = conceptos.find(c => c.id_concepto === conceptoPrecargado.id_concepto);
      if (conc) {
        const yaEsta = (borradorConsumo?.lineas ?? []).some(l => l.fk_concepto === conc.id_concepto);
        if (!yaEsta) {
          setLineas(prev => [
            ...prev,
            {
              idCargo: null,
              fk_concepto: conc.id_concepto,
              nombre: conc.nombre,
              cantidad: '1',
              precioUnitario: Number(conc.arancel) || 0,
            },
          ]);
        }
      }
      onConceptoPrecargadoConsumido?.();
    } else {
      aperturaAlVolverRef.current = true;
      restaurar();
      onReabrirCargarConsumoConsumido?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folio, conceptos, conceptoPrecargado, reabrirCargarConsumo]);

  /**
   * Vuelca al folio todo lo que se armó en el modal: altas, cambios de
   * producto o cantidad, y bajas. Se aplica en ese orden y de a una operación,
   * así un fallo a mitad deja el modal con lo que todavía no se guardó.
   *
   * Las validaciones de cantidad y precio ya las hizo el modal antes de llamar.
   */
  const handleAddCargo = async () => {
    clearMessages();
    setErrorModal(null);

    const nuevas = lineas.filter(l => l.idCargo == null);
    const modificadas = lineas.filter(
      l =>
        l.idCargo != null &&
        l.original != null &&
        (l.fk_concepto !== l.original.fk_concepto ||
          parseInt(l.cantidad, 10) !== l.original.cantidad),
    );

    if (nuevas.length === 0 && modificadas.length === 0 && cargosAQuitar.length === 0) {
      setErrorModal('No hay cambios para guardar.');
      return;
    }

    setSavingCargo(true);
    // Copia mutable: lo que se va aplicando se saca, así un error deja en el
    // modal sólo lo pendiente y reintentar no duplica nada.
    let restantes = [...lineas];
    let bajasPendientes = [...cargosAQuitar];
    try {
      for (const linea of nuevas) {
        const cantidad = parseInt(linea.cantidad, 10);
        const creado = await folioService.addCargo(
          {
            fk_folio: folioId,
            fk_concepto: linea.fk_concepto,
            cantidad,
            monto_unitario: linea.precioUnitario,
            monto_total: cantidad * linea.precioUnitario,
            fk_usuario: currentUser?.id_usuario || currentUser?.id || null,
          },
          // Un concepto repetido no se fusiona: se corta y se avisa.
          { rechazarDuplicado: true },
        );
        // Ya guardada: si algo falla después, no se vuelve a insertar.
        restantes = restantes.map(l =>
          l === linea
            ? {
                ...l,
                idCargo: creado.id_cargo,
                original: {
                  fk_concepto: l.fk_concepto,
                  cantidad,
                  montoTotal: cantidad * l.precioUnitario,
                },
              }
            : l,
        );
      }

      for (const linea of modificadas) {
        const cantidad = parseInt(linea.cantidad, 10);
        const montoTotal = cantidad * linea.precioUnitario;
        await folioService.updateCargo(
          linea.idCargo as number,
          {
            fk_concepto: linea.fk_concepto,
            cantidad,
            monto_unitario: linea.precioUnitario,
            monto_total: montoTotal,
          },
          linea.original!.montoTotal,
          folioId,
        );
        restantes = restantes.map(l =>
          l === linea
            ? { ...l, original: { fk_concepto: l.fk_concepto, cantidad, montoTotal } }
            : l,
        );
      }

      while (bajasPendientes.length > 0) {
        const idCargo = bajasPendientes[0];
        const cargo = cargosVigentes.find((c: any) => c.id_cargo === idCargo);
        await folioService.deleteCargoLogic(idCargo, folioId, Number(cargo?.monto_total || 0));
        bajasPendientes = bajasPendientes.slice(1);
      }

      const partes: string[] = [];
      if (nuevas.length) partes.push(`${nuevas.length} agregado(s)`);
      if (modificadas.length) partes.push(`${modificadas.length} modificado(s)`);
      if (cargosAQuitar.length) partes.push(`${cargosAQuitar.length} eliminado(s)`);
      setSuccess(`Consumos actualizados: ${partes.join(', ')}.`);
      handleCloseAddCargo();
      await loadFolio();
    } catch (err: any) {
      setLineas(restantes);
      setCargosAQuitar(bajasPendientes);
      setErrorModal(err.message || 'Error al guardar los consumos.');
      // Puede haber entrado parte de los cambios: la tabla debe reflejarlo.
      await loadFolio();
    } finally {
      setSavingCargo(false);
    }
  };

  const handleReopenFolio = async () => {
    setReopening(true);
    clearMessages();
    try {
      const idUsuario = currentUser?.id_usuario || currentUser?.id || null;
      await folioService.reopenFolio(folioId, idUsuario);
      setSuccess('Folio reabierto correctamente.');
      setShowConfirmReopen(false);
      await loadFolio();
    } catch (err: any) {
      setError(err.message || 'Error al reabrir el folio.');
    } finally {
      setReopening(false);
    }
  };

  const handleCloseFolio = async () => {
    setClosing(true);
    clearMessages();
    try {
      await folioService.closeFolio(folioId);
      setSuccess('Folio cerrado correctamente.');
      setShowConfirmClose(false);
      await loadFolio();
    } catch (err: any) {
      setError(err.message || 'Error al cerrar el folio.');
    } finally {
      setClosing(false);
    }
  };

  if (loading) return (
    <ModuleLayout title="Cargando Folio..." description="">
      <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
        <div className="loader"></div>
      </div>
    </ModuleLayout>
  );

  if (!folio) return (
    <ModuleLayout title="Folio no encontrado" description="">
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
        No se encontró el folio solicitado.
      </div>
    </ModuleLayout>
  );

  // Tabla de sólo lectura: agregar, editar y quitar consumos se hace desde
  // "Cargar o editar consumo", que es el único lugar que toca el folio.
  const cargosColumns: Column<any>[] = [
    { header: 'Concepto', render: (c) => <span style={{ fontWeight: 600 }}>{c.concepto?.nombre || `ID: ${c.fk_concepto}`}</span> },
    { header: 'Cant.', align: 'center', render: (c) => c.cantidad },
    { header: 'P. Unit.', align: 'right', render: (c) => formatGs(c.monto_unitario) },
    { header: 'Total', align: 'right', render: (c) => <span style={{ fontWeight: 700, color: '#10b981' }}>{formatGs(c.monto_total)}</span> },
  ];

  const activeCargos = cargosConsumo;
  const filteredCargos = cargoSearch.trim()
    ? activeCargos.filter((c: any) =>
        (c.concepto?.nombre || '').toLowerCase().includes(cargoSearch.trim().toLowerCase())
      )
    : activeCargos;

  return (
    <ModuleLayout
      title={`Folio #${folio.id_folio}`}
      description={`Reserva #${folio.fk_reserva} · Cliente: ${folio.reserva?.cliente?.razon_social || folio.reserva?.clientes?.razon_social || 'N/A'}`}
      actions={
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          {/* Total badge */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(245, 158, 11, 0.1)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: '10px',
            padding: '8px 16px',
          }}>
            <Wallet size={18} color="#f59e0b" />
            <span style={{ fontWeight: 700, fontSize: '20px', color: '#f59e0b' }}>
              {formatGs(folio.total_acumulado || 0)}
            </span>
            <span
              className="status-badge"
              style={{ '--badge-color': folio.estado === 'abierto' ? '#10b981' : '#94a3b8', marginLeft: '6px' } as React.CSSProperties}
            >
              {folio.estado.toUpperCase()}
            </span>
          </div>

          {folio.estado === 'cerrado' && puedeReabrirFolio && (
            <button
              onClick={() => setShowConfirmReopen(true)}
              className="btn-ghost"
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Unlock size={16} /> Reabrir folio
            </button>
          )}

          {folio.estado === 'abierto' && folio.fk_usuario_reapertura != null && puedeReabrirFolio && (
            <button
              onClick={() => setShowConfirmClose(true)}
              className="btn-ghost"
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Lock size={16} /> Cerrar folio
            </button>
          )}

          {/* Back buttons */}
          {onVolverAReserva && (
            <button onClick={onVolverAReserva} className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <ArrowLeft size={16} /> Volver a Reserva
            </button>
          )}
          <button onClick={onBack} className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ArrowLeft size={16} /> Volver a Folios
          </button>
        </div>
      }
    >
      {error && <div className="status-message status-error" style={{ marginBottom: '16px' }}>{error}</div>}
      {success && <div className="status-message status-success" style={{ marginBottom: '16px' }}>{success}</div>}

      {/* ─── Alojamiento y consumos comparten un solo fondo ───
          Antes eran dos `.module-container` apilados, y como esa clase lleva
          `min-height: 100%` cada uno se estiraba a la altura completa sin
          importar cuántas filas tuviera: con una sola habitación quedaba medio
          panel vacío y había que scrollear para llegar a los cargos extras. */}
      <div className="module-container" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', gap: '12px', flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, fontSize: '18px', lineHeight: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <BedDouble size={18} color="#60a5fa" /> Alojamiento
          </h3>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            {folio.reserva?.fecha_entrada && folio.reserva?.fecha_salida
              ? `${new Date(folio.reserva.fecha_entrada + 'T12:00:00').toLocaleDateString()} → ${new Date(folio.reserva.fecha_salida + 'T12:00:00').toLocaleDateString()} · ${desgloseAlojamiento.noches} noche(s)`
              : ''}
          </span>
        </div>
        <p style={{ margin: '0 0 16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
          Se calcula solo: cada habitación asignada aporta su precio por noche × las noches de la
          estadía. Para cambiarlo, editá la reserva.
        </p>

        {desgloseAlojamiento.filas.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-secondary)', background: 'var(--bg-lighter)', borderRadius: '8px' }}>
            <BedDouble size={36} style={{ opacity: 0.2, marginBottom: '10px' }} />
            <p style={{ margin: 0 }}>La reserva no tiene habitaciones asignadas.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-secondary)', fontSize: 13 }}>
                  <th style={{ padding: '8px' }}>Habitación</th>
                  <th style={{ padding: '8px' }}>Tipo</th>
                  <th style={{ padding: '8px' }}>Tarifa</th>
                  <th style={{ padding: '8px', textAlign: 'center' }}>Huéspedes</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Precio/noche</th>
                  <th style={{ padding: '8px', textAlign: 'center' }}>Noches</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {desgloseAlojamiento.filas.map((f) => (
                  <tr key={f.idDetalle} style={{ borderTop: '1px solid var(--glass-border)' }}>
                    <td style={{ padding: '8px', fontWeight: 600 }}>#{f.habitacion}</td>
                    <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>{f.tipo}</td>
                    <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>{f.tarifa}</td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>{f.huespedes || '-'}</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>{formatGs(f.precioPorNoche)}</td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>{f.noches}</td>
                    <td style={{ padding: '8px', textAlign: 'right', fontWeight: 600 }}>
                      {formatGs(f.subtotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '1px solid var(--glass-border)' }}>
                  <td colSpan={6} style={{ padding: '12px 8px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                    Total alojamiento
                  </td>
                  <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: 700, fontSize: 16, color: '#10b981' }}>
                    {formatGs(desgloseAlojamiento.total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* El cargo del folio y el cálculo deberían coincidir siempre: si no,
            algo quedó desincronizado y conviene que se vea. */}
        {cargoAlojamiento && Number(cargoAlojamiento.monto_total) !== desgloseAlojamiento.total && (
          <div
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 16,
              padding: '12px 14px', borderRadius: 10,
              background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)',
              color: '#fbbf24', fontSize: 13,
            }}
          >
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              El folio tiene cargado {formatGs(cargoAlojamiento.monto_total)} de
              alojamiento, distinto de los {formatGs(desgloseAlojamiento.total)} que suman las
              habitaciones. Volvé a guardar las fechas de la reserva para reajustarlo.
            </span>
          </div>
        )}

        {/* Separador entre las dos secciones del panel. */}
        <div style={{ height: '1px', background: 'var(--glass-border)', margin: '28px 0' }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', gap: '12px', flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, fontSize: '18px', lineHeight: 1 }}>Cargos Extras Registrados</h3>
          {folio.estado === 'abierto' && (
            <button className="btn-primary-sm" style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }} onClick={handleOpenAddCargo}>
              <Plus size={15} /> Cargar o editar consumo
            </button>
          )}
        </div>

        {activeCargos.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)', background: 'var(--bg-lighter)', borderRadius: '8px' }}>
            <Receipt size={40} style={{ opacity: 0.2, marginBottom: '10px' }} />
            <p style={{ margin: 0 }}>No hay consumos registrados en este folio.</p>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: '16px' }}>
              <SearchBox value={cargoSearch} onChange={setCargoSearch} placeholder="Buscar consumo por nombre..." maxWidth={280} />
            </div>
            {filteredCargos.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-secondary)', background: 'var(--bg-lighter)', borderRadius: '8px' }}>
                <p style={{ margin: 0 }}>Ningún consumo coincide con "{cargoSearch}".</p>
              </div>
            ) : (
              <DataTable
                data={filteredCargos}
                columns={cargosColumns}
                emptyMessage="Sin cargos"
                keyExtractor={c => c.id_cargo}
              />
            )}
          </>
        )}
      </div>

      {/* ─── Dialog: Cargar o editar consumo ─── */}
      {showAddCargo && (
        <ConsumosFolioModal
          subtitulo={`Folio #${folio.id_folio} · agregá, cambiá o quitá productos y confirmá al final`}
          conceptos={conceptos}
          lineas={lineas}
          setLineas={setLineas}
          cargosAQuitar={cargosAQuitar}
          setCargosAQuitar={setCargosAQuitar}
          onConfirm={handleAddCargo}
          onCancel={handleCloseAddCargo}
          saving={savingCargo}
          error={errorModal}
          onCrearProducto={onCrearProducto ? () => onCrearProducto(borradorActual()) : undefined}
        />
      )}

      {/* ─── Dialog: Confirmar reapertura de folio ─── */}
      {showConfirmReopen && (
        <ModalPortal>
          <div className="modal-backdrop-glow">
            <div className="modal-box-glow" style={{ maxWidth: '400px', textAlign: 'center' }}>
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: 'rgba(59, 130, 246, 0.15)',
                border: '2px solid rgba(59, 130, 246, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 20px',
              }}>
                <Unlock size={28} style={{ color: '#60a5fa' }} />
              </div>

              <h3 style={{ margin: '0 0 10px', fontSize: '20px', fontWeight: 700 }}>
                Reabrir folio
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '15px', margin: '0 0 24px' }}>
                ¿Seguro que querés reabrir el <strong style={{ color: 'var(--text-primary)' }}>Folio #{folio.id_folio}</strong>?
                Esto no afecta el estado de la reserva ni el check-in/check-out.
              </p>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  className="btn-modal-cancel"
                  style={{ flex: 1 }}
                  onClick={() => setShowConfirmReopen(false)}
                  disabled={reopening}
                >
                  Cancelar
                </button>
                <button
                  className="btn-modal-submit"
                  style={{ flex: 1 }}
                  onClick={handleReopenFolio}
                  disabled={reopening}
                >
                  {reopening ? 'Reabriendo...' : 'Sí, reabrir'}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* ─── Dialog: Confirmar cierre de folio reabierto ─── */}
      {showConfirmClose && (
        <ModalPortal>
          <div className="modal-backdrop-glow">
            <div className="modal-box-glow" style={{ maxWidth: '400px', textAlign: 'center' }}>
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: 'rgba(148, 163, 184, 0.15)',
                border: '2px solid rgba(148, 163, 184, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 20px',
              }}>
                <Lock size={28} style={{ color: '#94a3b8' }} />
              </div>

              <h3 style={{ margin: '0 0 10px', fontSize: '20px', fontWeight: 700 }}>
                Cerrar folio
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '15px', margin: '0 0 24px' }}>
                ¿Seguro que querés cerrar de nuevo el <strong style={{ color: 'var(--text-primary)' }}>Folio #{folio.id_folio}</strong>?
              </p>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  className="btn-modal-cancel"
                  style={{ flex: 1 }}
                  onClick={() => setShowConfirmClose(false)}
                  disabled={closing}
                >
                  Cancelar
                </button>
                <button
                  className="btn-modal-submit"
                  style={{ flex: 1 }}
                  onClick={handleCloseFolio}
                  disabled={closing}
                >
                  {closing ? 'Cerrando...' : 'Sí, cerrar'}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

    </ModuleLayout>
  );
}
