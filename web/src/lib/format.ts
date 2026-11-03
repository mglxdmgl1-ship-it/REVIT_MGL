export const money = (n: number | string | null | undefined) =>
  `S/ ${Number(n ?? 0).toLocaleString("es-PE", { minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

export const date = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export const dateTime = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString("es-PE", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

export function daysLeft(s: string | null | undefined): number | null {
  if (!s) return null;
  return Math.ceil((new Date(s).getTime() - Date.now()) / 86_400_000);
}

export function durationLabel(months: number, days: number): string {
  if (months > 0) {
    if (months % 12 === 0) return months === 12 ? "1 año" : `${months / 12} años`;
    return months === 1 ? "1 mes" : `${months} meses`;
  }
  return days === 1 ? "1 día" : `${days} días`;
}

export function perMonth(price: number, months: number): string | null {
  if (months <= 1) return null;
  return money(Math.round((price / months) * 100) / 100);
}

export const orderStatus: Record<string, { label: string; tone: string }> = {
  pending: { label: "Esperando pago", tone: "warn" },
  review: { label: "En revisión", tone: "info" },
  paid: { label: "Pagado", tone: "ok" },
  rejected: { label: "Rechazado", tone: "bad" },
  cancelled: { label: "Cancelado", tone: "muted" },
};

export function licenseState(l: { status: string; expires_at: string | null; starts_at: string | null; is_trial: boolean }) {
  if (l.status === "revoked") return { label: "Anulada", tone: "bad" };
  if (l.status === "suspended") return { label: "Suspendida", tone: "bad" };
  if (!l.starts_at) return { label: l.is_trial ? "Prueba sin activar" : "Sin activar", tone: "info" };
  const d = daysLeft(l.expires_at);
  if (d !== null && d <= 0) return { label: "Vencida", tone: "bad" };
  if (d !== null && d <= 5) return { label: `Vence en ${d} día${d === 1 ? "" : "s"}`, tone: "warn" };
  return { label: l.is_trial ? "Prueba activa" : "Activa", tone: "ok" };
}

export function waLink(phone: string, text: string) {
  const digits = (phone || "").replace(/\D/g, "");
  const full = digits.length === 9 ? `51${digits}` : digits;
  return `https://wa.me/${full}?text=${encodeURIComponent(text)}`;
}

export function bytes(n: number) {
  if (!n) return "—";
  const mb = n / 1024 / 1024;
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(n / 1024)} KB`;
}
