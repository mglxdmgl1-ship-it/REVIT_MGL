import { useEffect, useState } from "react";
import { Modal, Spinner, Tag, useToast } from "../../components/ui";
import { fetchSetting, invalidateContact, useQuery } from "../../lib/data";
import { bytes, dateTime, durationLabel, money } from "../../lib/format";
import { supabase, type ContactSettings, type PaymentMethod, type Plan, type Release } from "../../lib/supabase";
import { PageTitle, sha256Hex, useAdminOp } from "./common";

// ============================================================================== Planes
const emptyPlan: Plan = { id: "", name: "", tagline: "", months: 1, days: 0, price_pen: 0, list_price_pen: null, devices: 1, badge: "", highlight: false, features: [], sort: 100, active: true };

export function Plans() {
  const toast = useToast();
  const { data, loading, reload } = useQuery(async () => ((await supabase.from("kz_plans").select("*").order("sort")).data ?? []) as Plan[]);
  const [edit, setEdit] = useState<Plan | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [features, setFeatures] = useState("");

  function open(p: Plan, fresh: boolean) {
    setEdit({ ...p });
    setFeatures((p.features ?? []).join("\n"));
    setIsNew(fresh);
  }

  async function save() {
    if (!edit) return;
    const row = { ...edit, badge: edit.badge || null, list_price_pen: edit.list_price_pen || null, features: features.split("\n").map((s) => s.trim()).filter(Boolean) };
    if (!/^[a-z0-9-]+$/.test(row.id)) return toast("El identificador solo admite minúsculas, números y guiones", "bad");
    if (row.months <= 0 && row.days <= 0) return toast("Indica meses o días", "bad");
    const { error } = isNew ? await supabase.from("kz_plans").insert(row) : await supabase.from("kz_plans").update(row).eq("id", row.id);
    if (error) return toast(error.message, "bad");
    toast("Plan guardado", "ok");
    setEdit(null);
    void reload();
  }

  return (
    <>
      <PageTitle title="Planes y precios" sub="Lo que guardes aquí se ve al instante en la web.">
        <button className="btn btn-sm btn-primary" onClick={() => open(emptyPlan, true)}>+ Nuevo plan / combo</button>
      </PageTitle>
      <div className="card table-wrap">
        {loading ? <div className="empty"><Spinner /></div> : (
          <table className="table">
            <thead><tr><th>Orden</th><th>Plan</th><th>Duración</th><th className="num">Precio</th><th className="num">Precio regular</th><th>Equipos</th><th>Etiqueta</th><th>Estado</th><th /></tr></thead>
            <tbody>
              {(data ?? []).map((p) => (
                <tr key={p.id}>
                  <td>{p.sort}</td>
                  <td><b>{p.name}</b> {p.highlight && <Tag tone="warn">destacado</Tag>}<div className="tiny muted mono">{p.id}</div></td>
                  <td>{durationLabel(p.months, p.days)}</td>
                  <td className="num">{money(p.price_pen)}</td>
                  <td className="num">{p.list_price_pen ? money(p.list_price_pen) : "—"}</td>
                  <td>{p.devices}</td>
                  <td>{p.badge || "—"}</td>
                  <td>{p.active ? <Tag tone="ok">Visible</Tag> : <Tag tone="muted">Oculto</Tag>}</td>
                  <td><button className="btn btn-sm btn-ghost" onClick={() => open(p, false)}>Editar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {edit && (
        <Modal title={isNew ? "Nuevo plan" : `Editar ${edit.name}`} onClose={() => setEdit(null)}>
          <div className="grid grid-2">
            <label className="field"><span>Identificador (URL)</span><input className="input" disabled={!isNew} value={edit.id} onChange={(e) => setEdit({ ...edit, id: e.target.value.toLowerCase() })} placeholder="ej. anual-promo" /></label>
            <label className="field"><span>Nombre</span><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label>
          </div>
          <label className="field"><span>Frase corta</span><input className="input" value={edit.tagline} onChange={(e) => setEdit({ ...edit, tagline: e.target.value })} /></label>
          <div className="grid grid-3">
            <label className="field"><span>Meses</span><input className="input" type="number" min={0} value={edit.months} onChange={(e) => setEdit({ ...edit, months: Number(e.target.value) })} /></label>
            <label className="field"><span>Días extra</span><input className="input" type="number" min={0} value={edit.days} onChange={(e) => setEdit({ ...edit, days: Number(e.target.value) })} /></label>
            <label className="field"><span>Equipos (PCs)</span><input className="input" type="number" min={1} value={edit.devices} onChange={(e) => setEdit({ ...edit, devices: Number(e.target.value) })} /></label>
            <label className="field"><span>Precio S/</span><input className="input" type="number" step="0.01" value={edit.price_pen} onChange={(e) => setEdit({ ...edit, price_pen: Number(e.target.value) })} /></label>
            <label className="field"><span>Precio regular S/ (tachado)</span><input className="input" type="number" step="0.01" value={edit.list_price_pen ?? ""} onChange={(e) => setEdit({ ...edit, list_price_pen: e.target.value ? Number(e.target.value) : null })} /></label>
            <label className="field"><span>Orden</span><input className="input" type="number" value={edit.sort} onChange={(e) => setEdit({ ...edit, sort: Number(e.target.value) })} /></label>
          </div>
          <label className="field"><span>Etiqueta (ej. «Más elegido», «Ahorra 30 %»)</span><input className="input" value={edit.badge ?? ""} onChange={(e) => setEdit({ ...edit, badge: e.target.value })} /></label>
          <label className="field"><span>Beneficios (uno por línea)</span><textarea className="input" value={features} onChange={(e) => setFeatures(e.target.value)} /></label>
          <label className="check"><input type="checkbox" checked={edit.highlight} onChange={(e) => setEdit({ ...edit, highlight: e.target.checked })} /> Destacar este plan</label>
          <label className="check"><input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Visible en la web</label>
          <button className="btn btn-primary" onClick={save}>Guardar plan</button>
        </Modal>
      )}
    </>
  );
}

// ============================================================================== Métodos de pago
const emptyMethod: PaymentMethod = { id: "", name: "", kind: "wallet", holder: "", account: "", account_alt: "", instructions: "", qr_url: "", requires_voucher: true, active: true, sort: 100 };

export function PaymentMethods() {
  const toast = useToast();
  const { data, loading, reload } = useQuery(async () => ((await supabase.from("kz_payment_methods").select("*").order("sort")).data ?? []) as PaymentMethod[]);
  const [edit, setEdit] = useState<PaymentMethod | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function uploadQr(file: File) {
    if (!edit) return;
    setUploading(true);
    const path = `qr/${edit.id || "metodo"}-${Date.now()}.${(file.name.split(".").pop() || "png").toLowerCase()}`;
    const { error } = await supabase.storage.from("kz-releases").upload(path, file, { contentType: file.type });
    setUploading(false);
    if (error) return toast(error.message, "bad");
    const { data: pub } = supabase.storage.from("kz-releases").getPublicUrl(path);
    setEdit({ ...edit, qr_url: pub.publicUrl });
  }

  async function save() {
    if (!edit) return;
    if (!/^[a-z0-9-]+$/.test(edit.id)) return toast("Identificador: minúsculas, números y guiones (ej. plin, bcp)", "bad");
    const { error } = isNew ? await supabase.from("kz_payment_methods").insert(edit) : await supabase.from("kz_payment_methods").update(edit).eq("id", edit.id);
    if (error) return toast(error.message, "bad");
    toast("Método guardado", "ok");
    setEdit(null);
    void reload();
  }

  async function remove(m: PaymentMethod) {
    if (!confirm(`¿Eliminar ${m.name}? Si ya tiene pedidos, mejor desactívalo.`)) return;
    const { error } = await supabase.from("kz_payment_methods").delete().eq("id", m.id);
    if (error) toast(error.message, "bad");
    else void reload();
  }

  return (
    <>
      <PageTitle title="Métodos de pago" sub="Yape, Plin, transferencias, efectivo… Agrega los que quieras; el cliente verá los activos.">
        <button className="btn btn-sm btn-primary" onClick={() => { setEdit({ ...emptyMethod }); setIsNew(true); }}>+ Agregar método</button>
      </PageTitle>
      <div className="grid grid-3">
        {loading && <Spinner />}
        {(data ?? []).map((m) => (
          <div key={m.id} className="card card-pad">
            <div className="row between"><h3 style={{ margin: 0 }}>{m.name}</h3>{m.active ? <Tag tone="ok">Activo</Tag> : <Tag tone="muted">Inactivo</Tag>}</div>
            {m.qr_url && <img src={m.qr_url} alt="" className="qr" style={{ width: 110, height: 110, marginTop: 10 }} />}
            <p className="small" style={{ marginTop: 10 }}><b>{m.account || "—"}</b>{m.holder && <> · {m.holder}</>}</p>
            <p className="tiny muted">{m.instructions.slice(0, 120)}{m.instructions.length > 120 ? "…" : ""}</p>
            <div className="row">
              <button className="btn btn-sm btn-ghost" onClick={() => { setEdit({ ...m }); setIsNew(false); }}>Editar</button>
              <button className="btn btn-sm btn-ghost" onClick={() => remove(m)}>Eliminar</button>
            </div>
          </div>
        ))}
      </div>
      <div className="card card-pad" style={{ marginTop: 20 }}>
        <h3>Mercado Pago (tarjetas, activación automática)</h3>
        <MercadoPagoToggle />
      </div>
      {edit && (
        <Modal title={isNew ? "Nuevo método de pago" : `Editar ${edit.name}`} onClose={() => setEdit(null)}>
          <div className="grid grid-2">
            <label className="field"><span>Identificador</span><input className="input" disabled={!isNew} value={edit.id} onChange={(e) => setEdit({ ...edit, id: e.target.value.toLowerCase() })} placeholder="plin, bcp, interbank…" /></label>
            <label className="field"><span>Nombre visible</span><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Plin" /></label>
            <label className="field"><span>Tipo</span>
              <select className="input" value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value as PaymentMethod["kind"] })}>
                <option value="wallet">Billetera (Yape, Plin…)</option><option value="bank">Transferencia bancaria</option><option value="cash">Efectivo</option><option value="other">Otro</option>
              </select>
            </label>
            <label className="field"><span>Titular</span><input className="input" value={edit.holder} onChange={(e) => setEdit({ ...edit, holder: e.target.value })} /></label>
            <label className="field"><span>Número / cuenta</span><input className="input" value={edit.account} onChange={(e) => setEdit({ ...edit, account: e.target.value })} /></label>
            <label className="field"><span>CCI / dato alterno</span><input className="input" value={edit.account_alt} onChange={(e) => setEdit({ ...edit, account_alt: e.target.value })} /></label>
            <label className="field"><span>Orden</span><input className="input" type="number" value={edit.sort} onChange={(e) => setEdit({ ...edit, sort: Number(e.target.value) })} /></label>
            <label className="field"><span>Imagen QR</span><input className="input" type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && uploadQr(e.target.files[0])} />{uploading && <Spinner />}</label>
          </div>
          {edit.qr_url && <div className="row"><img src={edit.qr_url} className="qr" alt="QR" /><button className="btn btn-sm btn-ghost" onClick={() => setEdit({ ...edit, qr_url: "" })}>Quitar QR</button></div>}
          <label className="field"><span>Instrucciones para el cliente</span><textarea className="input" value={edit.instructions} onChange={(e) => setEdit({ ...edit, instructions: e.target.value })} /></label>
          <label className="check"><input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Activo (visible al pagar)</label>
          <button className="btn btn-primary" onClick={save}>Guardar</button>
        </Modal>
      )}
    </>
  );
}

function MercadoPagoToggle() {
  const toast = useToast();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  useEffect(() => { fetchSetting<{ enabled: boolean }>("mercadopago", { enabled: false }).then((v) => setEnabled(v.enabled)); }, []);
  if (enabled === null) return <Spinner />;
  return (
    <>
      <p className="small muted">Requiere guardar tu Access Token de Mercado Pago como secreto <code>MP_ACCESS_TOKEN</code> de la Edge Function en Supabase (Project Settings → Edge Functions → Secrets) y el secreto <code>SITE_URL</code> con la dirección de esta web. Con el secreto configurado, actívalo aquí.</p>
      <label className="check"><input type="checkbox" checked={enabled} onChange={async (e) => {
        const v = e.target.checked;
        const { error } = await supabase.from("kz_settings").upsert({ key: "mercadopago", value: { enabled: v }, public: true });
        if (error) toast(error.message, "bad");
        else { setEnabled(v); toast(v ? "Mercado Pago activado" : "Mercado Pago desactivado", "ok"); }
      }} /> Ofrecer pago con Mercado Pago</label>
    </>
  );
}

// ============================================================================== Versiones
export function Releases() {
  const toast = useToast();
  const { run, busy } = useAdminOp();
  const { data, loading, reload } = useQuery(async () => ((await supabase.from("kz_releases").select("*").order("created_at", { ascending: false })).data ?? []) as Release[]);
  const [f, setF] = useState({ version: "", notes: "", download_url: "", sha256: "", size_bytes: 0, mandatory: false, channel: "stable", revit: "2025,2026,2027" });
  const [progress, setProgress] = useState<string | null>(null);

  async function onFile(file: File) {
    const m = file.name.match(/(\d+\.\d+\.\d+)/);
    setProgress("Calculando SHA-256…");
    const sha = await sha256Hex(file);
    setProgress("Subiendo instalador…");
    const path = `installers/${file.name.replace(/[^A-Za-z0-9._-]/g, "_")}`;
    const { error } = await supabase.storage.from("kz-releases").upload(path, file, { upsert: true, contentType: "application/octet-stream" });
    setProgress(null);
    if (error) return toast(`${error.message}. Si el archivo supera el límite de Supabase, súbelo a GitHub Releases y pega la URL.`, "bad");
    const { data: pub } = supabase.storage.from("kz-releases").getPublicUrl(path);
    setF((x) => ({ ...x, version: x.version || m?.[1] || "", download_url: pub.publicUrl, sha256: sha, size_bytes: file.size }));
    toast("Instalador subido", "ok");
  }

  async function create() {
    if (!/^\d+\.\d+\.\d+$/.test(f.version)) return toast("Versión con formato 1.2.3", "bad");
    if (!/^[a-f0-9]{64}$/i.test(f.sha256)) return toast("SHA-256 inválido (64 caracteres hex)", "bad");
    const { data: rel, error } = await supabase.from("kz_releases").insert({
      version: f.version, notes: f.notes, download_url: f.download_url, sha256: f.sha256.toLowerCase(), size_bytes: f.size_bytes,
      mandatory: f.mandatory, channel: f.channel, revit_versions: f.revit.split(",").map((s) => s.trim()).filter(Boolean),
    }).select().single();
    if (error) return toast(error.message, "bad");
    if (await run("publish_release", { release_id: rel.id, published: true }, `Versión ${f.version} publicada: los usuarios recibirán el aviso`)) {
      setF({ version: "", notes: "", download_url: "", sha256: "", size_bytes: 0, mandatory: false, channel: "stable", revit: "2025,2026,2027" });
      void reload();
    }
  }

  return (
    <>
      <PageTitle title="Versiones del add-in" sub="Publica una versión y todos los KAIZEN instalados mostrarán el aviso de actualización y la instalarán al cerrar Revit." />
      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <div className="card card-pad">
          <h3>Publicar nueva versión</h3>
          <label className="field"><span>1. Instalador (.exe)</span><input className="input" type="file" accept=".exe,.msi" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} /></label>
          {progress && <div className="alert alert-info"><Spinner /> {progress}</div>}
          <div className="grid grid-2">
            <label className="field"><span>Versión</span><input className="input" value={f.version} onChange={(e) => setF({ ...f, version: e.target.value })} placeholder="0.16.0" /></label>
            <label className="field"><span>Canal</span><select className="input" value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value })}><option value="stable">Estable</option><option value="beta">Beta</option></select></label>
          </div>
          <label className="field"><span>URL de descarga (o sube el archivo arriba)</span><input className="input" value={f.download_url} onChange={(e) => setF({ ...f, download_url: e.target.value })} /></label>
          <label className="field"><span>SHA-256</span><input className="input mono" value={f.sha256} onChange={(e) => setF({ ...f, sha256: e.target.value.trim() })} /></label>
          <label className="field"><span>Versiones de Revit</span><input className="input" value={f.revit} onChange={(e) => setF({ ...f, revit: e.target.value })} /></label>
          <label className="field"><span>Novedades (se muestran en el aviso)</span><textarea className="input" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder={"• Nueva herramienta…\n• Corrección en…"} /></label>
          <label className="check"><input type="checkbox" checked={f.mandatory} onChange={(e) => setF({ ...f, mandatory: e.target.checked })} /> Actualización obligatoria (se instala sin preguntar al cerrar Revit)</label>
          <button className="btn btn-primary" disabled={busy || !!progress} onClick={create}>{busy ? <Spinner /> : "Publicar y notificar"}</button>
        </div>
        <div className="card table-wrap">
          {loading ? <div className="empty"><Spinner /></div> : (
            <table className="table">
              <thead><tr><th>Versión</th><th>Canal</th><th>Tamaño</th><th>Estado</th><th>Fecha</th><th /></tr></thead>
              <tbody>
                {(data ?? []).map((r) => (
                  <tr key={r.id}>
                    <td><b>{r.version}</b> {r.mandatory && <Tag tone="warn">obligatoria</Tag>}<div className="tiny muted mono">{r.sha256.slice(0, 12)}…</div></td>
                    <td>{r.channel}</td><td>{bytes(r.size_bytes)}</td>
                    <td>{r.published ? <Tag tone="ok">Publicada</Tag> : <Tag tone="muted">Retirada</Tag>}</td>
                    <td className="small">{dateTime(r.published_at ?? r.created_at)}</td>
                    <td><button className="btn btn-sm btn-ghost" disabled={busy} onClick={async () => { if (await run("publish_release", { release_id: r.id, published: !r.published }, r.published ? "Retirada" : "Publicada")) void reload(); }}>{r.published ? "Retirar" : "Publicar"}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}

// ============================================================================== Ajustes
export function SettingsPage() {
  const toast = useToast();
  const [contact, setContact] = useState<ContactSettings | null>(null);
  const [lic, setLic] = useState<{ trial_days: number; check_interval_days: number } | null>(null);
  useEffect(() => {
    fetchSetting<ContactSettings>("contact", { whatsapp: "", whatsapp_display: "", email: "", hours: "", whatsapp_message: "" }).then(setContact);
    fetchSetting("licensing", { trial_days: 3, check_interval_days: 5 }).then(setLic);
  }, []);
  async function save(key: string, value: unknown) {
    const { error } = await supabase.from("kz_settings").upsert({ key, value, public: true });
    if (error) toast(error.message, "bad");
    else { toast("Ajustes guardados", "ok"); invalidateContact(); }
  }
  if (!contact || !lic) return <Spinner />;
  return (
    <>
      <PageTitle title="Ajustes" />
      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <div className="card card-pad">
          <h3>Contacto y WhatsApp</h3>
          <label className="field"><span>WhatsApp (con código de país, solo números)</span><input className="input" value={contact.whatsapp} onChange={(e) => setContact({ ...contact, whatsapp: e.target.value.replace(/\D/g, "") })} placeholder="51951230463" /></label>
          <label className="field"><span>Cómo se muestra</span><input className="input" value={contact.whatsapp_display} onChange={(e) => setContact({ ...contact, whatsapp_display: e.target.value })} /></label>
          <label className="field"><span>Mensaje inicial de WhatsApp</span><input className="input" value={contact.whatsapp_message} onChange={(e) => setContact({ ...contact, whatsapp_message: e.target.value })} /></label>
          <label className="field"><span>Correo de soporte (opcional)</span><input className="input" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} /></label>
          <label className="field"><span>Horario de atención</span><input className="input" value={contact.hours} onChange={(e) => setContact({ ...contact, hours: e.target.value })} /></label>
          <button className="btn btn-primary" onClick={() => save("contact", contact)}>Guardar contacto</button>
        </div>
        <div className="card card-pad">
          <h3>Licenciamiento</h3>
          <label className="field"><span>Días de prueba gratuita</span><input className="input" type="number" min={1} max={30} value={lic.trial_days} onChange={(e) => setLic({ ...lic, trial_days: Number(e.target.value) })} /></label>
          <label className="field"><span>Verificación en línea cada (días)</span><input className="input" type="number" min={1} max={30} value={lic.check_interval_days} onChange={(e) => setLic({ ...lic, check_interval_days: Number(e.target.value) })} /></label>
          <p className="small muted">Si el add-in no logra verificar en ese plazo, se bloquea hasta reconectarse. Aplica a las nuevas activaciones y verificaciones.</p>
          <button className="btn btn-primary" onClick={() => save("licensing", lic)}>Guardar</button>
        </div>
      </div>
    </>
  );
}
