import { and, eq } from 'drizzle-orm';
import { api, HttpError, requireUser } from '@/lib/session';
import { db, schema } from '@/lib/db';
import { requireAdmin } from '@/lib/org';

export const PUT = api(async (req: Request) => {
  const user = await requireUser();
  requireAdmin(user);
  const b = await req.json();
  if (!b.email) throw new HttpError(400, 'Falta la persona');
  const set: Record<string, unknown> = {};
  if (['admin', 'jefe', 'miembro'].includes(b.role)) set.role = b.role;
  if ('area' in b) set.area = b.area ? String(b.area).slice(0, 60) : null;
  if (b.email.toLowerCase() === user.email && set.role && set.role !== 'admin') throw new HttpError(400, 'No puedes quitarte tu propio rol de administrador.');
  const [m] = await db().update(schema.users).set(set).where(and(eq(schema.users.domain, user.domain), eq(schema.users.email, b.email.toLowerCase()))).returning();
  if (!m) throw new HttpError(404, 'Esa persona todavía no ha ingresado a MetroMail');
  return Response.json({ ok: true });
});
