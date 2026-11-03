import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { supabase } from "../../lib/supabase";

const LINKS = [
  { to: "/admin", label: "Resumen", ico: "📊", end: true },
  { to: "/admin/pedidos", label: "Pedidos y pagos", ico: "🧾", badge: true },
  { to: "/admin/clientes", label: "Clientes", ico: "👥" },
  { to: "/admin/licencias", label: "Licencias", ico: "🔑" },
  { to: "/admin/equipos", label: "Equipos", ico: "💻" },
  { to: "/admin/actividad", label: "Actividad", ico: "📜" },
  { title: "Configuración" },
  { to: "/admin/planes", label: "Planes y precios", ico: "🏷️" },
  { to: "/admin/metodos", label: "Métodos de pago", ico: "💳" },
  { to: "/admin/versiones", label: "Versiones del add-in", ico: "🚀" },
  { to: "/admin/ajustes", label: "Ajustes", ico: "⚙️" },
];

export default function AdminLayout() {
  const [pending, setPending] = useState(0);
  useEffect(() => {
    const load = () =>
      supabase.from("kz_orders").select("*", { count: "exact", head: true }).in("status", ["pending", "review"])
        .then(({ count }) => setPending(count ?? 0));
    void load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="admin">
      <aside className="side">
        {LINKS.map((l, i) =>
          "title" in l ? <div key={i} className="side-title">{l.title}</div> : (
            <NavLink key={l.to} to={l.to!} end={l.end}>
              <span>{l.ico}</span> {l.label}
              {l.badge && pending > 0 && <span className="badge">{pending}</span>}
            </NavLink>
          ))}
      </aside>
      <main className="admin-main"><Outlet /></main>
    </div>
  );
}
