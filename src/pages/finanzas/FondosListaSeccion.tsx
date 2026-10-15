import { useState } from 'react';
import type { FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { DataTable } from '../../components/DataTable';
import type { Column } from '../../components/DataTable';
import { Modal } from '../../components/Modal';
import { Campo } from '../../components/finanzas/Campo';
import { ActivoBadge } from '../../components/finanzas/EstadoBadge';
import { finanzasService } from '../../services/finanzasService';
import { formatGs } from '../../utils/currency';
import { mensajeDeError } from '../../utils/facturaCredito';
import { ETIQUETA_TIPO_FONDO } from '../../utils/finanzasForm';
import type { CuentaFondo, TipoFondo } from '../../types/finanzas';

interface FondoFormModalProps {
  /** null = new fund. */
  fondo: CuentaFondo | null;
  onClose: () => void;
  onSaved: () => void;
}

// New funds are petty cash or bank accounts. Shift cash funds are created by
// the system with each cash register, so for them only the name can change.
function FondoFormModal({ fondo, onClose, onSaved }: FondoFormModalProps) {
  const [nombre, setNombre] = useState(fondo?.nombre ?? '');
  const [tipo, setTipo] = useState<TipoFondo>(fondo?.tipo ?? 'caja_chica');
  const [errorNombre, setErrorNombre] = useState<string | undefined>();
  const [errorBase, setErrorBase] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) {
      setErrorNombre('El nombre es obligatorio.');
      return;
    }
    setSaving(true);
    setErrorBase(null);
    try {
      if (fondo) await finanzasService.actualizarFondo(fondo.id, { nombre: nombre.trim() });
      else await finanzasService.crearFondo({ nombre: nombre.trim(), tipo });
      onSaved();
    } catch (err: unknown) {
      setErrorBase(mensajeDeError(err, 'No se pudo guardar el fondo.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={fondo ? 'Renombrar fondo' : 'Nuevo fondo'}>
      <form onSubmit={handleSubmit} noValidate>
        {errorBase && <div className="fin-error-box" role="alert">{errorBase}</div>}
        <Campo label="Nombre" htmlFor="fondo-nombre" error={errorNombre}>
          <input
            id="fondo-nombre"
            className={`input-field ${errorNombre ? 'input-error' : ''}`}
            value={nombre}
            onChange={(e) => {
              setNombre(e.target.value);
              setErrorNombre(undefined);
            }}
            autoFocus
          />
        </Campo>
        <Campo label="Tipo" htmlFor="fondo-tipo">
          {fondo ? (
            <div style={{ color: 'var(--text-primary)' }}>{ETIQUETA_TIPO_FONDO[fondo.tipo]}</div>
          ) : (
            <select
              id="fondo-tipo"
              className="input-field"
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoFondo)}
            >
              <option value="caja_chica">{ETIQUETA_TIPO_FONDO.caja_chica}</option>
              <option value="banco">{ETIQUETA_TIPO_FONDO.banco}</option>
            </select>
          )}
        </Campo>
        <div className="fin-form-actions">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary-sm" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

interface FondosListaSeccionProps {
  fondos: CuentaFondo[];
  /** Current balance by fund id, from the fund flow report. */
  saldos: Map<number, number>;
  /** Called after any change so the parent reloads funds and balances. */
  onChanged: () => void;
}

export default function FondosListaSeccion({ fondos, saldos, onChanged }: FondosListaSeccionProps) {
  // undefined = form closed, null = new fund, otherwise the one being renamed.
  const [editando, setEditando] = useState<CuentaFondo | null | undefined>(undefined);
  const [cambiandoId, setCambiandoId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggleActivo = async (f: CuentaFondo) => {
    setCambiandoId(f.id);
    setError(null);
    try {
      await finanzasService.setFondoActivo(f.id, !f.activo);
      onChanged();
    } catch (err: unknown) {
      setError(mensajeDeError(err, 'No se pudo cambiar el estado del fondo.'));
    } finally {
      setCambiandoId(null);
    }
  };

  const columns: Column<CuentaFondo>[] = [
    { header: 'Nombre', render: (f) => <strong>{f.nombre}</strong> },
    { header: 'Tipo', render: (f) => ETIQUETA_TIPO_FONDO[f.tipo] },
    {
      header: 'Saldo',
      align: 'right',
      render: (f) => <span className="fin-monto">{formatGs(saldos.get(f.id) ?? 0)}</span>,
    },
    { header: 'Estado', render: (f) => <ActivoBadge activo={f.activo} /> },
    {
      header: 'Acciones',
      align: 'center',
      render: (f) => (
        <div className="fin-actions" style={{ justifyContent: 'center' }}>
          <button className="btn-ghost" onClick={() => setEditando(f)}>Renombrar</button>
          {/* Shift cash funds follow their register: they are not switched off here. */}
          {f.tipo !== 'caja_turno' && (
            <button className="btn-ghost" onClick={() => toggleActivo(f)} disabled={cambiandoId === f.id}>
              {f.activo ? 'Desactivar' : 'Reactivar'}
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <section className="fin-panel">
      <div className="fin-toolbar">
        <h3 className="fin-section-title" style={{ marginBottom: 0 }}>Fondos</h3>
        <button className="btn-primary-sm" onClick={() => setEditando(null)}>
          <Plus size={15} /> Nuevo fondo
        </button>
      </div>
      <p className="fin-hint">
        El saldo es el acumulado desde el inicio del año hasta hoy (saldo inicial más ingresos menos
        egresos). Las cajas de turno se crean solas con cada caja.
      </p>
      {error && <div className="fin-error-box" role="alert">{error}</div>}
      <DataTable
        data={fondos}
        columns={columns}
        emptyMessage="Todavía no hay fondos."
        keyExtractor={(f) => f.id}
      />
      {editando !== undefined && (
        <FondoFormModal
          key={editando?.id ?? 'nuevo'}
          fondo={editando}
          onClose={() => setEditando(undefined)}
          onSaved={() => {
            setEditando(undefined);
            onChanged();
          }}
        />
      )}
    </section>
  );
}
