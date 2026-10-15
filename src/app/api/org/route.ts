import { eq } from 'drizzle-orm';
import { api, requireUser } from '@/lib/session';
import { db, schema } from '@/lib/db';
import { getOrg, orgMembers, requireAdmin } from '@/lib/org';

export const GET = api(async () => {
  const user = await requireUser();
  const [org, members] = await Promise.all([getOrg(user.domain), orgMembers(user.domain)]);
  return Response.json({ org, members, canEdit: user.role === 'admin' });
});

export const PUT = api(async (req: Request) => {
  const user = await requireUser();
  requireAdmin(user);
  const b = await req.json();
  const set: Record<string, unknown> = {};
  if (typeof b.name === 'string' && b.name.trim()) set.name = b.name.trim().slice(0, 80);
  if ('showNames' in b) set.showNames = !!b.showNames;
  if ('minGroup' in b) set.minGroup = !!b.minGroup;
  if (['admin', 'jefes', 'todos'].includes(b.perfVisibility)) set.perfVisibility = b.perfVisibility;
  if (Array.isArray(b.areas)) set.areas = [...new Set(b.areas.map((a: unknown) => String(a).trim()).filter(Boolean))].slice(0, 30);
  if (Object.keys(set).length) await db().update(schema.orgs).set(set).where(eq(schema.orgs.domain, user.domain));
  return Response.json({ org: await getOrg(user.domain) });
});
