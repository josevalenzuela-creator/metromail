import { db, schema } from '@/lib/db';
import { slaSyncStep } from '@/lib/sla';

export const maxDuration = 60;

/** Tarea diaria (Vercel Cron): avanza la sincronización del SLA de cada persona. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return Response.json({ error: 'No autorizado' }, { status: 401 });
  const users = await db().select().from(schema.users);
  const started = Date.now();
  const results: Record<string, string> = {};
  for (const u of users) {
    if (Date.now() - started > 45_000) break;
    try {
      const r = await slaSyncStep(u, { budget: 15, force: true });
      results[u.email] = `${r.status} ${r.processed}/${r.total}`;
    } catch (e) {
      results[u.email] = e instanceof Error ? e.message : 'error';
    }
  }
  return Response.json({ ok: true, results });
}
