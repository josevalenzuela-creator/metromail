'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from './App';
import { api, CAT_COLOR, fmtHours, type InboxItem, type Task } from './lib';
import { Bar, Icon, Spinner } from './ui';
import { ageText, flagsOf, tsLabel } from './taskKpi';

export type SlaData = {
  measured: number; ok: number; pct: number | null; prevPct: number | null; medianH: number | null; p90H: number | null; lateNow: number; riskNow: number;
  lateThreads: { threadId: string; elapsedH: number; target: number; senderType: string; late: boolean; subject: string; fromName: string }[];
  byCat: { cat: string; n: number; ok: number; medianH: number | null; target: number }[];
  trend: { label: string; n: number; ok: number; pct: number | null }[];
  targets: { Clientes: number; Equipo: number; Proveedores: number }; biz: boolean;
  sync: { status: string; processed: number; total: number; lastRunAt: string | null } | null;
};

type Fu = { threadId: string; followUpAt: string | null; state: string };

/** Ejecuta la sincronización de SLA por tramos hasta terminar. */
export function useSlaSync(onDone: () => void) {
  const [prog, setProg] = useState<{ processed: number; total: number } | null>(null);
  const running = useRef(false);
  const run = useCallback(async (force = false) => {
    if (running.current) return;
    running.current = true;
    try {
      let first = true;
      for (let i = 0; i < 60; i++) {
        const r = await api<{ status: string; processed: number; total: number }>(`/api/sla/sync${first && force ? '?force=1' : ''}`, { body: {} });
        first = false;
        setProg({ processed: r.processed, total: r.total });
        if (r.status !== 'running') break;
      }
    } catch { /* se reintenta en la próxima visita */ }
    finally { running.current = false; setProg(null); onDone(); }
  }, [onDone]);
  return { prog, run };
}

export default function Home() {
  const { me, go, toast, setCounts, createTask } = useApp();
  const [inbox, setInbox] = useState<InboxItem[] | null>(null);
  const [fus, setFus] = useState<Fu[] | null>(null);
  const [sla, setSla] = useState<SlaData | null>(null);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [days, setDays] = useState(30);

  const loadSla = useCallback(() => { api<SlaData>(`/api/sla/summary?days=${days}`).then(setSla).catch(() => null); }, [days]);
  const { prog, run } = useSlaSync(loadSla);

  useEffect(() => {
    api<{ items: InboxItem[] }>('/api/inbox').then((r) => { setInbox(r.items); setCounts({ inbox: r.items.filter((i) => i.state === 'pendiente' || i.state === 'gestion').length }); }).catch((e) => { setInbox([]); toast(e.message, { error: true }); });
    api<{ items: Fu[] }>('/api/followups').then((r) => { setFus(r.items); setCounts({ overdue: r.items.filter((f) => f.followUpAt && new Date(f.followUpAt) < new Date()).length }); }).catch(() => setFus([]));
    api<{ tasks: Task[] }>('/api/tasks').then((r) => { setTasks(r.tasks); setCounts({ myTasks: r.tasks.filter((t) => t.status !== 'hecho' && (t.assigneeEmail === me.user.email || t.collaborators.includes(me.user.email))).length }); }).catch(() => setTasks([]));
  }, [me.user.email, setCounts, toast]);

  useEffect(() => { loadSla(); }, [loadSla]);
  // Primera visita o sincronización a medias: seguir sincronizando.
  const started = useRef(false);
  useEffect(() => {
    if (!sla || started.current) return;
    const stale = !sla.sync?.lastRunAt || Date.now() - new Date(sla.sync.lastRunAt).getTime() > 6 * 3_600_000;
    if (!sla.sync || sla.sync.status === 'running' || stale) { started.current = true; run(); }
  }, [sla, run]);

  const first = (me.user.name || me.user.email).split(/[\s@]/)[0];
  const pend = inbox?.filter((i) => i.state === 'pendiente').length ?? null;
  const gest = inbox?.filter((i) => i.state === 'gestion').length ?? null;
  const wait = inbox?.filter((i) => i.state === 'esperando').length ?? null;
  const overdueFu = fus?.filter((f) => f.followUpAt && new Date(f.followUpAt) < new Date()).length ?? null;

  const open = (tasks || []).filter((t) => t.status !== 'hecho');
  const fl = open.map((t) => ({ t, f: flagsOf(t, me.user.email) }));
  const kOverdue = fl.filter((x) => x.f.overdue).length;
  const kNoResp = fl.filter((x) => x.f.noResp).length;
  const kStale = fl.filter((x) => x.f.stale).length;
  const kUrgent = fl.filter((x) => x.f.urgent).map((x) => x.t).sort((a, b) => (a.dueDate || '9').localeCompare(b.dueDate || '9'));
  const mine = open.filter((t) => t.assigneeEmail === me.user.email);
  const name = (e: string) => (me.members.find((m) => m.email === e)?.name || e).split(' ')[0];

  const nudge = async (t: Task) => {
    try { await api(`/api/tasks/${t.id}/nudge`, { body: {} }); toast(`Recordatorio enviado a ${name(t.assigneeEmail)}`); }
    catch (e) { toast(e instanceof Error ? e.message : 'Error', { error: true }); }
  };

  const n = (v: number | null) => (v === null ? '…' : v);
  const delta = sla && sla.pct !== null && sla.prevPct !== null ? sla.pct - sla.prevPct : null;

  return (
    <div className="page">
      <div className="row" style={{ gap: 12 }}>
        <div className="grow"><h1>Hola, {first}</h1><p className="muted" style={{ margin: '4px 0 0' }}>Lo que necesita tu atención hoy.</p></div>
        <button className="btn" onClick={() => createTask({})}>Nueva tarea</button>
        <button className="btn btn-primary" onClick={() => go('inbox')}><Icon name="inbox" />Ir a la bandeja</button>
      </div>

      <section className="tiles" aria-label="Correo">
        <button className="tile" onClick={() => go('inbox')}><span className="tile-label">Pendientes</span><span className="tile-value">{n(pend)}</span><span className="small muted">por revisar en tu bandeja</span></button>
        <button className="tile" onClick={() => go('inbox')}><span className="tile-label">En gestión</span><span className="tile-value">{n(gest)}</span><span className="small muted">trabajando en ellos</span></button>
        <button className="tile" onClick={() => go('inbox', { f: 'esperando' })}><span className="tile-label">Esperando respuesta</span><span className="tile-value">{n(wait)}</span><span className="small muted">la pelota está del otro lado</span></button>
        <button className="tile" onClick={() => go('followups')} style={overdueFu ? { background: 'var(--warn-bg)' } : undefined}><span className="tile-label">Seguimientos vencidos</span><span className="tile-value">{n(overdueFu)}</span><span className="small muted">recordatorios que ya pasaron</span></button>
      </section>

      <section className="card pad col" style={{ gap: 14 }} aria-label="Mi SLA de respuesta">
        <div className="row" style={{ gap: 10 }}>
          <h2 className="grow" style={{ fontSize: 18 }}>Mi SLA de respuesta</h2>
          {prog ? <Spinner label={`Analizando correos ${prog.processed}/${prog.total || '…'}`} /> : <button className="btn btn-ghost btn-sm" onClick={() => run(true)}><Icon name="refresh" />Recalcular</button>}
          <div className="seg">{[7, 30, 90].map((d) => <button key={d} aria-pressed={days === d} onClick={() => setDays(d)}>{d} días</button>)}</div>
        </div>
        {!sla ? <Spinner /> : sla.measured === 0 && !sla.lateNow && !sla.riskNow ? (
          <div className="banner info">{prog ? 'Estamos leyendo los metadatos de tus correos de los últimos 90 días. Toma uno o dos minutos la primera vez.' : 'Aún no hay correos dirigidos a ti con respuesta medible en este período.'}</div>
        ) : (
          <>
            <div className="tiles">
              <div className="tile"><span className="tile-label">Respondidos a tiempo</span><span className="tile-value" style={{ color: (sla.pct ?? 100) >= 80 ? 'var(--good)' : 'var(--warn)' }}>{sla.pct === null ? '—' : `${sla.pct}%`}</span>
                <span className="small muted">{sla.ok} de {sla.measured}{delta !== null ? ` · ${delta >= 0 ? '+' : ''}${delta} pts vs período anterior` : ''}</span></div>
              <div className="tile"><span className="tile-label">Tiempo típico de respuesta</span><span className="tile-value">{fmtHours(sla.medianH)}</span><span className="small muted">mediana{sla.biz ? ', en horario hábil' : ''}</span></div>
              <div className="tile"><span className="tile-label">9 de cada 10 en menos de</span><span className="tile-value">{fmtHours(sla.p90H)}</span><span className="small muted">percentil 90</span></div>
              <button className="tile" onClick={() => go('inbox')} style={sla.lateNow ? { background: 'var(--bad-bg)' } : undefined}><span className="tile-label">Fuera de plazo ahora</span><span className="tile-value" style={{ color: sla.lateNow ? 'var(--bad)' : undefined }}>{sla.lateNow}</span><span className="small muted">{sla.riskNow} más por vencer</span></button>
            </div>
            <div className="row" style={{ gap: 24, alignItems: 'flex-start' }}>
              <div className="col grow" style={{ minWidth: 260, gap: 10 }}>
                <b style={{ fontSize: 13 }}>Por tipo de remitente</b>
                {sla.byCat.map((c) => {
                  const pct = c.n ? Math.round((c.ok / c.n) * 100) : 0;
                  return (
                    <div key={c.cat} className="col" style={{ gap: 4 }}>
                      <div className="row small"><span className="grow"><span className="dot" style={{ background: CAT_COLOR[c.cat], display: 'inline-block', marginRight: 6 }} />{c.cat} <span className="muted">· meta {c.target} h</span></span><span className="num">{c.n ? `${pct}% · ${fmtHours(c.medianH)}` : 'sin datos'}</span></div>
                      <Bar pct={pct} target={80} color={pct >= 80 ? 'var(--good)' : 'var(--warn)'} />
                    </div>
                  );
                })}
              </div>
              <div className="col grow" style={{ minWidth: 260, gap: 6 }}>
                <b style={{ fontSize: 13 }}>Requieren respuesta</b>
                {sla.lateThreads.length ? sla.lateThreads.slice(0, 6).map((x) => (
                  <button key={x.threadId} className="trow" style={{ textAlign: 'left' }} onClick={() => go('inbox', { t: x.threadId })}>
                    <span className={'chip ' + (x.late ? 'red' : 'amber')}>{x.late ? 'Vencido' : 'Por vencer'}</span>
                    <span className="grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><b>{x.fromName}</b> · {x.subject}</span>
                    <span className="small muted num">{fmtHours(x.elapsedH)} / {x.target} h</span>
                  </button>
                )) : <span className="small muted">Nada fuera de plazo. Bien.</span>}
              </div>
            </div>
          </>
        )}
      </section>

      <section className="card pad col" style={{ gap: 14 }} aria-label="Tareas">
        <div className="row"><h2 className="grow" style={{ fontSize: 18 }}>Tareas del equipo</h2><button className="btn btn-ghost btn-sm" onClick={() => go('tasks')}>Ver tablero<Icon name="arrow" /></button></div>
        {!tasks ? <Spinner /> : (
          <>
            <div className="tiles">
              <button className="tile" onClick={() => go('tasks', { flag: 'urgent' })} style={kUrgent.length ? { background: 'var(--bad-bg)' } : undefined}><span className="tile-label">Urgentes</span><span className="tile-value">{kUrgent.length}</span><span className="small muted">vencidas o alta prioridad para mañana</span></button>
              <button className="tile" onClick={() => go('tasks', { flag: 'overdue' })}><span className="tile-label">Vencidas</span><span className="tile-value">{kOverdue}</span><span className="small muted">pasaron su fecha límite</span></button>
              <button className="tile" onClick={() => go('tasks', { flag: 'noResp' })} style={kNoResp ? { background: 'var(--warn-bg)' } : undefined}><span className="tile-label">Sin respuesta del equipo</span><span className="tile-value">{kNoResp}</span><span className="small muted">sin empezar o sin contestar en 24 h</span></button>
              <button className="tile" onClick={() => go('tasks', { flag: 'stale' })}><span className="tile-label">Sin avance</span><span className="tile-value">{kStale}</span><span className="small muted">3 días o más sin cambios</span></button>
            </div>
            <div className="row" style={{ gap: 24, alignItems: 'flex-start' }}>
              <div className="col grow" style={{ minWidth: 260, gap: 6 }}>
                <b style={{ fontSize: 13 }}>Lo más urgente</b>
                {kUrgent.length ? kUrgent.slice(0, 6).map((t) => (
                  <div key={t.id} className="trow">
                    <button className="grow" style={{ textAlign: 'left', background: 'none', border: 0, padding: 0, color: 'inherit', font: 'inherit', cursor: 'pointer' }} onClick={() => go('tasks', { task: t.id })}>
                      <b>{t.title}</b><br /><span className="small muted">{name(t.assigneeEmail)} · {tsLabel(t.status)} · {t.dueDate ? (flagsOf(t, me.user.email).overdue ? 'vencida' : 'vence pronto') : ''}</span>
                    </button>
                    {t.assigneeEmail !== me.user.email ? <button className="btn btn-sm" onClick={() => nudge(t)}>Recordar</button> : null}
                  </div>
                )) : <span className="small muted">No hay tareas urgentes.</span>}
              </div>
              <div className="col grow" style={{ minWidth: 260, gap: 6 }}>
                <b style={{ fontSize: 13 }}>Esperando al equipo</b>
                {fl.filter((x) => x.f.noResp).slice(0, 6).map(({ t, f }) => (
                  <div key={t.id} className="trow">
                    <button className="grow" style={{ textAlign: 'left', background: 'none', border: 0, padding: 0, color: 'inherit', font: 'inherit', cursor: 'pointer' }} onClick={() => go('tasks', { task: t.id })}>
                      <b>{t.title}</b><br /><span className="small muted">{name(t.assigneeEmail)} · {f.notStarted ? `sin empezar hace ${ageText(t.createdAt)}` : `sin responder tu comentario hace ${ageText(t.comments[t.comments.length - 1]?.createdAt)}`}</span>
                    </button>
                    <button className="btn btn-sm" onClick={() => nudge(t)}>Recordar</button>
                  </div>
                ))}
                {!kNoResp ? <span className="small muted">Todo el equipo al día.</span> : null}
                <span className="small muted" style={{ marginTop: 6 }}>Tienes {mine.length} {mine.length === 1 ? 'tarea abierta' : 'tareas abiertas'} a tu cargo.</span>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
