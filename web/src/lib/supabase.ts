import { createClient } from "@supabase/supabase-js";

// La URL y la clave publicable NO son secretas: están pensadas para ir en el navegador y la
// seguridad la ponen las políticas RLS y la Edge Function. Se pueden sobrescribir por entorno.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "https://jecvalnflhtxfnvjdgcm.supabase.co";
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY ?? "sb_publishable_11frTEtS5O2UcgMrLp2_Xg_JZnEcLnq";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1/kaizen`;

export class ApiError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

/** Llama a la Edge Function `kaizen` con la sesión actual. */
export async function api<T = Record<string, unknown>>(path: string, body: unknown = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(`${FUNCTIONS_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_KEY,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({ ok: false, code: "network", message: "No se pudo conectar con el servidor." }));
  if (!res.ok || json.ok === false) throw new ApiError(json.code ?? "error", json.message ?? "Ocurrió un error.");
  return json as T;
}

// ---------------------------------------------------------------------------------------------
// Tipos de la base de datos
// ---------------------------------------------------------------------------------------------
export interface Plan {
  id: string;
  name: string;
  tagline: string;
  months: number;
  days: number;
  price_pen: number;
  list_price_pen: number | null;
  devices: number;
  badge: string | null;
  highlight: boolean;
  features: string[];
  sort: number;
  active: boolean;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  company: string;
  role: "customer" | "admin";
  blocked: boolean;
  created_at: string;
}

export interface License {
  id: string;
  user_id: string;
  license_key: string;
  plan_id: string | null;
  is_trial: boolean;
  status: "active" | "suspended" | "revoked";
  duration_days: number;
  starts_at: string | null;
  expires_at: string | null;
  max_devices: number;
  notes: string | null;
  created_at: string;
}

export interface Device {
  id: string;
  license_id: string;
  machine_hash: string;
  machine_id: string;
  label: string;
  computer_name: string;
  windows_user: string;
  manufacturer: string;
  model: string;
  chassis: string;
  cpu: string;
  ram_gb: number | null;
  board: string;
  os: string;
  revit_version: string;
  addin_version: string;
  first_ip: string;
  last_ip: string;
  hardware: Record<string, unknown>;
  active: boolean;
  first_seen: string;
  last_seen: string;
}

export interface Order {
  id: string;
  code: string;
  user_id: string;
  plan_id: string;
  plan_name: string;
  amount_pen: number;
  method: string;
  method_name: string;
  status: "pending" | "review" | "paid" | "rejected" | "cancelled";
  provider_ref: string | null;
  operation_code: string | null;
  voucher_path: string | null;
  customer_note: string | null;
  admin_note: string | null;
  renew_license_id: string | null;
  license_id: string | null;
  created_at: string;
  paid_at: string | null;
}

export interface PaymentMethod {
  id: string;
  name: string;
  kind: "wallet" | "bank" | "cash" | "other";
  holder: string;
  account: string;
  account_alt: string;
  instructions: string;
  qr_url: string;
  requires_voucher: boolean;
  active: boolean;
  sort: number;
}

export interface Release {
  id: string;
  version: string;
  channel: "stable" | "beta";
  revit_versions: string[];
  notes: string;
  download_url: string;
  sha256: string;
  size_bytes: number;
  signature: string | null;
  mandatory: boolean;
  published: boolean;
  published_at: string | null;
  created_at: string;
}

export interface EventRow {
  id: number;
  license_id: string | null;
  user_id: string | null;
  machine_hash: string | null;
  action: string;
  ok: boolean;
  detail: string | null;
  ip: string | null;
  created_at: string;
}

export interface ContactSettings {
  whatsapp: string;
  whatsapp_display: string;
  email: string;
  hours: string;
  whatsapp_message: string;
}
