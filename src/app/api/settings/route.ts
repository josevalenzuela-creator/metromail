import { eq } from 'drizzle-orm';
import { api, requireUser } from '@/lib/session';
import { db, schema } from '@/lib/db';
import { getSettings } from '@/lib/settings';

const cleanList = (xs: unknown, re: RegExp) => Array.isArray(xs) ? [...new Set(xs.map((x) => String(x).trim().toLowerCase()).filter((x) => re.test(x)))].slice(0, 200) : undefined;

export const PUT = api(async (req: Request) => {
  const user = await requireUser();
  await getSettings(user.id);
  const b = await req.json();
  const set: Record<string, unknown> = {};
  if ('sigNewId' in b) set.sigNewId = b.sigNewId || null;
  if ('sigReplyId' in b) set.sigReplyId = b.sigReplyId || null;
  if (b.slaTargets) {
    const n = (v: unknown, d: number) => Math.max(1, Math.min(72, Math.round(Number(v) || d)));
    set.slaTargets = { Clientes: n(b.slaTargets.Clientes, 4), Equipo: n(b.slaTargets.Equipo, 8), Proveedores: n(b.slaTargets.Proveedores, 24) };
  }
  for (const k of ['slaBiz', 'orgMetrics', 'reopenRule'] as const) if (k in b) set[k] = !!b[k];
  if ('groupBy' in b) set.groupBy = b.groupBy === 'prioridad' ? 'prioridad' : 'semana';
  const vip = cleanList(b.vipEmails, /^[^\s@]+@[^\s@]+\.[^\s@]+$/); if (vip) set.vipEmails = vip;
  const sup = cleanList(b.supplierDomains, /^[a-z0-9.-]+\.[a-z]{2,}$/); if (sup) set.supplierDomains = sup;
  if (Object.keys(set).length) await db().update(schema.userSettings).set(set).where(eq(schema.userSettings.userId, user.id));
  return Response.json({ settings: await getSettings(user.id) });
});
