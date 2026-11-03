import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Spinner } from "../components/ui";
import { useAuth } from "../lib/auth";
import { useContact } from "../lib/data";
import { waLink } from "../lib/format";
import { supabase } from "../lib/supabase";

function translate(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid login")) return "Correo o contraseña incorrectos.";
  if (m.includes("already registered") || m.includes("already been registered")) return "Ese correo ya tiene cuenta. Ingresa con tu contraseña.";
  if (m.includes("password should be")) return "La contraseña debe tener al menos 8 caracteres.";
  if (m.includes("rate limit")) return "Demasiados intentos. Espera unos minutos.";
  if (m.includes("email")) return "Revisa el correo ingresado.";
  return msg;
}

function useNext() {
  const [params] = useSearchParams();
  const next = params.get("next");
  return next && next.startsWith("/") ? next : "/cuenta";
}

export function Login() {
  const navigate = useNavigate();
  const next = useNext();
  const { session } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (session) navigate(next, { replace: true });
  }, [session, next, navigate]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setError(translate(error.message));
  }

  return (
    <div className="auth-wrap">
      <form className="card auth-card" onSubmit={submit}>
        <h2>Ingresar</h2>
        <p className="muted">Accede a tus licencias, descargas y pagos.</p>
        {error && <div className="alert alert-bad">{error}</div>}
        <label className="field"><span>Correo</span><input className="input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="field"><span>Contraseña</span><input className="input" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? <Spinner /> : "Ingresar"}</button>
        <div className="row between small" style={{ marginTop: 16 }}>
          <Link to="/recuperar">¿Olvidaste tu contraseña?</Link>
          <Link to={`/registro${next !== "/cuenta" ? `?next=${encodeURIComponent(next)}` : ""}`}>Crear cuenta</Link>
        </div>
      </form>
    </div>
  );
}

export function Register() {
  const navigate = useNavigate();
  const next = useNext();
  const { session } = useAuth();
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", password: "", accept: false });
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (session) navigate(next, { replace: true });
  }, [session, next, navigate]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (form.password.length < 8) return setError("La contraseña debe tener al menos 8 caracteres.");
    if (!form.accept) return setError("Debes aceptar los términos y la política de privacidad.");
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.password,
      options: { data: { full_name: form.full_name.trim(), phone: form.phone.trim() }, emailRedirectTo: `${location.origin}/cuenta` },
    });
    setBusy(false);
    if (error) return setError(translate(error.message));
    if (!data.session) setInfo("Te enviamos un correo para confirmar tu cuenta. Ábrelo y vuelve a ingresar.");
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  return (
    <div className="auth-wrap">
      <form className="card auth-card" onSubmit={submit}>
        <span className="eyebrow">3 días gratis · sin tarjeta</span>
        <h2 style={{ marginTop: 8 }}>Crea tu cuenta</h2>
        <p className="muted">En un minuto tendrás tu clave de prueba.</p>
        {error && <div className="alert alert-bad">{error}</div>}
        {info && <div className="alert alert-ok">{info}</div>}
        <label className="field"><span>Nombre completo</span><input className="input" required value={form.full_name} onChange={set("full_name")} autoComplete="name" /></label>
        <label className="field"><span>Correo</span><input className="input" type="email" required value={form.email} onChange={set("email")} autoComplete="email" /></label>
        <label className="field"><span>Celular (WhatsApp)</span><input className="input" type="tel" value={form.phone} onChange={set("phone")} placeholder="9XX XXX XXX" autoComplete="tel" /></label>
        <label className="field"><span>Contraseña</span><input className="input" type="password" required minLength={8} value={form.password} onChange={set("password")} autoComplete="new-password" /></label>
        <label className="check"><input type="checkbox" checked={form.accept} onChange={set("accept")} /> <span>Acepto los <Link to="/terminos" target="_blank">términos</Link> y la <Link to="/privacidad" target="_blank">política de privacidad</Link>, incluido el registro de datos de mi equipo para la licencia.</span></label>
        <button className="btn btn-accent btn-block btn-lg" disabled={busy}>{busy ? <Spinner /> : "Crear cuenta gratis"}</button>
        <p className="small center" style={{ marginTop: 16 }}>¿Ya tienes cuenta? <Link to="/ingresar">Ingresar</Link></p>
      </form>
    </div>
  );
}

export function Forgot() {
  const contact = useContact();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${location.origin}/nueva-clave` });
    setBusy(false);
    if (error) setError(translate(error.message));
    else setSent(true);
  }

  return (
    <div className="auth-wrap">
      <form className="card auth-card" onSubmit={submit}>
        <h2>Recuperar contraseña</h2>
        {sent ? (
          <div className="alert alert-ok">Si el correo está registrado, te llegará un enlace para crear una nueva contraseña. Revisa también la carpeta de spam.</div>
        ) : (
          <>
            {error && <div className="alert alert-bad">{error}</div>}
            <label className="field"><span>Correo de tu cuenta</span><input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            <button className="btn btn-primary btn-block" disabled={busy}>{busy ? <Spinner /> : "Enviar enlace"}</button>
          </>
        )}
        <p className="small muted" style={{ marginTop: 18 }}>
          ¿No te llega el correo? <a href={waLink(contact.whatsapp, `Hola, no puedo entrar a mi cuenta KAIZEN (${email || "mi correo"}).`)} target="_blank" rel="noreferrer">Escríbenos por WhatsApp</a> y te ayudamos.
        </p>
      </form>
    </div>
  );
}

export function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setError("Mínimo 8 caracteres.");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) setError(translate(error.message));
    else navigate("/cuenta");
  }

  return (
    <div className="auth-wrap">
      <form className="card auth-card" onSubmit={submit}>
        <h2>Nueva contraseña</h2>
        {error && <div className="alert alert-bad">{error}</div>}
        <label className="field"><span>Contraseña nueva</span><input className="input" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" /></label>
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? <Spinner /> : "Guardar"}</button>
      </form>
    </div>
  );
}
