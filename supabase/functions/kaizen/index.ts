// =============================================================================================
// KAIZEN · API de licencias, pagos, administración y actualizaciones.
//
//   POST /kaizen/license/activate      add-in: activa la clave en esta PC → token firmado
//   POST /kaizen/license/validate      add-in: verificación periódica (cada 5 días)
//   GET  /kaizen/update/latest         add-in: última versión publicada (firmada)
//   POST /kaizen/trial                 web: crea la prueba gratuita de 3 días
//   POST /kaizen/checkout              web: crea un pedido (Yape/…/Mercado Pago)
//   POST /kaizen/order/proof           web: adjunta comprobante
//   POST /kaizen/order/cancel          web: cancela un pedido propio
//   POST /kaizen/order/sync            web: reconsulta un pago de Mercado Pago
//   POST /kaizen/mp/webhook            Mercado Pago: notificaciones
//   POST /kaizen/admin/<operación>     panel admin
//
// verify_jwt = false: el add-in no tiene sesión de Supabase. Las rutas web validan el JWT aquí.
// =============================================================================================
import { handleAdmin } from "./admin.ts";
import { handleLicense } from "./license.ts";
import { cancelOrder, checkout, createTrial, mpWebhook, submitProof, syncOrder } from "./orders.ts";
import { cors, db, fail, HttpError, ok, requireAdmin, requireUser, str } from "./shared.ts";

async function latestRelease(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const channel = url.searchParams.get("channel") === "beta" ? ["stable", "beta"] : ["stable"];
  const revit = str(url.searchParams.get("revit") ?? "", 10);

  let query = db.from("kz_releases")
    .select("version, channel, notes, download_url, sha256, size_bytes, signature, mandatory, published_at, revit_versions")
    .eq("published", true)
    .in("channel", channel)
    .order("published_at", { ascending: false })
    .limit(1);

  if (/^20\d\d$/.test(revit)) query = query.contains("revit_versions", [revit]);

  const { data } = await query;
  const r = data?.[0];
  if (!r || !r.signature) return ok({ release: null });

  return ok({
    release: {
      version: r.version,
      channel: r.channel,
      notes: r.notes,
      url: r.download_url,
      sha256: r.sha256,
      size: r.size_bytes,
      signature: r.signature,
      mandatory: r.mandatory,
      publishedAt: r.published_at,
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const { pathname } = new URL(req.url);
  const idx = pathname.indexOf("/kaizen");
  const route = (idx >= 0 ? pathname.slice(idx + "/kaizen".length) : pathname).replace(/\/+$/, "") || "/";

  try {
    if (route === "/" || route === "/health") return ok({ service: "kaizen", time: new Date().toISOString() });

    if (route === "/license/activate" && req.method === "POST") return await handleLicense(req, "activate");
    if (route === "/license/validate" && req.method === "POST") return await handleLicense(req, "validate");
    if (route === "/update/latest") return await latestRelease(req);
    if (route === "/mp/webhook") return await mpWebhook(req);

    if (req.method !== "POST") return fail(405, "method_not_allowed", "Método no permitido.");

    if (route === "/trial") return await createTrial(await requireUser(req));
    if (route === "/checkout") return await checkout(req, await requireUser(req));
    if (route === "/order/proof") return await submitProof(req, await requireUser(req));
    if (route === "/order/cancel") return await cancelOrder(req, await requireUser(req));
    if (route === "/order/sync") return await syncOrder(req, await requireUser(req));

    if (route.startsWith("/admin/")) {
      const admin = await requireAdmin(req);
      return await handleAdmin(route.slice("/admin/".length), req, admin);
    }

    return fail(404, "not_found", "Ruta no encontrada.");
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.code, e.message);
    console.error(route, e);
    return fail(500, "server_error", "Error interno. Intenta otra vez en unos minutos.");
  }
});
