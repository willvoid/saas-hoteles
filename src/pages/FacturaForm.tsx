import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, Pencil, Plus, Trash2, Wallet } from 'lucide-react';
import { ModuleLayout } from '../components/ModuleLayout';
import AutocompleteClientes from '../components/AutocompleteClientes';
import AutocompleteConceptos from '../components/AutocompleteConceptos';
import ConsumosFolioModal from '../components/ConsumosFolioModal';
import type { LineaConsumo } from '../components/ConsumosFolioModal';
import FolioSelector from '../components/FolioSelector';
import { ClientService } from '../services/clientService';
import { cajaService } from '../services/cajaService';
import { facturaService } from '../services/facturaService';
import { folioService } from '../services/folioService';
import { calcularTotales, calcularVuelto } from '../utils/facturaTotals';
import {
  mensajeDeError,
  puedeFacturarACredito,
  validarVencimiento,
} from '../utils/facturaCredito';
import { fechaNegocioHoy } from '../utils/periodoContable';
import { esCargoDeAlojamiento } from '../utils/alojamiento';
import { formatGs } from '../utils/currency';
import { enfocarPrimerError } from '../utils/formFocus';
import {
  CONDICION_VENTA_CONTADO,
  CONDICION_VENTA_CREDITO,
  type LineaFactura,
  type Turno,
  type ConceptoConIva,
  type ModoPagoItem,
  type FolioCerradoItem,
} from '../types/factura';
import type { TenantModulos } from '../services/tenantService';
import '../index.css';
import { COLORS, tint } from '../constants/colors';

/**
 * Cómo está guardado un cargo en el folio. Se conserva aparte de las líneas de
 * la factura para saber, al emitir, qué hay que dar de alta, actualizar o dar
 * de baja en el folio.
 */
interface CargoOriginal {
  fk_concepto: number;
  cantidad: number;
  precioUnitario: number;
  montoTotal: number;
}

interface FacturaFormProps {
  currentUser: { id?: number; id_usuario?: number };
  onBack: () => void;
  onCreated: (idFactura: number) => void;
  onGoToCaja: () => void;
  /** Cuando viene de un folio (check-out), las líneas se precargan de los cargos y no hay selector. */
  fkFolio?: number | null;
  /** Plan modules of the hotel; credit sales need `contabilidad`. */
  modulos?: TenantModulos;
}

const panelStyle: React.CSSProperties = {
  background: 'var(--glass-bg)',
  border: '1px solid var(--glass-border)',
  borderRadius: 16,
  padding: 24,
};

/** Orden en pantalla, para llevar el foco al primer campo que falle al emitir. */
const ORDEN_CAMPOS = ['cliente', 'folio-selector', 'items', 'modo-pago', 'efectivo', 'vencimiento'] as const;

const errorEnCampo: React.CSSProperties = {
  color: COLORS.errorLight,
  fontSize: 12,
  marginTop: 4,
  display: 'block',
};

export default function FacturaForm({ currentUser, onBack, onCreated, onGoToCaja, fkFolio, modulos }: FacturaFormProps) {
  const userId = currentUser?.id_usuario || currentUser?.id || 0;
  const folioForzado = !!fkFolio;
  const creditoHabilitado = !!modulos?.contabilidad;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Errores pegados a su campo: en un formulario largo el cartel de arriba
  // queda fuera de pantalla y no se ve sin scrollear.
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});
  // Aviso de ítem repetido: no es un error de guardado, sólo explica por qué
  // no se agregó nada.
  const [avisoItem, setAvisoItem] = useState<string | null>(null);

  const [turno, setTurno] = useState<Turno | null>(null);
  const [clientes, setClientes] = useState<Awaited<ReturnType<typeof ClientService.getClients>>>([]);
  const [conceptos, setConceptos] = useState<ConceptoConIva[]>([]);
  const [modosPago, setModosPago] = useState<ModoPagoItem[]>([]);

  // Origen manual: sólo aplica cuando NO viene forzado por prop (check-out).
  const [origenManual, setOrigenManual] = useState<'directo' | 'folio'>('directo');
  const [foliosCerrados, setFoliosCerrados] = useState<FolioCerradoItem[]>([]);
  const [cargandoFoliosCerrados, setCargandoFoliosCerrados] = useState(false);
  const [folioIdManual, setFolioIdManual] = useState<number | ''>('');
  const [cargandoFolio, setCargandoFolio] = useState(false);
  // Ids de clientes con folios cerrados facturables. Null mientras no se pidió
  // la lista (origen "venta directa", donde el filtro no aplica).
  const [clientesConFolios, setClientesConFolios] = useState<number[] | null>(null);
  const [cargandoClientesConFolios, setCargandoClientesConFolios] = useState(false);

  const [fkCliente, setFkCliente] = useState<number | ''>('');
  const [fkModoPago, setFkModoPago] = useState<number | ''>('');
  const [lineas, setLineas] = useState<LineaFactura[]>([]);
  const [efectivo, setEfectivo] = useState('');
  // Contado by default; Crédito is only offered when the plan has `contabilidad`.
  const [condicion, setCondicion] = useState<number>(CONDICION_VENTA_CONTADO);
  const [fechaVencimiento, setFechaVencimiento] = useState('');
  const [conceptoSel, setConceptoSel] = useState<number | ''>('');
  // Cambia en cada alta de línea para remontar el buscador y limpiar el texto
  // tipeado (el propio componente sólo se sincroniza cuando `value` cambia,
  // y acá siempre vuelve a '' sin pasar por un valor intermedio).
  const [conceptoBuscadorKey, setConceptoBuscadorKey] = useState(0);

  // ─── Edición de los consumos del folio ───
  // Las líneas que vienen de un folio no se editan en la tabla: se abren en el
  // mismo modal que usa Folios y los cambios se vuelcan al folio recién al
  // emitir la factura (antes se editaban acá y el folio quedaba desfasado).
  const [showConsumos, setShowConsumos] = useState(false);
  const [consumosDraft, setConsumosDraft] = useState<LineaConsumo[]>([]);
  const [cargosAQuitar, setCargosAQuitar] = useState<number[]>([]);
  // Cómo está guardado hoy cada cargo del folio, por id_cargo.
  const [cargosOriginales, setCargosOriginales] = useState<Record<number, CargoOriginal>>({});
  // Bajas ya marcadas antes de abrir el modal: si se cancela, se restauran.
  const cargosAQuitarPrevios = useRef<number[]>([]);

  // Folio efectivamente elegido, venga forzado por prop o elegido a mano.
  const folioActivo = fkFolio ?? (origenManual === 'folio' ? (folioIdManual || null) : null);
  // Se está en "modo folio" apenas se elige el origen, aunque todavía no se
  // haya seleccionado un folio puntual (oculta el agregador de conceptos).
  const modoFolio = folioForzado || origenManual === 'folio';

  const limpiarEstadoFolio = () => {
    setLineas([]);
    setCargosAQuitar([]);
    setCargosOriginales({});
    setConsumosDraft([]);
    setShowConsumos(false);
  };

  const cargarLineasDeFolio = async (idFolio: number) => {
    const [cargos, folio] = await Promise.all([
      facturaService.getCargosFacturablesByFolio(idFolio),
      folioService.getFolioById(idFolio),
    ]);
    setLineas(
      cargos.map((c) => ({
        fk_concepto: c.fk_concepto,
        descripcion: c.concepto?.nombre || 'Consumo',
        cantidad: Number(c.cantidad),
        precioUnitario: Number(c.monto_unitario),
        ivaRate: Number(c.concepto?.iva?.valor ?? 0),
        fk_cargo_folio: c.id_cargo,
      })),
    );
    setCargosOriginales(
      Object.fromEntries(
        cargos.map((c) => [
          c.id_cargo,
          {
            fk_concepto: Number(c.fk_concepto),
            cantidad: Number(c.cantidad),
            precioUnitario: Number(c.monto_unitario),
            montoTotal: Number(c.monto_total),
          },
        ]),
      ),
    );
    setCargosAQuitar([]);
    const cliente = folio?.reserva?.fk_cliente ?? folio?.reserva?.cliente?.id_cliente;
    if (cliente) setFkCliente(cliente);
  };

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const [activo, refs, listaClientes] = await Promise.all([
          cajaService.getTurnoActivo(userId),
          facturaService.getReferencias(),
          ClientService.getClients(),
        ]);
        setTurno(activo);
        setConceptos(refs.conceptos as unknown as ConceptoConIva[]);
        setModosPago(refs.modosPago as unknown as ModoPagoItem[]);
        setClientes(listaClientes);

        const efectivoModo = (refs.modosPago as unknown as ModoPagoItem[]).find(
          (m) => (m.descripcion || '').toLowerCase() === 'efectivo',
        );
        setFkModoPago(efectivoModo?.id_modo_pago ?? refs.modosPago[0]?.id_modo_pago ?? '');

        if (fkFolio) {
          await cargarLineasDeFolio(fkFolio);
        }
      } catch (err: unknown) {
        setError(mensajeDeError(err, 'Error al cargar el formulario.'));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // En "Facturar folio existente" el buscador de clientes se limita a los que
  // tienen algún folio cerrado pendiente: elegir a cualquier otro sólo llevaría
  // a un selector de folios vacío.
  useEffect(() => {
    if (folioForzado || origenManual !== 'folio' || clientesConFolios !== null) return;
    let cancelado = false;
    (async () => {
      try {
        setCargandoClientesConFolios(true);
        const ids = await folioService.getClientesConFoliosCerrados();
        if (!cancelado) setClientesConFolios(ids);
      } catch (err: unknown) {
        if (!cancelado) setError(mensajeDeError(err, 'No se pudieron cargar los clientes con folios cerrados.'));
      } finally {
        if (!cancelado) setCargandoClientesConFolios(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [folioForzado, origenManual, clientesConFolios]);

  // Al elegir cliente en modo "Facturar folio existente", listar sus folios
  // cerrados (check-out ya hecho) pendientes de facturar.
  useEffect(() => {
    if (folioForzado || origenManual !== 'folio' || !fkCliente) {
      setFoliosCerrados([]);
      return;
    }
    // Cambió el cliente: la selección de folio previa (de otro cliente) ya no aplica.
    setFolioIdManual('');
    limpiarEstadoFolio();
    let cancelado = false;
    (async () => {
      try {
        setCargandoFoliosCerrados(true);
        const folios = await folioService.getFoliosCerradosPorCliente(Number(fkCliente));
        if (!cancelado) setFoliosCerrados((folios || []) as unknown as FolioCerradoItem[]);
      } catch (err: unknown) {
        if (!cancelado) setError(mensajeDeError(err, 'No se pudieron cargar los folios del cliente.'));
      } finally {
        if (!cancelado) setCargandoFoliosCerrados(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [folioForzado, origenManual, fkCliente]);

  const handleOrigenChange = (origen: 'directo' | 'folio') => {
    setOrigenManual(origen);
    setFolioIdManual('');
    limpiarEstadoFolio();
    setError(null);
    setFieldErrors({});
    setAvisoItem(null);
    // El buscador de clientes cambia de universo entre un origen y el otro, así
    // que una selección hecha con la lista anterior deja de valer.
    setFkCliente('');
  };

  const handleSeleccionFolio = async (idFolio: number | '') => {
    setFolioIdManual(idFolio);
    limpiarEstadoFolio();
    setError(null);
    if (!idFolio) return;
    try {
      setCargandoFolio(true);
      await cargarLineasDeFolio(Number(idFolio));
    } catch (err: unknown) {
      setError(mensajeDeError(err, 'No se pudo cargar el folio.'));
    } finally {
      setCargandoFolio(false);
    }
  };

  // Clientes ofrecidos en el buscador según el origen elegido.
  const clientesVisibles = useMemo(() => {
    if (folioForzado || origenManual !== 'folio' || clientesConFolios === null) return clientes;
    const permitidos = new Set(clientesConFolios);
    return clientes.filter((c) => permitidos.has(Number(c.id_cliente)));
  }, [clientes, clientesConFolios, folioForzado, origenManual]);

  const esCredito = creditoHabilitado && condicion === CONDICION_VENTA_CREDITO;

  // Credit collects nothing at issue, so cash/change never apply to it.
  const modoEsEfectivo = useMemo(() => {
    if (esCredito) return false;
    const modo = modosPago.find((m) => m.id_modo_pago === fkModoPago);
    return (modo?.descripcion || '').toLowerCase() === 'efectivo';
  }, [modosPago, fkModoPago, esCredito]);

  const totales = useMemo(() => calcularTotales(lineas), [lineas]);

  const vuelto = useMemo(
    () => (modoEsEfectivo ? calcularVuelto(Number(efectivo) || 0, totales.total_general) : 0),
    [modoEsEfectivo, efectivo, totales.total_general],
  );

  const addLineaConcepto = (idConcepto: number) => {
    const c = conceptos.find((x) => x.id_concepto === idConcepto);
    if (!c) return;

    // Entre o no, el buscador vuelve a quedar vacío.
    setConceptoSel('');
    setConceptoBuscadorKey((k) => k + 1);

    // Un concepto repetido no genera una segunda línea ni suma cantidad: se
    // avisa y el usuario ajusta la cantidad en la línea que ya está.
    const yaCargado = lineas.find((l) => l.fk_concepto === idConcepto);
    if (yaCargado) {
      setAvisoItem(
        `Ya cargaste "${yaCargado.descripcion}" en esta factura. Cambiale la cantidad en la lista en vez de agregarlo de nuevo.`,
      );
      return;
    }

    setAvisoItem(null);
    setFieldErrors((prev) => ({ ...prev, items: undefined }));
    setLineas((prev) => [
      ...prev,
      {
        fk_concepto: c.id_concepto,
        descripcion: c.nombre,
        cantidad: 1,
        precioUnitario: Number(c.arancel) || 0,
        ivaRate: Number(c.iva?.valor ?? 0),
      },
    ]);
  };

  const updateCantidad = (idx: number, cantidad: number) => {
    setLineas((prev) => prev.map((l, i) => (i === idx ? { ...l, cantidad } : l)));
  };

  // Sin lógica de stock todavía: se limita a 2 dígitos (máx. 99) y se corta
  // el tipeo ante cualquier valor inválido, mismo criterio que habitaciones/caja.
  // Vacío se tolera mientras se tipea (equivalente a "required" recién al emitir).
  const handleCantidadChange = (idx: number, value: string) => {
    setError(null);
    setFieldErrors((prev) => ({ ...prev, items: undefined }));
    if (/[^\d]/.test(value)) {
      setError('Solo puede ingresar números enteros para la cantidad.');
      return;
    }
    if (value.length > 0 && value[0] === '0') {
      setError('La cantidad no puede ser cero ni empezar con 0.');
      return;
    }
    if (value.length > 2) {
      setError('La cantidad permite un máximo de 2 dígitos.');
      return;
    }
    updateCantidad(idx, value === '' ? 0 : Number(value));
  };

  const removeLinea = (idx: number) => {
    setLineas((prev) => prev.filter((_, i) => i !== idx));
  };

  // ─── Consumos del folio ───────────────────────────────────────────────────
  // El Alojamiento no se toca desde acá: lo administra el folio a partir de las
  // fechas de la reserva, así que queda fuera del modal aunque sí se factura.
  const lineasAlojamiento = lineas.filter((l) => esCargoDeAlojamiento(l.descripcion));
  const lineasConsumo = lineas.filter((l) => !esCargoDeAlojamiento(l.descripcion));

  const handleAbrirConsumos = () => {
    setError(null);
    setAvisoItem(null);
    setFieldErrors((prev) => ({ ...prev, items: undefined }));
    setConsumosDraft(
      lineasConsumo.map((l) => ({
        idCargo: l.fk_cargo_folio ?? null,
        fk_concepto: l.fk_concepto,
        nombre: l.descripcion,
        cantidad: String(l.cantidad),
        precioUnitario: l.precioUnitario,
      })),
    );
    cargosAQuitarPrevios.current = cargosAQuitar;
    setShowConsumos(true);
  };

  const handleCancelarConsumos = () => {
    // El modal escribe las bajas directo en el estado del formulario: cancelar
    // tiene que devolverlas a como estaban al abrirlo.
    setCargosAQuitar(cargosAQuitarPrevios.current);
    setConsumosDraft([]);
    setShowConsumos(false);
  };

  /**
   * Aplica el armado del modal a las líneas de la factura. Todavía no toca el
   * folio: eso pasa al emitir (ver sincronizarFolio).
   */
  const handleConfirmarConsumos = () => {
    const nuevas: LineaFactura[] = consumosDraft.map((l) => {
      const previa = l.idCargo != null
        ? lineas.find((x) => x.fk_cargo_folio === l.idCargo)
        : undefined;
      const concepto = conceptos.find((c) => c.id_concepto === l.fk_concepto);
      return {
        fk_concepto: l.fk_concepto,
        descripcion: l.nombre,
        cantidad: parseInt(l.cantidad, 10) || 0,
        precioUnitario: l.precioUnitario,
        ivaRate: Number(concepto?.iva?.valor ?? previa?.ivaRate ?? 0),
        fk_cargo_folio: l.idCargo,
      };
    });
    setLineas([...lineasAlojamiento, ...nuevas]);
    setConsumosDraft([]);
    setShowConsumos(false);
  };

  /**
   * Vuelca al folio lo que se editó en el modal: primero las bajas (así un
   * concepto quitado y vuelto a agregar no choca con su cargo anterior), luego
   * las altas y por último los cambios de producto o cantidad.
   *
   * Cada operación aplicada se refleja en el estado antes de seguir, para que
   * un error a mitad de camino no se re-aplique al reintentar. Devuelve las
   * líneas ya vinculadas a su cargo, que son las que se facturan.
   */
  const sincronizarFolio = async (idFolio: number): Promise<LineaFactura[]> => {
    const lineasAplicadas = [...lineas];
    const originales = { ...cargosOriginales };
    let bajasPendientes = [...cargosAQuitar];

    try {
      while (bajasPendientes.length > 0) {
        const idCargo = bajasPendientes[0];
        const original = originales[idCargo];
        await folioService.deleteCargoLogic(idCargo, idFolio, Number(original?.montoTotal || 0));
        delete originales[idCargo];
        bajasPendientes = bajasPendientes.slice(1);
      }

      for (let i = 0; i < lineasAplicadas.length; i++) {
        const l = lineasAplicadas[i];
        if (l.fk_cargo_folio != null) continue;
        const montoTotal = l.cantidad * l.precioUnitario;
        const creado = await folioService.addCargo(
          {
            fk_folio: idFolio,
            fk_concepto: l.fk_concepto,
            cantidad: l.cantidad,
            monto_unitario: l.precioUnitario,
            monto_total: montoTotal,
            fk_usuario: userId,
          },
          // Un concepto repetido no se fusiona: se corta y se avisa.
          { rechazarDuplicado: true },
        );
        lineasAplicadas[i] = { ...l, fk_cargo_folio: creado.id_cargo };
        originales[creado.id_cargo] = {
          fk_concepto: l.fk_concepto,
          cantidad: l.cantidad,
          precioUnitario: l.precioUnitario,
          montoTotal,
        };
      }

      for (const l of lineasAplicadas) {
        const idCargo = l.fk_cargo_folio;
        if (idCargo == null) continue;
        const original = originales[idCargo];
        if (!original) continue;
        const sinCambios =
          original.fk_concepto === l.fk_concepto &&
          original.cantidad === l.cantidad &&
          original.precioUnitario === l.precioUnitario;
        if (sinCambios) continue;

        const montoTotal = l.cantidad * l.precioUnitario;
        await folioService.updateCargo(
          idCargo,
          {
            fk_concepto: l.fk_concepto,
            cantidad: l.cantidad,
            monto_unitario: l.precioUnitario,
            monto_total: montoTotal,
          },
          original.montoTotal,
          idFolio,
        );
        originales[idCargo] = {
          fk_concepto: l.fk_concepto,
          cantidad: l.cantidad,
          precioUnitario: l.precioUnitario,
          montoTotal,
        };
      }

      return lineasAplicadas;
    } finally {
      setLineas(lineasAplicadas);
      setCargosOriginales(originales);
      setCargosAQuitar(bajasPendientes);
    }
  };

  // Efectivo recibido: se corta el tipeo ante cualquier valor inválido (mismo
  // criterio que el número de habitación en Gestión de habitaciones).
  const handleEfectivoChange = (value: string) => {
    setError(null);
    setFieldErrors((prev) => ({ ...prev, efectivo: undefined }));
    if (/[^\d]/.test(value)) {
      setError('Solo puede ingresar números para el efectivo recibido.');
      return;
    }
    if (value.length > 0 && value[0] === '0') {
      setError('El efectivo recibido no puede empezar con 0.');
      return;
    }
    if (value.length > 8) {
      setError('El efectivo recibido permite un máximo de 8 dígitos.');
      return;
    }
    setEfectivo(value);
  };

  const handleModoPagoChange = (value: string) => {
    setError(null);
    setFieldErrors((prev) => ({ ...prev, 'modo-pago': undefined, efectivo: undefined }));
    setFkModoPago(value ? Number(value) : '');
    setEfectivo('');
  };

  const handleCondicionChange = (valor: number) => {
    setError(null);
    setFieldErrors((prev) => ({
      ...prev,
      'modo-pago': undefined,
      efectivo: undefined,
      vencimiento: undefined,
    }));
    setCondicion(valor);
    if (valor === CONDICION_VENTA_CONTADO) setFechaVencimiento('');
  };

  const handleSubmit = async () => {
    setError(null);
    if (!turno) {
      setError('No hay un turno de caja abierto.');
      return;
    }

    // Todo junto y no de a uno: así el foco va al primer problema de la
    // pantalla y el usuario ve de una todos los campos a corregir.
    const errores: Record<string, string | undefined> = {};
    if (modoFolio && !folioActivo) errores['folio-selector'] = 'Elegí un folio para facturar.';
    if (!fkCliente) errores.cliente = 'Elegí un cliente.';
    if (lineas.length === 0) {
      errores.items = 'Agregá al menos un ítem.';
    } else if (lineas.some((l) => !l.cantidad || l.cantidad <= 0)) {
      errores.items = 'Todas las líneas deben tener una cantidad mayor a cero.';
    }
    if (esCredito) {
      if (!puedeFacturarACredito({ modulos: { contabilidad: creditoHabilitado }, cliente: fkCliente })) {
        errores.cliente = 'La venta a crédito requiere un cliente identificado.';
      }
      const errorVencimiento = validarVencimiento(fechaNegocioHoy(), fechaVencimiento);
      if (errorVencimiento) errores.vencimiento = errorVencimiento;
    } else if (!fkModoPago) {
      errores['modo-pago'] = 'Elegí un modo de pago.';
    }
    if (modoEsEfectivo) {
      if (!efectivo) {
        errores.efectivo = 'Ingresá el efectivo recibido.';
      } else if (Number(efectivo) <= 0) {
        errores.efectivo = 'El efectivo recibido debe ser mayor a cero.';
      } else if (Number(efectivo) < totales.total_general) {
        errores.efectivo = `El efectivo recibido no puede ser menor al total a pagar (${formatGs(totales.total_general)}).`;
      }
    }

    setFieldErrors(errores);
    if (Object.values(errores).some(Boolean)) {
      enfocarPrimerError(errores, ORDEN_CAMPOS);
      return;
    }

    try {
      setSaving(true);
      // Con origen folio, lo editado acá se vuelca primero al folio: así el
      // folio queda con los mismos consumos que la factura que se emite.
      const lineasAFacturar = folioActivo ? await sincronizarFolio(Number(folioActivo)) : lineas;
      const factura = await facturaService.crearFactura({
        fk_cliente: Number(fkCliente),
        fk_folio: folioActivo ?? null,
        fk_modo_pago: esCredito ? null : Number(fkModoPago),
        fk_turno: turno.id_turno,
        esEfectivo: modoEsEfectivo,
        efectivo: Number(efectivo) || 0,
        condicion_venta: esCredito ? CONDICION_VENTA_CREDITO : CONDICION_VENTA_CONTADO,
        fecha_vencimiento: esCredito ? fechaVencimiento || null : null,
        lineas: lineasAFacturar,
      });
      onCreated(factura.id_factura);
    } catch (err: unknown) {
      setError(mensajeDeError(err, 'No se pudo emitir la factura.'));
    } finally {
      setSaving(false);
    }
  };

  const backAction = (
    <button className="btn-ghost" onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <ArrowLeft size={16} /> Volver
    </button>
  );

  if (loading) {
    return (
      <ModuleLayout title="Nueva factura" description="Cargando…" actions={backAction}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="loader"></div></div>
      </ModuleLayout>
    );
  }

  // Guard: sin turno abierto no se puede facturar.
  if (!turno) {
    return (
      <ModuleLayout title="Nueva factura" description="Facturación interna" actions={backAction}>
        <div style={{ ...panelStyle, maxWidth: 480, textAlign: 'center' }}>
          <Wallet size={32} color={COLORS.textSecondary} style={{ margin: '0 auto 12px' }} />
          <p style={{ marginBottom: 16 }}>
            Necesitás un turno de caja abierto para poder facturar.
          </p>
          <button className="btn-primary-sm" onClick={onGoToCaja}>Abrir turno en Caja</button>
        </div>
      </ModuleLayout>
    );
  }

  return (
    <ModuleLayout
      title={folioForzado ? 'Facturar folio' : 'Nueva factura'}
      description={
        folioForzado
          ? 'Ítems precargados desde los consumos del folio.'
          : 'Elegí si es una venta de mostrador o si facturás un folio existente.'
      }
      actions={backAction}
    >
      {error && <div className="status-message status-error" style={{ marginBottom: 20 }}>{error}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {!folioForzado && (
          <div style={panelStyle}>
            <h3 className="section-title" style={{ marginTop: 0 }}>Origen</h3>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                className={origenManual === 'directo' ? 'btn-primary-sm' : 'btn-ghost'}
                onClick={() => handleOrigenChange('directo')}
              >
                Venta directa
              </button>
              <button
                type="button"
                className={origenManual === 'folio' ? 'btn-primary-sm' : 'btn-ghost'}
                onClick={() => handleOrigenChange('folio')}
              >
                Facturar folio existente
              </button>
            </div>
          </div>
        )}

        <div style={panelStyle}>
          <div className="input-group" style={{ marginBottom: origenManual === 'folio' && !folioForzado ? 16 : 0 }}>
            <label htmlFor="cliente">Cliente</label>
            <div id="cliente">
              <AutocompleteClientes
                clients={clientesVisibles}
                value={fkCliente}
                lockOnSelect
                onChange={(v) => {
                  setFkCliente(v ? Number(v) : '');
                  if (v) setFieldErrors((prev) => ({ ...prev, cliente: undefined }));
                }}
              />
            </div>
            {modoFolio && !folioForzado && (
              <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 8 }}>
                {cargandoClientesConFolios
                  ? 'Buscando clientes con folios cerrados…'
                  : clientesVisibles.length === 0
                    ? 'No hay clientes con folios cerrados pendientes de facturar.'
                    : 'Sólo se listan los clientes con folios cerrados pendientes de facturar.'}
              </p>
            )}
            {fieldErrors.cliente && <span style={errorEnCampo}>{fieldErrors.cliente}</span>}
          </div>

          {origenManual === 'folio' && !folioForzado && (
            <div id="folio-selector">
              <FolioSelector
                folios={foliosCerrados}
                value={folioIdManual}
                onChange={handleSeleccionFolio}
                loading={cargandoFoliosCerrados || cargandoFolio}
                disabledHint={!fkCliente ? 'Elegí un cliente para ver sus folios cerrados.' : undefined}
              />
              {fieldErrors['folio-selector'] && (
                <span style={errorEnCampo}>{fieldErrors['folio-selector']}</span>
              )}
            </div>
          )}
        </div>

        <div style={panelStyle} id="items">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            <h3 className="section-title" style={{ marginTop: 0, marginBottom: 0 }}>Ítems</h3>
            {/* Con origen folio la tabla es de sólo lectura: los cambios se
                arman en el modal y se aplican al folio al emitir. */}
            {modoFolio && !!folioActivo && (
              <button
                type="button"
                className="btn-primary-sm"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
                onClick={handleAbrirConsumos}
              >
                <Pencil size={15} /> Agregar o editar concepto
              </button>
            )}
          </div>

          {modoFolio && !!folioActivo && (
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '0 0 16px' }}>
              Los ítems vienen del folio #{folioActivo}. Para cambiarlos usá "Agregar o editar
              concepto": al emitir la factura, el folio se actualiza con esos cambios.
            </p>
          )}

          {modoFolio && !folioActivo && (
            <p style={{ color: 'var(--text-secondary)' }}>Elegí un folio arriba para cargar sus consumos.</p>
          )}

          {avisoItem && (
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                padding: '12px 14px',
                borderRadius: 10,
                background: tint('warning', 0.1),
                border: `1px solid ${tint('warning', 0.3)}`,
                color: COLORS.warningLight,
                fontSize: 13,
                marginBottom: 16,
              }}
            >
              <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{avisoItem}</span>
            </div>
          )}

          {!modoFolio && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 16 }}>
              <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
                <label>Agregar concepto</label>
                <AutocompleteConceptos
                  key={conceptoBuscadorKey}
                  conceptos={conceptos}
                  value={conceptoSel}
                  onChange={(v) => {
                    if (v) addLineaConcepto(Number(v));
                    else setConceptoSel('');
                  }}
                />
              </div>
            </div>
          )}

          {fieldErrors.items && <span style={{ ...errorEnCampo, marginBottom: 12 }}>{fieldErrors.items}</span>}

          {lineas.length === 0 ? (
            !(modoFolio && !folioActivo) && (
              <p style={{ color: 'var(--text-secondary)' }}>Todavía no hay ítems.</p>
            )
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--text-secondary)', fontSize: 13 }}>
                    <th style={{ padding: '8px 8px' }}>Concepto</th>
                    <th style={{ padding: '8px 8px' }}>IVA</th>
                    <th style={{ padding: '8px 8px' }}>Cant.</th>
                    <th style={{ padding: '8px 8px', textAlign: 'right' }}>P. Unit.</th>
                    <th style={{ padding: '8px 8px', textAlign: 'right' }}>Subtotal</th>
                    {!modoFolio && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {totales.lineas.map((l, idx) => (
                    <tr key={idx} style={{ borderTop: '1px solid var(--glass-border)' }}>
                      <td style={{ padding: '8px 8px' }}>{l.descripcion}</td>
                      <td style={{ padding: '8px 8px' }}>{l.ivaRate === 0 ? 'Exenta' : `${l.ivaRate}%`}</td>
                      <td style={{ padding: '8px 8px', width: 90 }}>
                        {modoFolio ? (
                          l.cantidad
                        ) : (
                          /* type="text": un input numérico deja tipear "+",
                             "-", "." y ",", y acá sólo van enteros. */
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            className="input-field"
                            style={{ padding: '6px 8px' }}
                            value={l.cantidad === 0 ? '' : l.cantidad}
                            onChange={(e) => handleCantidadChange(idx, e.target.value)}
                          />
                        )}
                      </td>
                      <td style={{ padding: '8px 8px', textAlign: 'right' }}>{formatGs(l.precioUnitario)}</td>
                      <td style={{ padding: '8px 8px', textAlign: 'right', fontWeight: 600 }}>{formatGs(l.subtotal)}</td>
                      {!modoFolio && (
                        <td style={{ padding: '8px 8px', textAlign: 'center' }}>
                          <button className="btn-action" onClick={() => removeLinea(idx)} title="Quitar">
                            <Trash2 size={16} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ ...panelStyle, flex: '1 1 280px' }}>
            <h3 className="section-title" style={{ marginTop: 0 }}>Pago</h3>
            {creditoHabilitado && (
              <div className="input-group">
                <label>Condición de venta</label>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    type="button"
                    className={!esCredito ? 'btn-primary-sm' : 'btn-ghost'}
                    onClick={() => handleCondicionChange(CONDICION_VENTA_CONTADO)}
                  >
                    Contado
                  </button>
                  <button
                    type="button"
                    className={esCredito ? 'btn-primary-sm' : 'btn-ghost'}
                    onClick={() => handleCondicionChange(CONDICION_VENTA_CREDITO)}
                  >
                    Crédito
                  </button>
                </div>
              </div>
            )}
            {esCredito && (
              <div className="input-group">
                <label htmlFor="vencimiento">Vencimiento (opcional)</label>
                <input
                  id="vencimiento"
                  type="date"
                  className={`input-field ${fieldErrors.vencimiento ? 'input-error' : ''}`}
                  value={fechaVencimiento}
                  min={fechaNegocioHoy()}
                  onChange={(e) => {
                    setFechaVencimiento(e.target.value);
                    setFieldErrors((prev) => ({ ...prev, vencimiento: undefined }));
                  }}
                />
                {fieldErrors.vencimiento && <span style={errorEnCampo}>{fieldErrors.vencimiento}</span>}
                <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 8 }}>
                  La factura queda con saldo pendiente hasta que se registren los cobros.
                </p>
              </div>
            )}
            {!esCredito && (
            <div className="input-group">
              <label htmlFor="modo-pago">Modo de pago</label>
              <select
                id="modo-pago"
                className="input-field"
                value={fkModoPago}
                onChange={(e) => handleModoPagoChange(e.target.value)}
              >
                {modosPago.map((m) => (
                  <option key={m.id_modo_pago} value={m.id_modo_pago}>{m.descripcion}</option>
                ))}
              </select>
              {fieldErrors['modo-pago'] && <span style={errorEnCampo}>{fieldErrors['modo-pago']}</span>}
            </div>
            )}
            {modoEsEfectivo && (
              <div className="input-group">
                <label htmlFor="efectivo">Efectivo recibido *</label>
                <input
                  id="efectivo"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className={`input-field ${fieldErrors.efectivo ? 'input-error' : ''}`}
                  value={efectivo}
                  onChange={(e) => handleEfectivoChange(e.target.value)}
                  placeholder="0"
                />
                {fieldErrors.efectivo && <span style={errorEnCampo}>{fieldErrors.efectivo}</span>}
              </div>
            )}
          </div>

          <div style={{ ...panelStyle, flex: '1 1 280px' }}>
            <h3 className="section-title" style={{ marginTop: 0 }}>Totales</h3>
            <dl style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '6px 16px', margin: 0 }}>
              <dt style={{ color: 'var(--text-secondary)' }}>Gravado 10%</dt>
              <dd style={{ margin: 0, textAlign: 'right' }}>{formatGs(totales.total_gravado_10)}</dd>
              <dt style={{ color: 'var(--text-secondary)' }}>Gravado 5%</dt>
              <dd style={{ margin: 0, textAlign: 'right' }}>{formatGs(totales.total_gravado_5)}</dd>
              <dt style={{ color: 'var(--text-secondary)' }}>Exenta</dt>
              <dd style={{ margin: 0, textAlign: 'right' }}>{formatGs(totales.total_exenta)}</dd>
              <dt style={{ color: 'var(--text-secondary)' }}>IVA</dt>
              <dd style={{ margin: 0, textAlign: 'right' }}>{formatGs(totales.total_iva)}</dd>
              <dt style={{ fontWeight: 700, fontSize: 18, paddingTop: 8 }}>Total</dt>
              <dd style={{ margin: 0, textAlign: 'right', fontWeight: 700, fontSize: 18, paddingTop: 8, color: COLORS.successLight }}>
                {formatGs(totales.total_general)}
              </dd>
              {modoEsEfectivo && (
                <>
                  <dt style={{ color: 'var(--text-secondary)' }}>Vuelto</dt>
                  <dd style={{ margin: 0, textAlign: 'right' }}>{formatGs(vuelto)}</dd>
                </>
              )}
            </dl>

            <button
              className="btn-primary-sm"
              style={{ marginTop: 20, width: '100%', display: 'inline-flex', justifyContent: 'center', alignItems: 'center', gap: 8 }}
              onClick={handleSubmit}
              disabled={saving}
            >
              <Plus size={16} /> Emitir factura
            </button>
          </div>
        </div>
      </div>

      {/* ─── Dialog: Agregar o editar concepto del folio ─── */}
      {showConsumos && (
        <ConsumosFolioModal
          subtitulo={`Folio #${folioActivo} · los cambios se aplican al folio al emitir la factura`}
          conceptos={conceptos}
          lineas={consumosDraft}
          setLineas={setConsumosDraft}
          cargosAQuitar={cargosAQuitar}
          setCargosAQuitar={setCargosAQuitar}
          onConfirm={handleConfirmarConsumos}
          onCancel={handleCancelarConsumos}
          confirmLabel="Aplicar a la factura"
          totalLabel="Total de los consumos"
        />
      )}
    </ModuleLayout>
  );
}
