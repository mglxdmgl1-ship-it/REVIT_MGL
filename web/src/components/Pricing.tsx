import { Link } from "react-router-dom";
import { fetchPlans, useQuery } from "../lib/data";
import { durationLabel, money, perMonth } from "../lib/format";
import type { Plan } from "../lib/supabase";
import { Reveal, Spinner } from "./ui";

export function PlanCard({ plan, cta = "Elegir plan", to }: { plan: Plan; cta?: string; to?: string }) {
  const per = perMonth(Number(plan.price_pen), plan.months);
  const saving = plan.list_price_pen && Number(plan.list_price_pen) > Number(plan.price_pen)
    ? Math.round((1 - Number(plan.price_pen) / Number(plan.list_price_pen)) * 100) : 0;
  return (
    <div className={`plan ${plan.highlight ? "hl" : ""}`}>
      {plan.badge && <span className="plan-badge">{plan.badge}</span>}
      <h3>{plan.name}</h3>
      <div className="muted small">{plan.tagline}</div>
      <div className="plan-price">
        <b>{money(plan.price_pen)}</b>
        {plan.list_price_pen && Number(plan.list_price_pen) > Number(plan.price_pen) && <s>{money(plan.list_price_pen)}</s>}
      </div>
      <div className="plan-per muted">
        {durationLabel(plan.months, plan.days)}
        {plan.devices > 1 ? ` · ${plan.devices} equipos` : " · 1 equipo"}
        {per && <> · <b>{per}/mes</b></>}
        {saving > 0 && <> · ahorras {saving}%</>}
      </div>
      <ul className="plan-feats">
        {(plan.features ?? []).map((f) => <li key={f}>{f}</li>)}
      </ul>
      <Link className={`btn btn-block ${plan.highlight ? "btn-accent" : "btn-primary"}`} to={to ?? `/comprar/${plan.id}`}>{cta}</Link>
    </div>
  );
}

export function Pricing() {
  const { data: plans, loading, error } = useQuery(fetchPlans);
  return (
    <section className="section pricing" id="precios">
      <div className="container center">
        <Reveal>
          <span className="eyebrow">Precios en soles · sin costos ocultos</span>
          <h2 className="section-title">Elige cuánto tiempo quieres trabajar más rápido</h2>
          <p className="lead">Todas las licencias incluyen las 31 herramientas y todas las actualizaciones mientras esté vigente. Empieza con 3 días gratis y paga solo si te convence.</p>
        </Reveal>
        {loading && <div style={{ marginTop: 40 }}><Spinner /></div>}
        {error && <div className="alert alert-bad" style={{ marginTop: 30 }}>No se pudieron cargar los planes. Recarga la página.</div>}
        <div className="plans" style={{ textAlign: "left" }}>
          {(plans ?? []).map((p, i) => (
            <Reveal key={p.id} delay={i * 70}><PlanCard plan={p} /></Reveal>
          ))}
        </div>
        <div className="guarantee">
          <span>🎁 Prueba de 3 días sin tarjeta</span>
          <span>📲 Paga con Yape en segundos</span>
          <span>🔄 Actualizaciones automáticas incluidas</span>
          <span>💬 Soporte directo por WhatsApp</span>
        </div>
      </div>
    </section>
  );
}
