// Pedidos, pagos (Yape/manual y Mercado Pago) y entrega de licencias.
import {
  addPlan, Caller, db, DAY_MS, fail, generateLicenseKey, HttpError, ok, PlanRow, setting, str,
} from "./shared.ts";

const SITE_URL = (Deno.env.get("SITE_URL") ?? "https://kaizen-revit.netlify.app").replace(/\/+$/, "");
const MP_TOKEN = Deno.env.get("MP_ACCESS_TOKEN") ?? "";

async function getPlan(id: string): Promise<PlanRow> {
  const { data } = await db.from("kz_plans").select("*").eq("id", id).maybeSingle();
  if (!data) throw new HttpError(404, "plan_not_found", "El plan elegido no existe.");
  return data as PlanRow;
}

async function insertLicense(row: Record<string, unknown>) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const license_key = await generateLicenseKey();
    const { data, error } = await db.from("kz_licenses").insert({ ...row, license_key }).select().single();
    if (!error) return data;
    if (!String(error.message).includes("duplicate")) throw new Error(error.message);
  }
  throw new Error("No se pudo generar una clave única.");
}

/**
 * Marca el pedido como pagado y entrega la licencia (nueva o renovación). Idempotente: si dos
 * notificaciones llegan a la vez, solo la que gana la actualización condicional crea la licencia.
 */
export async function fulfillOrder(orderId: string, reviewerId: string | null, adminNote?: string) {
  const { data: claimed } = await db
    .from("kz_orders")
    .update({ status: "paid", paid_at: new Date().toISOString(), reviewed_by: reviewerId, ...(adminNote ? { admin_note: adminNote } : {}) })
    .eq("id", orderId)
    .in("status", ["pending", "review", "rejected"])
    .select()
    .maybeSingle();

  if (!claimed) {
    const { data: existing } = await db.from("kz_orders").select("*").eq("id", orderId).maybeSingle();
    return existing;
  }

  const plan = await getPlan(claimed.plan_id);
  const now = new Date();
  let licenseId: string | null = null;

  if (claimed.renew_license_id) {
    const { data: lic } = await db.from("kz_licenses").select("*").eq("id", claimed.renew_license_id).maybeSingle();
    if (lic && lic.user_id === claimed.user_id && !lic.is_trial) {
      const base = lic.expires_at && new Date(lic.expires_at) > now ? new Date(lic.expires_at) : now;
      const expires = addPlan(base, plan);
      await db.from("kz_licenses").update({
        expires_at: expires.toISOString(),
        starts_at: lic.starts_at ?? now.toISOString(),
        plan_id: plan.id,
        max_devices: Math.max(lic.max_devices, plan.devices),
        status: lic.status === "revoked" ? "revoked" : "active",
      }).eq("id", lic.id);
      licenseId = lic.id;
    }
  }

  if (!licenseId) {
    const expires = addPlan(now, plan);
    const lic = await insertLicense({
      user_id: claimed.user_id,
      plan_id: plan.id,
      is_trial: false,
      duration_days: Math.round((expires.getTime() - now.getTime()) / DAY_MS),
      starts_at: now.toISOString(),
      expires_at: expires.toISOString(),
      max_devices: plan.devices,
    });
    licenseId = lic.id;
  }

  const { data: done } = await db.from("kz_orders").update({ license_id: licenseId }).eq("id", orderId).select().single();
  return done;
}

// ---------------------------------------------------------------------------------------------
// Prueba gratuita (una por cuenta; además una por placa base al activar)
// ---------------------------------------------------------------------------------------------
export async function createTrial(user: Caller): Promise<Response> {
  const { data: existing } = await db.from("kz_licenses").select("id, license_key, expires_at, starts_at")
    .eq("user_id", user.id).eq("is_trial", true).maybeSingle();

  if (existing) return ok({ license: existing, existing: true });

  const licensing = await setting<{ trial_days?: number }>("licensing");
  const days = Math.min(30, Math.max(1, Number(licensing.trial_days ?? 3)));

  const lic = await insertLicense({
    user_id: user.id,
    plan_id: null,
    is_trial: true,
    duration_days: days,
    starts_at: null,
    expires_at: null,
    max_devices: 1,
    notes: "Prueba gratuita",
  });

  return ok({ license: lic, existing: false });
}

// ---------------------------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------------------------
interface CheckoutBody {
  plan_id?: string;
  method?: string;
  operation_code?: string;
  voucher_path?: string;
  note?: string;
  renew_license_id?: string;
}

export async function checkout(req: Request, user: Caller): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as CheckoutBody;
  const plan = await getPlan(str(body.plan_id, 40));
  if (!plan.active) return fail(400, "plan_inactive", "Este plan ya no está disponible.");

  let renewId: string | null = null;
  if (body.renew_license_id) {
    const { data: lic } = await db.from("kz_licenses").select("id, user_id, is_trial").eq("id", body.renew_license_id).maybeSingle();
    if (!lic || lic.user_id !== user.id || lic.is_trial) return fail(400, "bad_license", "No puedes renovar esa licencia.");
    renewId = lic.id;
  }

  const method = str(body.method, 40);
  const voucher = str(body.voucher_path, 300);
  if (voucher && !voucher.startsWith(`${user.id}/`)) return fail(400, "bad_voucher", "Comprobante inválido.");

  if (method === "mercadopago") {
    const mp = await setting<{ enabled?: boolean }>("mercadopago");
    if (!mp.enabled || !MP_TOKEN) return fail(400, "method_unavailable", "El pago con Mercado Pago no está disponible por ahora.");

    const { data: order, error } = await db.from("kz_orders").insert({
      user_id: user.id, plan_id: plan.id, plan_name: plan.name, amount_pen: plan.price_pen,
      method: "mercadopago", method_name: "Mercado Pago", status: "pending", renew_license_id: renewId,
    }).select().single();
    if (error) throw new Error(error.message);

    const notificationUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/kaizen/mp/webhook`;
    const back = `${SITE_URL}/cuenta/pedido/${order.id}`;
    const res = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: { Authorization: `Bearer ${MP_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [{ id: plan.id, title: `KAIZEN para Revit · ${plan.name}`, quantity: 1, currency_id: "PEN", unit_price: Number(plan.price_pen) }],
        payer: { email: user.email },
        external_reference: order.id,
        back_urls: { success: back, pending: back, failure: back },
        auto_return: "approved",
        notification_url: notificationUrl,
        statement_descriptor: "KAIZEN",
      }),
    });
    const pref = await res.json();
    if (!res.ok || !pref.init_point) {
      await db.from("kz_orders").update({ status: "cancelled", admin_note: "MP preference error" }).eq("id", order.id);
      return fail(502, "provider_error", "Mercado Pago no respondió. Intenta otra vez o paga con Yape.");
    }
    await db.from("kz_orders").update({ provider_ref: pref.id }).eq("id", order.id);
    return ok({ order, redirect: pref.init_point });
  }

  const { data: pm } = await db.from("kz_payment_methods").select("*").eq("id", method).eq("active", true).maybeSingle();
  if (!pm) return fail(400, "method_unavailable", "Ese método de pago no está disponible.");

  const operation = str(body.operation_code, 60);
  const hasProof = Boolean(voucher || operation);

  const { data: order, error } = await db.from("kz_orders").insert({
    user_id: user.id, plan_id: plan.id, plan_name: plan.name, amount_pen: plan.price_pen,
    method: pm.id, method_name: pm.name, status: hasProof ? "review" : "pending",
    operation_code: operation || null, voucher_path: voucher || null,
    customer_note: str(body.note, 500) || null, renew_license_id: renewId,
  }).select().single();
  if (error) throw new Error(error.message);

  return ok({ order });
}

/** El cliente adjunta el comprobante después de crear el pedido. */
export async function submitProof(req: Request, user: Caller): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as { order_id?: string; operation_code?: string; voucher_path?: string; note?: string };
  const voucher = str(body.voucher_path, 300);
  if (voucher && !voucher.startsWith(`${user.id}/`)) return fail(400, "bad_voucher", "Comprobante inválido.");
  const operation = str(body.operation_code, 60);
  if (!voucher && !operation) return fail(400, "missing_proof", "Sube la captura o escribe el número de operación.");

  const { data, error } = await db.from("kz_orders")
    .update({ voucher_path: voucher || undefined, operation_code: operation || undefined, customer_note: str(body.note, 500) || undefined, status: "review" })
    .eq("id", str(body.order_id, 60)).eq("user_id", user.id).in("status", ["pending", "review", "rejected"])
    .select().maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return fail(404, "order_not_found", "No se encontró el pedido.");
  return ok({ order: data });
}

export async function cancelOrder(req: Request, user: Caller): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as { order_id?: string };
  const { data } = await db.from("kz_orders").update({ status: "cancelled" })
    .eq("id", str(body.order_id, 60)).eq("user_id", user.id).in("status", ["pending", "review"]).select().maybeSingle();
  if (!data) return fail(404, "order_not_found", "No se pudo cancelar el pedido.");
  return ok({ order: data });
}

// ---------------------------------------------------------------------------------------------
// Mercado Pago
// ---------------------------------------------------------------------------------------------
async function applyMpPayment(paymentId: string) {
  if (!MP_TOKEN || !/^\d+$/.test(paymentId)) return;
  const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${MP_TOKEN}` },
  });
  if (!res.ok) throw new Error(`MP payment ${paymentId}: ${res.status}`);
  const p = await res.json();
  const orderId = String(p.external_reference ?? "");
  const { data: order } = await db.from("kz_orders").select("*").eq("id", orderId).maybeSingle();
  if (!order || order.method !== "mercadopago") return;

  await db.from("kz_orders").update({ provider_ref: String(p.id), provider_status: String(p.status) }).eq("id", order.id);

  const amountOk = Number(p.transaction_amount) + 0.01 >= Number(order.amount_pen);
  if (p.status === "approved" && p.currency_id === "PEN" && amountOk) {
    await fulfillOrder(order.id, null, `Mercado Pago #${p.id}`);
  }
}

export async function mpWebhook(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const body = await req.json().catch(() => ({})) as { type?: string; topic?: string; data?: { id?: string | number } };
  const type = body.type ?? body.topic ?? url.searchParams.get("type") ?? url.searchParams.get("topic") ?? "";
  const id = String(body.data?.id ?? url.searchParams.get("data.id") ?? url.searchParams.get("id") ?? "");
  // Se consulta siempre el pago en la API de MP con nuestro token: una notificación falsa no
  // puede marcar nada como pagado.
  if (type === "payment" && id) await applyMpPayment(id);
  return ok();
}

/** Consulta activa desde la página de retorno, por si el webhook se retrasa. */
export async function syncOrder(req: Request, user: Caller): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as { order_id?: string };
  const { data: order } = await db.from("kz_orders").select("*").eq("id", str(body.order_id, 60)).eq("user_id", user.id).maybeSingle();
  if (!order) return fail(404, "order_not_found", "No se encontró el pedido.");

  if (order.method === "mercadopago" && order.status !== "paid" && MP_TOKEN) {
    const res = await fetch(`https://api.mercadopago.com/v1/payments/search?external_reference=${order.id}&sort=date_created&criteria=desc`, {
      headers: { Authorization: `Bearer ${MP_TOKEN}` },
    });
    if (res.ok) {
      const found = await res.json();
      for (const p of found.results ?? []) {
        if (p.status === "approved") {
          await applyMpPayment(String(p.id));
          break;
        }
      }
    }
  }

  const { data: fresh } = await db.from("kz_orders").select("*").eq("id", order.id).single();
  return ok({ order: fresh });
}
