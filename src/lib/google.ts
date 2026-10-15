import { eq } from 'drizzle-orm';
import { db, schema } from './db';
import { decrypt, encrypt } from './crypto';
import { HttpError } from './session';

export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/gmail.modify',
];

export function appUrl() {
  const u = process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000');
  return u.replace(/\/$/, '');
}

export function redirectUri() {
  return `${appUrl()}/api/auth/callback`;
}

function clientCreds() {
  const id = process.env.GOOGLE_CLIENT_ID, secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) throw new HttpError(500, 'Faltan GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en la configuración del servidor');
  return { id, secret };
}

export function authUrl(state: string) {
  const { id } = clientCreds();
  const p = new URLSearchParams({
    client_id: id,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: 'consent',
    state,
  });
  const hd = (process.env.ALLOWED_DOMAINS || '').split(',')[0]?.trim();
  if (hd) p.set('hd', hd);
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

type TokenResponse = { access_token: string; expires_in: number; refresh_token?: string; scope: string; id_token?: string; token_type: string };

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const { id, secret } = clientCreds();
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: id, client_secret: secret, ...body }),
  });
  const j = await r.json();
  if (!r.ok) throw new HttpError(401, `Google rechazó la autorización (${j.error_description || j.error || r.status})`);
  return j;
}

export function exchangeCode(code: string) {
  return tokenRequest({ code, grant_type: 'authorization_code', redirect_uri: redirectUri() });
}

export async function fetchUserInfo(accessToken: string): Promise<{ email: string; name?: string; picture?: string; email_verified?: boolean; hd?: string }> {
  const r = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { authorization: `Bearer ${accessToken}` } });
  if (!r.ok) throw new HttpError(401, 'No se pudo leer el perfil de Google');
  return r.json();
}

export async function saveTokens(userId: string, email: string, t: TokenResponse, previousRefresh?: string) {
  const refresh = t.refresh_token || previousRefresh;
  if (!refresh) throw new HttpError(401, 'Google no entregó un token de renovación. Quita el acceso de MetroMail en tu cuenta de Google e inicia sesión de nuevo.');
  const values = {
    userId,
    email,
    accessToken: encrypt(t.access_token),
    refreshToken: encrypt(refresh),
    expiresAt: new Date(Date.now() + (t.expires_in - 60) * 1000),
    scope: t.scope,
    updatedAt: new Date(),
  };
  await db().insert(schema.accounts).values(values).onConflictDoUpdate({ target: schema.accounts.userId, set: values });
}

/** Devuelve un token de acceso válido, renovándolo si venció. */
export async function accessTokenFor(userId: string, force = false): Promise<string> {
  const [acc] = await db().select().from(schema.accounts).where(eq(schema.accounts.userId, userId)).limit(1);
  if (!acc) throw new HttpError(401, 'La cuenta de Google no está conectada');
  if (!force && acc.expiresAt.getTime() > Date.now() + 30_000) return decrypt(acc.accessToken);
  const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: decrypt(acc.refreshToken) });
  await saveTokens(userId, acc.email, t, decrypt(acc.refreshToken));
  return t.access_token;
}

/** Llamada a la API de Gmail del usuario, con reintento si el token expiró. */
export async function gmail<T = unknown>(userId: string, path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  // GMAIL_API_BASE solo se usa en pruebas locales (servidor simulado).
  const url = `${process.env.GMAIL_API_BASE || 'https://gmail.googleapis.com'}/gmail/v1/users/me/${path}`;
  const doFetch = async (token: string) => fetch(url, {
    ...init,
    headers: { authorization: `Bearer ${token}`, ...(init.json ? { 'content-type': 'application/json' } : {}), ...(init.headers || {}) },
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  });
  let r = await doFetch(await accessTokenFor(userId));
  if (r.status === 401) r = await doFetch(await accessTokenFor(userId, true));
  if (r.status === 204) return undefined as T;
  const text = await r.text();
  const j = text ? JSON.parse(text) : {};
  if (!r.ok) {
    const msg = j?.error?.message || `Error de Gmail (${r.status})`;
    throw new HttpError(r.status === 404 ? 404 : r.status === 403 ? 403 : 502, msg);
  }
  return j as T;
}
