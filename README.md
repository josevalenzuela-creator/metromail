# MetroMail AI

Gestor de correo web al estilo Spark para equipos con Google Workspace: bandeja inteligente agrupada por semana, estados de gestión, seguimientos, firmas globales, SLA personal y de equipo, y tareas o proyectos creados desde un correo.

**Stack:** Next.js 15 · Postgres (Neon) con Drizzle · API de Gmail · Vercel.

## Puesta en marcha (unos 20 minutos)

### 1. Base de datos en Neon
1. Entra a https://neon.tech, crea un proyecto **metromail** en la región **AWS São Paulo (sa-east-1)**.
2. En *Connection details* copia dos cadenas:
   - con **Pooled connection** activado → `DATABASE_URL`
   - con **Pooled connection** desactivado → `DIRECT_URL`

### 2. Proyecto en Vercel
1. En https://vercel.com › *Add New › Project*, importa el repositorio `metromail` de GitHub.
2. Antes de desplegar, en *Environment Variables* agrega:

| Variable | Valor |
|---|---|
| `DATABASE_URL` | cadena pooled de Neon |
| `DIRECT_URL` | cadena directa de Neon |
| `SESSION_SECRET` | texto aleatorio de 48+ caracteres |
| `ENCRYPTION_KEY` | otro texto aleatorio de 48+ caracteres (no lo cambies después: cifra los tokens de Google) |
| `CRON_SECRET` | otro texto aleatorio |
| `ALLOWED_DOMAINS` | `metrowan.cl` |
| `ADMIN_EMAILS` | `jose@metrowan.cl` |
| `APP_URL` | `https://<tu-proyecto>.vercel.app` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | del paso 3 (puedes desplegar primero y agregarlos después) |
| `ANTHROPIC_API_KEY` | opcional, activa el asistente IA |

3. Despliega. El build aplica las migraciones de la base automáticamente (`vercel-build`).
4. Anota la URL final (ej.: `https://metromail.vercel.app`) y ajústala en `APP_URL` si cambió.

### 3. Acceso a Gmail en Google Cloud
1. En https://console.cloud.google.com crea un proyecto **MetroMail** con tu cuenta de Workspace.
2. *APIs y servicios › Biblioteca* → habilita **Gmail API**.
3. *Pantalla de consentimiento de OAuth* → tipo de usuario **Interno**. Nombre: MetroMail. Correo de soporte: el tuyo.
   - Permisos: `openid`, `email`, `profile`, `https://www.googleapis.com/auth/gmail.modify`.
4. *Credenciales › Crear credenciales › ID de cliente de OAuth* → **Aplicación web**.
   - Orígenes autorizados: `https://<tu-proyecto>.vercel.app`
   - URI de redireccionamiento: `https://<tu-proyecto>.vercel.app/api/auth/callback`
5. Copia el ID y el secreto a `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` en Vercel y vuelve a desplegar (*Deployments › … › Redeploy*).

Al ser una app **Interna**, solo cuentas de tu dominio pueden entrar y Google no exige verificación.

### 4. Primer ingreso
Abre la URL y pulsa **Entrar con Google**. La primera persona del dominio (o quien esté en `ADMIN_EMAILS`) queda como administradora. Comparte el enlace con tu equipo: cada persona aparece en *Configuración › Organización* al entrar por primera vez, y ahí le asignas rol y área.

## Cómo funciona
- **Estados** (Pendiente, En gestión, Esperando, Pospuesto, Apartado, Finalizado) se guardan en la base y se reflejan en Gmail con etiquetas `MetroMail/…`. Finalizar o apartar archiva el correo en Gmail; si llega una respuesta, vuelve a la bandeja.
- **SLA:** mide el tiempo entre un correo dirigido a ti y tu respuesta, en horario hábil (lun–vie 9–19, Santiago). Excluye boletines y correos automáticos. Se sincroniza al abrir Inicio y una vez al día con el cron de Vercel.
- **Equipo:** el rendimiento usa solo metadatos (tiempos y tipo de remitente). Administración ve a todos; jefaturas ven su área; miembros ven lo propio y promedios.
- **Tareas:** visibles para responsable, creador y colaboradores. El correo original solo se comparte si lo activas.
- **Seguridad:** tokens de Google cifrados (AES-256-GCM), sesión firmada en cookie httpOnly, HTML de correos aislado en iframe sin scripts e imágenes remotas bloqueadas hasta que las permitas.

## Desarrollo local
```bash
cp .env.example .env   # completa los valores; APP_URL=http://localhost:3000
npm install
npm run db:migrate
npm run dev
npm test
```
Para desarrollo local agrega `http://localhost:3000/api/auth/callback` como URI de redirección en el cliente OAuth.

Cambios de esquema: edita `src/db/schema.ts`, ejecuta `npm run db:generate` y haz commit de la carpeta `drizzle/`.

## Próximas etapas
Microsoft 365 e IMAP, notificaciones push, sincronización en tiempo real con Gmail Pub/Sub.
