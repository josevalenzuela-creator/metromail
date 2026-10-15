import { and, eq } from 'drizzle-orm';
import { api, HttpError, requireUser } from '@/lib/session';
import { db, schema } from '@/lib/db';
import { hydrate, logActivity, notifyTask, visibleTasks } from '@/lib/tasks';
import { setThreadState } from '@/lib/inbox';

export const maxDuration = 60;

export const GET = api(async () => {
  const user = await requireUser();
  const [tasks, projects] = await Promise.all([
    visibleTasks(user),
    db().select().from(schema.projects).where(eq(schema.projects.domain, user.domain)),
  ]);
  return Response.json({ tasks, projects });
});

type CreateBody = {
  titles: string[]; // una tarea por título (proyecto con varias tareas) o una sola
  checklist?: string[];
  projectId?: string | null; newProjectName?: string | null;
  assigneeEmail?: string; collaborators?: string[];
  dueDate?: string | null; priority?: string;
  threadId?: string | null; threadSubject?: string | null; threadFrom?: string | null; threadSummary?: string | null;
  shareEmail?: boolean; toGestion?: boolean; notify?: boolean;
};

const PCOL = ['#1546C9', '#6B3FD1', '#0B6E6E', '#B4560B', '#9F1F5A', '#1A6E37'];
const isEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

export const POST = api(async (req: Request) => {
  const user = await requireUser();
  const b = (await req.json()) as CreateBody;
  const titles = (b.titles || []).map((t) => t.trim()).filter(Boolean).slice(0, 20);
  if (!titles.length) throw new HttpError(400, 'Escribe al menos una tarea');
  const assignee = (b.assigneeEmail || user.email).toLowerCase();
  if (!isEmail(assignee)) throw new HttpError(400, 'Responsable no válido');
  const collabs = [...new Set((b.collaborators || []).map((e) => e.toLowerCase().trim()).filter((e) => isEmail(e) && e !== assignee))];
  const outside = [assignee, ...collabs].filter((e) => e.split('@')[1] !== user.domain);
  if (outside.length && user.role === 'miembro') throw new HttpError(403, 'Solo administradores y jefes pueden invitar a personas externas.');

  let projectId = b.projectId || null;
  if (b.newProjectName?.trim()) {
    const count = (await db().select({ id: schema.projects.id }).from(schema.projects).where(eq(schema.projects.domain, user.domain))).length;
    const [p] = await db().insert(schema.projects).values({ domain: user.domain, name: b.newProjectName.trim().slice(0, 80), color: PCOL[count % PCOL.length], createdById: user.id }).returning();
    projectId = p.id;
  } else if (projectId) {
    const [p] = await db().select().from(schema.projects).where(and(eq(schema.projects.id, projectId), eq(schema.projects.domain, user.domain))).limit(1);
    if (!p) projectId = null;
  }

  const created = [];
  for (const title of titles) {
    const [t] = await db().insert(schema.tasks).values({
      domain: user.domain, title: title.slice(0, 200), priority: ['Alta', 'Media', 'Baja'].includes(b.priority || '') ? b.priority! : 'Media',
      dueDate: b.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(b.dueDate) ? b.dueDate : null, projectId, assigneeEmail: assignee, createdById: user.id,
      threadId: b.threadId || null, threadOwnerId: b.threadId ? user.id : null, threadSubject: b.threadSubject || null, threadFrom: b.threadFrom || null,
      threadSummary: b.threadSummary || null, shareEmail: !!b.shareEmail,
      checklist: titles.length === 1 ? (b.checklist || []).filter(Boolean).slice(0, 30).map((x) => ({ t: x.slice(0, 200), done: false })) : [],
    }).returning();
    if (collabs.length) await db().insert(schema.taskCollaborators).values(collabs.map((email) => ({ taskId: t.id, email })));
    await logActivity(t.id, `${user.name || user.email} la creó${b.threadSubject ? ` desde el correo «${b.threadSubject}»` : ''}`);
    if (b.notify !== false) {
      await notifyTask(user, assignee, t, 'asignada');
      for (const c of collabs) await notifyTask(user, c, t, 'invitado');
    }
    created.push(t);
  }
  if (b.threadId && b.toGestion) await setThreadState(user, b.threadId, 'gestion').catch(() => null);
  return Response.json({ tasks: await hydrate(created) });
});
