import { eq } from 'drizzle-orm';
import { api, HttpError, requireUser } from '@/lib/session';
import { db, schema } from '@/lib/db';
import { loadTaskFor } from '@/lib/tasks';
import { loadThreadView } from '@/lib/thread';

export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string }> };

/** Correo de origen de una tarea. Los colaboradores solo lo ven si quien lo creó decidió compartirlo. */
export const GET = api(async (_req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const { task } = await loadTaskFor(user, id);
  if (!task.threadId || !task.threadOwnerId) throw new HttpError(404, 'Esta tarea no viene de un correo');
  const isOwner = task.threadOwnerId === user.id;
  if (!isOwner && !task.shareEmail) throw new HttpError(403, 'Quien creó la tarea no compartió el correo original');
  const [owner] = await db().select().from(schema.users).where(eq(schema.users.id, task.threadOwnerId)).limit(1);
  if (!owner) throw new HttpError(404, 'La cuenta dueña del correo ya no existe');
  const view = await loadThreadView(owner.id, owner.email, task.threadId);
  return Response.json({ subject: view.subject, messages: view.messages.map((m) => ({ ...m, attachments: [] })) });
});
