import { eq } from 'drizzle-orm';
import { api, requireUser } from '@/lib/session';
import { db, schema } from '@/lib/db';
import { computeSla, loadEvents } from '@/lib/sla';
import { getOrg, orgMembers } from '@/lib/org';

/**
 * Rendimiento del equipo: solo metadatos (tiempos y tipo de remitente). Nunca asuntos ni contenido.
 * Admin: todos. Jefe: su área + promedios. Miembro: lo propio + promedios.
 */
export const GET = api(async (req: Request) => {
  const user = await requireUser();
  const sp = new URL(req.url).searchParams;
  const days = [7, 30, 90].includes(Number(sp.get('days'))) ? Number(sp.get('days')) : 30;
  const org = await getOrg(user.domain);
  const members = await orgMembers(user.domain);
  const settingsRows = await db().select().from(schema.userSettings);
  const sm = new Map(settingsRows.map((s) => [s.userId, s]));

  const rows = [] as { id: string; email: string; name: string; area: string; isMe: boolean; n: number; ok: number; pct: number | null; prevPct: number | null; medianH: number | null; p90H: number | null; lateNow: number; byCat: { cat: string; n: number; ok: number; medianH: number | null; target: number }[]; trend: { label: string; n: number; ok: number; pct: number | null }[]; synced: boolean }[];
  for (const m of members) {
    const s = sm.get(m.id);
    if (s && s.orgMetrics === false && m.id !== user.id) continue;
    const events = await loadEvents(m.id, days * 2 + 60);
    const sum = computeSla(events, s?.slaTargets || { Clientes: 4, Equipo: 8, Proveedores: 24 }, s?.slaBiz ?? true, days, false);
    rows.push({ id: m.id, email: m.email, name: m.name || m.email, area: m.area || 'Sin área', isMe: m.id === user.id, n: sum.measured, ok: sum.ok, pct: sum.pct, prevPct: sum.prevPct, medianH: sum.medianH, p90H: sum.p90H, lateNow: sum.lateNow, byCat: sum.byCat, trend: sum.trend, synced: events.length > 0 });
  }

  const agg = (list: typeof rows) => {
    const n = list.reduce((a, r) => a + r.n, 0), ok = list.reduce((a, r) => a + r.ok, 0);
    const withMed = list.filter((r) => r.medianH !== null && r.n > 0);
    const w = withMed.reduce((a, r) => a + r.n, 0);
    return { count: list.length, n, ok, pct: n ? Math.round((ok / n) * 100) : null, medianH: w ? withMed.reduce((a, r) => a + (r.medianH as number) * r.n, 0) / w : null, lateNow: list.reduce((a, r) => a + r.lateNow, 0) };
  };
  const me = rows.find((r) => r.isMe);
  const minGroup = org?.minGroup ?? true;
  const areaNames = [...new Set(rows.map((r) => r.area))];
  const areas = areaNames.map((a) => { const list = rows.filter((r) => r.area === a); return { name: a, ...agg(list), hidden: minGroup && list.length < 3 && user.role !== 'admin' }; });

  let visible = rows;
  if (user.role === 'jefe') visible = rows.filter((r) => r.area === (user.area || 'Sin área') || r.isMe);
  else if (user.role !== 'admin') visible = rows.filter((r) => r.isMe);
  const showNames = (org?.showNames ?? true) || user.role !== 'admin';
  const letters = new Map(rows.map((r, i) => [r.id, String.fromCharCode(65 + (i % 26))]));

  return Response.json({
    role: user.role, myArea: user.area, days,
    org: agg(rows), scope: agg(visible), me: me || null,
    areas: user.role === 'admin' ? areas : areas.filter((a) => a.name === (user.area || 'Sin área') || user.role === 'jefe'),
    people: visible.map((r) => ({ ...r, email: undefined, name: r.isMe ? `${r.name} (tú)` : showNames ? r.name : `Persona ${letters.get(r.id)}` })),
    showNames, minGroup,
  });
});
