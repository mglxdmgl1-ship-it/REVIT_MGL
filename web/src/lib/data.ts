import { useCallback, useEffect, useState } from "react";
import { supabase, type ContactSettings, type PaymentMethod, type Plan, type Release } from "./supabase";

/** Carga simple con recarga manual. */
export function useQuery<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const run = useCallback(fn, deps);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await run());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [run]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, error, loading, reload, setData };
}

async function unwrap<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as T;
}

/** Planes iniciales: se muestran si la base de datos no responde, para que la web nunca quede sin precios. */
export const FALLBACK_PLANS: Plan[] = [
  { id: "mensual", name: "Mensual", tagline: "Para un proyecto puntual", months: 1, days: 0, price_pen: 40, list_price_pen: null, devices: 1, badge: null, highlight: false, sort: 10, active: true,
    features: ["Las 31 herramientas de KAIZEN", "1 equipo (PC)", "Actualizaciones incluidas", "Soporte por WhatsApp"] },
  { id: "semestral", name: "Semestral", tagline: "Medio año sin preocuparte", months: 6, days: 0, price_pen: 200, list_price_pen: 240, devices: 1, badge: "Ahorra 17 %", highlight: false, sort: 30, active: true,
    features: ["Las 31 herramientas de KAIZEN", "1 equipo (PC)", "Actualizaciones incluidas", "Soporte prioritario"] },
  { id: "anual", name: "Anual", tagline: "La opción de los profesionales", months: 12, days: 0, price_pen: 300, list_price_pen: 480, devices: 1, badge: "Más elegido", highlight: true, sort: 40, active: true,
    features: ["Las 31 herramientas de KAIZEN", "1 equipo (PC)", "Actualizaciones incluidas", "Soporte prioritario", "Equivale a S/ 25 al mes"] },
];

export const fetchPlans = async () => {
  try {
    const rows = await unwrap<Plan[]>(supabase.from("kz_plans").select("*").eq("active", true).order("sort"));
    return rows.length ? rows : FALLBACK_PLANS;
  } catch {
    return FALLBACK_PLANS;
  }
};

export const fetchPaymentMethods = () =>
  unwrap<PaymentMethod[]>(supabase.from("kz_payment_methods").select("*").eq("active", true).order("sort"));

export const fetchLatestRelease = async () => {
  const rows = await unwrap<Release[]>(
    supabase.from("kz_releases").select("*").eq("published", true).eq("channel", "stable")
      .order("published_at", { ascending: false }).limit(1),
  );
  return rows[0] ?? null;
};

export async function fetchSetting<T>(key: string, fallback: T): Promise<T> {
  const { data } = await supabase.from("kz_settings").select("value").eq("key", key).maybeSingle();
  return { ...fallback, ...((data?.value as T) ?? {}) };
}

export const defaultContact: ContactSettings = {
  whatsapp: "51951230463",
  whatsapp_display: "951 230 463",
  email: "",
  hours: "Lun–Sáb, 9:00–19:00",
  whatsapp_message: "Hola, quiero información sobre KAIZEN para Revit.",
};

let contactCache: Promise<ContactSettings> | null = null;
export function fetchContact() {
  contactCache ??= fetchSetting<ContactSettings>("contact", defaultContact);
  return contactCache;
}
export function invalidateContact() {
  contactCache = null;
}

export function useContact() {
  const [contact, setContact] = useState<ContactSettings>(defaultContact);
  useEffect(() => {
    fetchContact().then(setContact).catch(() => undefined);
  }, []);
  return contact;
}
