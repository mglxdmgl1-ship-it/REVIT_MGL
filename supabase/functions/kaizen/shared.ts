// Utilidades comunes de la Edge Function `kaizen`: cliente con service role, respuestas JSON,
// firma ECDSA P-256 y formato de claves compatible con Kaizen.Login.LicenseKey (C#).
import { createClient } from "jsr:@supabase/supabase-js@2";

export const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

export const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-kaizen-client",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
  });
}

export const ok = (body: Record<string, unknown> = {}) => json(200, { ok: true, ...body });

export const fail = (status: number, code: string, message: string, extra: Record<string, unknown> = {}) =>
  json(status, { ok: false, code, message, ...extra });

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim().slice(0, 64);
  return (req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? "").slice(0, 64);
}

// ---------------------------------------------------------------------------------------------
// Sesión del usuario (web)
// ---------------------------------------------------------------------------------------------
export interface Caller {
  id: string;
  email: string;
  role: "customer" | "admin";
  blocked: boolean;
  full_name: string;
}

export async function requireUser(req: Request): Promise<Caller> {
  const auth = req.headers.get("authorization") ?? "";
  const jwt = auth.replace(/^Bearer\s+/i, "");
  if (!jwt) throw new HttpError(401, "unauthorized", "Inicia sesión para continuar.");

  const { data, error } = await db.auth.getUser(jwt);
  if (error || !data.user) throw new HttpError(401, "unauthorized", "Tu sesión expiró. Vuelve a ingresar.");

  const { data: profile } = await db
    .from("kz_profiles")
    .select("id, email, role, blocked, full_name")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!profile) {
    // Usuario creado antes del trigger: se crea el perfil al vuelo.
    const created = {
      id: data.user.id,
      email: data.user.email ?? "",
      full_name: (data.user.user_metadata?.full_name as string) ?? "",
      role: "customer" as const,
      blocked: false,
    };
    await db.from("kz_profiles").insert(created);
    return created;
  }

  if (profile.blocked) throw new HttpError(403, "account_blocked", "Tu cuenta está bloqueada. Escríbenos por WhatsApp.");
  return profile as Caller;
}

export async function requireAdmin(req: Request): Promise<Caller> {
  const user = await requireUser(req);
  if (user.role !== "admin") throw new HttpError(403, "forbidden", "Solo el administrador puede hacer esto.");
  return user;
}

// ---------------------------------------------------------------------------------------------
// Ajustes
// ---------------------------------------------------------------------------------------------
export async function setting<T = Record<string, unknown>>(key: string): Promise<T> {
  const { data } = await db.from("kz_settings").select("value").eq("key", key).maybeSingle();
  return (data?.value ?? {}) as T;
}

// ---------------------------------------------------------------------------------------------
// Firma
// ---------------------------------------------------------------------------------------------
let keyPromise: Promise<CryptoKey> | null = null;

function signingKey(): Promise<CryptoKey> {
  if (!keyPromise) {
    keyPromise = (async () => {
      const { data, error } = await db.rpc("kz_signing_key");
      if (error || !data) throw new Error("No se encontró la clave de firma (vault: kz_signing_jwk).");
      const jwk = JSON.parse(data as string);
      return await crypto.subtle.importKey(
        "jwk",
        { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d, ext: true },
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["sign"],
      );
    })().catch((e) => {
      keyPromise = null;
      throw e;
    });
  }
  return keyPromise;
}

export function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const enc = new TextEncoder();

/** Firma ECDSA P-256/SHA-256 en formato IEEE P1363 (r‖s, 64 bytes), base64url. */
export async function signText(text: string): Promise<string> {
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, await signingKey(), enc.encode(text));
  return b64url(new Uint8Array(sig));
}

/** token = base64url(json) + "." + firma(base64url(json)) */
export async function signToken(payload: Record<string, unknown>): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  return `${body}.${await signText(body)}`;
}

// ---------------------------------------------------------------------------------------------
// Claves KZ-AAAAA-BBBBB-CCCCC-DDDDD (mismo verificador que LicenseKey.cs)
// ---------------------------------------------------------------------------------------------
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const SALT = "KAIZEN-REVIT-2025";

async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(text)));
}

export async function generateLicenseKey(): Promise<string> {
  const rnd = crypto.getRandomValues(new Uint8Array(15));
  const group = (o: number) => Array.from(rnd.slice(o, o + 5), (b) => ALPHABET[b % ALPHABET.length]).join("");
  const a = group(0), b = group(5), c = group(10);
  const h = await sha256(`${SALT}|${a}|${b}|${c}`);
  const d = Array.from(h.slice(0, 5), (x) => ALPHABET[x % ALPHABET.length]).join("");
  return `KZ-${a}-${b}-${c}-${d}`;
}

export function normalizeKey(key: unknown): string {
  const raw = typeof key === "string" ? key : "";
  let clean = raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (clean.startsWith("KZ")) clean = clean.slice(2);
  if (clean.length !== 20) return raw.trim().toUpperCase();
  return "KZ-" + [0, 1, 2, 3].map((i) => clean.slice(i * 5, i * 5 + 5)).join("-");
}

// ---------------------------------------------------------------------------------------------
// Fechas
// ---------------------------------------------------------------------------------------------
export interface PlanRow {
  id: string;
  name: string;
  months: number;
  days: number;
  price_pen: number;
  devices: number;
  active: boolean;
}

export function addPlan(from: Date, plan: { months: number; days: number }): Date {
  const d = new Date(from.getTime());
  if (plan.months > 0) d.setUTCMonth(d.getUTCMonth() + plan.months);
  if (plan.days > 0) d.setUTCDate(d.getUTCDate() + plan.days);
  return d;
}

export const DAY_MS = 86_400_000;

export function str(v: unknown, max = 200): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}
