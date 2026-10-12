import { useState } from 'react';
import ReactDOM from 'react-dom';
import { Edit2, Trash2, X, AlertTriangle, ShoppingCart } from 'lucide-react';
import AutocompleteConceptos from './AutocompleteConceptos';
import { esCargoDeAlojamiento } from '../utils/alojamiento';
import { enfocarCampo } from '../utils/formFocus';
import { formatGs } from '../utils/currency';
import '../index.css';
import { COLORS, tint } from '../constants/colors';

function ModalPortal({ children }: { children: React.ReactNode }) {
  return ReactDOM.createPortal(children, document.body);
}

/**
 * Ítem de la lista de "Cargar o editar consumo". La lista arranca con los
 * cargos que el folio ya tiene y admite altas, cambios y bajas; todo se
 * persiste recién al confirmar.
 */
export interface LineaConsumo {
  /** id_cargo si la línea ya existe en el folio; null si es un alta nueva. */
  idCargo: number | null;
  fk_concepto: number;
  nombre: string;
  /** Se guarda como texto para tolerar el campo vacío mientras se tipea. */
  cantidad: string;
  precioUnitario: number;
  /** Cómo estaba guardada la línea, para saber si hay que actualizarla. */
  original?: { fk_concepto: number; cantidad: number; montoTotal: number };
}

/** Estado del modal que se conserva al ir y volver de "Crear nuevo producto". */
export interface BorradorConsumo {
  lineas: LineaConsumo[];
  /** id_cargo de las líneas ya guardadas que se marcaron para quitar. */
  cargosAQuitar: number[];
}

/** Producto elegible en el buscador (forma mínima común a folios y facturación). */
interface ConceptoSeleccionable {
  id_concepto: number;
  nombre: string;
  arancel?: number | null;
  estado?: string | null;
}

interface ConsumosFolioModalProps {
  /** Línea de contexto bajo el título (folio, cliente, etc.). */
  subtitulo: string;
  conceptos: ConceptoSeleccionable[];
  lineas: LineaConsumo[];
  setLineas: React.Dispatch<React.SetStateAction<LineaConsumo[]>>;
  cargosAQuitar: number[];
  setCargosAQuitar: React.Dispatch<React.SetStateAction<number[]>>;
  /** Se llama sólo si la lista pasó las validaciones de cantidad y precio. */
  onConfirm: () => void;
  onCancel: () => void;
  saving?: boolean;
  /** Error de la persistencia que hace el contenedor (no del armado local). */
  error?: string | null;
  /** Lleva al alta de un producto nuevo; el contenedor guarda el borrador. */
  onCrearProducto?: () => void;
  confirmLabel?: string;
  totalLabel?: string;
}

/**
 * Modal de armado de consumos de un folio: agrega, cambia el producto, ajusta
 * cantidades y marca bajas. No persiste nada — el estado vive en el contenedor
 * (folio o factura) y se vuelca cuando éste lo decide, en `onConfirm`.
 */
export default function ConsumosFolioModal({
  subtitulo,
  conceptos,
  lineas,
  setLineas,
  cargosAQuitar,
  setCargosAQuitar,
  onConfirm,
  onCancel,
  saving = false,
  error,
  onCrearProducto,
  confirmLabel = 'Guardar cambios',
  totalLabel = 'Total del folio',
}: ConsumosFolioModalProps) {
  // Problemas del armado local (cantidad inválida, duplicados). El error de
  // guardado llega por prop; el más reciente es el que se muestra.
  const [mensajeError, setMensajeError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  // Remonta el buscador tras cada alta para limpiar el texto tipeado (el
  // componente sólo se sincroniza cuando cambia `value`, y acá siempre vuelve
  // a '' sin pasar por un valor intermedio).
  const [conceptoBuscadorKey, setConceptoBuscadorKey] = useState(0);
  // Línea cuyo producto se está por reemplazar: mientras está activa, el
  // buscador de arriba cambia ese producto en vez de agregar uno nuevo.
  const [lineaACambiar, setLineaACambiar] = useState<number | null>(null);
  // Línea que se pidió quitar: dispara la confirmación antes de sacarla.
  const [lineaAQuitar, setLineaAQuitar] = useState<number | null>(null);

  // El concepto de Alojamiento no se ofrece en el buscador: es de uso interno
  // exclusivo de ajustarCargoAlojamiento (a partir de las fechas de la
  // reserva), nunca se agrega ni se reasigna a mano desde este modal. Los
  // productos dados de baja tampoco se ofrecen.
  const conceptosSeleccionables = conceptos.filter(
    (c) =>
      !esCargoDeAlojamiento(c.nombre) &&
      (c.estado ?? 'ACTIVO').toString().trim().toLowerCase() === 'activo',
  );

  /**
   * Motivo por el que un producto no se puede usar, o null si está libre. Como
   * la lista ya incluye los cargos del folio, alcanza con mirarla: nunca se
   * suma cantidad en silencio, se avisa y el usuario decide.
   */
  const motivoDuplicado = (idConcepto: number, ignorarIdx?: number): string | null => {
    const idx = lineas.findIndex((l) => l.fk_concepto === idConcepto);
    if (idx === -1 || idx === ignorarIdx) return null;
    return `"${lineas[idx].nombre}" ya está en la lista. Cambiale la cantidad ahí en vez de agregarlo de nuevo.`;
  };

  /**
   * Selección en el buscador. Según el modo, agrega una línea nueva o
   * reemplaza el producto de la línea que se está cambiando con el lápiz.
   */
  const handleSeleccionBuscador = (val: string | number) => {
    if (!val) return;
    const idConcepto = Number(val);
    const conc = conceptos.find((c) => c.id_concepto === idConcepto);
    if (!conc) return;

    setMensajeError(null);
    // Entre o no, el buscador vuelve a quedar vacío.
    setConceptoBuscadorKey((k) => k + 1);

    // Respaldo del bloqueo ya aplicado en `conceptosSeleccionables`: el
    // buscador no debería ofrecerlo, pero si de alguna forma se seleccionara,
    // no se admite (ni como alta nueva ni como reemplazo de otra línea).
    if (esCargoDeAlojamiento(conc.nombre)) {
      setAviso(
        'El Alojamiento se genera y se actualiza solo, según las fechas de la reserva. No se puede cargar ni reasignar a mano.',
      );
      return;
    }

    const idxACambiar = lineaACambiar;
    const motivo = motivoDuplicado(idConcepto, idxACambiar ?? undefined);
    if (motivo) {
      setAviso(motivo);
      return;
    }

    setAviso(null);

    if (idxACambiar !== null) {
      setLineas((prev) =>
        prev.map((l, i) =>
          i === idxACambiar
            ? { ...l, fk_concepto: idConcepto, nombre: conc.nombre, precioUnitario: Number(conc.arancel) || 0 }
            : l,
        ),
      );
      setLineaACambiar(null);
      return;
    }

    setLineas((prev) => [
      ...prev,
      {
        idCargo: null,
        fk_concepto: idConcepto,
        nombre: conc.nombre,
        cantidad: '1',
        precioUnitario: Number(conc.arancel) || 0,
      },
    ]);
  };

  /** Arranca el cambio de producto: el buscador de arriba pasa a reemplazarlo. */
  const handlePedirCambio = (idx: number) => {
    setAviso(null);
    setMensajeError(null);
    setLineaACambiar(idx);
    setConceptoBuscadorKey((k) => k + 1);
    enfocarCampo('buscador-consumo');
  };

  // Cantidad: sólo enteros positivos. Se corta el tipeo ante cualquier otro
  // carácter (el "+", "-", "." y "," que dejaba pasar un input numérico
  // incluidos), sin 0 inicial y con tope de 2 dígitos.
  const handleCantidadLinea = (idx: number, value: string) => {
    setMensajeError(null);
    if (/[^\d]/.test(value)) {
      setMensajeError('Solo puede ingresar números enteros para la cantidad.');
      return;
    }
    if (value.length > 0 && value[0] === '0') {
      setMensajeError('La cantidad no puede ser cero ni empezar con 0.');
      return;
    }
    if (value.length > 2) {
      setMensajeError('La cantidad permite un máximo de 2 dígitos.');
      return;
    }
    setLineas((prev) => prev.map((l, i) => (i === idx ? { ...l, cantidad: value } : l)));
  };

  const handleQuitarLinea = () => {
    if (lineaAQuitar === null) return;
    const linea = lineas[lineaAQuitar];
    // Si ya estaba guardada, su baja se aplica al confirmar; si era un alta
    // que nunca llegó al folio, alcanza con sacarla de la lista.
    if (linea?.idCargo != null) {
      setCargosAQuitar((prev) => [...prev, linea.idCargo as number]);
    }
    setLineas((prev) => prev.filter((_, i) => i !== lineaAQuitar));
    setLineaACambiar(null);
    setLineaAQuitar(null);
    setAviso(null);
  };

  const totalLineas = lineas.reduce(
    (acc, l) => acc + (parseInt(l.cantidad, 10) || 0) * l.precioUnitario,
    0,
  );

  /** Valida el armado y recién ahí deja que el contenedor lo vuelque. */
  const handleConfirmar = () => {
    setMensajeError(null);

    const sinCantidad = lineas.findIndex((l) => !(parseInt(l.cantidad, 10) > 0));
    if (sinCantidad !== -1) {
      setMensajeError(`Indicá la cantidad de "${lineas[sinCantidad].nombre}".`);
      enfocarCampo(`consumo-cantidad-${sinCantidad}`);
      return;
    }

    const sinPrecio = lineas.find((l) => !(l.precioUnitario > 0));
    if (sinPrecio) {
      setMensajeError(`"${sinPrecio.nombre}" no tiene un precio válido cargado en Productos y servicios.`);
      return;
    }

    onConfirm();
  };

  const errorVisible = mensajeError ?? error ?? null;

  return (
    <>
      <ModalPortal>
        <div className="modal-backdrop-glow">
          <div className="modal-box-glow" style={{ maxWidth: '680px', width: '95%' }}>
            {/* Header */}
            <div className="modal-header-row">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '36px', height: '36px', borderRadius: '8px',
                  background: tint('primary', 0.15),
                  border: `1px solid ${tint('primary', 0.3)}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <ShoppingCart size={18} color={COLORS.primary} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>Consumos del folio</h3>
                  <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
                    {subtitulo}
                  </p>
                </div>
              </div>
              <button className="modal-close-btn" onClick={onCancel}>
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', margin: '20px 0' }}>
              {errorVisible && (
                <div className="status-message status-error" style={{ margin: 0 }}>{errorVisible}</div>
              )}
              {aviso && (
                <div
                  style={{
                    margin: 0,
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    background: tint('warning', 0.1),
                    border: `1px solid ${tint('warning', 0.3)}`,
                    color: COLORS.warningLight,
                    fontSize: '13px',
                  }}
                >
                  <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
                  <span>{aviso}</span>
                </div>
              )}

              <div className="input-group" style={{ marginBottom: 0 }}>
                <label style={{ marginBottom: '6px', display: 'block' }}>
                  {lineaACambiar !== null
                    ? `Busque un producto para cambiarlo por "${lineas[lineaACambiar]?.nombre ?? ''}"`
                    : 'Agregar producto'}
                </label>
                <div id="buscador-consumo">
                  <AutocompleteConceptos
                    key={conceptoBuscadorKey}
                    conceptos={conceptosSeleccionables}
                    value=""
                    onChange={handleSeleccionBuscador}
                  />
                </div>
                <div style={{ display: 'flex', gap: '14px', alignItems: 'center', marginTop: '6px' }}>
                  {onCrearProducto && (
                    <button
                      type="button"
                      className="link-btn"
                      style={{ fontSize: '13px' }}
                      onClick={onCrearProducto}
                    >
                      + Crear nuevo producto
                    </button>
                  )}
                  {lineaACambiar !== null && (
                    <button
                      type="button"
                      className="link-btn"
                      style={{ fontSize: '13px' }}
                      onClick={() => { setLineaACambiar(null); setConceptoBuscadorKey(k => k + 1); }}
                    >
                      Cancelar el cambio
                    </button>
                  )}
                </div>
              </div>

              {lineas.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '14px' }}>
                  {cargosAQuitar.length > 0
                    ? 'Vas a quitar todos los consumos del folio. Confirmá para aplicarlo.'
                    : 'Todavía no hay productos. Buscá uno arriba para agregarlo.'}
                </p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ textAlign: 'left', color: 'var(--text-secondary)', fontSize: 13 }}>
                        <th style={{ padding: '8px' }}>Producto</th>
                        <th style={{ padding: '8px' }}>Cant.</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>P. Unit.</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>Subtotal</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {lineas.map((l, idx) => (
                        <tr
                          key={l.idCargo ?? `nueva-${l.fk_concepto}`}
                          style={{
                            borderTop: '1px solid var(--glass-border)',
                            // Resalta la línea que se está por reemplazar.
                            background: lineaACambiar === idx ? tint('primary', 0.1) : undefined,
                          }}
                        >
                          <td style={{ padding: '8px', minWidth: 200 }}>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              <span>{l.nombre}</span>
                              {l.idCargo == null && (
                                <span style={{ fontSize: 11, color: COLORS.successLight }}>nuevo</span>
                              )}
                              <button
                                className="btn-action blue"
                                style={{ padding: '4px 6px', minWidth: 'auto' }}
                                onClick={() => handlePedirCambio(idx)}
                                title="Cambiar el producto"
                              >
                                <Edit2 size={14} />
                              </button>
                            </div>
                          </td>
                          <td style={{ padding: '8px', width: 90 }}>
                            {/* type="text": un input numérico deja tipear
                                "+", "-", "." y ",", y acá sólo van enteros. */}
                            <input
                              id={`consumo-cantidad-${idx}`}
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              className="input-field"
                              style={{ padding: '6px 8px' }}
                              value={l.cantidad}
                              onChange={(e) => handleCantidadLinea(idx, e.target.value)}
                            />
                          </td>
                          <td style={{ padding: '8px', textAlign: 'right' }}>
                            {formatGs(l.precioUnitario)}
                          </td>
                          <td style={{ padding: '8px', textAlign: 'right', fontWeight: 600 }}>
                            {formatGs((parseInt(l.cantidad, 10) || 0) * l.precioUnitario)}
                          </td>
                          <td style={{ padding: '8px', textAlign: 'center' }}>
                            <button
                              className="btn-action"
                              onClick={() => setLineaAQuitar(idx)}
                              title="Quitar de la lista"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Total preview */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '14px 16px',
                background: tint('success', 0.08),
                border: `1px solid ${tint('success', 0.25)}`,
                borderRadius: '10px',
              }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>{totalLabel}</span>
                <span style={{ fontWeight: 700, fontSize: '20px', color: COLORS.success }}>
                  {formatGs(totalLineas)}
                </span>
              </div>

              {cargosAQuitar.length > 0 && (
                <p style={{ margin: 0, fontSize: 13, color: COLORS.errorLighter }}>
                  {cargosAQuitar.length} consumo(s) se van a eliminar del folio al confirmar.
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="modal-actions-row">
              <button
                className="btn-modal-cancel"
                onClick={onCancel}
                disabled={saving}
              >
                Cancelar
              </button>
              <button className="btn-modal-submit" onClick={handleConfirmar} disabled={saving}>
                {saving ? 'Guardando...' : confirmLabel}
              </button>
            </div>
          </div>
        </div>
      </ModalPortal>

      {/* ─── Dialog: Confirmar quitar una línea del consumo en armado ─── */}
      {lineaAQuitar !== null && lineas[lineaAQuitar] && (
        <ModalPortal>
          <div className="modal-backdrop-glow">
            <div className="modal-box-glow" style={{ maxWidth: '400px', textAlign: 'center' }}>
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: tint('error', 0.15),
                border: `2px solid ${tint('error', 0.3)}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 20px',
              }}>
                <Trash2 size={28} style={{ color: COLORS.errorLight }} />
              </div>

              <h3 style={{ margin: '0 0 10px', fontSize: '20px', fontWeight: 700 }}>
                Quitar producto
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '15px', margin: '0 0 24px' }}>
                ¿Seguro que querés quitar{' '}
                <strong style={{ color: 'var(--text-primary)' }}>{lineas[lineaAQuitar].nombre}</strong>?{' '}
                {lineas[lineaAQuitar].idCargo != null
                  ? 'Se eliminará del folio cuando guardes los cambios.'
                  : 'Todavía no se guardó nada en el folio.'}
              </p>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button className="btn-modal-cancel" style={{ flex: 1 }} onClick={() => setLineaAQuitar(null)}>
                  Cancelar
                </button>
                <button
                  className="btn-modal-submit"
                  style={{ flex: 1, backgroundColor: COLORS.error }}
                  onClick={handleQuitarLinea}
                >
                  Sí, quitar
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </>
  );
}
