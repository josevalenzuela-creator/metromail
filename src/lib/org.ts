import { and, eq, sql } from 'drizzle-orm';
import { db, schema } from './db';
import { HttpError, type SessionUser } from './session';

const list = (v?: string) => (v || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

export const DEFAULT_AREAS = ['Gerencia', 'Comercial', 'Operaciones y Red', 'Finanzas', 'Atención al Cliente'];

/** Crea o actualiza el usuario al iniciar sesión y asegura su organización (por dominio). */
export async function upsertUserOnLogin(info: { email: string; name?: string; picture?: string }) {
  const email = info.email.toLowerCase();
  const domain = email.split('@')[1];
  const allowed = list(process.env.ALLOWED_DOMAINS);
  if (allowed.length && !allowed.includes(domain)) throw new HttpError(403, `Solo pueden ingresar cuentas de ${allowed.join(', ')}.`);
  const admins = list(process.env.ADMIN_EMAILS);

  await db().insert(schema.orgs).values({ domain, name: domain, areas: DEFAULT_AREAS }).onConflictDoNothing();

  const [existing] = await db().select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (existing) {
    const role = admins.includes(email) ? 'admin' : existing.role;
    const [u] = await db().update(schema.users).set({ name: info.name || existing.name, picture: info.picture || existing.picture, lastSeenAt: new Date(), role })
      .where(eq(schema.users.id, existing.id)).returning();
    return u;
  }
  const [{ count }] = await db().select({ count: sql<number>`count(*)::int` }).from(schema.users).where(eq(schema.users.domain, domain));
  const role = admins.includes(email) || count === 0 ? 'admin' : 'miembro';
  const [u] = await db().insert(schema.users).values({ email, name: info.name || email, picture: info.picture, domain, role, area: role === 'admin' ? 'Gerencia' : null }).returning();
  return u;
}

export async function orgMembers(domain: string) {
  return db().select({ id: schema.users.id, email: schema.users.email, name: schema.users.name, role: schema.users.role, area: schema.users.area, picture: schema.users.picture, lastSeenAt: schema.users.lastSeenAt })
    .from(schema.users).where(eq(schema.users.domain, domain));
}

export async function getOrg(domain: string) {
  const [o] = await db().select().from(schema.orgs).where(eq(schema.orgs.domain, domain)).limit(1);
  return o;
}

export function requireAdmin(u: SessionUser) {
  if (u.role !== 'admin') throw new HttpError(403, 'Solo un administrador puede hacer esto.');
}

export async function memberByEmail(domain: string, email: string) {
  const [m] = await db().select().from(schema.users).where(and(eq(schema.users.domain, domain), eq(schema.users.email, email.toLowerCase()))).limit(1);
  return m;
}
