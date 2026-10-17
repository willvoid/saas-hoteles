import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Ban, Pencil, Plus, Tags } from 'lucide-react';
import { DataTable } from '../../components/DataTable';
import type { Column } from '../../components/DataTable';
import { Modal } from '../../components/Modal';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { StatusBadge } from '../../components/StatusBadge';
import { BotonPdf } from '../../components/finanzas/BotonPdf';
import { Campo, CampoMonto } from '../../components/finanzas/Campo';
import { KpiCard } from '../../components/finanzas/KpiCard';
import { RangoFechas } from '../../components/finanzas/RangoFechas';
import { MonthlyBarChart } from '../../components/superadmin/MonthlyBarChart';
import { TIPO_LABEL } from '../../constants/finanzasPlataforma';
import {
  categoriasParaTipo,
  emptyMovimientoForm,
  formFromMovimiento,
  movimientoDescripcion,
  movimientoPdfRows,
  validateMovimientoForm,
} from '../../utils/movimientoForm';
import type { MovimientoFormState } from '../../utils/movimientoForm';
import { useFinanzasPlataforma } from '../../hooks/useFinanzasPlataforma';
import type { Categoria, CategoriaInput, Movimiento, MovimientoTipo } from '../../services/superadminFinanzasService';
import { formatGs } from '../../utils/currency';
import { fechaNegocioHoy } from '../../utils/periodoContable';
import { COLORS, tint } from '../../constants/colors';
import { SuperadminTabs } from '../../components/superadmin/SuperadminTabs';
import '../../index.css';

type Result = { ok: boolean; message?: string };

const isEditable = (m: Movimiento) => m.origen === 'manual' && !m.anulado && !!m.id;
const struck = (m: Movimiento) => (m.anulado ? { textDecoration: 'line-through', opacity: 0.6 } : undefined);

export default function FinanzasPlataforma() {
  const f = useFinanzasPlataforma();
  const { resumen, movimientos, categorias } = f;

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Movimiento | null>(null);
  const [form, setForm] = useState<MovimientoFormState>(() => emptyMovimientoForm(fechaNegocioHoy()));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [toAnular, setToAnular] = useState<Movimiento | null>(null);
  const [anularError, setAnularError] = useState<string | null>(null);
  const [catsOpen, setCatsOpen] = useState(false);

  const openNew = () => {
    setEditing(null);
    setForm(emptyMovimientoForm(fechaNegocioHoy()));
    setErrors({});
    setFormError(null);
    setFormOpen(true);
  };
  const openEdit = (m: Movimiento) => {
    setEditing(m);
    setForm(formFromMovimiento(m));
    setErrors({});
    setFormError(null);
    setFormOpen(true);
  };
  const openAnular = (m: Movimiento) => {
    setAnularError(null);
    setToAnular(m);
  };

  const submitForm = async (e: FormEvent) => {
    e.preventDefault();
    const { errors: errs, value } = validateMovimientoForm(form);
    setErrors(errs);
    if (!value) return;
    const res = editing?.id ? await f.update(editing.id, value) : await f.create(value);
    if (res.ok) setFormOpen(false);
    else setFormError(res.message ?? 'No se pudo guardar.');
  };

  const confirmAnular = async () => {
    if (!toAnular?.id) return;
    const res = await f.anular(toAnular.id);
    if (res.ok) setToAnular(null);
    else setAnularError(res.message ?? 'No se pudo anular.');
  };

  const catsForForm = categoriasParaTipo(categorias, form.tipo, editing?.categoria_id);
  const totales = resumen?.totales;
  const ingresos = totales ? totales.ingresos_suscripcion + totales.ingresos_manuales : null;

  const exportPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(16);
    doc.text('Finanzas de la plataforma', 14, 18);
    doc.setFontSize(10);
    doc.text(`Período: ${f.range.desde} a ${f.range.hasta}`, 14, 25);
    if (totales && ingresos !== null) {
      doc.text(
        `Ingresos: ${formatGs(ingresos)}   Egresos: ${formatGs(totales.egresos)}   Neto: ${formatGs(totales.neto)}   MRR: ${formatGs(resumen?.mrr)}`,
        14,
        31,
      );
    }
    autoTable(doc, {
      startY: 37,
      head: [['Fecha', 'Tipo', 'Categoría', 'Descripción', 'Monto', 'Origen']],
      body: movimientoPdfRows(movimientos),
      styles: { fontSize: 9 },
    });
    doc.save(`finanzas-plataforma_${f.range.desde}_${f.range.hasta}.pdf`);
  };

  const columns: Column<Movimiento>[] = useMemo(
    () => [
      { header: 'Fecha', render: (m) => <span style={struck(m)}>{m.fecha}</span> },
      { header: 'Tipo', render: (m) => TIPO_LABEL[m.tipo] },
      { header: 'Categoría', render: (m) => (m.origen === 'suscripcion' ? 'Suscripción' : (m.categoria_nombre ?? '—')) },
      { header: 'Descripción', render: (m) => <span style={struck(m)}>{movimientoDescripcion(m) || '—'}</span> },
      {
        header: 'Monto',
        align: 'right',
        render: (m) => (
          <span style={{ color: m.tipo === 'ingreso' ? COLORS.success : COLORS.error, ...struck(m) }}>
            {m.tipo === 'egreso' ? '−' : ''}
            {formatGs(m.monto)}
          </span>
        ),
      },
      {
        header: 'Origen',
        render: (m) => (
          <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
            <StatusBadge
              label={m.origen === 'suscripcion' ? 'Suscripción' : 'Manual'}
              style={{ color: COLORS.primary, bg: tint('primary', 0.12) }}
              size="sm"
            />
            {m.anulado && <StatusBadge label="Anulado" style={{ color: COLORS.error, bg: tint('error', 0.15) }} size="sm" />}
          </span>
        ),
      },
      {
        header: 'Acciones',
        align: 'right',
        render: (m) =>
          isEditable(m) ? (
            <span style={{ display: 'inline-flex', gap: 8 }}>
              <button type="button" className="btn-ghost" onClick={() => openEdit(m)}>
                <Pencil size={14} /> Editar
              </button>
              <button type="button" className="btn-ghost" onClick={() => openAnular(m)}>
                <Ban size={14} /> Anular
              </button>
            </span>
          ) : null,
      },
    ],
    [],
  );

  return (
    <div className="hotel-select-page">
      <div className="hotel-select-inner">
        <div className="hotel-select-header">
          <div>
            <h1 className="hotel-select-title">Finanzas de la plataforma</h1>
            <p className="hotel-select-subtitle">Ingresos por suscripciones y egresos propios del SaaS.</p>
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button type="button" className="btn-primary-sm" onClick={openNew}>
              <Plus size={16} style={{ marginRight: '6px', verticalAlign: 'text-bottom' }} />
              Nuevo movimiento
            </button>
            <button type="button" className="btn-ghost" onClick={() => setCatsOpen(true)}>
              <Tags size={16} style={{ marginRight: '6px', verticalAlign: 'text-bottom' }} />
              Categorías
            </button>
            <BotonPdf onClick={exportPdf} disabled={f.loading || movimientos.length === 0} />
            <Link to="/hoteles" className="btn-ghost">
              Mis hoteles
            </Link>
          </div>
        </div>

        <SuperadminTabs active="finanzas" />

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '20px', alignItems: 'flex-end' }}>
          <RangoFechas desde={f.range.desde} hasta={f.range.hasta} onChange={f.setRange} />
        </div>

        {f.error && (
          <div className="status-message status-error" role="alert" style={{ marginBottom: '20px' }}>
            {f.error}{' '}
            <button type="button" className="link-btn" onClick={f.refetch}>
              Reintentar
            </button>
          </div>
        )}

        {f.loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
            <div className="loader" role="status" aria-label="Cargando finanzas" />
          </div>
        ) : (
          <>
            <div className="fin-kpi-grid">
              <KpiCard label="Ingresos" valor={ingresos === null ? null : formatGs(ingresos)} tono="positivo" />
              <KpiCard label="Egresos" valor={totales ? formatGs(totales.egresos) : null} tono="negativo" />
              <KpiCard
                label="Neto"
                valor={totales ? formatGs(totales.neto) : null}
                tono={totales && totales.neto < 0 ? 'negativo' : 'positivo'}
              />
              <KpiCard label="MRR" valor={resumen ? formatGs(resumen.mrr) : null} nota="Plan anual = precio / 12" />
            </div>

            <MonthlyBarChart serie={resumen?.serie_mensual ?? []} />

            <div className="chart-card">
              <h3 className="chart-title">Ingresos por hotel</h3>
              {resumen && resumen.por_tenant.length > 0 ? (
                <ol style={{ margin: '12px 0 0', paddingLeft: 20, display: 'grid', gap: 6 }}>
                  {resumen.por_tenant.map((t) => (
                    <li key={t.tenant_id}>
                      {t.nombre} — <strong>{formatGs(t.total)}</strong>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="chart-empty">Sin ingresos por suscripción en el período.</p>
              )}
            </div>

            <DataTable
              data={movimientos}
              columns={columns}
              keyExtractor={(m) => m.id ?? `${m.origen}-${m.tenant_id}-${m.fecha}-${m.created_at}-${m.monto}`}
              emptyMessage="No hay movimientos en el período."
            />
          </>
        )}

        <Modal isOpen={formOpen} onClose={() => setFormOpen(false)} title={editing ? 'Editar movimiento' : 'Nuevo movimiento'}>
          <form onSubmit={submitForm} noValidate>
            <Campo label="Tipo" htmlFor="mov-tipo">
              <select
                id="mov-tipo"
                className="input-field"
                value={form.tipo}
                onChange={(e) => setForm({ ...form, tipo: e.target.value as MovimientoTipo, categoria_id: '' })}
              >
                <option value="egreso">Egreso</option>
                <option value="ingreso">Ingreso</option>
              </select>
            </Campo>
            <Campo label="Categoría" htmlFor="mov-cat" error={errors.categoria_id}>
              <select
                id="mov-cat"
                className="input-field"
                value={form.categoria_id}
                onChange={(e) => setForm({ ...form, categoria_id: e.target.value })}
              >
                <option value="">Seleccioná…</option>
                {catsForForm.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </Campo>
            <CampoMonto
              id="mov-monto"
              label="Monto (Gs.)"
              value={form.monto}
              onChange={(monto) => setForm({ ...form, monto })}
              error={errors.monto}
            />
            <Campo label="Fecha" htmlFor="mov-fecha" error={errors.fecha}>
              <input
                id="mov-fecha"
                type="date"
                className="input-field"
                value={form.fecha}
                onChange={(e) => setForm({ ...form, fecha: e.target.value })}
              />
            </Campo>
            <Campo label="Descripción" htmlFor="mov-desc">
              <input
                id="mov-desc"
                type="text"
                className="input-field"
                value={form.descripcion}
                onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              />
            </Campo>
            <Campo label="Referencia" htmlFor="mov-ref">
              <input
                id="mov-ref"
                type="text"
                className="input-field"
                value={form.referencia}
                onChange={(e) => setForm({ ...form, referencia: e.target.value })}
              />
            </Campo>
            {formError && (
              <div className="fin-error-box" role="alert" style={{ marginTop: 12 }}>
                {formError}
              </div>
            )}
            <div className="fin-form-actions" style={{ marginTop: 16 }}>
              <button type="button" className="btn-ghost" onClick={() => setFormOpen(false)} disabled={f.busy}>
                Cancelar
              </button>
              <button type="submit" className="btn-primary-sm" disabled={f.busy}>
                {f.busy ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </form>
        </Modal>

        <ConfirmDialog
          isOpen={!!toAnular}
          title="Anular movimiento"
          message={
            anularError ??
            (toAnular
              ? `¿Anular el ${toAnular.tipo} de ${formatGs(toAnular.monto)} del ${toAnular.fecha}? Dejará de contar en los totales.`
              : '')
          }
          confirmLabel="Sí, anular"
          variant="danger"
          loading={f.busy}
          onConfirm={confirmAnular}
          onCancel={() => setToAnular(null)}
        />

        <CategoriasModal
          isOpen={catsOpen}
          onClose={() => setCatsOpen(false)}
          categorias={categorias}
          busy={f.busy}
          onSave={f.upsertCategoria}
          onToggle={f.setCategoriaActiva}
        />
      </div>
    </div>
  );
}

interface CategoriasModalProps {
  isOpen: boolean;
  onClose: () => void;
  categorias: Categoria[];
  busy: boolean;
  onSave: (input: CategoriaInput) => Promise<Result>;
  onToggle: (id: string, activo: boolean) => Promise<Result>;
}

function CategoriasModal({ isOpen, onClose, categorias, busy, onSave, onToggle }: CategoriasModalProps) {
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<MovimientoTipo>('egreso');
  const [renaming, setRenaming] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const run = async (p: Promise<Result>, onOk?: () => void) => {
    const r = await p;
    if (r.ok) {
      setError(null);
      onOk?.();
    } else {
      setError(r.message ?? 'No se pudo guardar la categoría.');
    }
  };

  const create = (e: FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) {
      setError('Ingresá un nombre.');
      return;
    }
    void run(onSave({ nombre: nombre.trim(), tipo }), () => setNombre(''));
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Categorías" maxWidth={560}>
      <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
        {categorias.map((c) => {
          const draft = renaming[c.id] ?? c.nombre;
          return (
            <div
              key={c.id}
              style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', opacity: c.activo ? 1 : 0.6 }}
            >
              <input
                className="input-field"
                style={{ flex: 1, minWidth: 140 }}
                aria-label={`Nombre de ${c.nombre}`}
                value={draft}
                onChange={(e) => setRenaming({ ...renaming, [c.id]: e.target.value })}
              />
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{TIPO_LABEL[c.tipo]}</span>
              <button
                type="button"
                className="btn-ghost"
                disabled={busy || !draft.trim() || draft.trim() === c.nombre}
                onClick={() => void run(onSave({ id: c.id, nombre: draft.trim(), tipo: c.tipo }), () => setRenaming({}))}
              >
                Renombrar
              </button>
              <button type="button" className="btn-ghost" disabled={busy} onClick={() => void run(onToggle(c.id, !c.activo))}>
                {c.activo ? 'Desactivar' : 'Activar'}
              </button>
            </div>
          );
        })}
      </div>
      <form onSubmit={create} noValidate style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          className="input-field"
          style={{ flex: 1, minWidth: 140 }}
          placeholder="Nueva categoría"
          aria-label="Nombre de la nueva categoría"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
        />
        <select
          className="input-field"
          style={{ width: 'auto' }}
          aria-label="Tipo de la nueva categoría"
          value={tipo}
          onChange={(e) => setTipo(e.target.value as MovimientoTipo)}
        >
          <option value="egreso">Egreso</option>
          <option value="ingreso">Ingreso</option>
        </select>
        <button type="submit" className="btn-primary-sm" disabled={busy}>
          Agregar
        </button>
      </form>
      {error && (
        <div className="fin-error-box" role="alert" style={{ marginTop: 12 }}>
          {error}
        </div>
      )}
    </Modal>
  );
}
