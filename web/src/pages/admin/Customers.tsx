import { useState } from "react";
import { Modal, Spinner, Tag } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { useQuery } from "../../lib/data";
import { date, dateTime, licenseState, money, orderStatus, waLink } from "../../lib/format";
import { supabase, type EventRow, type Order, type Profile } from "../../lib/supabase";
import { chassisIcon, PageTitle, useAdminOp } from "./common";
import { LicenseModal, loadLicenses, NewLicenseModal, type LicenseRow } from "./Licenses";

interface CustomerRow extends Profile { licenses: { id: string; is_trial: boolean; status: string; expires_at: string | null; starts_at: string | null }[]; orders: { amount_pen: number; status: string }[] }

async function loadCustomers(): Promise<CustomerRow[]> {
  const { data, error } = await supabase.from("kz_profiles")
    .select("*, licenses:kz_licenses(id, is_trial, status, expires_at, starts_at), orders:kz_orders!kz_orders_user_id_fkey(amount_pen, status)")
    .order("created_at", { ascending: false }).limit(2000);
  if (error) throw new Error(error.message);
  return (data ?? []) as CustomerRow[];
}

function CustomerModal({ c, onClose, onChanged }: { c: CustomerRow; onClose: () => void; onChanged: () => void }) {
  const { profile: me } = useAuth();
  const { run, busy } = useAdminOp();
  const { data: lics, reload: reloadLics } = useQuery(() => loadLicenses(c.id), [c.id]);
  const { data: orders } = useQuery(async () => ((await supabase.from("kz_orders").select("*").eq("user_id", c.id).order("created_at", { ascending: false })).data ?? []) as Order[], [c.id]);
  const { data: events } = useQuery(async () => ((await supabase.from("kz_events").select("*").eq("user_id", c.id).order("created_at", { ascending: false }).limit(50)).data ?? []) as EventRow[], [c.id]);
  const [form, setForm] = useState({ full_name: c.full_name, phone: c.phone, company: c.company });
  const [selLic, setSelLic] = useState<LicenseRow | null>(null);
  const [creating, setCreating] = useState(false);
  const paid = (orders ?? []).filter((o) => o.status === "paid").reduce((s, o) => s + Number(o.amount_pen), 0);

  return (
    <Modal title={c.full_name || c.email} onClose={onClose} wide>
      <div className="grid grid-2">
        <div>
          <label className="field"><span>Nombre</span><input className="input" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></label>
          <div className="grid grid-2">
            <label className="field"><span>Celular</span><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
            <label className="field"><span>Empresa</span><input className="input" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></label>
          </div>
          <div className="row">
            <button className="btn btn-sm btn-primary" disabled={busy} onClick={async () => { if (await run("update_user", { user_id: c.id, ...form }, "Datos guardados")) onChanged(); }}>Guardar</button>
            {c.phone && <a className="btn btn-sm btn-wa" href={waLink(c.phone, `Hola ${c.full_name}, te escribimos de KAIZEN.`)} target="_blank" rel="noreferrer">WhatsApp</a>}
          </div>
          <dl className="kv" style={{ marginTop: 18 }}>
            <dt>Correo</dt><dd>{c.email}</dd>
            <dt>Registro</dt><dd>{dateTime(c.created_at)}</dd>
            <dt>Total pagado</dt><dd>{money(paid)}</dd>
            <dt>Rol</dt><dd>{c.role === "admin" ? <Tag tone="info">Administrador</Tag> : "Cliente"}</dd>
            <dt>Cuenta</dt><dd>{c.blocked ? <Tag tone="bad">Bloqueada</Tag> : <Tag tone="ok">Activa</Tag>}</dd>
          </dl>
          {c.id !== me?.id && (
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn btn-sm btn-ghost" disabled={busy} onClick={async () => { if (await run("set_user_blocked", { user_id: c.id, blocked: !c.blocked }, c.blocked ? "Cuenta desbloqueada" : "Cuenta bloqueada")) onChanged(); }}>{c.blocked ? "Desbloquear cuenta" : "Bloquear cuenta"}</button>
              <button className="btn btn-sm btn-ghost" disabled={busy} onClick={async () => { if (confirm(c.role === "admin" ? "¿Quitar rol de administrador?" : "¿Dar rol de ADMINISTRADOR? Tendrá acceso total al panel.")) { if (await run("set_user_role", { user_id: c.id, role: c.role === "admin" ? "customer" : "admin" }, "Rol actualizado")) onChanged(); } }}>{c.role === "admin" ? "Quitar admin" : "Hacer admin"}</button>
            </div>
          )}
          <h4 style={{ marginTop: 22 }}>Pedidos</h4>
          {(orders ?? []).length === 0 ? <div className="muted small">Sin pedidos.</div> : (orders ?? []).map((o) => (
            <div key={o.id} className="row between small" style={{ padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
              <span className="mono">{o.code}</span><span>{o.plan_name}</span><span>{money(o.amount_pen)}</span><Tag tone={orderStatus[o.status].tone}>{orderStatus[o.status].label}</Tag>
            </div>
          ))}
        </div>
        <div>
          <div className="row between"><h4 style={{ margin: 0 }}>Licencias</h4><button className="btn btn-sm btn-primary" onClick={() => setCreating(true)}>+ Licencia</button></div>
          {(lics ?? []).length === 0 && <div className="muted small" style={{ marginTop: 10 }}>Sin licencias.</div>}
          {(lics ?? []).map((l) => {
            const st = licenseState(l);
            return (
              <div key={l.id} className="card card-pad" style={{ marginTop: 10 }}>
                <div className="row between"><span className="mono small">{l.license_key}</span><Tag tone={st.tone}>{st.label}</Tag></div>
                <div className="small muted">{l.is_trial ? "Prueba" : l.plan?.name} · vence {l.starts_at ? date(l.expires_at) : "al activar"}</div>
                {l.devices.map((d) => <div key={d.id} className="small">{chassisIcon(d.chassis)} {d.computer_name} · {d.manufacturer} {d.model} · IP {d.last_ip}</div>)}
                <button className="btn btn-sm btn-ghost" style={{ marginTop: 8 }} onClick={() => setSelLic(l)}>Gestionar</button>
              </div>
            );
          })}
          <h4 style={{ marginTop: 22 }}>Actividad reciente</h4>
          <div style={{ maxHeight: 240, overflow: "auto" }}>
            {(events ?? []).map((e) => (
              <div key={e.id} className="small" style={{ padding: "4px 0", borderBottom: "1px solid var(--line)" }}>
                {e.ok ? "✅" : "⚠️"} <b>{e.action}</b> · {dateTime(e.created_at)} · <span className="mono">{e.ip}</span> <span className="muted">{e.detail}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      {selLic && <LicenseModal lic={(lics ?? []).find((x) => x.id === selLic.id) ?? selLic} onClose={() => setSelLic(null)} onChanged={() => { void reloadLics(); onChanged(); }} />}
      {creating && <NewLicenseModal email={c.email} onClose={() => setCreating(false)} onChanged={() => { void reloadLics(); onChanged(); }} />}
    </Modal>
  );
}

export default function Customers() {
  const { data, loading, reload } = useQuery(loadCustomers);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [sel, setSel] = useState<CustomerRow | null>(null);
  const now = Date.now();
  const isPaying = (c: CustomerRow) => c.licenses.some((l) => !l.is_trial && l.status === "active" && l.expires_at && new Date(l.expires_at).getTime() > now);
  const rows = (data ?? []).filter((c) => {
    if (filter === "paying" && !isPaying(c)) return false;
    if (filter === "trial" && !(c.licenses.some((l) => l.is_trial) && !isPaying(c))) return false;
    if (filter === "none" && c.licenses.length > 0) return false;
    return !q || `${c.full_name} ${c.email} ${c.phone} ${c.company}`.toLowerCase().includes(q.toLowerCase());
  });

  function exportCsv() {
    const lines = [["Nombre", "Correo", "Celular", "Empresa", "Registro", "Licencias", "Pagado S/"].join(",")];
    for (const c of rows) {
      const paid = c.orders.filter((o) => o.status === "paid").reduce((s, o) => s + Number(o.amount_pen), 0);
      lines.push([c.full_name, c.email, c.phone, c.company, c.created_at.slice(0, 10), c.licenses.length, paid].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","));
    }
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `kaizen-clientes-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  return (
    <>
      <PageTitle title="Clientes" sub={`${data?.length ?? 0} cuentas registradas`}>
        <button className="btn btn-sm btn-ghost" onClick={exportCsv}>Exportar CSV</button>
      </PageTitle>
      <div className="toolbar">
        {[["all", "Todos"], ["paying", "Con licencia pagada"], ["trial", "Solo prueba"], ["none", "Sin licencia"]].map(([k, l]) => (
          <button key={k} className={`btn btn-sm ${filter === k ? "btn-primary" : "btn-ghost"}`} onClick={() => setFilter(k)}>{l}</button>
        ))}
        <input className="input" placeholder="Nombre, correo, celular…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="card table-wrap">
        {loading ? <div className="empty"><Spinner /></div> : rows.length === 0 ? <div className="empty">Sin resultados.</div> : (
          <table className="table">
            <thead><tr><th>Cliente</th><th>Celular</th><th>Registro</th><th>Licencias</th><th className="num">Pagado</th><th /></tr></thead>
            <tbody>
              {rows.map((c) => {
                const paid = c.orders.filter((o) => o.status === "paid").reduce((s, o) => s + Number(o.amount_pen), 0);
                return (
                  <tr key={c.id}>
                    <td>{c.full_name || "—"} {c.role === "admin" && <Tag tone="info">admin</Tag>} {c.blocked && <Tag tone="bad">bloqueado</Tag>}<div className="tiny muted">{c.email}</div></td>
                    <td>{c.phone ? <a href={waLink(c.phone, `Hola ${c.full_name}, te escribimos de KAIZEN.`)} target="_blank" rel="noreferrer">{c.phone}</a> : "—"}</td>
                    <td className="small">{date(c.created_at)}</td>
                    <td>{isPaying(c) ? <Tag tone="ok">Pagada</Tag> : c.licenses.some((l) => l.is_trial) ? <Tag tone="info">Prueba</Tag> : c.licenses.length ? <Tag tone="muted">Vencida</Tag> : <Tag tone="muted">—</Tag>}</td>
                    <td className="num">{money(paid)}</td>
                    <td><button className="btn btn-sm btn-ghost" onClick={() => setSel(c)}>Ver</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {sel && <CustomerModal c={(data ?? []).find((x) => x.id === sel.id) ?? sel} onClose={() => setSel(null)} onChanged={reload} />}
    </>
  );
}
