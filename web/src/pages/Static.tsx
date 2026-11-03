import { Link } from "react-router-dom";
import { DownloadCard } from "./Account";
import { useAuth } from "../lib/auth";
import { useContact } from "../lib/data";

export function DownloadPage() {
  const { session } = useAuth();
  return (
    <>
      <div className="page-head"><div className="container"><h1>Descargar KAIZEN</h1><p>Instalador para Windows · Autodesk Revit 2025, 2026 y 2027</p></div></div>
      <div className="container page-body">
        <div className="grid grid-2" style={{ alignItems: "start" }}>
          <DownloadCard />
          <div className="card card-pad prose">
            <h3>Requisitos</h3>
            <ul>
              <li>Windows 10 u 11 de 64 bits.</li>
              <li>Autodesk Revit 2025 o superior instalado.</li>
              <li>Conexión a internet para activar y una vez cada 5 días.</li>
            </ul>
            <h3>¿Aún no tienes clave?</h3>
            <p>Crea tu cuenta y genera tu clave de prueba de 3 días gratis.</p>
            <Link className="btn btn-accent" to={session ? "/cuenta" : "/registro"}>{session ? "Ir a mi cuenta" : "Crear cuenta gratis"}</Link>
            <h3 style={{ marginTop: 24 }}>Actualizaciones</h3>
            <p>No necesitas volver a esta página: KAIZEN te avisa dentro de Revit cuando hay una versión nueva y la instala al cerrar Revit.</p>
          </div>
        </div>
      </div>
    </>
  );
}

export function Privacy() {
  const contact = useContact();
  return (
    <div className="container section prose">
      <h1>Política de privacidad</h1>
      <p className="muted">Última actualización: noviembre de 2026. Se aplica la Ley N.º 29733, Ley de Protección de Datos Personales del Perú, y su reglamento.</p>
      <h2>1. Qué datos tratamos</h2>
      <ul>
        <li><b>Cuenta:</b> nombre, correo, celular y empresa (opcional).</li>
        <li><b>Pagos:</b> plan, monto, método, número de operación y la captura del comprobante que subas.</li>
        <li><b>Equipo donde activas KAIZEN:</b> una huella irreversible (hash) de la placa base, nombre del equipo, usuario de Windows, fabricante, modelo y tipo de equipo (laptop o escritorio), procesador, memoria RAM, sistema operativo, versiones de Revit y de KAIZEN, y la dirección IP desde la que se activa y verifica la licencia, con la fecha de cada verificación.</li>
      </ul>
      <h2>2. Para qué los usamos</h2>
      <ul>
        <li>Validar que la licencia se usa en el equipo para el que fue adquirida y prevenir su uso no autorizado.</li>
        <li>Verificar y registrar pagos, emitir y renovar licencias.</li>
        <li>Darte soporte técnico (por ejemplo, para cambiar tu licencia de PC).</li>
        <li>Avisarte de nuevas versiones del complemento.</li>
      </ul>
      <p>No vendemos ni cedemos tus datos a terceros. Usamos proveedores de infraestructura (Supabase para la base de datos y Netlify para la web) que los procesan por nuestra cuenta.</p>
      <h2>3. Conservación</h2>
      <p>Conservamos los datos mientras tengas una cuenta y, después, el tiempo exigido por las normas tributarias para los registros de pago.</p>
      <h2>4. Tus derechos</h2>
      <p>Puedes solicitar acceso, rectificación, cancelación u oposición (derechos ARCO) escribiéndonos por WhatsApp al {contact.whatsapp_display}{contact.email ? ` o a ${contact.email}` : ""}.</p>
    </div>
  );
}

export function Terms() {
  return (
    <div className="container section prose">
      <h1>Términos y condiciones de uso</h1>
      <h2>1. Licencia</h2>
      <p>KAIZEN se licencia, no se vende. Cada licencia es personal, por el plazo contratado, y queda vinculada a la placa base del número de equipos de su plan. No puede revenderse, compartirse ni usarse en otros equipos sin autorización.</p>
      <h2>2. Prueba gratuita</h2>
      <p>Se ofrece una prueba de 3 días por persona y por computadora, con todas las funciones. Al terminar, las herramientas se bloquean hasta adquirir un plan.</p>
      <h2>3. Verificación periódica</h2>
      <p>El complemento verifica la licencia en línea al activarse y al menos una vez cada 5 días. Si no puede verificar en ese plazo, se bloquea hasta que vuelva a conectarse.</p>
      <h2>4. Pagos y renovaciones</h2>
      <p>Los precios están en soles e incluyen las actualizaciones publicadas durante la vigencia. Una renovación suma el nuevo periodo a la fecha de vencimiento vigente.</p>
      <h2>5. Prohibiciones</h2>
      <p>Queda prohibido descompilar, desensamblar, aplicar ingeniería inversa, modificar o eludir los mecanismos de licencia del software. El incumplimiento conlleva la anulación de la licencia sin reembolso.</p>
      <h2>6. Responsabilidad técnica</h2>
      <p>KAIZEN es una herramienta de modelado y automatización BIM. La configuración de refuerzo, encofrados, metrados y documentación debe ser revisada y aprobada por el profesional responsable del proyecto. Las longitudes de empalme, recubrimientos y espaciamientos son entradas del usuario, no un sustituto del cálculo estructural firmado.</p>
      <h2>7. Marcas</h2>
      <p>Autodesk y Revit son marcas registradas de Autodesk, Inc. KAIZEN es un producto independiente no afiliado a Autodesk.</p>
    </div>
  );
}

export function NotFound() {
  return (
    <div className="container section center">
      <h1>Página no encontrada</h1>
      <p className="muted">El enlace no existe o cambió.</p>
      <Link className="btn btn-primary" to="/">Volver al inicio</Link>
    </div>
  );
}
