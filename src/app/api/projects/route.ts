import { eq } from 'drizzle-orm';
import { api, HttpError, requireUser } from '@/lib/session';
import { db, schema } from '@/lib/db';

const PCOL = ['#1546C9', '#6B3FD1', '#0B6E6E', '#B4560B', '#9F1F5A', '#1A6E37'];

export const POST = api(async (req: Request) => {
  const user = await requireUser();
  const { name } = await req.json();
  if (!name?.trim()) throw new HttpError(400, 'Ponle nombre al proyecto');
  const count = (await db().select({ id: schema.projects.id }).from(schema.projects).where(eq(schema.projects.domain, user.domain))).length;
  const [p] = await db().insert(schema.projects).values({ domain: user.domain, name: name.trim().slice(0, 80), color: PCOL[count % PCOL.length], createdById: user.id }).returning();
  return Response.json({ project: p });
});
