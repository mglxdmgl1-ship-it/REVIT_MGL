import { useState } from "react";
import { Modal, Spinner, Tag } from "../../components/ui";
import { useQuery } from "../../lib/data";
import { dateTime } from "../../lib/format";
import { supabase, type Device, type EventRow } from "../../lib/supabase";
import { chassisIcon, PageTitle, useAdminOp } from "./common";
import { DeviceDetails } from "./Licenses";

type DeviceRow = Device & { license: { license_key: string; is_trial: boolean; profile: { email: string; full_name: string } | null } | null };

async function loadDevices(): Promise<DeviceRow[]> {
  const { data, error } = await supabase.from("kz_devices")
    .select("*, license:kz_licenses(license_key, is_trial, profile:kz_profiles(email, full_name))")
    .order("last_seen", { ascending: false }).limit(2000);
  if (error) throw new Error(error.message);
  return (data ?? []) as DeviceRow[];
}

export default function Devices() {
  const { data, loading, reload } = useQuery(loadDevices);
  const { run, busy } = useAdminOp();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<DeviceRow | null>(null);
  const rows = (data ?? []).filter((d) => !q || [d.computer_name, d.windows_user, d.manufacturer, d.model, d.cpu, d.last_ip, d.first_ip, d.machine_id, d.license?.license_key, d.license?.profile?.email].join(" ").toLowerCase().includes(q.toLowerCase()));

  // Una misma placa en varias licencias suele indicar reventa o pruebas repetidas.
  const byHash = new Map<string, number>();
  for (const d of data ?? []) byHash.set(d.machine_hash, (byHash.get(d.machine_hash) ?? 0) + 1);

  return (
    <>
      <PageTitle title="Equipos" sub="Inventario de cada PC donde se activó KAIZEN: usuario, modelo, tipo, CPU, RAM e IP." />
      <div className="toolbar"><input className="input" placeholder="PC, usuario, modelo, IP, correo…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="card table-wrap">
        {loading ? <div className="empty"><Spinner /></div> : rows.length === 0 ? <div className="empty">Aún no hay equipos activados.</div> : (
          <table className="table">
            <thead><tr><th>PC</th><th>Usuario Windows</th><th>Marca / modelo</th><th>CPU · RAM</th><th>Sistema</th><th>Revit · KAIZEN</th><th>IP</th><th>Cliente</th><th>Último uso</th><th /></tr></thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id}>
                  <td>{chassisIcon(d.chassis)} <b>{d.computer_name || "—"}</b> {!d.active && <Tag tone="bad">bloq.</Tag>} {(byHash.get(d.machine_hash) ?? 0) > 1 && <Tag tone="warn">{byHash.get(d.machine_hash)} licencias</Tag>}<div className="tiny muted mono">{d.machine_id}</div></td>
                  <td>{d.windows_user || "—"}</td>
                  <td className="small">{[d.manufacturer, d.model].filter(Boolean).join(" ") || "—"}<div className="tiny muted">{d.chassis}</div></td>
                  <td className="small">{d.cpu || "—"}<div className="tiny muted">{d.ram_gb ? `${d.ram_gb} GB` : ""}</div></td>
                  <td className="small">{d.os || "—"}</td>
                  <td className="small">{d.revit_version || "—"} · v{d.addin_version || "—"}</td>
                  <td className="mono small">{d.last_ip || "—"}</td>
                  <td className="small">{d.license?.profile?.full_name || d.license?.profile?.email || "—"}<div className="tiny muted mono">{d.license?.license_key}</div></td>
                  <td className="small">{dateTime(d.last_seen)}</td>
                  <td><button className="btn btn-sm btn-ghost" onClick={() => setSel(d)}>Ver</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {sel && (
        <Modal title={`${chassisIcon(sel.chassis)} ${sel.computer_name || sel.machine_id}`} onClose={() => setSel(null)}>
          <DeviceDetails d={sel} />
          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn btn-sm btn-ghost" disabled={busy} onClick={async () => { if (await run("set_device_active", { device_id: sel.id, active: !sel.active }, "Actualizado")) { await reload(); setSel(null); } }}>{sel.active ? "Bloquear esta PC" : "Desbloquear"}</button>
            <button className="btn btn-sm btn-ghost" disabled={busy} onClick={async () => { if (confirm("¿Desvincular? La licencia quedará libre para otra PC.") && await run("delete_device", { device_id: sel.id }, "Desvinculada")) { await reload(); setSel(null); } }}>Desvincular</button>
            <button className="btn btn-sm btn-ghost" disabled={busy} onClick={async () => { if (confirm("¿Permitir que esta PC vuelva a usar la prueba gratuita?")) await run("reset_trial", { machine_hash: sel.machine_hash }, "Prueba reiniciada para esta PC"); }}>Reiniciar prueba de esta PC</button>
          </div>
        </Modal>
      )}
    </>
  );
}

export function Activity() {
  const [only, setOnly] = useState("all");
  const { data, loading } = useQuery(async () => {
    let q = supabase.from("kz_events").select("*").order("created_at", { ascending: false }).limit(500);
    if (only === "fail") q = q.eq("ok", false);
    if (only === "admin") q = q.like("action", "admin.%");
    return ((await q).data ?? []) as EventRow[];
  }, [only]);
  return (
    <>
      <PageTitle title="Actividad" sub="Activaciones, verificaciones cada 5 días y acciones del administrador." />
      <div className="toolbar">
        {[["all", "Todo"], ["fail", "Rechazos"], ["admin", "Acciones admin"]].map(([k, l]) => (
          <button key={k} className={`btn btn-sm ${only === k ? "btn-primary" : "btn-ghost"}`} onClick={() => setOnly(k)}>{l}</button>
        ))}
      </div>
      <div className="card table-wrap">
        {loading ? <div className="empty"><Spinner /></div> : (
          <table className="table">
            <thead><tr><th>Fecha</th><th>Acción</th><th>Resultado</th><th>Detalle</th><th>IP</th></tr></thead>
            <tbody>
              {(data ?? []).map((e) => (
                <tr key={e.id}>
                  <td className="small">{dateTime(e.created_at)}</td>
                  <td><b>{e.action}</b></td>
                  <td>{e.ok ? <Tag tone="ok">OK</Tag> : <Tag tone="bad">Rechazado</Tag>}</td>
                  <td className="small">{e.detail}</td>
                  <td className="mono small">{e.ip}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
