// Operaciones del panel de administración que no pueden hacerse desde el navegador con RLS:
// entregar licencias, cambiar roles, desvincular equipos y firmar versiones del add-in.
import { fulfillOrder } from "./orders.ts";
import {
  addPlan, Caller, db, DAY_MS, fail, generateLicenseKey, HttpError, ok, signText, str,
} from "./shared.ts";

type Body = Record<string, unknown>;

const num = (v: unknown, def = 0) => (typeof v === "number" && isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && isFinite(Number(v)) ? Number(v) : def);

async function audit(admin: Caller, action: string, detail: string, licenseId: string | null = null, userId: string | null = null) {
  await db.from("kz_events").insert({ action: `admin.${action}`, detail: `${admin.email}: ${detail}`.slice(0, 500), license_id: licenseId, user_id: userId, ok: true });
}

export async function handleAdmin(op: string, req: Request, admin: Caller): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as Body;

  switch (op) {
    case "approve_order": {
      const order = await fulfillOrder(str(body.order_id, 60), admin.id, str(body.note, 500) || undefined);
      if (!order) return fail(404, "order_not_found", "No se encontró el pedido.");
      await audit(admin, op, `pedido ${order.code}`, order.license_id, order.user_id);
      return ok({ order });
    }

    case "reject_order": {
      const { data } = await db.from("kz_orders")
        .update({ status: "rejected", admin_note: str(body.note, 500) || "Pago no verificado", reviewed_by: admin.id })
        .eq("id", str(body.order_id, 60)).in("status", ["pending", "review"]).select().maybeSingle();
      if (!data) return fail(404, "order_not_found", "No se pudo rechazar el pedido.");
      await audit(admin, op, `pedido ${data.code}`, null, data.user_id);
      return ok({ order: data });
    }

    case "create_license": {
      // Venta directa (p. ej. pago en efectivo) o cortesía.
      let userId = str(body.user_id, 60);
      const email = str(body.email, 200).toLowerCase();
      if (!userId && email) {
        const { data: p } = await db.from("kz_profiles").select("id").ilike("email", email).maybeSingle();
        if (!p) return fail(404, "user_not_found", "Ese correo no tiene cuenta. Pide al cliente que se registre primero.");
        userId = p.id;
      }
      if (!userId) return fail(400, "bad_request", "Indica el cliente.");

      const planId = str(body.plan_id, 40) || null;
      const { data: plan } = planId ? await db.from("kz_plans").select("*").eq("id", planId).maybeSingle() : { data: null };
      const now = new Date();
      const days = num(body.days);
      const expires = days > 0 ? new Date(now.getTime() + days * DAY_MS) : plan ? addPlan(now, plan) : null;
      if (!expires) return fail(400, "bad_request", "Indica un plan o un número de días.");
      const isTrial = body.is_trial === true;
      const maxDevices = Math.max(1, Math.min(100, num(body.max_devices, plan?.devices ?? 1)));

      let lic = null;
      for (let i = 0; i < 5 && !lic; i++) {
        const { data, error } = await db.from("kz_licenses").insert({
          user_id: userId, license_key: await generateLicenseKey(), plan_id: plan?.id ?? null, is_trial: isTrial,
          duration_days: Math.round((expires.getTime() - now.getTime()) / DAY_MS),
          starts_at: now.toISOString(), expires_at: expires.toISOString(), max_devices: maxDevices,
          notes: str(body.note, 500) || null,
        }).select().single();
        if (error && !String(error.message).includes("duplicate")) throw new Error(error.message);
        lic = data;
      }

      const amount = num(body.amount_pen);
      if (lic && amount > 0) {
        await db.from("kz_orders").insert({
          user_id: userId, plan_id: plan?.id ?? "mensual", plan_name: plan?.name ?? "Manual", amount_pen: amount,
          method: str(body.method, 40) || "manual", method_name: str(body.method_name, 60) || "Venta directa",
          status: "paid", paid_at: now.toISOString(), license_id: lic.id, reviewed_by: admin.id,
          admin_note: str(body.note, 500) || null,
        });
      }
      await audit(admin, op, `licencia ${lic?.license_key}`, lic?.id ?? null, userId);
      return ok({ license: lic });
    }

    case "extend_license": {
      const id = str(body.license_id, 60);
      const days = num(body.days);
      if (!days) return fail(400, "bad_request", "Indica los días (pueden ser negativos).");
      const { data: lic } = await db.from("kz_licenses").select("*").eq("id", id).maybeSingle();
      if (!lic) return fail(404, "license_not_found", "Licencia no encontrada.");
      const now = new Date();
      const base = lic.expires_at && new Date(lic.expires_at) > now ? new Date(lic.expires_at) : now;
      const patch: Record<string, unknown> = { expires_at: new Date(base.getTime() + days * DAY_MS).toISOString() };
      if (!lic.starts_at) {
        patch.starts_at = now.toISOString();
      }
      const { data } = await db.from("kz_licenses").update(patch).eq("id", id).select().single();
      await audit(admin, op, `${lic.license_key} ${days > 0 ? "+" : ""}${days} días`, id, lic.user_id);
      return ok({ license: data });
    }

    case "set_license_expiry": {
      const id = str(body.license_id, 60);
      const date = new Date(str(body.expires_at, 40));
      if (isNaN(date.getTime())) return fail(400, "bad_request", "Fecha inválida.");
      const { data } = await db.from("kz_licenses").update({ expires_at: date.toISOString() }).eq("id", id).select().single();
      await audit(admin, op, `${data?.license_key} → ${date.toISOString()}`, id, data?.user_id ?? null);
      return ok({ license: data });
    }

    case "set_license_status": {
      const status = str(body.status, 20);
      if (!["active", "suspended", "revoked"].includes(status)) return fail(400, "bad_request", "Estado inválido.");
      const { data } = await db.from("kz_licenses").update({ status }).eq("id", str(body.license_id, 60)).select().single();
      await audit(admin, op, `${data?.license_key} → ${status}`, data?.id ?? null, data?.user_id ?? null);
      return ok({ license: data });
    }

    case "set_max_devices": {
      const max = Math.max(1, Math.min(100, num(body.max_devices, 1)));
      const { data } = await db.from("kz_licenses").update({ max_devices: max }).eq("id", str(body.license_id, 60)).select().single();
      await audit(admin, op, `${data?.license_key} → ${max} equipos`, data?.id ?? null, data?.user_id ?? null);
      return ok({ license: data });
    }

    case "reset_devices": {
      // Libera la licencia para que el cliente la active en otra PC (cambio de equipo).
      const id = str(body.license_id, 60);
      await db.from("kz_devices").delete().eq("license_id", id);
      await audit(admin, op, "equipos liberados", id);
      return ok();
    }

    case "set_device_active": {
      const { data } = await db.from("kz_devices").update({ active: body.active === true }).eq("id", str(body.device_id, 60)).select().single();
      await audit(admin, op, `${data?.computer_name || data?.machine_id} → ${body.active ? "activo" : "bloqueado"}`, data?.license_id ?? null);
      return ok({ device: data });
    }

    case "delete_device": {
      const { data } = await db.from("kz_devices").delete().eq("id", str(body.device_id, 60)).select().maybeSingle();
      await audit(admin, op, `${data?.computer_name || data?.machine_id}`, data?.license_id ?? null);
      return ok();
    }

    case "reset_trial": {
      // Permite que una PC vuelva a usar la prueba (cortesía).
      await db.from("kz_trials").delete().eq("machine_hash", str(body.machine_hash, 64).toLowerCase());
      await audit(admin, op, str(body.machine_hash, 64));
      return ok();
    }

    case "set_user_role": {
      const userId = str(body.user_id, 60);
      const role = str(body.role, 20);
      if (!["customer", "admin"].includes(role)) return fail(400, "bad_request", "Rol inválido.");
      if (userId === admin.id && role !== "admin") return fail(400, "bad_request", "No puedes quitarte el rol de administrador a ti mismo.");
      const { data } = await db.from("kz_profiles").update({ role }).eq("id", userId).select().single();
      await audit(admin, op, `${data?.email} → ${role}`, null, userId);
      return ok({ profile: data });
    }

    case "set_user_blocked": {
      const userId = str(body.user_id, 60);
      if (userId === admin.id) return fail(400, "bad_request", "No puedes bloquearte a ti mismo.");
      const { data } = await db.from("kz_profiles").update({ blocked: body.blocked === true }).eq("id", userId).select().single();
      await audit(admin, op, `${data?.email} → ${body.blocked ? "bloqueado" : "activo"}`, null, userId);
      return ok({ profile: data });
    }

    case "update_user": {
      const userId = str(body.user_id, 60);
      const patch: Record<string, string> = {};
      for (const k of ["full_name", "phone", "company"]) if (typeof body[k] === "string") patch[k] = str(body[k], 200);
      const { data } = await db.from("kz_profiles").update(patch).eq("id", userId).select().single();
      return ok({ profile: data });
    }

    case "publish_release": {
      const id = str(body.release_id, 60);
      const publish = body.published !== false;
      const { data: rel } = await db.from("kz_releases").select("*").eq("id", id).maybeSingle();
      if (!rel) return fail(404, "release_not_found", "Versión no encontrada.");
      if (publish && (!rel.download_url || !/^[a-f0-9]{64}$/i.test(rel.sha256))) {
        return fail(400, "bad_release", "La versión necesita URL de descarga y SHA-256 antes de publicarse.");
      }
      // El add-in solo instala lo que esta firma respalda: versión, hash y URL exactos.
      const signature = publish ? await signText(`${rel.version}|${rel.sha256.toLowerCase()}|${rel.download_url}`) : rel.signature;
      const { data } = await db.from("kz_releases").update({
        signature,
        sha256: rel.sha256.toLowerCase(),
        published: publish,
        published_at: publish ? (rel.published_at ?? new Date().toISOString()) : rel.published_at,
      }).eq("id", id).select().single();
      await audit(admin, op, `${rel.version} → ${publish ? "publicada" : "retirada"}`);
      return ok({ release: data });
    }

    case "stats": {
      const now = new Date().toISOString();
      const [{ count: customers }, { count: active }, { count: trials }, { count: pending }, paid] = await Promise.all([
        db.from("kz_profiles").select("*", { count: "exact", head: true }).eq("role", "customer"),
        db.from("kz_licenses").select("*", { count: "exact", head: true }).eq("status", "active").eq("is_trial", false).gt("expires_at", now),
        db.from("kz_licenses").select("*", { count: "exact", head: true }).eq("is_trial", true).gt("expires_at", now),
        db.from("kz_orders").select("*", { count: "exact", head: true }).in("status", ["pending", "review"]),
        db.from("kz_orders").select("amount_pen, paid_at").eq("status", "paid"),
      ]);
      const rows = paid.data ?? [];
      const monthStart = new Date();
      monthStart.setUTCDate(1);
      monthStart.setUTCHours(0, 0, 0, 0);
      const total = rows.reduce((s, r) => s + Number(r.amount_pen), 0);
      const month = rows.filter((r) => r.paid_at && new Date(r.paid_at) >= monthStart).reduce((s, r) => s + Number(r.amount_pen), 0);
      return ok({ stats: { customers, active, trials, pending, revenue_total: total, revenue_month: month } });
    }

    default:
      throw new HttpError(404, "not_found", `Operación desconocida: ${op}`);
  }
}
