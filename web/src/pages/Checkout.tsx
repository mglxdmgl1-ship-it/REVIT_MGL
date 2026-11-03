import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { CopyButton, LoadingPage, Spinner, Tag, useToast } from "../components/ui";
import { useAuth } from "../lib/auth";
import { fetchPaymentMethods, fetchPlans, fetchSetting, useContact, useQuery } from "../lib/data";
import { dateTime, durationLabel, money, orderStatus, perMonth, waLink } from "../lib/format";
import { api, ApiError, supabase, type Order, type PaymentMethod } from "../lib/supabase";

export function Checkout() {
  const { planId } = useParams();
  const [params] = useSearchParams();
  const renew = params.get("renovar");
  const navigate = useNavigate();
  const toast = useToast();
  const { data: plans, loading } = useQuery(fetchPlans);
  const { data: methods } = useQuery(fetchPaymentMethods);
  const { data: mp } = useQuery(() => fetchSetting<{ enabled: boolean }>("mercadopago", { enabled: false }));
  const [selected, setSelected] = useState(planId ?? "anual");
  const [method, setMethod] = useState<string>("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!method && methods?.length) setMethod(methods[0].id);
  }, [methods, method]);

  if (loading) return <LoadingPage />;
  const plan = plans?.find((p) => p.id === selected) ?? plans?.[0];
  if (!plan) return <div className="container section">Plan no encontrado.</div>;

  async function pay() {
    setBusy(true);
    try {
      const res = await api<{ order: Order; redirect?: string }>("/checkout", { plan_id: plan!.id, method, renew_license_id: renew ?? undefined });
      if (res.redirect) {
        location.href = res.redirect;
        return;
      }
      navigate(`/cuenta/pedido/${res.order.id}`);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "No se pudo crear el pedido", "bad");
    } finally {
      setBusy(false);
    }
  }

  const allMethods: { id: string; name: string; hint: string }[] = [
    ...(methods ?? []).map((m) => ({ id: m.id, name: m.name, hint: m.kind === "wallet" ? "Pago con el celular · se verifica en minutos" : m.kind === "bank" ? "Transferencia bancaria" : "Coordinado con soporte" })),
    ...(mp?.enabled ? [{ id: "mercadopago", name: "Tarjeta / Mercado Pago", hint: "Activación automática al aprobarse" }] : []),
  ];

  return (
    <>
      <div className="page-head"><div className="container"><h1>{renew ? "Renovar licencia" : "Completar compra"}</h1><p>Elige plan y método de pago. Tu licencia aparecerá en tu cuenta apenas se confirme el pago.</p></div></div>
      <div className="container page-body">
        <div className="grid grid-2" style={{ alignItems: "start" }}>
          <div className="card card-pad">
            <h3>1. Plan</h3>
            <div className="stack">
              {plans!.map((p) => (
                <label key={p.id} className={`method-opt ${p.id === plan.id ? "on" : ""}`}>
                  <input type="radio" name="plan" checked={p.id === plan.id} onChange={() => setSelected(p.id)} />
                  <div className="grow">
                    <b>{p.name}</b> {p.badge && <Tag tone="warn">{p.badge}</Tag>}
                    <div className="small muted">{durationLabel(p.months, p.days)} · {p.devices} equipo{p.devices > 1 ? "s" : ""}{perMonth(Number(p.price_pen), p.months) ? ` · ${perMonth(Number(p.price_pen), p.months)}/mes` : ""}</div>
                  </div>
                  <b>{money(p.price_pen)}</b>
                </label>
              ))}
            </div>
          </div>
          <div className="card card-pad">
            <h3>2. Método de pago</h3>
            {allMethods.length === 0 ? <div className="alert alert-warn">No hay métodos de pago activos. Escríbenos por WhatsApp.</div> : (
              <div className="stack">
                {allMethods.map((m) => (
                  <label key={m.id} className={`method-opt ${m.id === method ? "on" : ""}`}>
                    <input type="radio" name="method" checked={m.id === method} onChange={() => setMethod(m.id)} />
                    <div><b>{m.name}</b><div className="small muted">{m.hint}</div></div>
                  </label>
                ))}
              </div>
            )}
            <div style={{ borderTop: "1px solid var(--line)", marginTop: 22, paddingTop: 18 }}>
              <div className="row between"><span>KAIZEN · {plan.name}</span><b>{money(plan.price_pen)}</b></div>
              {plan.list_price_pen && Number(plan.list_price_pen) > Number(plan.price_pen) && (
                <div className="row between small muted"><span>Ahorro frente a precio regular</span><span>−{money(Number(plan.list_price_pen) - Number(plan.price_pen))}</span></div>
              )}
              <button className="btn btn-accent btn-block btn-lg" style={{ marginTop: 16 }} disabled={busy || !method} onClick={pay}>
                {busy ? <Spinner /> : `Continuar · ${money(plan.price_pen)}`}
              </button>
              <p className="tiny muted center" style={{ marginTop: 10 }}>Al continuar aceptas los <Link to="/terminos">términos</Link>.</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function PaymentInstructions({ order, method }: { order: Order; method: PaymentMethod | undefined }) {
  if (!method) return null;
  return (
    <div className="pay-box">
      <div className="row" style={{ alignItems: "flex-start", gap: 24 }}>
        {method.qr_url && <img className="qr" src={method.qr_url} alt={`QR de ${method.name}`} />}
        <div className="grow">
          <div className="muted small">Paga con {method.name}</div>
          <div className="row"><span className="pay-number">{method.account}</span><CopyButton text={method.account.replace(/\s/g, "")} label="Copiar número" /></div>
          {method.holder && <div className="small">Titular: <b>{method.holder}</b></div>}
          {method.account_alt && <div className="small">CCI / alterno: <b>{method.account_alt}</b></div>}
          <div style={{ marginTop: 10 }}>Monto exacto: <b style={{ fontSize: "1.2rem" }}>{money(order.amount_pen)}</b></div>
          <div className="small">En el mensaje o concepto escribe: <b className="mono">{order.code}</b></div>
          {method.instructions && <p className="small muted" style={{ marginTop: 10, whiteSpace: "pre-wrap" }}>{method.instructions}</p>}
        </div>
      </div>
    </div>
  );
}

export function OrderPage() {
  const { id } = useParams();
  const { session } = useAuth();
  const toast = useToast();
  const contact = useContact();
  const { data: order, loading, reload, setData } = useQuery(async () => {
    const { data } = await supabase.from("kz_orders").select("*").eq("id", id!).maybeSingle();
    return data as Order | null;
  }, [id]);
  const { data: methods } = useQuery(async () => {
    const { data } = await supabase.from("kz_payment_methods").select("*");
    return (data ?? []) as PaymentMethod[];
  });
  const [file, setFile] = useState<File | null>(null);
  const [operation, setOperation] = useState("");
  const [busy, setBusy] = useState(false);

  // Mercado Pago: al volver del checkout se reconsulta el pago; las revisiones manuales se sondean.
  useEffect(() => {
    if (!order || order.status === "paid" || order.status === "cancelled") return;
    if (order.method === "mercadopago") {
      void api<{ order: Order }>("/order/sync", { order_id: order.id }).then((r) => setData(r.order)).catch(() => undefined);
    }
    const t = setInterval(() => void reload(), 15000);
    return () => clearInterval(t);
  }, [order?.id, order?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && !order) return <LoadingPage />;
  if (!order) return <div className="container section">Pedido no encontrado.</div>;
  const method = methods?.find((m) => m.id === order.method);
  const st = orderStatus[order.status];

  async function sendProof() {
    if (!file && !operation.trim()) return toast("Sube la captura o escribe el número de operación", "bad");
    setBusy(true);
    try {
      let voucher_path: string | undefined;
      if (file) {
        if (file.size > 8 * 1024 * 1024) throw new Error("La imagen pesa más de 8 MB.");
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
        voucher_path = `${session!.user.id}/${order!.id}-${Date.now()}.${ext}`;
        const up = await supabase.storage.from("kz-vouchers").upload(voucher_path, file, { contentType: file.type || "image/jpeg" });
        if (up.error) throw new Error(up.error.message);
      }
      const r = await api<{ order: Order }>("/order/proof", { order_id: order!.id, voucher_path, operation_code: operation.trim() || undefined });
      setData(r.order);
      toast("¡Recibido! Estamos verificando tu pago.", "ok");
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo enviar", "bad");
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!confirm("¿Cancelar este pedido?")) return;
    try {
      const r = await api<{ order: Order }>("/order/cancel", { order_id: order!.id });
      setData(r.order);
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo cancelar", "bad");
    }
  }

  const waText = `Hola, hice el pago del pedido ${order.code} (${order.plan_name}, ${money(order.amount_pen)}) por ${order.method_name}.`;

  return (
    <>
      <div className="page-head"><div className="container"><h1>Pedido {order.code}</h1><p>{order.plan_name} · {money(order.amount_pen)} · {dateTime(order.created_at)}</p></div></div>
      <div className="container page-body">
        <div className="card card-pad" style={{ maxWidth: 820 }}>
          <div className="row between"><h3 style={{ margin: 0 }}>Estado</h3><Tag tone={st.tone}>{st.label}</Tag></div>

          {order.status === "paid" && (
            <div className="alert alert-ok" style={{ marginTop: 16 }}>
              ✅ ¡Pago confirmado! Tu licencia ya está en <Link to="/cuenta">tu cuenta</Link>. Cópiala y pégala en Revit → KAIZEN → Área personal.
            </div>
          )}
          {order.status === "rejected" && (
            <div className="alert alert-bad" style={{ marginTop: 16 }}>No pudimos verificar el pago{order.admin_note ? `: ${order.admin_note}` : "."} Puedes volver a enviar el comprobante o escribirnos.</div>
          )}
          {order.status === "review" && (
            <div className="alert alert-info" style={{ marginTop: 16 }}>
              Recibimos tu comprobante y lo estamos verificando (normalmente en minutos, {contact.hours}). Esta página se actualiza sola.
            </div>
          )}

          {(order.status === "pending" || order.status === "rejected" || order.status === "review") && order.method !== "mercadopago" && (
            <>
              <h3 style={{ marginTop: 24 }}>1. Paga</h3>
              <PaymentInstructions order={order} method={method} />
              <h3 style={{ marginTop: 24 }}>2. Envía tu comprobante</h3>
              <div className="grid grid-2">
                <label className="field"><span>Captura del pago</span><input className="input" type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
                <label className="field"><span>N.º de operación (opcional)</span><input className="input" value={operation} onChange={(e) => setOperation(e.target.value)} placeholder="Ej. 01234567" /></label>
              </div>
              <div className="row">
                <button className="btn btn-primary" onClick={sendProof} disabled={busy}>{busy ? <Spinner /> : order.status === "review" ? "Reenviar comprobante" : "Enviar comprobante"}</button>
                <a className="btn btn-wa" href={waLink(contact.whatsapp, waText)} target="_blank" rel="noreferrer">Avisar por WhatsApp</a>
                {order.status !== "review" && <button className="btn btn-ghost" onClick={cancel}>Cancelar pedido</button>}
              </div>
            </>
          )}

          {order.method === "mercadopago" && order.status === "pending" && (
            <div className="alert alert-info" style={{ marginTop: 16 }}>Esperando la confirmación de Mercado Pago. Si ya pagaste, en unos segundos se actualizará.</div>
          )}

          <div className="row" style={{ marginTop: 24 }}><Link to="/cuenta">← Volver a mi cuenta</Link></div>
        </div>
      </div>
    </>
  );
}
