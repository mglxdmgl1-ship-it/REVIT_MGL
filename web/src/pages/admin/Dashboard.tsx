import { useState } from "react";
import { Link } from "react-router-dom";
import { Spinner, Tag } from "../../components/ui";
import { useQuery } from "../../lib/data";
import { dateTime, money, orderStatus } from "../../lib/format";
import { api } from "../../lib/supabase";
import { PageTitle } from "./common";
import { loadOrders, OrderModal } from "./Orders";

interface Stats { customers: number; active: number; trials: number; pending: number; revenue_total: number; revenue_month: number }

export default function Dashboard() {
  const { data: stats } = useQuery(() => api<{ stats: Stats }>("/admin/stats").then((r) => r.stats));
  const { data: orders, loading, reload } = useQuery(() => loadOrders("open", 20));
  const [sel, setSel] = useState<NonNullable<typeof orders>[number] | null>(null);

  const cards = [
    { label: "Ingresos del mes", value: stats ? money(stats.revenue_month) : "…", tone: "var(--green)" },
    { label: "Ingresos totales", value: stats ? money(stats.revenue_total) : "…", tone: "var(--blue)" },
    { label: "Licencias pagadas activas", value: stats?.active ?? "…", tone: "var(--purple)" },
    { label: "Pruebas en curso", value: stats?.trials ?? "…", tone: "var(--amber)" },
    { label: "Clientes registrados", value: stats?.customers ?? "…", tone: "var(--navy-600)" },
    { label: "Pagos por revisar", value: stats?.pending ?? "…", tone: "var(--red)" },
  ];

  return (
    <>
      <PageTitle title="Resumen" sub="Lo importante de un vistazo." />
      <div className="grid grid-3">
        {cards.map((c) => (
          <div key={c.label} className="card stat" style={{ borderTop: `4px solid ${c.tone}` }}>
            <b>{c.value}</b><span>{c.label}</span>
          </div>
        ))}
      </div>
      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-pad row between" style={{ paddingBottom: 8 }}>
          <h3 style={{ margin: 0 }}>Pagos por revisar</h3>
          <Link to="/admin/pedidos">Ver todos →</Link>
        </div>
        {loading ? <div className="empty"><Spinner /></div> : (orders ?? []).length === 0 ? <div className="empty">🎉 No hay pagos pendientes.</div> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Código</th><th>Cliente</th><th>Plan</th><th className="num">Monto</th><th>Estado</th><th>Fecha</th><th /></tr></thead>
              <tbody>
                {orders!.map((o) => (
                  <tr key={o.id}>
                    <td className="mono">{o.code}</td><td>{o.profile?.full_name || o.profile?.email}</td><td>{o.plan_name}</td>
                    <td className="num">{money(o.amount_pen)}</td>
                    <td><Tag tone={orderStatus[o.status].tone}>{orderStatus[o.status].label}</Tag></td>
                    <td className="small">{dateTime(o.created_at)}</td>
                    <td><button className="btn btn-sm btn-primary" onClick={() => setSel(o)}>Revisar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {sel && <OrderModal order={sel} onClose={() => setSel(null)} onChanged={reload} />}
    </>
  );
}
