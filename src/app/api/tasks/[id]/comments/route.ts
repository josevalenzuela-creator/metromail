import { eq } from 'drizzle-orm';
import { api, HttpError, requireUser } from '@/lib/session';
import { db, schema } from '@/lib/db';
import { firstName, loadTaskFor, notifyTask } from '@/lib/tasks';
import { orgMembers } from '@/lib/org';

type Ctx = { params: Promise<{ id: string }> };

export const POST = api(async (req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const { task, collaborators } = await loadTaskFor(user, id);
  const { body } = await req.json();
  const text = String(body || '').trim().slice(0, 4000);
  if (!text) throw new HttpError(400, 'Escribe un comentario');
  const [c] = await db().insert(schema.taskComments).values({ taskId: id, authorEmail: user.email, body: text }).returning();
  await db().update(schema.tasks).set({ updatedAt: new Date() }).where(eq(schema.tasks.id, id));
  // Avisar a quienes se menciona con @Nombre.
  const people = (await orgMembers(user.domain)).filter((m) => m.email !== user.email && [task.assigneeEmail, ...collaborators].includes(m.email));
  const mentioned = people.filter((m) => text.toLowerCase().includes('@' + firstName(m).toLowerCase()));
  for (const m of mentioned) await notifyTask(user, m.email, task, 'mencion', `«${text.slice(0, 300)}»`);
  return Response.json({ comment: c, mentioned: mentioned.map((m) => m.name || m.email) });
});
