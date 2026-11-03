import { Fragment, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CopyButton, LoadingPage, Spinner, Tag, useToast } from "../components/ui";
import { useAuth } from "../lib/auth";
import { fetchLatestRelease, useContact, useQuery } from "../lib/data";
import { bytes, date, dateTime, daysLeft, licenseState, money, orderStatus, waLink } from "../lib/format";
import { api, ApiError, supabase, type Device, type License, type Order } from "../lib/supabase";

interface AccountData {
  licenses: (License & { plan: { name: string } | null })[];
  devices: Device[];
  orders: Order[];
}

async function loadAccount(userId: string): Promise<AccountData> {
  const [l, o] = await Promise.all([
    supabase.from("kz_licenses").select("*, plan:kz_plans(name)").eq("user_id", userId).order("created_at", { ascending: false }),
    supabase.from("kz_orders").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
  ]);
  const licenses = (l.data ?? []) as AccountData["licenses"];
  const ids = licenses.map((x) => x.id);
  const d = ids.length ? await supabase.from("kz_devices").select("*").in("license_id", ids) : { data: [] };
  return { licenses, devices: (d.data ?? []) as Device[], orders: (o.data ?? []) as Order[] };
}

export function DownloadCard() {
  const { data: rel, loading } = useQuery(fetchLatestRelease);
  const contact = useContact();
  return (
    <div className="card card-pad">
      <h3>⬇️ Descargar KAIZEN</h3>
      {loading ? <Spinner /> : rel ? (
        <>
          <p className="muted small">Versión <b>{rel.version}</b> · {bytes(rel.size_bytes)} · Revit {rel.revit_versions.join(", ")} · {date(rel.published_at)}</p>
          <a className="btn btn-primary btn-block" href={rel.download_url}>Descargar instalador para Windows</a>
          <details style={{ marginTop: 12 }}><summary className="small" style={{ cursor: "pointer" }}>Novedades de esta versión</summary><p className="small muted" style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{rel.notes || "—"}</p></details>
        </>
      ) : (
        <>
          <p className="muted small">El instalador se está publicando. Escríbenos y te lo enviamos ahora mismo.</p>
          <a className="btn btn-wa btn-block" href={waLink(contact.whatsapp, "Hola, quiero el instalador de KAIZEN.")} target="_blank" rel="noreferrer">Pedir instalador por WhatsApp</a>
        </>
      )}
      <ol className="small muted" style={{ paddingLeft: 18, marginTop: 16, marginBottom: 0 }}>
        <li>Cierra Revit y ejecuta el instalador.</li>
        <li>Abre Revit → pestaña <b>KAIZEN</b> → <b>Área personal</b>.</li>
        <li>Pega tu clave y pulsa <b>Activar</b>.</li>
      </ol>
    </div>
  );
}

function LicenseCard({ lic, devices, onRenew }: { lic: AccountData["licenses"][number]; devices: Device[]; onRenew: () => void }) {
  const st = licenseState(lic);
  const left = daysLeft(lic.expires_at);
  const off = st.tone === "bad";
  return (
    <div className={`license-card ${lic.is_trial ? "trial" : ""} ${off ? "off" : ""}`}>
      <div className="row between">
        <div>
          <div className="muted small">{lic.is_trial ? "Prueba gratuita" : `Plan ${lic.plan?.name ?? ""}`}</div>
          <h3 style={{ margin: 0 }}>Licencia KAIZEN</h3>
        </div>
        <Tag tone={st.tone}>{st.label}</Tag>
      </div>
      <div className="license-key"><span>{lic.license_key}</span><CopyButton text={lic.license_key} /></div>
      <dl className="kv">
        <dt>Vence</dt><dd>{lic.starts_at ? `${date(lic.expires_at)}${left !== null && left > 0 ? ` (${left} días)` : ""}` : `${lic.duration_days} días desde que la actives`}</dd>
        <dt>Equipos</dt><dd>{devices.filter((d) => d.active).length} de {lic.max_devices}</dd>
        {devices.map((d) => (
          <Fragment key={d.id}><dt>PC</dt><dd>{d.computer_name || d.machine_id} {d.model ? `· ${d.manufacturer} ${d.model}` : ""} · visto {dateTime(d.last_seen)}</dd></Fragment>
        ))}
      </dl>
      <div className="row" style={{ marginTop: 16 }}>
        {lic.is_trial ? (
          <Link className="btn btn-accent btn-sm" to="/#precios">Comprar licencia</Link>
        ) : (
          <button className="btn btn-accent btn-sm" onClick={onRenew}>Renovar / ampliar</button>
        )}
      </div>
    </div>
  );
}

function ProfileForm() {
  const { profile, refreshProfile } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ full_name: profile?.full_name ?? "", phone: profile?.phone ?? "", company: profile?.company ?? "" });
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setBusy(true);
    const { error } = await supabase.from("kz_profiles").update(form).eq("id", profile.id);
    setBusy(false);
    if (error) toast(error.message, "bad");
    else {
      toast("Datos guardados", "ok");
      void refreshProfile();
    }
  }
  return (
    <form className="card card-pad" onSubmit={submit}>
      <h3>👤 Mis datos</h3>
      <label className="field"><span>Nombre</span><input className="input" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></label>
      <label className="field"><span>Celular</span><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
      <label className="field"><span>Empresa (opcional)</span><input className="input" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></label>
      <p className="small muted">Correo: {profile?.email}</p>
      <button className="btn btn-ghost btn-sm" disabled={busy}>Guardar</button>
    </form>
  );
}

export default function Account() {
  const { session, profile } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const userId = session!.user.id;
  const { data, loading, reload } = useQuery(() => loadAccount(userId), [userId]);
  const [trialBusy, setTrialBusy] = useState(false);

  if (loading && !data) return <LoadingPage />;
  const licenses = data?.licenses ?? [];
  const openOrders = (data?.orders ?? []).filter((o) => o.status === "pending" || o.status === "review");

  async function startTrial() {
    setTrialBusy(true);
    try {
      await api("/trial");
      toast("¡Listo! Tu clave de prueba está abajo.", "ok");
      await reload();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "No se pudo crear la prueba", "bad");
    } finally {
      setTrialBusy(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div className="container">
          <h1>Hola{profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""} 👋</h1>
          <p>Aquí están tus licencias, la descarga y tus pagos.</p>
        </div>
      </div>
      <div className="container page-body">
        <div className="grid" style={{ gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)", alignItems: "start" }}>
          <div className="stack">
            {openOrders.map((o) => (
              <div key={o.id} className="alert alert-warn row between">
                <span>Pedido <b>{o.code}</b> · {o.plan_name} · {money(o.amount_pen)} — {orderStatus[o.status].label}</span>
                <Link className="btn btn-sm btn-ghost" to={`/cuenta/pedido/${o.id}`}>Ver pedido</Link>
              </div>
            ))}

            {licenses.length === 0 && (
              <div className="card card-pad center">
                <h2>Empieza tu prueba gratis de 3 días</h2>
                <p className="muted">Genera tu clave, instala KAIZEN y pégala en Revit. Los 3 días empiezan a contar cuando la actives.</p>
                <div className="row" style={{ justifyContent: "center" }}>
                  <button className="btn btn-accent btn-lg" onClick={startTrial} disabled={trialBusy}>{trialBusy ? <Spinner /> : "Generar mi clave de prueba"}</button>
                  <Link className="btn btn-ghost btn-lg" to="/#precios">Ver planes</Link>
                </div>
              </div>
            )}

            {licenses.map((l) => (
              <LicenseCard key={l.id} lic={l} devices={(data?.devices ?? []).filter((d) => d.license_id === l.id)}
                onRenew={() => navigate(`/comprar/${l.plan_id ?? "anual"}?renovar=${l.id}`)} />
            ))}

            {licenses.length > 0 && (
              <div className="card card-pad row between">
                <div>
                  <b>¿Necesitas otra licencia o un plan más largo?</b>
                  <div className="muted small">Los planes largos salen mucho más baratos por mes.</div>
                </div>
                <Link className="btn btn-primary btn-sm" to="/#precios">Ver planes</Link>
              </div>
            )}

            <div className="card">
              <div className="card-pad" style={{ paddingBottom: 0 }}><h3>🧾 Mis pedidos</h3></div>
              {(data?.orders ?? []).length === 0 ? <div className="empty">Aún no tienes pedidos.</div> : (
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>Código</th><th>Plan</th><th>Monto</th><th>Método</th><th>Estado</th><th>Fecha</th><th /></tr></thead>
                    <tbody>
                      {data!.orders.map((o) => (
                        <tr key={o.id}>
                          <td className="mono">{o.code}</td><td>{o.plan_name}</td><td>{money(o.amount_pen)}</td><td>{o.method_name}</td>
                          <td><Tag tone={orderStatus[o.status].tone}>{orderStatus[o.status].label}</Tag></td>
                          <td>{date(o.created_at)}</td>
                          <td><Link to={`/cuenta/pedido/${o.id}`}>Ver</Link></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
          <div className="stack">
            <DownloadCard />
            <ProfileForm />
          </div>
        </div>
      </div>
      <style>{`@media (max-width: 900px) { .page-body > .grid { grid-template-columns: 1fr !important; } }`}</style>
    </>
  );
}
