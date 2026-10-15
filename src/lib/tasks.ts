import { and, eq, inArray, or, desc, asc } from 'drizzle-orm';
import { db, schema } from './db';
import { HttpError, type SessionUser } from './session';
import { buildMime, toBase64Url } from './mime';
import { sendRaw } from './gmail';
import { appUrl } from './google';
import { escapeHtml } from './signature';

export type TaskRow = typeof schema.tasks.$inferSelect;

/** Tareas que el usuario puede ver: las suyas (responsable, colaborador o creador). Los administradores ven todas las de su organización. */
export async function visibleTasks(user: SessionUser) {
  const base = eq(schema.tasks.domain, user.domain);
  let rows: TaskRow[];
  if (user.role === 'admin') rows = await db().select().from(schema.tasks).where(base).orderBy(desc(schema.tasks.updatedAt));
  else {
    const collab = await db().select({ taskId: schema.taskCollaborators.taskId }).from(schema.taskCollaborators).where(eq(schema.taskCollaborators.email, user.email));
    const ids = collab.map((c) => c.taskId);
    rows = await db().select().from(schema.tasks).where(and(base, or(
      eq(schema.tasks.assigneeEmail, user.email), eq(schema.tasks.createdById, user.id),
      ...(ids.length ? [inArray(schema.tasks.id, ids)] : []),
    ))).orderBy(desc(schema.tasks.updatedAt));
  }
  return hydrate(rows);
}

export async function hydrate(rows: TaskRow[]) {
  const ids = rows.map((r) => r.id);
  if (!ids.length) return [];
  const [collabs, comments, activity] = await Promise.all([
    db().select().from(schema.taskCollaborators).where(inArray(schema.taskCollaborators.taskId, ids)),
    db().select().from(schema.taskComments).where(inArray(schema.taskComments.taskId, ids)).orderBy(asc(schema.taskComments.createdAt)),
    db().select().from(schema.taskActivity).where(inArray(schema.taskActivity.taskId, ids)).orderBy(asc(schema.taskActivity.createdAt)),
  ]);
  return rows.map((r) => ({
    ...r,
    collaborators: collabs.filter((c) => c.taskId === r.id).map((c) => c.email),
    comments: comments.filter((c) => c.taskId === r.id),
    activity: activity.filter((a) => a.taskId === r.id),
  }));
}

export async function loadTaskFor(user: SessionUser, id: string) {
  const [t] = await db().select().from(schema.tasks).where(and(eq(schema.tasks.id, id), eq(schema.tasks.domain, user.domain))).limit(1);
  if (!t) throw new HttpError(404, 'Tarea no encontrada');
  const collab = await db().select().from(schema.taskCollaborators).where(eq(schema.taskCollaborators.taskId, id));
  const allowed = user.role === 'admin' || t.assigneeEmail === user.email || t.createdById === user.id || collab.some((c) => c.email === user.email);
  if (!allowed) throw new HttpError(403, 'No participas en esta tarea');
  return { task: t, collaborators: collab.map((c) => c.email) };
}

export async function logActivity(taskId: string, text: string) {
  await db().insert(schema.taskActivity).values({ taskId, text });
}

export function firstName(u: { name: string | null; email: string }) {
  return (u.name || u.email).split(' ')[0];
}

/** Avisa por correo (desde la cuenta de quien invita) que lo sumaron a una tarea. */
export async function notifyTask(from: SessionUser, toEmail: string, task: { id: string; title: string }, kind: 'asignada' | 'invitado' | 'recordatorio' | 'mencion', extra = '') {
  if (toEmail.toLowerCase() === from.email.toLowerCase()) return;
  const link = `${appUrl()}/app?v=tasks&task=${task.id}`;
  const who = from.name || from.email;
  const lines: Record<typeof kind, string> = {
    asignada: `${who} te asignó una tarea en MetroMail:`,
    invitado: `${who} te invitó a colaborar en una tarea en MetroMail:`,
    recordatorio: `${who} te recuerda esta tarea en MetroMail:`,
    mencion: `${who} te mencionó en una tarea en MetroMail:`,
  };
  const text = `${lines[kind]}\n\n«${task.title}»\n${extra ? `\n${extra}\n` : ''}\nÁbrela aquí: ${link}\n\nSolo verás esta tarea, no la bandeja de ${who}.`;
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#202124"><p>${escapeHtml(lines[kind])}</p><p style="font-size:16px"><b>${escapeHtml(task.title)}</b></p>${extra ? `<p style="color:#536173">${escapeHtml(extra)}</p>` : ''}<p><a href="${link}" style="display:inline-block;background:#1546C9;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Abrir la tarea</a></p><p style="font-size:12px;color:#536173">Solo verás esta tarea, no la bandeja de ${escapeHtml(who)}.</p></div>`;
  const subject = kind === 'recordatorio' ? `Recordatorio: ${task.title}` : `Tarea: ${task.title}`;
  try {
    await sendRaw(from.id, toBase64Url(buildMime({ from: from.name ? `${from.name} <${from.email}>` : from.email, to: toEmail, subject, text, html })));
  } catch (e) {
    console.warn('No se pudo enviar el aviso de tarea', e);
  }
}
