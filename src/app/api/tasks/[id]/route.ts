import { and, eq } from 'drizzle-orm';
import { api, HttpError, requireUser } from '@/lib/session';
import { db, schema } from '@/lib/db';
import { hydrate, loadTaskFor, logActivity, notifyTask } from '@/lib/tasks';
import type { CheckItem } from '@/db/schema';

type Ctx = { params: Promise<{ id: string }> };
const LABEL: Record<string, string> = { hacer: 'Por hacer', curso: 'En curso', revision: 'En revisión', hecho: 'Hecho' };
const isEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

export const PATCH = api(async (req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const { task, collaborators } = await loadTaskFor(user, id);
  const b = await req.json();
  const who = user.name || user.email;
  const set: Partial<typeof schema.tasks.$inferInsert> = { updatedAt: new Date() };
  const logs: string[] = [];
  if (typeof b.title === 'string' && b.title.trim()) set.title = b.title.trim().slice(0, 200);
  if (b.status && LABEL[b.status] && b.status !== task.status) { set.status = b.status; logs.push(`${who} la movió a ${LABEL[b.status]}`); }
  if (b.priority && ['Alta', 'Media', 'Baja'].includes(b.priority)) set.priority = b.priority;
  if ('dueDate' in b) set.dueDate = b.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(b.dueDate) ? b.dueDate : null;
  if ('projectId' in b) set.projectId = b.projectId || null;
  if ('shareEmail' in b) { set.shareEmail = !!b.shareEmail; logs.push(b.shareEmail ? `${who} compartió el correo original` : `${who} dejó de compartir el correo original`); }
  if (Array.isArray(b.checklist)) set.checklist = (b.checklist as CheckItem[]).slice(0, 50).map((c) => ({ t: String(c.t).slice(0, 200), done: !!c.done }));
  if (b.assigneeEmail && isEmail(b.assigneeEmail) && b.assigneeEmail.toLowerCase() !== task.assigneeEmail) {
    const newAssignee = String(b.assigneeEmail).toLowerCase();
    set.assigneeEmail = newAssignee;
    logs.push(`Responsable: ${newAssignee}`);
    await notifyTask(user, newAssignee, task, 'asignada');
  }
  await db().update(schema.tasks).set(set).where(eq(schema.tasks.id, id));
  if (Array.isArray(b.addCollaborators)) {
    for (const e of b.addCollaborators.map((x: string) => x.toLowerCase().trim()).filter(isEmail)) {
      if (collaborators.includes(e) || e === (set.assigneeEmail || task.assigneeEmail)) continue;
      if (e.split('@')[1] !== user.domain && user.role === 'miembro') throw new HttpError(403, 'Solo administradores y jefes pueden invitar a personas externas.');
      await db().insert(schema.taskCollaborators).values({ taskId: id, email: e }).onConflictDoNothing();
      logs.push(`${who} invitó a ${e}`);
      await notifyTask(user, e, task, 'invitado');
    }
  }
  if (Array.isArray(b.removeCollaborators)) {
    for (const e of b.removeCollaborators) {
      await db().delete(schema.taskCollaborators).where(and(eq(schema.taskCollaborators.taskId, id), eq(schema.taskCollaborators.email, String(e).toLowerCase())));
      logs.push(`${who} quitó a ${e}`);
    }
  }
  for (const l of logs) await logActivity(id, l);
  const [fresh] = await db().select().from(schema.tasks).where(eq(schema.tasks.id, id));
  return Response.json({ task: (await hydrate([fresh]))[0] });
});

export const DELETE = api(async (_req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const { task } = await loadTaskFor(user, id);
  if (task.createdById !== user.id && user.role !== 'admin') throw new HttpError(403, 'Solo quien creó la tarea puede eliminarla');
  await db().delete(schema.tasks).where(eq(schema.tasks.id, id));
  return Response.json({ ok: true });
});
