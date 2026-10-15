import { eq } from 'drizzle-orm';
import { api, HttpError, requireUser } from '@/lib/session';
import { db, schema } from '@/lib/db';
import { loadTaskFor, logActivity, notifyTask } from '@/lib/tasks';

type Ctx = { params: Promise<{ id: string }> };

export const POST = api(async (_req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const { task } = await loadTaskFor(user, id);
  if (task.assigneeEmail === user.email) throw new HttpError(400, 'Esta tarea es tuya');
  if (task.nudgedAt && Date.now() - task.nudgedAt.getTime() < 12 * 3_600_000) throw new HttpError(429, 'Ya enviaste un recordatorio hace menos de 12 horas');
  await notifyTask(user, task.assigneeEmail, task, 'recordatorio', task.dueDate ? `Fecha límite: ${task.dueDate}` : '');
  await db().update(schema.tasks).set({ nudgedAt: new Date() }).where(eq(schema.tasks.id, id));
  await logActivity(id, `${user.name || user.email} envió un recordatorio a ${task.assigneeEmail}`);
  return Response.json({ ok: true });
});
