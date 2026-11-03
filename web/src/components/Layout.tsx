import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useContact } from "../lib/data";
import { waLink } from "../lib/format";
import { LoadingPage, WhatsAppIcon } from "./ui";

export function Logo() {
  return (
    <Link to="/" className="logo" aria-label="KAIZEN, inicio">
      <span className="logo-mark">
        <svg width="20" height="20" viewBox="0 0 64 64" aria-hidden="true"><path d="M18 10v44M18 32l22-22M23 29l19 25" stroke="#fff" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" fill="none" /></svg>
      </span>
      <span>KAIZEN<small>PARA REVIT</small></span>
    </Link>
  );
}

export function Nav() {
  const { session, isAdmin, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const navigate = useNavigate();
  useEffect(() => setOpen(false), [loc.pathname, loc.hash]);

  return (
    <header className={`nav ${open ? "open" : ""}`}>
      <div className="container nav-inner">
        <Logo />
        <nav className="nav-links" aria-label="Principal">
          <a href="/#herramientas">Herramientas</a>
          <a href="/#como-funciona">Cómo funciona</a>
          <a href="/#precios">Precios</a>
          <a href="/#preguntas">Preguntas</a>
          <NavLink to="/descargar">Descargar</NavLink>
        </nav>
        <div className="nav-cta">
          {session ? (
            <>
              {isAdmin && <Link className="btn btn-sm btn-light" to="/admin">Panel admin</Link>}
              <Link className="btn btn-sm btn-light" to="/cuenta">Mi cuenta</Link>
              <button className="btn btn-sm btn-light" onClick={async () => { await signOut(); navigate("/"); }}>Salir</button>
            </>
          ) : (
            <>
              <Link className="btn btn-sm btn-light" to="/ingresar">Ingresar</Link>
              <Link className="btn btn-sm btn-accent" to="/registro">Probar gratis</Link>
            </>
          )}
        </div>
        <button className="nav-burger" onClick={() => setOpen(!open)} aria-label="Menú">☰</button>
      </div>
    </header>
  );
}

export function Footer() {
  const contact = useContact();
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <Logo />
            <p style={{ marginTop: 14, maxWidth: 320 }}>
              Suite de automatización BIM para Autodesk Revit 2025 o superior: acero, encofrados, metrados y documentación.
            </p>
          </div>
          <div>
            <h4>Producto</h4>
            <ul>
              <li><a href="/#herramientas">Herramientas</a></li>
              <li><a href="/#precios">Precios</a></li>
              <li><Link to="/descargar">Descargar</Link></li>
            </ul>
          </div>
          <div>
            <h4>Cuenta</h4>
            <ul>
              <li><Link to="/registro">Crear cuenta</Link></li>
              <li><Link to="/ingresar">Ingresar</Link></li>
              <li><Link to="/cuenta">Mis licencias</Link></li>
            </ul>
          </div>
          <div>
            <h4>Contacto</h4>
            <ul>
              <li><a href={waLink(contact.whatsapp, contact.whatsapp_message)} target="_blank" rel="noreferrer">WhatsApp {contact.whatsapp_display}</a></li>
              {contact.email && <li><a href={`mailto:${contact.email}`}>{contact.email}</a></li>}
              <li>{contact.hours}</li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} KAIZEN. Autodesk y Revit son marcas de Autodesk, Inc. KAIZEN no está afiliado a Autodesk.</span>
          <span><Link to="/terminos">Términos</Link> · <Link to="/privacidad">Privacidad</Link></span>
        </div>
      </div>
    </footer>
  );
}

export function WhatsAppFloat() {
  const contact = useContact();
  return (
    <a className="wa-float" href={waLink(contact.whatsapp, contact.whatsapp_message)} target="_blank" rel="noreferrer" aria-label="Escríbenos por WhatsApp">
      <WhatsAppIcon />
    </a>
  );
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <LoadingPage />;
  if (!session) return <Navigate to={`/ingresar?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  return <>{children}</>;
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { session, loading, profile, isAdmin } = useAuth();
  if (loading || (session && !profile)) return <LoadingPage />;
  if (!session) return <Navigate to="/ingresar?next=/admin" replace />;
  if (!isAdmin) return <Navigate to="/cuenta" replace />;
  return <>{children}</>;
}
