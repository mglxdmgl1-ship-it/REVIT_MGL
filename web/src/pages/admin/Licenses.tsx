import { Fragment, useState } from "react";
import { Modal, Spinner, Tag } from "../../components/ui";
import { fetchPlans, useQuery } from "../../lib/data";
import { date, dateTime, daysLeft, licenseState } from "../../lib/format";
import { supabase, type Device, type License, type Profile } from "../../lib/supabase";
import { chassisIcon, PageTitle, useAdminOp } from "./common";

export type LicenseRow = License & { profile: Pick<Profile, "email" | "full_name" | "phone"> | null; plan: { name: string } | null; devices: Device[] };

export async function loadLicenses(userId?: string): Promise<LicenseRow[]> {
  let q = supabase.from("kz_licenses").select("*, profile:kz_profiles(email, full_name, phone), plan:kz_plans(name), devices:kz_devices(*)").order("created_at", { ascending: false }).limit(1000);
  if (userId) q = q.eq("user_id", userId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as LicenseRow[];
}

export function DeviceDetails({ d }: { d: Device }) {
  return (
    <dl className="kv small">
      <dt>Equipo</dt><dd>{chassisIcon(d.chassis)} {d.computer_name || "—"} · usuario <b>{d.windows_user || "—"}</b></dd>
      <dt>Marca / modelo</dt><dd>{[d.manufacturer, d.model].filter(Boolean).join(" ") || "—"} {d.chassis && `(${d.chassis})`}</dd>
      <dt>CPU / RAM</dt><dd>{d.cpu || "—"} · {d.ram_gb ? `${d.ram_gb} GB` : "—"}</dd>
      <dt>Placa</dt><dd>{d.board || "—"}</dd>
      <dt>Sistema</dt><dd>{d.os || "—"}</dd>
      <dt>Revit / KAIZEN</dt><dd>{d.revit_version || "—"} · v{d.addin_version || "—"}</dd>
      <dt>IP</dt><dd className="mono">{d.last_ip || "—"}{d.first_ip && d.first_ip !== d.last_ip ? ` (primera: ${d.first_ip})` : ""}</dd>
      <dt>Visto</dt><dd>{dateTime(d.first_seen)} → {dateTime(d.last_seen)}</dd>
      <dt>Huella</dt><dd className="mono tiny" style={{ wordBreak: "break-all" }}>{d.machine_id} · {d.machine_hash.slice(0, 16)}…</dd>
      {d.hardware && Object.keys(d.hardware).length > 0 && (
        <>{Object.entries(d.hardware).map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{String(v)}</dd></Fragment>)}</>
      )}
    </dl>
  );
}

export function LicenseModal({ lic, onClose, onChanged }: { lic: LicenseRow; onClose: () => void; onChanged: () => void }) {
  const { run, busy } = useAdminOp();
  const [days, setDays] = useState("30");
  const [expiry, setExpiry] = useState(lic.expires_at ? lic.expires_at.slice(0, 10) : "");
  const [maxDev, setMaxDev] = useState(String(lic.max_devices));
  const st = licenseState(lic);
  const done = async (r: unknown) => { if (r) onChanged(); };

  return (
    <Modal title={<span className="mono">{lic.license_key}</span>} onClose={onClose} wide>
      <div className="grid grid-2">
        <div>
          <dl className="kv">
            <dt>Estado</dt><dd><Tag tone={st.tone}>{st.label}</Tag> <span className="small muted">({lic.status})</span></dd>
            <dt>Cliente</dt><dd>{lic.profile?.full_name || "—"} · <span className="small">{lic.profile?.email}</span></dd>
            <dt>Plan</dt><dd>{lic.is_trial ? "Prueba gratuita" : lic.plan?.name ?? "Manual"}</dd>
            <dt>Inicio</dt><dd>{dateTime(lic.starts_at)}</dd>
            <dt>Vence</dt><dd>{dateTime(lic.expires_at)} {daysLeft(lic.expires_at) !== null && <span className="muted">({daysLeft(lic.expires_at)} d)</span>}</dd>
            <dt>Equipos</dt><dd>{lic.devices.length} / {lic.max_devices}</dd>
            {lic.notes && <><dt>Notas</dt><dd>{lic.notes}</dd></>}
          </dl>
          <h4 style={{ marginTop: 22 }}>Acciones</h4>
          <div className="stack">
            <div className="row">
              <input className="input" style={{ width: 100 }} type="number" value={days} onChange={(e) => setDays(e.target.value)} />
              <button className="btn btn-sm btn-primary" disabled={busy} onClick={async () => done(await run("extend_license", { license_id: lic.id, days: Number(days) }, "Vigencia actualizada"))}>Sumar días</button>
              <span className="tiny muted">(negativo para restar)</span>
            </div>
            <div className="row">
              <input className="input" style={{ width: 170 }} type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
              <button className="btn btn-sm btn-ghost" disabled={busy || !expiry} onClick={async () => done(await run("set_license_expiry", { license_id: lic.id, expires_at: `${expiry}T23:59:59-05:00` }, "Fecha fijada"))}>Fijar vencimiento</button>
            </div>
            <div className="row">
              <input className="input" style={{ width: 100 }} type="number" min={1} value={maxDev} onChange={(e) => setMaxDev(e.target.value)} />
              <button className="btn btn-sm btn-ghost" disabled={busy} onClick={async () => done(await run("set_max_devices", { license_id: lic.id, max_devices: Number(maxDev) }, "Límite de equipos actualizado"))}>Máx. equipos</button>
            </div>
            <div className="row">
              <button className="btn btn-sm btn-ghost" disabled={busy} onClick={async () => { if (confirm("¿Liberar todos los equipos? El cliente podrá activar la licencia en otra PC.")) await done(await run("reset_devices", { license_id: lic.id }, "Equipos liberados")); }}>🔄 Liberar equipos (cambio de PC)</button>
            </div>
            <div className="row">
              {lic.status !== "active" && <button className="btn btn-sm btn-ok" disabled={busy} onClick={async () => done(await run("set_license_status", { license_id: lic.id, status: "active" }, "Reactivada"))}>Reactivar</button>}
              {lic.status === "active" && <button className="btn btn-sm btn-ghost" disabled={busy} onClick={async () => done(await run("set_license_status", { license_id: lic.id, status: "suspended" }, "Suspendida"))}>Suspender</button>}
              {lic.status !== "revoked" && <button className="btn btn-sm btn-danger" disabled={busy} onClick={async () => { if (confirm("¿Anular la licencia definitivamente?")) await done(await run("set_license_status", { license_id: lic.id, status: "revoked" }, "Anulada")); }}>Anular</button>}
            </div>
            <p className="tiny muted">Los cambios llegan al add-in en su próxima verificación (como máximo cada 5 días o al reiniciar Revit con internet).</p>
          </div>
        </div>
        <div>
          <h4>Equipos vinculados</h4>
          {lic.devices.length === 0 ? <div className="empty">Aún no se activó en ninguna PC.</div> : lic.devices.map((d) => (
            <div key={d.id} className="card card-pad" style={{ marginBottom: 12 }}>
              <div className="row between"><b>{d.computer_name || d.machine_id}</b>{d.active ? <Tag tone="ok">Activo</Tag> : <Tag tone="bad">Bloqueado</Tag>}</div>
              <DeviceDetails d={d} />
              <div className="row" style={{ marginTop: 10 }}>
                <button className="btn btn-sm btn-ghost" disabled={busy} onClick={async () => done(await run("set_device_active", { device_id: d.id, active: !d.active }, d.active ? "Equipo bloqueado" : "Equipo desbloqueado"))}>{d.active ? "Bloquear PC" : "Desbloquear PC"}</button>
                <button className="btn btn-sm btn-ghost" disabled={busy} onClick={async () => { if (confirm("¿Desvincular esta PC?")) await done(await run("delete_device", { device_id: d.id }, "PC desvinculada")); }}>Desvincular</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

export function NewLicenseModal({ onClose, onChanged, email: initialEmail = "" }: { onClose: () => void; onChanged: () => void; email?: string }) {
  const { data: plans } = useQuery(fetchPlans);
  const { run, busy } = useAdminOp();
  const [f, setF] = useState({ email: initialEmail, plan_id: "anual", days: "", max_devices: "", amount_pen: "", method_name: "Efectivo", note: "", is_trial: false });
  return (
    <Modal title="Nueva licencia (venta directa o cortesía)" onClose={onClose}>
      <label className="field"><span>Correo del cliente (debe tener cuenta)</span><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
      <div className="grid grid-2">
        <label className="field"><span>Plan</span>
          <select className="input" value={f.plan_id} onChange={(e) => setF({ ...f, plan_id: e.target.value })}>
            <option value="">— Solo días —</option>
            {(plans ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="field"><span>Días (sustituye al plan)</span><input className="input" type="number" value={f.days} onChange={(e) => setF({ ...f, days: e.target.value })} /></label>
        <label className="field"><span>Máx. equipos</span><input className="input" type="number" value={f.max_devices} onChange={(e) => setF({ ...f, max_devices: e.target.value })} placeholder="según plan" /></label>
        <label className="field"><span>Monto cobrado S/ (0 = cortesía)</span><input className="input" type="number" value={f.amount_pen} onChange={(e) => setF({ ...f, amount_pen: e.target.value })} /></label>
        <label className="field"><span>Medio de pago</span><input className="input" value={f.method_name} onChange={(e) => setF({ ...f, method_name: e.target.value })} /></label>
        <label className="field"><span>Nota</span><input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
      </div>
      <label className="check"><input type="checkbox" checked={f.is_trial} onChange={(e) => setF({ ...f, is_trial: e.target.checked })} /> Marcar como prueba</label>
      <button className="btn btn-primary" disabled={busy || !f.email} onClick={async () => {
        const r = await run("create_license", {
          email: f.email, plan_id: f.plan_id || undefined, days: f.days ? Number(f.days) : undefined,
          max_devices: f.max_devices ? Number(f.max_devices) : undefined, amount_pen: f.amount_pen ? Number(f.amount_pen) : 0,
          method_name: f.method_name, note: f.note, is_trial: f.is_trial,
        }, "Licencia creada");
        if (r) { onChanged(); onClose(); }
      }}>{busy ? <Spinner /> : "Crear licencia"}</button>
    </Modal>
  );
}

export default function Licenses() {
  const { data, loading, reload } = useQuery(() => loadLicenses());
  const [filter, setFilter] = useState("active");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<LicenseRow | null>(null);
  const [creating, setCreating] = useState(false);

  const rows = (data ?? []).filter((l) => {
    const d = daysLeft(l.expires_at);
    const expired = l.starts_at && d !== null && d <= 0;
    if (filter === "active" && (l.status !== "active" || expired || l.is_trial)) return false;
    if (filter === "trial" && !l.is_trial) return false;
    if (filter === "expiring" && !(l.status === "active" && d !== null && d > 0 && d <= 7)) return false;
    if (filter === "expired" && !expired) return false;
    if (filter === "off" && l.status === "active") return false;
    return !q || `${l.license_key} ${l.profile?.email} ${l.profile?.full_name} ${l.devices.map((x) => x.computer_name).join(" ")}`.toLowerCase().includes(q.toLowerCase());
  });
  const current = sel ? (data ?? []).find((l) => l.id === sel.id) ?? sel : null;

  return (
    <>
      <PageTitle title="Licencias" sub="Extiende, suspende, cambia de PC o crea licencias manuales.">
        <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>+ Nueva licencia</button>
      </PageTitle>
      <div className="toolbar">
        {[["active", "Pagadas activas"], ["expiring", "Vencen en 7 días"], ["trial", "Pruebas"], ["expired", "Vencidas"], ["off", "Suspendidas/anuladas"], ["all", "Todas"]].map(([k, l]) => (
          <button key={k} className={`btn btn-sm ${filter === k ? "btn-primary" : "btn-ghost"}`} onClick={() => setFilter(k)}>{l}</button>
        ))}
        <input className="input" placeholder="Clave, correo, PC…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="card table-wrap">
        {loading ? <div className="empty"><Spinner /></div> : rows.length === 0 ? <div className="empty">Sin resultados.</div> : (
          <table className="table">
            <thead><tr><th>Clave</th><th>Cliente</th><th>Plan</th><th>Estado</th><th>Vence</th><th>Equipos</th><th /></tr></thead>
            <tbody>
              {rows.map((l) => {
                const st = licenseState(l);
                return (
                  <tr key={l.id}>
                    <td className="mono small">{l.license_key}</td>
                    <td>{l.profile?.full_name || "—"}<div className="tiny muted">{l.profile?.email}</div></td>
                    <td>{l.is_trial ? "Prueba" : l.plan?.name ?? "Manual"}</td>
                    <td><Tag tone={st.tone}>{st.label}</Tag></td>
                    <td className="small">{l.starts_at ? date(l.expires_at) : "Al activar"}</td>
                    <td className="small">{l.devices.map((d) => <div key={d.id}>{chassisIcon(d.chassis)} {d.computer_name || d.machine_id}</div>)}{l.devices.length === 0 && "—"}</td>
                    <td><button className="btn btn-sm btn-ghost" onClick={() => setSel(l)}>Gestionar</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {current && <LicenseModal lic={current} onClose={() => setSel(null)} onChanged={reload} />}
      {creating && <NewLicenseModal onClose={() => setCreating(false)} onChanged={reload} />}
    </>
  );
}
