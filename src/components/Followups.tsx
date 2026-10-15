'use client';
import { useCallback, useEffect, useState } from 'react';
import { useApp } from './App';
import { ago, api, localISODate, longDate, quickTimes, STATE_META, todayISO, type State } from './lib';
import { Icon, Spinner } from './ui';

type Item = { threadId: string; state: State; subject: string; fromName: string; snippet: string; followUpAt: string | null; followUpNote: string | null; waitingSince: string | null; snoozeUntil: string | null };

export default function Followups() {
  const { go, toast, setCounts } = useApp();
  const [items, setItems] = useState<Item[] | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ items: Item[] }>('/api/followups');
      setItems(r.items);
      setCounts({ overdue: r.items.filter((f) => f.followUpAt && new Date(f.followUpAt) < new Date()).length });
    } catch (e) { toast(e instanceof Error ? e.message : 'Error', { error: true }); setItems([]); }
  }, [setCounts, toast]);
  useEffect(() => { load(); }, [load]);

  const patch = async (id: string, body: Record<string, unknown>, msg: string) => {
    try { await api(`/api/threads/${id}/state`, { body }); toast(msg); load(); }
    catch (e) { toast(e instanceof Error ? e.message : 'Error', { error: true }); }
  };

  const now = new Date(), today = todayISO();
  const withFu = (items || []).filter((i) => i.followUpAt).sort((a, b) => a.followUpAt!.localeCompare(b.followUpAt!));
  const overdue = withFu.filter((i) => new Date(i.followUpAt!) < now);
  const todayL = withFu.filter((i) => new Date(i.followUpAt!) >= now && localISODate(new Date(i.followUpAt!)) === today);
  const later = withFu.filter((i) => localISODate(new Date(i.followUpAt!)) > today);
  const waiting = (items || []).filter((i) => !i.followUpAt && i.state === 'esperando').sort((a, b) => (a.waitingSince || '').localeCompare(b.waitingSince || ''));
  const parked = (items || []).filter((i) => !i.followUpAt && (i.state === 'pospuesto' || i.state === 'apartado'));

  const Row = ({ i, kind }: { i: Item; kind: 'fu' | 'wait' | 'park' }) => (
    <div className="trow" style={{ alignItems: 'center' }}>
      <button className="grow" style={{ textAlign: 'left', background: 'none', border: 0, padding: 0, color: 'inherit', font: 'inherit', cursor: 'pointer', minWidth: 0 }} onClick={() => go('inbox', { t: i.threadId })}>
        <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}><b style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.subject}</b><span className={'chip ' + STATE_META[i.state].cls}>{STATE_META[i.state].label}</span></div>
        <span className="small muted">
          {i.fromName}
          {kind === 'fu' ? ` · ${longDate(i.followUpAt!)}${i.followUpNote ? ` · ${i.followUpNote}` : ''}` : ''}
          {kind === 'wait' && i.waitingSince ? ` · esperando hace ${ago(i.waitingSince)}` : ''}
          {kind === 'park' && i.snoozeUntil ? ` · vuelve ${longDate(i.snoozeUntil)}` : ''}
        </span>
      </button>
      {kind === 'fu' ? (
        <>
          <button className="btn btn-sm" onClick={() => patch(i.threadId, { followUpAt: quickTimes()[0].iso }, `Recordatorio movido a ${quickTimes()[0].label.toLowerCase()}`)}>Posponer</button>
          <button className="btn btn-sm btn-good" onClick={() => patch(i.threadId, { followUpAt: null, followUpNote: null }, 'Seguimiento resuelto')}><Icon name="check" />Listo</button>
        </>
      ) : kind === 'wait' ? (
        <button className="btn btn-sm" onClick={() => patch(i.threadId, { followUpAt: quickTimes()[1].iso }, 'Te recordaremos mañana a las 9:00')}>Recordar mañana</button>
      ) : (
        <button className="btn btn-sm" onClick={() => patch(i.threadId, { state: 'pendiente' }, 'Devuelto a la bandeja')}>A la bandeja</button>
      )}
    </div>
  );

  const Section = ({ title, list, kind, tone }: { title: string; list: Item[]; kind: 'fu' | 'wait' | 'park'; tone?: string }) => list.length ? (
    <section className="card" style={{ overflow: 'hidden' }}>
      <div className="sec-head" style={tone ? { background: tone } : undefined}><span className="grow">{title}</span><span className="num">{list.length}</span></div>
      <div className="col" style={{ gap: 0 }}>{list.map((i) => <Row key={i.threadId} i={i} kind={kind} />)}</div>
    </section>
  ) : null;

  return (
    <div className="page">
      <div><h1>Seguimientos</h1><p className="muted" style={{ margin: '4px 0 0' }}>Correos que te pediste recordar y conversaciones donde esperas respuesta.</p></div>
      {!items ? <Spinner /> : !items.length ? (
        <div className="card empty"><strong>Sin seguimientos</strong><span>Desde un correo usa «Recordarme» o márcalo «Esperando respuesta» para verlo aquí.</span></div>
      ) : (
        <>
          <Section title="Vencidos" list={overdue} kind="fu" tone="var(--bad-bg)" />
          <Section title="Hoy" list={todayL} kind="fu" tone="var(--warn-bg)" />
          <Section title="Próximos" list={later} kind="fu" />
          <Section title="Esperando respuesta, sin recordatorio" list={waiting} kind="wait" />
          <Section title="Pospuestos y apartados" list={parked} kind="park" />
        </>
      )}
    </div>
  );
}
