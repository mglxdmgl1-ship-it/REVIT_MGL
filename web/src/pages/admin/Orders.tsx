import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Modal, Spinner, Tag } from "../../components/ui";
import { useQuery } from "../../lib/data";
import { dateTime, money, orderStatus, waLink } from "../../lib/format";
import { supabase, type Order, type Profile } from "../../lib/supabase";
import { PageTitle, useAdminOp } from "./common";

type OrderRow = Order & { profile: Pick<Profile, "email" | "full_name" | "phone"> | null };

export async function loadOrders(status: string, limit = 300): Promise<OrderRow[]> {
  let q = supabase.from("kz_orders").select("*, profile:kz_profiles!kz_orders_user_id_fkey(email, full_name, phone)").order("created_at", { ascending: false }).limit(limit);
  if (status === "open") q = q.in("status", ["pending", "review"]);
  else if (status !== "all") q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as OrderRow[];
}

export function OrderModal({ order, onClose, onChanged }: { order: OrderRow; onClose: () => void; onChanged: () => void }) {
  const { run, busy } = useAdminOp();
  const [note, setNote] = useState("");
  const [voucherUrl, setVoucherUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!order.voucher_path) return;
    supabase.storage.from("kz-vouchers").createSignedUrl(order.voucher_path, 600).then(({ data }) => setVoucherUrl(data?.signedUrl ?? null));
  }, [order.voucher_path]);

  const st = orderStatus[order.status];
  const open = order.status === "pending" || order.status === "review" || order.status === "rejected";

  return (
    <Modal title={`Pedido ${order.code}`} onClose={onClose} wide>
      <div className="grid grid-2">
        <div>
          <dl className="kv">
            <dt>Estado</dt><dd><Tag tone={st.tone}>{st.label}</Tag></dd>
            <dt>Cliente</dt><dd>{order.profile?.full_name || "—"}<br /><span className="muted small">{order.profile?.email}</span></dd>
            <dt>Celular</dt><dd>{order.profile?.phone ? <a href={waLink(order.profile.phone, `Hola ${order.profile.full_name}, te escribimos de KAIZEN por tu pedido ${order.code}.`)} target="_blank" rel="noreferrer">{order.profile.phone}</a> : "—"}</dd>
            <dt>Plan</dt><dd>{order.plan_name}{order.renew_license_id ? " (renovación)" : ""}</dd>
            <dt>Monto</dt><dd>{money(order.amount_pen)}</dd>
            <dt>Método</dt><dd>{order.method_name}</dd>
            <dt>N.º operación</dt><dd className="mono">{order.operation_code || "—"}</dd>
            <dt>Creado</dt><dd>{dateTime(order.created_at)}</dd>
            <dt>Pagado</dt><dd>{dateTime(order.paid_at)}</dd>
            {order.customer_note && <><dt>Nota cliente</dt><dd>{order.customer_note}</dd></>}
            {order.admin_note && <><dt>Nota admin</dt><dd>{order.admin_note}</dd></>}
          </dl>
          {open && (
            <div style={{ marginTop: 20 }}>
              <label className="field"><span>Nota (opcional; si rechazas, el cliente la verá)</span><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></label>
              <div className="row">
                <button className="btn btn-ok" disabled={busy} onClick={async () => { if (await run("approve_order", { order_id: order.id, note }, "Pago aprobado · licencia entregada")) { onChanged(); onClose(); } }}>
                  {busy ? <Spinner /> : `✔ Aprobar y entregar licencia`}
                </button>
                {order.status !== "rejected" && (
                  <button className="btn btn-danger" disabled={busy} onClick={async () => { if (await run("reject_order", { order_id: order.id, note }, "Pedido rechazado")) { onChanged(); onClose(); } }}>✖ Rechazar</button>
                )}
              </div>
            </div>
          )}
        </div>
        <div>
          <h4>Comprobante</h4>
          {order.voucher_path ? (voucherUrl ? (
            /\.pdf$/i.test(order.voucher_path)
              ? <a className="btn btn-ghost" href={voucherUrl} target="_blank" rel="noreferrer">Abrir PDF</a>
              : <a href={voucherUrl} target="_blank" rel="noreferrer"><img src={voucherUrl} alt="Comprobante" style={{ borderRadius: 12, border: "1px solid var(--line)", maxHeight: 460 }} /></a>
          ) : <Spinner />) : <div className="empty">Sin captura adjunta.</div>}
        </div>
      </div>
    </Modal>
  );
}

export default function Orders() {
  const [status, setStatus] = useState("open");
  const [q, setQ] = useState("");
  const { data, loading, reload } = useQuery(() => loadOrders(status), [status]);
  const [sel, setSel] = useState<OrderRow | null>(null);
  const rows = (data ?? []).filter((o) => !q || `${o.code} ${o.profile?.email} ${o.profile?.full_name} ${o.operation_code}`.toLowerCase().includes(q.toLowerCase()));
  const total = rows.filter((o) => o.status === "paid").reduce((s, o) => s + Number(o.amount_pen), 0);

  return (
    <>
      <PageTitle title="Pedidos y pagos" sub="Aprueba los pagos con Yape u otros métodos manuales; la licencia se crea sola." />
      <div className="toolbar">
        {[["open", "Por revisar"], ["paid", "Pagados"], ["rejected", "Rechazados"], ["cancelled", "Cancelados"], ["all", "Todos"]].map(([k, l]) => (
          <button key={k} className={`btn btn-sm ${status === k ? "btn-primary" : "btn-ghost"}`} onClick={() => setStatus(k)}>{l}</button>
        ))}
        <input className="input" placeholder="Buscar código, correo, operación…" value={q} onChange={(e) => setQ(e.target.value)} />
        {status === "paid" && <span className="muted small">Total listado: <b>{money(total)}</b></span>}
      </div>
      <div className="card table-wrap">
        {loading ? <div className="empty"><Spinner /></div> : rows.length === 0 ? <div className="empty">No hay pedidos.</div> : (
          <table className="table">
            <thead><tr><th>Código</th><th>Cliente</th><th>Plan</th><th className="num">Monto</th><th>Método</th><th>Operación</th><th>Estado</th><th>Fecha</th><th /></tr></thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id}>
                  <td className="mono">{o.code}</td>
                  <td>{o.profile?.full_name || "—"}<div className="tiny muted">{o.profile?.email}</div></td>
                  <td>{o.plan_name}</td>
                  <td className="num">{money(o.amount_pen)}</td>
                  <td>{o.method_name}</td>
                  <td className="mono small">{o.operation_code || (o.voucher_path ? "📎 captura" : "—")}</td>
                  <td><Tag tone={orderStatus[o.status].tone}>{orderStatus[o.status].label}</Tag></td>
                  <td className="small">{dateTime(o.created_at)}</td>
                  <td><button className="btn btn-sm btn-ghost" onClick={() => setSel(o)}>Abrir</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {sel && <OrderModal order={sel} onClose={() => setSel(null)} onChanged={reload} />}
      <p className="small muted" style={{ marginTop: 12 }}>¿Venta en efectivo o por otro medio? Créala desde <Link to="/admin/licencias">Licencias → Nueva licencia</Link>.</p>
    </>
  );
}
