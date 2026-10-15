-- ═══════════════════════════════════════════════════════════════════════════
-- 0021 · Finance reports (read-only RPCs)
-- ═══════════════════════════════════════════════════════════════════════════
-- Six report functions the Finanzas UI calls with supabase.rpc(...). All of them:
--
--   * LANGUAGE sql, STABLE, SECURITY INVOKER, search_path = public. They run
--     with the caller's rights, so RLS applies on top of the explicit filters.
--   * Filter `tenant_id = current_tenant_id()` explicitly (belt and braces with
--     RLS) and `current_es_admin_o_gerente()`: only admin and gerente get rows.
--     The role test matters for CxC, whose source tables (facturas, clientes)
--     are readable by reception; the ledger and the 0019 tables are already
--     admin/gerente-only through RLS (`admin_gerente_total`).
--   * Have no module / subscription gate: after a downgrade to `basico` the
--     reports of the history stay readable (writes are what 0014/0018/0019 gate).
--   * Read the ledger through asientos with estado = 'CONTABILIZADO' only. An
--     annulled document leaves its entry and its reversal both in ANULADO, so
--     annulled documents never appear in a report.
--   * Use the business day (America/Asuncion) of asientos.fecha, never UTC.
--   * Return money as numeric (PYG, no decimals in practice).
--
-- The internal helpers (fn_cuenta_por_clave, fn_fecha_negocio) have no EXECUTE
-- for the client, so the system accounts are matched on
-- cuentas_contables.clave directly, with the tenant filter.
--
-- Return shapes are `returns table (...)` with stable Spanish column names; the
-- frontend types them, so renaming a column is a breaking change. They are
-- documented again with COMMENT ON FUNCTION.
--
-- Idempotent: each function is dropped (if it exists) and recreated, and the
-- grants are repeated.
-- ═══════════════════════════════════════════════════════════════════════════

drop function if exists public.fn_rep_resultado(date, date);
drop function if exists public.fn_rep_cxc(date);
drop function if exists public.fn_rep_cxp(date);
drop function if exists public.fn_rep_flujo_fondos(date, date);
drop function if exists public.fn_rep_movimientos_fondo(bigint, date, date);
drop function if exists public.fn_rep_libro_iva(integer);

-- ─── 1. Income vs expenses ───────────────────────────────────────────────────
-- One row per (month, category) with movement in [p_desde, p_hasta] (business
-- dates, both inclusive). ingreso = haber - debe, egreso = debe - haber, so a
-- reversed/negative movement shows as a negative amount. Categories without
-- movement in the range are not returned.
create function public.fn_rep_resultado(p_desde date, p_hasta date)
returns table (
  mes           date,     -- first day of the month
  fk_categoria  bigint,   -- categorias_finanzas.id
  categoria     text,     -- categorias_finanzas.nombre
  tipo          text,     -- 'ingreso' | 'egreso'
  monto         numeric   -- amount of the category in that month
)
language sql
stable
security invoker
set search_path = public
as $$
  select date_trunc('month', a.fecha at time zone 'America/Asuncion')::date,
         c.id,
         c.nombre,
         c.tipo,
         sum(case when c.tipo = 'ingreso' then d.haber - d.debe else d.debe - d.haber end)
  from public.categorias_finanzas c
  join public.detalle_asientos d
    on d.tenant_id = c.tenant_id and d.fk_cuenta_contables = c.fk_cuenta_contable
  join public.asientos a
    on a.tenant_id = d.tenant_id and a.id = d.fk_asientos
  where c.tenant_id = public.current_tenant_id()
    and public.current_es_admin_o_gerente()
    and a.estado = 'CONTABILIZADO'
    and (a.fecha at time zone 'America/Asuncion')::date between p_desde and p_hasta
  group by 1, 2, 3, 4
  order by 1, 4 desc, 3
$$;

comment on function public.fn_rep_resultado(date, date) is
  'Income vs expenses by month and category from CONTABILIZADO entries. Columns: mes (first day of month), fk_categoria, categoria, tipo (ingreso|egreso), monto (ingreso = haber - debe, egreso = debe - haber). Only categories with movement. Admin/gerente only; invoker.';

-- ─── 2. Accounts receivable with aging ───────────────────────────────────────
-- Pending credit invoices (condicion_venta = 2, EMITIDA, saldo_pendiente > 0).
-- saldo_pendiente is the CURRENT balance: there is no point-in-time
-- reconstruction, p_corte only drives the aging (days past due). p_corte null =
-- today in America/Asuncion. An invoice without fecha_vencimiento is due on its
-- issue day. dias_vencido is 0 while not due. Oldest debt first.
create function public.fn_rep_cxc(p_corte date default null)
returns table (
  fk_cliente         bigint,
  cliente            text,     -- clientes.razon_social
  documento          text,     -- clientes.documento (RUC / CI)
  id_factura         bigint,
  nro                text,     -- facturas.nro_secuencial, as the app shows it
  fecha_emision      date,     -- business day of issue
  fecha_vencimiento  date,     -- facturas.fecha_vencimiento, or the issue day when null
  total_general      numeric,
  saldo_pendiente    numeric,  -- current balance
  dias_vencido       integer,  -- p_corte - fecha_vencimiento, 0 when not due
  bucket             text      -- 'vigente' | '1-30' | '31-60' | '61-90' | '+90'
)
language sql
stable
security invoker
set search_path = public
as $$
  select f.fk_cliente,
         cl.razon_social,
         cl.documento,
         f.id_factura,
         f.nro_secuencial::text,
         v.emision,
         v.vence,
         f.total_general,
         f.saldo_pendiente,
         v.dias,
         case when v.dias = 0  then 'vigente'
              when v.dias <= 30 then '1-30'
              when v.dias <= 60 then '31-60'
              when v.dias <= 90 then '61-90'
              else '+90' end
  from public.facturas f
  join public.clientes cl
    on cl.tenant_id = f.tenant_id and cl.id_cliente = f.fk_cliente
  cross join lateral (
    select (f.fecha_emision at time zone 'America/Asuncion')::date as emision
  ) e
  cross join lateral (
    select e.emision,
           coalesce(f.fecha_vencimiento, e.emision) as vence,
           greatest(coalesce(p_corte, (now() at time zone 'America/Asuncion')::date)
                    - coalesce(f.fecha_vencimiento, e.emision), 0) as dias
  ) v
  where f.tenant_id = public.current_tenant_id()
    and public.current_es_admin_o_gerente()
    and f.condicion_venta = 2
    and f.estado = 'EMITIDA'
    and f.saldo_pendiente > 0
  order by v.dias desc, v.vence, f.id_factura
$$;

comment on function public.fn_rep_cxc(date) is
  'Receivables with aging. Columns: fk_cliente, cliente, documento, id_factura, nro, fecha_emision, fecha_vencimiento (issue day when none), total_general, saldo_pendiente (CURRENT balance, not reconstructed at p_corte), dias_vencido (p_corte - vencimiento, 0 if not due), bucket (vigente|1-30|31-60|61-90|+90). p_corte only drives the aging; null = today in America/Asuncion. Admin/gerente only; invoker.';

-- ─── 3. Accounts payable with aging ──────────────────────────────────────────
-- Credit expenses (condicion = 'credito', REGISTRADO, saldo_pendiente > 0).
-- Same rules as fn_rep_cxc: current balance, p_corte drives the aging only, a
-- missing fecha_vencimiento means due on the expense date.
create function public.fn_rep_cxp(p_corte date default null)
returns table (
  fk_proveedor       bigint,
  proveedor          text,     -- proveedores.nombre
  ruc                text,     -- proveedores.ruc (may be null)
  id_gasto           bigint,
  nro_comprobante    text,     -- gastos.nro_comprobante (may be null)
  fecha              date,     -- gastos.fecha
  fecha_vencimiento  date,     -- gastos.fecha_vencimiento, or fecha when null
  total              numeric,
  saldo_pendiente    numeric,  -- current balance
  dias_vencido       integer,  -- p_corte - fecha_vencimiento, 0 when not due
  bucket             text      -- 'vigente' | '1-30' | '31-60' | '61-90' | '+90'
)
language sql
stable
security invoker
set search_path = public
as $$
  select g.fk_proveedor,
         p.nombre,
         p.ruc,
         g.id,
         g.nro_comprobante,
         g.fecha,
         v.vence,
         g.total,
         g.saldo_pendiente,
         v.dias,
         case when v.dias = 0  then 'vigente'
              when v.dias <= 30 then '1-30'
              when v.dias <= 60 then '31-60'
              when v.dias <= 90 then '61-90'
              else '+90' end
  from public.gastos g
  join public.proveedores p
    on p.tenant_id = g.tenant_id and p.id = g.fk_proveedor
  cross join lateral (
    select coalesce(g.fecha_vencimiento, g.fecha) as vence,
           greatest(coalesce(p_corte, (now() at time zone 'America/Asuncion')::date)
                    - coalesce(g.fecha_vencimiento, g.fecha), 0) as dias
  ) v
  where g.tenant_id = public.current_tenant_id()
    and public.current_es_admin_o_gerente()
    and g.condicion = 'credito'
    and g.estado = 'REGISTRADO'
    and g.saldo_pendiente > 0
  order by v.dias desc, v.vence, g.id
$$;

comment on function public.fn_rep_cxp(date) is
  'Payables with aging. Columns: fk_proveedor, proveedor, ruc, id_gasto, nro_comprobante, fecha, fecha_vencimiento (fecha when none), total, saldo_pendiente (CURRENT balance, not reconstructed at p_corte), dias_vencido (p_corte - vencimiento, 0 if not due), bucket (vigente|1-30|31-60|61-90|+90). p_corte only drives the aging; null = today in America/Asuncion. Admin/gerente only; invoker.';

-- ─── 4. Fund flow ────────────────────────────────────────────────────────────
-- One row per fund that is active or has CONTABILIZADO movement up to p_hasta.
-- saldo_inicial = net debit of the fund account before p_desde (opening
-- balances included), ingresos = debits and egresos = credits inside the range
-- (transfers between funds count as in/out), saldo_final = saldo_inicial +
-- ingresos - egresos. Entries after p_hasta are ignored.
create function public.fn_rep_flujo_fondos(p_desde date, p_hasta date)
returns table (
  fk_fondo       bigint,   -- cuentas_fondos.id
  fondo          text,     -- cuentas_fondos.nombre
  tipo           text,     -- 'caja_turno' | 'caja_chica' | 'banco'
  activo         boolean,
  saldo_inicial  numeric,
  ingresos       numeric,
  egresos        numeric,
  saldo_final    numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with fondos as (
    select f.id, f.nombre, f.tipo, f.activo, f.fk_cuenta_contable
    from public.cuentas_fondos f
    where f.tenant_id = public.current_tenant_id()
      and public.current_es_admin_o_gerente()
  ),
  mov as (
    select f.id as fk_fondo,
           coalesce(sum(d.debe - d.haber) filter (where x.dia < p_desde), 0) as inicial,
           coalesce(sum(d.debe)  filter (where x.dia between p_desde and p_hasta), 0) as ing,
           coalesce(sum(d.haber) filter (where x.dia between p_desde and p_hasta), 0) as egr
    from fondos f
    join public.detalle_asientos d
      on d.tenant_id = public.current_tenant_id() and d.fk_cuenta_contables = f.fk_cuenta_contable
    join public.asientos a
      on a.tenant_id = d.tenant_id and a.id = d.fk_asientos and a.estado = 'CONTABILIZADO'
    cross join lateral (select (a.fecha at time zone 'America/Asuncion')::date as dia) x
    where x.dia <= p_hasta
    group by f.id
  )
  select f.id, f.nombre, f.tipo, f.activo,
         coalesce(m.inicial, 0),
         coalesce(m.ing, 0),
         coalesce(m.egr, 0),
         coalesce(m.inicial, 0) + coalesce(m.ing, 0) - coalesce(m.egr, 0)
  from fondos f
  left join mov m on m.fk_fondo = f.id
  where f.activo or m.fk_fondo is not null
  order by f.nombre
$$;

comment on function public.fn_rep_flujo_fondos(date, date) is
  'Fund flow. Columns: fk_fondo, fondo, tipo, activo, saldo_inicial (net debit before p_desde), ingresos (debits in range, transfers in included), egresos (credits in range, transfers out included), saldo_final. One row per active fund or fund with movement up to p_hasta. CONTABILIZADO entries only. Admin/gerente only; invoker.';

-- ─── 5. Movements of one fund ────────────────────────────────────────────────
-- Ledger lines of the fund account inside [p_desde, p_hasta], oldest first,
-- with the running balance starting from the fund balance before p_desde.
-- An unknown fund (or one of another hotel) returns no rows.
create function public.fn_rep_movimientos_fondo(p_fondo bigint, p_desde date, p_hasta date)
returns table (
  fecha            date,     -- business day of the entry
  nro_asiento      bigint,
  descripcion      text,
  origen_tipo      text,     -- asientos.origen_tipo (factura, gasto, cobro, pago, transferencia, saldo_inicial, ...)
  fk_origen        bigint,   -- id of the source document
  debe             numeric,  -- money in
  haber            numeric,  -- money out
  saldo_acumulado  numeric   -- balance after this line
)
language sql
stable
security invoker
set search_path = public
as $$
  with lineas as (
    select (a.fecha at time zone 'America/Asuncion')::date as dia,
           a.id as aid, d.id as did,
           a.nro_asiento, a.descripcion, a.origen_tipo, a.fk_origen, d.debe, d.haber
    from public.cuentas_fondos f
    join public.detalle_asientos d
      on d.tenant_id = f.tenant_id and d.fk_cuenta_contables = f.fk_cuenta_contable
    join public.asientos a
      on a.tenant_id = d.tenant_id and a.id = d.fk_asientos and a.estado = 'CONTABILIZADO'
    where f.tenant_id = public.current_tenant_id()
      and public.current_es_admin_o_gerente()
      and f.id = p_fondo
      and (a.fecha at time zone 'America/Asuncion')::date <= p_hasta
  ),
  inicial as (
    select coalesce(sum(l.debe - l.haber), 0) as saldo from lineas l where l.dia < p_desde
  )
  select l.dia, l.nro_asiento, l.descripcion, l.origen_tipo, l.fk_origen, l.debe, l.haber,
         (select i.saldo from inicial i)
           + sum(l.debe - l.haber) over (order by l.dia, l.aid, l.did)
  from lineas l
  where l.dia >= p_desde
  order by l.dia, l.aid, l.did
$$;

comment on function public.fn_rep_movimientos_fondo(bigint, date, date) is
  'Ledger movements of one fund in range, oldest first. Columns: fecha, nro_asiento, descripcion, origen_tipo, fk_origen, debe (in), haber (out), saldo_acumulado (starts from the balance before p_desde). CONTABILIZADO entries only; unknown fund = no rows. Admin/gerente only; invoker.';

-- ─── 6. Simple VAT book ──────────────────────────────────────────────────────
-- Always 12 rows (months 1..12 of p_anio), zeros for months without activity.
--   sales      base_ventas_* and iva_debito come from the ledger accounts
--              VENTAS_10 / VENTAS_5 / VENTAS_EXENTAS / IVA_DEBITO (haber - debe).
--   purchases  iva_credito comes from the ledger account IVA_CREDITO
--              (debe - haber); the taxable bases come from REGISTRADO gastos
--              (amounts there include VAT, so base = gravado - iva). Expense
--              entries are posted on the expense date, so both sources agree.
--   iva_a_pagar = iva_debito - iva_credito (negative = credit in favour).
-- This is a management summary, not the RG 90 export.
create function public.fn_rep_libro_iva(p_anio integer)
returns table (
  mes                  integer,  -- 1..12
  base_ventas_10       numeric,
  base_ventas_5        numeric,
  base_ventas_exentas  numeric,
  iva_debito           numeric,
  compras_gravadas_10  numeric,  -- net of VAT
  compras_gravadas_5   numeric,  -- net of VAT
  compras_exentas      numeric,
  iva_credito          numeric,
  iva_a_pagar          numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with ledger as (
    select extract(month from a.fecha at time zone 'America/Asuncion')::integer as m,
           sum(case when c.clave = 'VENTAS_10'       then d.haber - d.debe else 0 end) as v10,
           sum(case when c.clave = 'VENTAS_5'        then d.haber - d.debe else 0 end) as v5,
           sum(case when c.clave = 'VENTAS_EXENTAS'  then d.haber - d.debe else 0 end) as vex,
           sum(case when c.clave = 'IVA_DEBITO'      then d.haber - d.debe else 0 end) as deb,
           sum(case when c.clave = 'IVA_CREDITO'     then d.debe - d.haber else 0 end) as cred
    from public.asientos a
    join public.detalle_asientos d
      on d.tenant_id = a.tenant_id and d.fk_asientos = a.id
    join public.cuentas_contables c
      on c.tenant_id = d.tenant_id and c.id = d.fk_cuenta_contables
    where a.tenant_id = public.current_tenant_id()
      and public.current_es_admin_o_gerente()
      and a.estado = 'CONTABILIZADO'
      and extract(year from a.fecha at time zone 'America/Asuncion') = p_anio
      and c.clave in ('VENTAS_10', 'VENTAS_5', 'VENTAS_EXENTAS', 'IVA_DEBITO', 'IVA_CREDITO')
    group by 1
  ),
  compras as (
    select extract(month from g.fecha)::integer as m,
           sum(g.gravado_10 - g.iva_10) as c10,
           sum(g.gravado_5 - g.iva_5)   as c5,
           sum(g.exenta)                as cex
    from public.gastos g
    where g.tenant_id = public.current_tenant_id()
      and public.current_es_admin_o_gerente()
      and g.estado = 'REGISTRADO'
      and extract(year from g.fecha) = p_anio
    group by 1
  )
  select s.m,
         coalesce(l.v10, 0), coalesce(l.v5, 0), coalesce(l.vex, 0), coalesce(l.deb, 0),
         coalesce(k.c10, 0), coalesce(k.c5, 0), coalesce(k.cex, 0), coalesce(l.cred, 0),
         coalesce(l.deb, 0) - coalesce(l.cred, 0)
  from generate_series(1, 12) as s(m)
  left join ledger l on l.m = s.m
  left join compras k on k.m = s.m
  where public.current_es_admin_o_gerente()
  order by s.m
$$;

comment on function public.fn_rep_libro_iva(integer) is
  'Simple VAT book, 12 rows (months 1..12, zeros when idle). Columns: mes, base_ventas_10, base_ventas_5, base_ventas_exentas, iva_debito (ledger IVA_DEBITO), compras_gravadas_10, compras_gravadas_5 (net of VAT), compras_exentas (from REGISTRADO gastos), iva_credito (ledger IVA_CREDITO), iva_a_pagar = iva_debito - iva_credito. Admin/gerente only (no rows otherwise); invoker. Not the RG 90 export.';

-- ─── Grants ──────────────────────────────────────────────────────────────────
-- 0012 already revokes EXECUTE from what is created above; repeated so this
-- migration does not depend on that event trigger. Only the client role gets it.
revoke execute on function public.fn_rep_resultado(date, date)                from public, anon;
revoke execute on function public.fn_rep_cxc(date)                            from public, anon;
revoke execute on function public.fn_rep_cxp(date)                            from public, anon;
revoke execute on function public.fn_rep_flujo_fondos(date, date)             from public, anon;
revoke execute on function public.fn_rep_movimientos_fondo(bigint, date, date) from public, anon;
revoke execute on function public.fn_rep_libro_iva(integer)                   from public, anon;

grant execute on function public.fn_rep_resultado(date, date)                 to authenticated;
grant execute on function public.fn_rep_cxc(date)                             to authenticated;
grant execute on function public.fn_rep_cxp(date)                             to authenticated;
grant execute on function public.fn_rep_flujo_fondos(date, date)              to authenticated;
grant execute on function public.fn_rep_movimientos_fondo(bigint, date, date) to authenticated;
grant execute on function public.fn_rep_libro_iva(integer)                    to authenticated;
