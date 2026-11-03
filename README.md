# KAIZEN · plataforma de venta y licencias

Web para vender y administrar las licencias del complemento **KAIZEN para Autodesk Revit 2025+**
(repositorio `kaizen-revit`).

| Pieza | Tecnología | Dónde |
|-------|-----------|-------|
| Web de clientes + panel de administrador | Vite + React + TypeScript | `web/` → Netlify, sitio `kaizen-revit` (https://kaizen-revit.netlify.app) |
| Base de datos, autenticación, archivos | Supabase, proyecto `kaizen-licencias` (São Paulo) | `supabase/migrations/` |
| API (licencias, pagos, admin, actualizaciones) | Supabase Edge Function `kaizen` (Deno) | `supabase/functions/kaizen/` |

---

## Qué puede hacer cada uno

**Cliente** (registro libre en la web)
- Prueba gratuita de 3 días: genera su clave y la activa en Revit. Una prueba por cuenta y por placa base.
- Compra o renueva un plan; paga con **Yape** (u otros métodos que agregues) y sube la captura.
- Ve sus licencias, días restantes, la PC vinculada, sus pedidos y descarga el instalador.

**Administrador** (`/admin`, cuenta con rol admin)
- **Resumen**: ingresos del mes y totales, licencias activas, pruebas en curso, pagos por revisar.
- **Pedidos y pagos**: ve la captura del Yape, aprueba (la licencia se crea o renueva sola) o rechaza.
- **Clientes**: datos, WhatsApp directo, historial, bloquear cuenta, dar o quitar rol de admin, exportar CSV.
- **Licencias**: sumar o restar días, fijar vencimiento, suspender, anular, cambiar el número de equipos,
  **liberar la PC** (cambio de computadora) y crear licencias manuales (efectivo, cortesía).
- **Equipos**: inventario de cada PC (nombre, usuario de Windows, marca, modelo, laptop o escritorio,
  CPU, RAM, sistema, versiones de Revit y KAIZEN, primera y última IP); avisa si una placa aparece en
  varias licencias; bloquear o desvincular; reiniciar la prueba de una PC.
- **Actividad**: cada activación, verificación (cada 5 días) y acción de administrador, con IP.
- **Planes y precios**: crear o editar combos (meses, días, equipos, precio, precio tachado, etiqueta, destacado).
- **Métodos de pago**: Yape (951 230 463), Plin, transferencias, efectivo… con QR, titular e instrucciones.
- **Versiones del add-in**: sube el instalador, escribe las novedades y publica; todos los KAIZEN
  instalados reciben el aviso y se actualizan solos.
- **Ajustes**: WhatsApp de contacto, horario, días de prueba e intervalo de verificación.

El primer administrador es **mgl.xdmgl1@gmail.com**: basta con registrarse con ese correo en la web.
Para agregar otros, entra en *Clientes → Ver → Hacer admin*.

---

## Puesta en marcha

### 1. Supabase (ya aplicado en `kaizen-licencias`)

- Migración: `supabase/migrations/20261103000000_kaizen_licensing.sql`.
- Clave de firma ECDSA P-256 en **Vault** con el nombre `kz_signing_jwk`. La pública está embebida
  en el add-in (`Kaizen.Login/Online/LicenseToken.cs`). **No la cambies** sin publicar antes una
  versión del add-in con la clave nueva.
- Función: `supabase functions deploy kaizen --no-verify-jwt` (el add-in no tiene sesión de
  Supabase; las rutas web validan el JWT dentro de la función).
- Los correos se confirman automáticamente (trigger `kz_autoconfirm_user`) porque el SMTP de prueba de
  Supabase solo envía a los miembros del equipo. Cuando configures un SMTP propio (Resend, Brevo…)
  en *Authentication → SMTP*, puedes borrar ese trigger y la recuperación de contraseña por correo
  funcionará para todos.

### 2. Netlify

El sitio `kaizen-revit` ya existe y está público. Para publicarlo, una de dos:

- **Vincular el repositorio** (recomendado): Netlify → *kaizen-revit → Project configuration →
  Build & deploy → Link repository* → `REVIT_MGL`, rama de producción la que uses. `netlify.toml`
  ya indica `base = "web"`, `npm ci && npm run build`, `dist`.
- **GitHub Actions**: agrega el secreto `NETLIFY_AUTH_TOKEN` al repositorio; `.github/workflows/netlify.yml`
  despliega en cada push.

La URL y la clave publicable de Supabase van en `web/src/lib/supabase.ts` (no son secretas; se
pueden sobrescribir con `VITE_SUPABASE_URL` y `VITE_SUPABASE_KEY`).

### 3. Mercado Pago (opcional, tarjetas con activación automática)

1. Supabase → *Edge Functions → Secrets*: `MP_ACCESS_TOKEN` (de tu cuenta de Mercado Pago) y,
   si cambias de dominio, `SITE_URL`.
2. Panel admin → *Métodos de pago* → activa **Ofrecer pago con Mercado Pago**.

El webhook es `https://jecvalnflhtxfnvjdgcm.supabase.co/functions/v1/kaizen/mp/webhook`. Cada aviso
se confirma consultando el pago en la API de Mercado Pago, así que un aviso falso no activa nada.

---

## Desarrollo

```bash
cd web
npm install
npm run dev
```

La función se comprueba con `deno check supabase/functions/kaizen/index.ts`.

## API de la función `kaizen`

| Ruta | Quién | Qué |
|------|-------|-----|
| `POST /license/activate` | add-in | Activa la clave en esta PC → token firmado |
| `POST /license/validate` | add-in | Verificación periódica |
| `GET /update/latest` | add-in | Última versión publicada y firmada |
| `POST /trial` | cliente | Crea la clave de prueba |
| `POST /checkout` | cliente | Crea el pedido (Yape/…/Mercado Pago) |
| `POST /order/proof` · `/order/cancel` · `/order/sync` | cliente | Comprobante, cancelar, reconsultar MP |
| `POST /mp/webhook` | Mercado Pago | Notificaciones de pago |
| `POST /admin/<operación>` | admin | approve_order, reject_order, create_license, extend_license, set_license_status, reset_devices, publish_release, stats… |
