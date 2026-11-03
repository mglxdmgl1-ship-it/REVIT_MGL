// Activación y verificación periódica de licencias desde el add-in.
//
// El add-in envía la clave y la huella de la placa base (SHA-256 de datos SMBIOS) junto con el
// inventario del equipo. La respuesta lleva un token firmado con ECDSA que el add-in verifica sin
// conexión con la clave pública embebida. El token caduca para uso a los N días (5 por defecto):
// pasado ese plazo el add-in se bloquea hasta que vuelva a verificar en línea.
import {
  clientIp, DAY_MS, db, fail, normalizeKey, ok, setting, signToken, str,
} from "./shared.ts";

interface MachineInfo {
  hash?: string;
  id?: string;
  label?: string;
  computerName?: string;
  windowsUser?: string;
  manufacturer?: string;
  model?: string;
  chassis?: string;
  cpu?: string;
  ramGb?: number;
  board?: string;
  os?: string;
  hardware?: Record<string, unknown>;
}

interface LicenseBody {
  key?: string;
  machine?: MachineInfo;
  revit?: string;
  version?: string;
}

function deviceFields(m: MachineInfo, body: LicenseBody) {
  const hw = m.hardware && typeof m.hardware === "object" ? m.hardware : {};
  return {
    machine_id: str(m.id, 40),
    label: str(m.label, 200),
    computer_name: str(m.computerName, 100),
    windows_user: str(m.windowsUser, 100),
    manufacturer: str(m.manufacturer, 100),
    model: str(m.model, 150),
    chassis: str(m.chassis, 40),
    cpu: str(m.cpu, 150),
    ram_gb: typeof m.ramGb === "number" && isFinite(m.ramGb) ? Math.round(m.ramGb * 10) / 10 : null,
    board: str(m.board, 150),
    os: str(m.os, 150),
    revit_version: str(body.revit, 20),
    addin_version: str(body.version, 30),
    // Inventario libre (GPU, disco, BIOS…). Se descarta si es desproporcionado.
    hardware: JSON.stringify(hw).length <= 4000 ? hw : {},
  };
}

export async function handleLicense(req: Request, mode: "activate" | "validate"): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as LicenseBody;
  const ip = clientIp(req);
  const m = body.machine ?? {};
  const hash = (m.hash ?? "").toLowerCase();

  if (!/^[a-f0-9]{64}$/.test(hash)) {
    return fail(400, "bad_request", "Solicitud inválida: falta la huella del equipo.");
  }

  const key = normalizeKey(body.key);

  const { data: lic } = await db
    .from("kz_licenses")
    .select("*, profile:kz_profiles(email, full_name, blocked), plan:kz_plans(name)")
    .eq("license_key", key)
    .maybeSingle();

  const log = (action: string, okFlag: boolean, detail: string) =>
    db.from("kz_events").insert({
      license_id: lic?.id ?? null,
      user_id: lic?.user_id ?? null,
      machine_hash: hash,
      action,
      ok: okFlag,
      detail: detail.slice(0, 500),
      ip,
    });

  if (!lic) {
    await log(mode, false, `invalid_key ${key.slice(0, 30)}`);
    return fail(404, "invalid_key", "La clave no existe. Cópiala tal cual desde tu cuenta en la web de KAIZEN.");
  }

  if (lic.profile?.blocked) {
    await log(mode, false, "account_blocked");
    return fail(403, "account_blocked", "La cuenta dueña de esta licencia está bloqueada. Escríbenos por WhatsApp.");
  }

  if (lic.status !== "active") {
    await log(mode, false, `status_${lic.status}`);
    return fail(403, "revoked",
      lic.status === "suspended"
        ? "Esta licencia está suspendida. Escríbenos por WhatsApp para reactivarla."
        : "Esta licencia fue anulada.");
  }

  const now = new Date();

  // Dispositivos de la licencia
  const { data: devices } = await db.from("kz_devices").select("*").eq("license_id", lic.id);
  const device = (devices ?? []).find((d) => d.machine_hash === hash);

  if (device && !device.active) {
    await log(mode, false, "device_blocked");
    return fail(403, "device_blocked", "Esta PC fue desvinculada de la licencia por el administrador.");
  }

  if (!device) {
    if (mode === "validate") {
      await log(mode, false, "device_not_registered");
      return fail(403, "device_not_registered", "Esta PC ya no está vinculada a la licencia. Actívala otra vez con tu clave.");
    }

    const activeCount = (devices ?? []).filter((d) => d.active).length;
    if (activeCount >= lic.max_devices) {
      await log(mode, false, "device_limit");
      return fail(403, "device_limit",
        lic.max_devices === 1
          ? "Esta licencia ya está vinculada a otra PC. Cada licencia funciona en un solo equipo; para cambiarla de PC escríbenos por WhatsApp."
          : `Esta licencia ya está vinculada a ${lic.max_devices} PCs, su máximo.`);
    }

    // Una prueba gratuita por placa base.
    if (lic.is_trial) {
      const { data: trial } = await db.from("kz_trials").select("license_id").eq("machine_hash", hash).maybeSingle();
      if (trial && trial.license_id !== lic.id) {
        await log(mode, false, "trial_used");
        return fail(403, "trial_used",
          "Esta PC ya usó su prueba gratuita. Elige un plan en la web para seguir usando KAIZEN.");
      }
    }
  }

  // La duración empieza a contar en la primera activación (pruebas y licencias manuales).
  if (!lic.starts_at) {
    const startsAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + Math.max(1, lic.duration_days) * DAY_MS).toISOString();
    await db.from("kz_licenses").update({ starts_at: startsAt, expires_at: expiresAt }).eq("id", lic.id).is("starts_at", null);
    lic.starts_at = startsAt;
    lic.expires_at = expiresAt;
  }

  if (lic.expires_at && new Date(lic.expires_at) <= now) {
    await log(mode, false, "expired");
    return fail(403, "expired",
      lic.is_trial
        ? "Tu prueba gratuita terminó. Elige un plan en la web para seguir usando KAIZEN."
        : "Tu licencia venció. Renuévala en la web para seguir usando KAIZEN.",
      { expires_at: lic.expires_at });
  }

  const fields = deviceFields(m, body);

  if (device) {
    // Solo se pisan los datos que llegan con valor: una verificación con inventario parcial no
    // debe borrar lo que se registró al activar.
    const changed = Object.fromEntries(
      Object.entries(fields).filter(([, v]) =>
        v !== null && v !== "" && !(typeof v === "object" && Object.keys(v as object).length === 0)),
    );
    await db.from("kz_devices").update({ ...changed, last_seen: now.toISOString(), last_ip: ip }).eq("id", device.id);
  } else {
    const { error } = await db.from("kz_devices").insert({
      license_id: lic.id,
      machine_hash: hash,
      ...fields,
      first_ip: ip,
      last_ip: ip,
    });
    if (error && !String(error.message).includes("duplicate")) {
      await log(mode, false, `device_insert ${error.message}`);
      return fail(500, "server_error", "No se pudo registrar el equipo. Intenta otra vez.");
    }
    if (lic.is_trial) {
      await db.from("kz_trials").upsert(
        { machine_hash: hash, user_id: lic.user_id, license_id: lic.id },
        { onConflict: "machine_hash", ignoreDuplicates: true },
      );
    }
  }

  const licensing = await setting<{ check_interval_days?: number }>("licensing");
  const interval = Math.min(30, Math.max(1, Number(licensing.check_interval_days ?? 5)));

  const payload = {
    v: 1,
    kid: "kz1",
    lid: lic.id,
    key: lic.license_key,
    mid: hash,
    sub: lic.profile?.email ?? "",
    name: lic.profile?.full_name ?? "",
    plan: lic.is_trial ? "Prueba gratuita" : (lic.plan?.name ?? "Licencia"),
    trial: lic.is_trial,
    dev: lic.max_devices,
    exp: new Date(lic.expires_at).toISOString(),
    iat: now.toISOString(),
    chk: new Date(now.getTime() + interval * DAY_MS).toISOString(),
  };

  const token = await signToken(payload);
  await log(mode, true, `${body.revit ?? ""} ${body.version ?? ""}`.trim());

  return ok({ token, license: payload });
}
