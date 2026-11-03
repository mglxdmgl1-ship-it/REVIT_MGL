import { useState } from "react";
import { useToast } from "../../components/ui";
import { api, ApiError } from "../../lib/supabase";

/** Ejecuta una operación /admin/<op> mostrando el resultado. */
export function useAdminOp() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function run<T = Record<string, unknown>>(op: string, body: Record<string, unknown>, okText?: string): Promise<T | null> {
    setBusy(true);
    try {
      const r = await api<T>(`/admin/${op}`, body);
      if (okText) toast(okText, "ok");
      return r;
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Error", "bad");
      return null;
    } finally {
      setBusy(false);
    }
  }
  return { run, busy };
}

export function PageTitle({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="row between" style={{ marginBottom: 20 }}>
      <div><h2 style={{ margin: 0 }}>{title}</h2>{sub && <div className="muted small">{sub}</div>}</div>
      <div className="row">{children}</div>
    </div>
  );
}

export async function sha256Hex(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const chassisIcon = (c: string) => (/laptop|notebook|portátil/i.test(c) ? "💻" : /desktop|tower|escritorio/i.test(c) ? "🖥️" : "🔲");
