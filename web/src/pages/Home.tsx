import { useState } from "react";
import { Link } from "react-router-dom";
import { Pricing } from "../components/Pricing";
import { Counter, Reveal } from "../components/ui";
import { useAuth } from "../lib/auth";
import { useContact } from "../lib/data";
import { waLink } from "../lib/format";
import { DOMAINS, TOOL_COUNT } from "../lib/tools";

function RevitMock() {
  const panels = [
    { name: "LOGIN", icons: ["Login_License", "Login_Settings"] },
    { name: "DATA", icons: ["Data_ToParams", "Data_RoomAssign", "Data_GridLocate", "Data_RebarTakeoff"] },
    { name: "MODELADO", icons: ["Modeling_RebarDesigner", "Modeling_BeamLongRebar", "Modeling_Stirrups", "Modeling_WallRebar", "Modeling_FormFinish", "Modeling_FastFloor"] },
    { name: "DOCUMENTACIÓN", icons: ["Documentation_Tagger", "Documentation_OneSheets"] },
    { name: "CALIDAD", icons: ["Quality_ViewFilter", "Quality_RebarSolidView"] },
  ];
  return (
    <div className="revit" aria-hidden="true">
      <div className="revit-title"><span className="r">R</span> Autodesk Revit 2025 — Edificio_Multifamiliar.rvt</div>
      <div className="revit-tabs"><span>Arquitectura</span><span>Estructura</span><span>Anotar</span><span className="on">KAIZEN</span><span>Vista</span></div>
      <div className="revit-ribbon">
        {panels.map((p) => (
          <div className="rpanel" key={p.name}>
            <div className="rpanel-icons">{p.icons.map((i) => <img key={i} src={`/icons/${i}_32.png`} alt="" />)}</div>
            <div className="rpanel-name">{p.name}</div>
          </div>
        ))}
      </div>
      <div className="revit-canvas">
        <svg viewBox="0 0 520 250" preserveAspectRatio="xMidYMid slice">
          <defs>
            <pattern id="g" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#e3e7ee" strokeWidth="1" /></pattern>
          </defs>
          <rect width="520" height="250" fill="url(#g)" />
          {/* Viga con armado */}
          <rect x="40" y="70" width="440" height="70" fill="#d9dee6" stroke="#8a94a3" />
          <line x1="50" y1="80" x2="470" y2="80" stroke="#c0392b" strokeWidth="3" />
          <line x1="50" y1="130" x2="470" y2="130" stroke="#c0392b" strokeWidth="3" />
          <line x1="50" y1="88" x2="150" y2="88" stroke="#e67e22" strokeWidth="2.5" />
          <line x1="370" y1="88" x2="470" y2="88" stroke="#e67e22" strokeWidth="2.5" />
          {Array.from({ length: 22 }, (_, i) => {
            const x = 56 + i * (i < 6 || i > 15 ? 14 : 22) + (i > 15 ? -40 : 0);
            return <rect key={i} x={Math.min(x, 462)} y="76" width="6" height="58" fill="none" stroke="#0f6fc5" strokeWidth="1.6" rx="1" />;
          })}
          {/* Columnas */}
          <rect x="30" y="140" width="40" height="110" fill="#cfd5de" stroke="#8a94a3" />
          <rect x="450" y="140" width="40" height="110" fill="#cfd5de" stroke="#8a94a3" />
          <text x="40" y="60" fontSize="12" fill="#3c4b5e" fontFamily="sans-serif">V-101 (30x60) · 3Ø5/8" + 2Ø1/2" bastón</text>
        </svg>
        <div className="toast-demo">
          <b>✔ Acero vigas · Eje B</b>
          4 tramos · 42 barras · 118 estribos creados
          <div className="bar"><i /></div>
        </div>
      </div>
    </div>
  );
}

const PAINS = [
  { ico: "⏳", bg: "#fff4dc", t: "Horas modelando acero barra por barra", d: "Estribos, bastones y empalmes a mano en cada viga y columna. Un cambio de sección y vuelves a empezar." },
  { ico: "📐", bg: "#e3f0fc", t: "Metrados que no cuadran", d: "Encofrados, tarrajeos, excavaciones y acero contados en Excel aparte, con errores que aparecen en obra." },
  { ico: "🗂️", bg: "#f3e8f8", t: "Planos y tablas que se llevan el día", d: "Etiquetar, exportar láminas y pasar tablas a Excel una por una cuando el plazo ya venció." },
];

const FAQ = [
  { q: "¿Qué versiones de Revit soporta?", a: "Autodesk Revit 2025 y superiores (2025, 2026 y 2027). El instalador detecta las versiones que tienes y se instala en todas." },
  { q: "¿Cómo funciona la prueba gratis de 3 días?", a: "Creas tu cuenta, generas tu clave de prueba y la pegas en KAIZEN dentro de Revit. Tienes las 31 herramientas completas durante 3 días. No pedimos tarjeta. La prueba es una por computadora." },
  { q: "¿Cómo pago?", a: "Por ahora con Yape: eliges tu plan, yapeas el monto y subes la captura. Verificamos el pago y tu licencia aparece en tu cuenta, normalmente en minutos dentro del horario de atención. Si tienes dudas, escríbenos por WhatsApp." },
  { q: "¿En cuántas computadoras puedo usarlo?", a: "Cada licencia queda vinculada a la placa base de una PC. Si cambias de computadora, escríbenos y la liberamos para que la actives en la nueva. Para oficinas existe el combo de 3 equipos." },
  { q: "¿Necesito internet?", a: "Para activar y luego una vez cada 5 días. Entre verificaciones KAIZEN funciona sin conexión. Si pasan más de 5 días sin verificar, se bloquea hasta que vuelva a conectarse." },
  { q: "¿Cómo recibo las actualizaciones?", a: "Automáticamente. Cuando publicamos una versión nueva, KAIZEN te avisa dentro de Revit, la descarga y la instala al cerrar Revit. No tienes que reinstalar nada." },
  { q: "¿Qué pasa cuando vence mi licencia?", a: "Las herramientas se bloquean, pero tus modelos quedan intactos: todo lo que KAIZEN creó son elementos nativos de Revit. Renuevas desde tu cuenta y se suma el tiempo a lo que te quedaba." },
  { q: "¿Reemplaza el criterio del ingeniero?", a: "No. KAIZEN automatiza el modelado y la documentación; recubrimientos, empalmes y espaciamientos son datos que tú defines. El diseño debe ser revisado por el profesional responsable." },
];

export default function Home() {
  const [domain, setDomain] = useState(DOMAINS[0].id);
  const d = DOMAINS.find((x) => x.id === domain)!;
  const { session } = useAuth();
  const contact = useContact();

  return (
    <>
      {/* ------------------------------------------------------------------ HERO */}
      <section className="hero">
        <div className="container hero-grid">
          <div>
            <div className="hero-badges">
              <span className="pill"><span className="dot" /> Revit 2025 · 2026 · 2027</span>
              <span className="pill">Hecho para concreto armado</span>
            </div>
            <h1>Modela el acero, el encofrado y el metrado <span className="grad">en minutos, no en días.</span></h1>
            <p className="lead">
              KAIZEN agrega a Revit {TOOL_COUNT} herramientas que convierten tu modelo estructural en refuerzo real, superficies medibles,
              tablas en Excel y planos listos. Menos clics, menos errores, más proyectos entregados.
            </p>
            <div className="hero-actions">
              <Link className="btn btn-accent btn-lg" to={session ? "/cuenta" : "/registro"}>Probar 3 días gratis</Link>
              <a className="btn btn-light btn-lg" href="#precios">Ver precios desde S/ 40</a>
            </div>
            <div className="hero-note">Sin tarjeta · Instalación en 2 minutos · Soporte por WhatsApp</div>
            <div className="hero-stats">
              <div><Counter to={TOOL_COUNT} /><span>herramientas en el ribbon</span></div>
              <div><Counter to={5} /><span>paneles de trabajo en una sola pestaña</span></div>
              <div><b>S/ 25</b><span>al mes con el plan anual</span></div>
            </div>
          </div>
          <RevitMock />
        </div>
      </section>

      <div className="strip">
        <div className="container strip-inner">
          <span>Acero en vigas, columnas, muros y zapatas</span>
          <span>Encofrado y tarrajeo medibles</span>
          <span>Excel ↔ parámetros</span>
          <span>Actualizaciones automáticas</span>
        </div>
      </div>

      {/* ------------------------------------------------------------------ DOLOR */}
      <section className="section">
        <div className="container">
          <Reveal className="center">
            <span className="eyebrow">El problema</span>
            <h2 className="section-title">Revit es potente. Pero el trabajo repetitivo te come el día.</h2>
            <p className="lead">Si haces estructuras, metrados o expedientes, ya conoces estas tareas:</p>
          </Reveal>
          <div className="grid grid-3" style={{ marginTop: 36 }}>
            {PAINS.map((p, i) => (
              <Reveal key={p.t} delay={i * 80}>
                <div className="pain">
                  <div className="ico" style={{ background: p.bg }}>{p.ico}</div>
                  <h3>{p.t}</h3>
                  <p className="muted" style={{ margin: 0 }}>{p.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal className="center">
            <p style={{ marginTop: 36, fontSize: "1.2rem", fontWeight: 700 }}>
              KAIZEN hace ese trabajo por ti, <span style={{ color: "var(--blue)" }}>directamente dentro de Revit.</span>
            </p>
          </Reveal>
        </div>
      </section>

      {/* ------------------------------------------------------------------ HERRAMIENTAS */}
      <section className="section" id="herramientas" style={{ background: "var(--surface)", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)" }}>
        <div className="container">
          <Reveal className="center">
            <span className="eyebrow">Todo en una sola pestaña</span>
            <h2 className="section-title">{TOOL_COUNT} herramientas organizadas como trabajas</h2>
            <p className="lead">Cada panel del ribbon responde una pregunta del proyecto. Elige uno:</p>
          </Reveal>
          <div className="domain-tabs" role="tablist">
            {DOMAINS.map((x) => (
              <button key={x.id} role="tab" aria-selected={x.id === domain}
                className={`domain-tab ${x.id === domain ? "on" : ""}`}
                style={x.id === domain ? { background: x.color } : undefined}
                onClick={() => setDomain(x.id)}>
                <i style={{ background: x.id === domain ? "#fff" : x.color }} /> {x.name} · {x.tools.length}
              </button>
            ))}
          </div>
          <div className="domain-panel">
            <div className="domain-intro" style={{ background: `linear-gradient(135deg, ${d.color}, #0b1b2e)` }}>
              <span className="eyebrow" style={{ color: "rgba(255,255,255,.8)" }}>Panel {d.name.toUpperCase()}</span>
              <h3>{d.question}</h3>
              <p>{d.intro}</p>
              <Link to="/registro" className="btn btn-light" style={{ marginTop: 8 }}>Probarlas gratis →</Link>
            </div>
            <div className="tool-list">
              {d.tools.map((t) => (
                <div className="tool" key={t.id}>
                  <img src={`/icons/${t.id}_32.png`} alt="" />
                  <div><b>{t.name}</b><span>{t.desc}</span></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ CÓMO FUNCIONA */}
      <section className="section" id="como-funciona">
        <div className="container">
          <Reveal className="center">
            <span className="eyebrow">Empieza hoy</span>
            <h2 className="section-title">De cero a trabajando en 3 pasos</h2>
          </Reveal>
          <div className="grid grid-3 steps" style={{ marginTop: 50 }}>
            {[
              { t: "Crea tu cuenta y tu clave de prueba", d: "Regístrate con tu correo. En tu cuenta generas al instante una clave de prueba de 3 días." },
              { t: "Descarga e instala", d: "Un instalador para Windows que detecta tus versiones de Revit (2025 o superior). Listo en 2 minutos." },
              { t: "Activa y trabaja", d: "Abre Revit → pestaña KAIZEN → Área personal, pega tu clave y empieza. ¿Te gustó? Elige un plan y pagas con Yape." },
            ].map((s, i) => (
              <Reveal key={s.t} delay={i * 90}>
                <div className="card step"><h3>{s.t}</h3><p className="muted" style={{ margin: 0 }}>{s.d}</p></div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ COMPARATIVA */}
      <section className="section-sm">
        <div className="container">
          <Reveal className="center">
            <h2 className="section-title">¿Por qué KAIZEN?</h2>
          </Reveal>
          <Reveal>
            <div className="table-wrap" style={{ marginTop: 26 }}>
              <table className="compare">
                <thead><tr><th>Tarea</th><th>Revit solo</th><th>Con KAIZEN</th></tr></thead>
                <tbody>
                  <tr><td>Acero longitudinal de un pórtico</td><td className="no">Barra por barra, tramo por tramo</td><td className="yes">Por eje, cruzando nudos, con empalmes</td></tr>
                  <tr><td>Estribos de columnas en tres zonas</td><td className="no">Calcular zonas y distribuir a mano</td><td className="yes">Automático según la viga que llega</td></tr>
                  <tr><td>Encofrado y tarrajeo para el metrado</td><td className="no">Modelar caras o medir en CAD</td><td className="yes">Superficies generadas y medibles</td></tr>
                  <tr><td>Datos de Excel a parámetros</td><td className="no">Copiar y pegar elemento por elemento</td><td className="yes">Carga masiva con vista previa</td></tr>
                  <tr><td>Exportar láminas y tablas</td><td className="no">Una por una</td><td className="yes">En lote, con nombres ordenados</td></tr>
                  <tr><td>Actualizaciones</td><td className="no">—</td><td className="yes">Automáticas al cerrar Revit</td></tr>
                </tbody>
              </table>
            </div>
          </Reveal>
        </div>
      </section>

      <Pricing />

      {/* ------------------------------------------------------------------ FAQ */}
      <section className="section" id="preguntas">
        <div className="container">
          <Reveal className="center">
            <span className="eyebrow">Resolvemos tus dudas</span>
            <h2 className="section-title">Preguntas frecuentes</h2>
          </Reveal>
          <div className="faq">
            {FAQ.map((f) => (
              <details key={f.q}><summary>{f.q}</summary><p>{f.a}</p></details>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ CTA */}
      <section className="section-sm">
        <div className="container">
          <Reveal>
            <div className="cta-band">
              <h2 className="section-title">Tu próximo proyecto puede salir más rápido.</h2>
              <p className="lead" style={{ margin: "0 auto 26px" }}>Pruébalo 3 días con todas las herramientas. Si no te ahorra tiempo, no pagas nada.</p>
              <div className="row" style={{ justifyContent: "center" }}>
                <Link className="btn btn-accent btn-lg" to={session ? "/cuenta" : "/registro"}>Empezar mi prueba gratis</Link>
                <a className="btn btn-wa btn-lg" href={waLink(contact.whatsapp, contact.whatsapp_message)} target="_blank" rel="noreferrer">Hablar por WhatsApp</a>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
