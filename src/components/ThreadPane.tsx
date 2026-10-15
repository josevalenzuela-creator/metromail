'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from './App';
import { api, longDate, quickTimes, STATE_META, type AiInsight, type InboxItem, type State, type Task, ago, todayISO, zonedISO, dueLabel } from './lib';
import { EmailFrame, Icon, Pills, Spinner } from './ui';

type Msg = { id: string; from: { name: string; email: string }; to: { name: string; email: string }[]; cc: { name: string; email: string }[]; date: string; subject: string; html: string; text: string; mine: boolean; attachments: { filename: string; mimeType: string; size: number; attachmentId: string; messageId: string }[] };
type ThreadData = { id: string; subject: string; messages: Msg[]; ai: AiInsight | null; state: { state: State; followUpAt: string | null; followUpNote: string | null; pinned: boolean; muted: boolean; noReply: boolean; snoozeUntil: string | null; waitingSince: string | null } | null };

export default function ThreadPane({ id, item, onPatch, onLeave, siblings }: { id: string; item: InboxItem | null; onPatch: (ch: Partial<InboxItem>) => void; onLeave: (next: string | null) => void; siblings: string[] }) {
  const { me, toast, createTask, go } = useApp();
  const [data, setData] = useState<ThreadData | null>(null);
  const [error, setError] = useState('');
  const [images, setImages] = useState(false);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [ai, setAi] = useState<AiInsight | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const d = await api<ThreadData>(`/api/threads/${id}`);
      setData(d); setAi(d.ai);
      api<{ tasks: Task[] }>('/api/tasks').then((r) => setTasks(r.tasks.filter((t) => t.threadId === id))).catch(() => null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Error'); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const state: State = item?.state || data?.state?.state || 'pendiente';
  const nextAfter = () => { const i = siblings.indexOf(id); return siblings[i + 1] || siblings[i - 1] || null; };

  const setState = async (s: State, extra: Record<string, unknown> = {}, msg?: string) => {
    const prev = state;
    setBusy(true);
    try {
      await api(`/api/threads/${id}/state`, { body: { state: s, ...extra } });
      onPatch({ state: s, ...(extra as Partial<InboxItem>), ...(s === 'esperando' ? { waitingSince: new Date().toISOString() } : {}) });
      toast(msg || `Estado: ${STATE_META[s].label}`, { undo: () => api(`/api/threads/${id}/state`, { body: { state: prev } }).then(() => onPatch({ state: prev })).catch(() => toast('No se pudo deshacer', { error: true })) });
      if (s !== 'pendiente' && s !== 'gestion') onLeave(nextAfter());
    } catch (e) { toast(e instanceof Error ? e.message : 'Error', { error: true }); }
    finally { setBusy(false); setSnoozeOpen(false); }
  };

  const setFlag = async (body: Record<string, unknown>, msg: string) => {
    try { await api(`/api/threads/${id}/state`, { body }); onPatch(body as Partial<InboxItem>); setData((d) => d && d.state ? { ...d, state: { ...d.state, ...body } } : d); toast(msg); load(); }
    catch (e) { toast(e instanceof Error ? e.message : 'Error', { error: true }); }
  };

  const analyze = async () => {
    setAiBusy(true);
    try { const r = await api<{ ai: AiInsight }>(`/api/threads/${id}/ai`, { body: {} }); setAi(r.ai); onPatch({ ai: r.ai }); }
    catch (e) { toast(e instanceof Error ? e.message : 'Error', { error: true }); }
    finally { setAiBusy(false); }
  };

  if (error) return <div style={{ padding: 24 }} className="banner bad">{error} <button className="btn btn-sm" onClick={load}>Reintentar</button></div>;
  if (!data) return <div style={{ padding: 24 }}><Spinner label="Abriendo la conversación…" /></div>;

  const last = data.messages[data.messages.length - 1];
  const lastIn = [...data.messages].reverse().find((m) => !m.mine) || last;
  const fu = data.state?.followUpAt || item?.followUpAt || null;
  const hasRemote = data.messages.some((m) => /<img[^>]+src=["']?https?:/i.test(m.html));

  return (
    <div className="col" style={{ gap: 0 }}>
      <div className="toolbar" role="toolbar" aria-label="Acciones">
        <div className="seg">
          {(['pendiente', 'gestion', 'esperando'] as State[]).map((s) => <button key={s} aria-pressed={state === s} disabled={busy} onClick={() => state !== s && setState(s)}>{s === 'esperando' ? 'Esperando' : STATE_META[s].label}</button>)}
        </div>
        <div style={{ position: 'relative' }}>
          <button className="btn btn-sm" aria-expanded={snoozeOpen} onClick={() => setSnoozeOpen(!snoozeOpen)}>Posponer ▾</button>
          {snoozeOpen ? (
            <div className="menu" style={{ top: 38, left: 0 }}>
              {quickTimes().map((o) => <button key={o.label} onClick={() => setState('pospuesto', { snoozeUntil: o.iso }, `Pospuesta: vuelve ${o.label.toLowerCase()}`)}>{o.label}</button>)}
            </div>
          ) : null}
        </div>
        <button className="btn btn-sm" disabled={busy} onClick={() => setState('apartado', {}, 'Apartada: la encuentras en Apartados')}>Apartar</button>
        <button className="btn btn-sm" onClick={() => setFlag({ pinned: !(item?.pinned || data.state?.pinned) }, item?.pinned ? 'Desfijada' : 'Fijada arriba del Smart Inbox')}>{item?.pinned || data.state?.pinned ? 'Desfijar' : 'Fijar'}</button>
        <button className="btn btn-sm" disabled={busy} onClick={() => setState('finalizado', { muted: true }, 'Silenciada: archivada y no se reabrirá')}>Silenciar</button>
        <button className="btn btn-sm" onClick={() => createTask({ threadId: id, subject: data.subject, from: `${lastIn.from.name} <${lastIn.from.email}>`, ai })}><Icon name="board" />Crear tarea</button>
        <span className="spacer" />
        <button className="btn btn-good btn-sm" disabled={busy} onClick={() => setState('finalizado', {}, 'Finalizada y archivada en Gmail')}><Icon name="check" />Finalizar</button>
      </div>

      {state === 'esperando' ? <div className="banner warn" style={{ borderRadius: 0 }}>Esperando respuesta {item?.waitingSince ? `hace ${ago(item.waitingSince)}` : ''}. Cuando respondan, vuelve sola a la bandeja.</div> : null}
      {state === 'pospuesto' ? <div className="banner info" style={{ borderRadius: 0 }}>Pospuesta: vuelve a la bandeja {item?.snoozeUntil ? longDate(item.snoozeUntil) : ''}. <button className="btn btn-sm" onClick={() => setState('pendiente', {}, 'De vuelta en la bandeja')}>Volver ahora</button></div> : null}
      {state === 'apartado' ? <div className="banner" style={{ borderRadius: 0, background: '#ECEDEF' }}>Apartada, sin fecha. <button className="btn btn-sm" onClick={() => setState('pendiente', {}, 'De vuelta en la bandeja')}>Volver a la bandeja</button></div> : null}

      <div style={{ padding: '18px 20px 4px' }} className="col">
        <h2 style={{ fontSize: 22, lineHeight: 1.25 }}>{data.subject}</h2>
        <div className="row small muted">
          <span className={`chip ${STATE_META[state].cls}`}>{STATE_META[state].label}</span>
          {item ? <span className="chip">{item.category}</span> : null}
          {hasRemote && !images ? <button className="btn btn-sm" onClick={() => setImages(true)}>Mostrar imágenes</button> : null}
        </div>
      </div>

      <div className="row" style={{ alignItems: 'flex-start', padding: '12px 20px 32px', gap: 16 }}>
        <div className="col" style={{ flex: '999 1 380px', minWidth: 0, gap: 12 }}>
          {data.messages.map((m, i) => <Message key={m.id} m={m} images={images} collapsed={i < data.messages.length - 3} />)}
          <Reply threadId={id} last={last} lastIn={lastIn} ai={ai} onSent={(after) => { load(); if (after) onPatch({ state: after, ...(after === 'esperando' ? { waitingSince: new Date().toISOString() } : {}) }); if (after && after !== 'pendiente' && after !== 'gestion') onLeave(nextAfter()); }} />
        </div>

        <aside className="col" style={{ flex: '1 1 280px', minWidth: 0, gap: 12 }}>
          {me.aiEnabled ? (
            <div className="aside-card">
              <div className="row"><span style={{ color: 'var(--violet)' }}><Icon name="spark" size={18} /></span><h3 className="grow" style={{ fontSize: 15 }}>Resumen IA</h3>
                <button className="btn btn-sm" onClick={analyze} disabled={aiBusy}>{aiBusy ? 'Analizando…' : ai ? 'Actualizar' : 'Analizar'}</button></div>
              {ai ? (
                <>
                  <p style={{ lineHeight: 1.55 }}>{ai.summary}</p>
                  {ai.requests.length ? <div className="col" style={{ gap: 4 }}><span className="small muted" style={{ fontWeight: 700 }}>Te piden</span>{ai.requests.map((r) => <span key={r}>› {r}</span>)}</div> : null}
                  {ai.commitments.length ? <div className="col" style={{ gap: 4 }}><span className="small muted" style={{ fontWeight: 700 }}>Compromisos</span>{ai.commitments.map((r) => <span key={r}>● {r}</span>)}</div> : null}
                  {ai.priority ? <div className="col" style={{ gap: 2 }}><span className="small muted" style={{ fontWeight: 700 }}>Prioridad sugerida</span><span>{ai.priority}</span></div> : null}
                  {ai.nextAction ? <div className="col" style={{ gap: 2 }}><span className="small muted" style={{ fontWeight: 700 }}>Próxima acción</span><span>{ai.nextAction}</span></div> : null}
                  <span className="small muted">Generado por IA a partir del hilo. Verifica antes de actuar.</span>
                </>
              ) : <p className="muted small">Resume el hilo y detecta lo que te piden y lo que prometiste.</p>}
            </div>
          ) : null}

          <div className="aside-card">
            <h3 style={{ fontSize: 15 }}>Tareas de este correo</h3>
            {tasks.map((t) => <button key={t.id} className="check" onClick={() => go('tasks', { task: t.id })} style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}><span style={{ fontWeight: 600, fontSize: 13 }}>{t.title}</span><span className="small muted">{t.assigneeEmail}, {t.status === 'hecho' ? 'hecha' : dueLabel(t.dueDate).toLowerCase()}</span></button>)}
            {!tasks.length ? <span className="small muted">Convierte el correo en trabajo para ti o tu equipo.</span> : null}
            <button className="btn btn-sm" onClick={() => createTask({ threadId: id, subject: data.subject, from: `${lastIn.from.name} <${lastIn.from.email}>`, ai })}>Crear tarea o proyecto</button>
          </div>

          <div className="aside-card">
            <h3 style={{ fontSize: 15 }}>Seguimiento</h3>
            {fu ? (
              <>
                <span className={`chip ${new Date(fu) < new Date() ? 'red' : 'amber'}`} style={{ alignSelf: 'flex-start' }}>Recordatorio {longDate(fu)}</span>
                <button className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setFlag({ followUpAt: null }, 'Recordatorio resuelto')}>Marcar resuelto</button>
              </>
            ) : (
              <>
                <span className="small muted">Recordarme sobre esta conversación:</span>
                <div className="row" style={{ gap: 6 }}>
                  {quickTimes().slice(0, 3).map((o) => <button key={o.label} className="pill" onClick={() => setFlag({ followUpAt: o.iso, followUpNote: data.subject }, `Recordatorio: ${o.label.toLowerCase()}`)}>{o.label.replace(' a las ', ' ')}</button>)}
                  <label className="pill" style={{ cursor: 'pointer' }}>Otra fecha<input type="date" min={todayISO()} className="sr" onChange={(e) => e.target.value && setFlag({ followUpAt: zonedISO(e.target.value, 9), followUpNote: data.subject }, 'Recordatorio creado')} /></label>
                </div>
              </>
            )}
            <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setFlag({ noReply: !data.state?.noReply }, data.state?.noReply ? 'Vuelve a contar en tu SLA' : 'Marcada como «no requiere respuesta»: sale de tu SLA')}>
              {data.state?.noReply ? 'Contar en mi SLA' : 'No requiere respuesta'}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Message({ m, images, collapsed }: { m: Msg; images: boolean; collapsed: boolean }) {
  const [open, setOpen] = useState(!collapsed);
  return (
    <article className={'msg' + (m.mine ? ' mine' : '')}>
      <button className="msg-head" style={{ width: '100%', border: 0, background: 'transparent', textAlign: 'left' }} onClick={() => setOpen(!open)} aria-expanded={open}>
        <span style={{ fontWeight: 600 }}>{m.mine ? 'Tú' : m.from.name}</span>
        <span className="small muted">{m.from.email}</span>
        <span className="spacer" />
        <span className="small muted">{longDate(m.date)}</span>
        {!open ? <span className="small muted" style={{ width: '100%' }}>{(m.text || '').slice(0, 140)}</span> : null}
      </button>
      {open ? (
        <>
          <div className="small muted" style={{ padding: '0 16px 6px' }}>Para: {m.to.map((a) => a.name || a.email).join(', ')}{m.cc.length ? ` · CC: ${m.cc.map((a) => a.name || a.email).join(', ')}` : ''}</div>
          <EmailFrame html={m.html} text={m.text} allowImages={images} />
          {m.attachments.length ? (
            <div className="row" style={{ padding: '0 16px 14px', gap: 6 }}>
              {m.attachments.map((a) => (
                <a key={a.attachmentId} className="attach" href={`/api/threads/x/attachment?m=${encodeURIComponent(a.messageId)}&a=${encodeURIComponent(a.attachmentId)}&name=${encodeURIComponent(a.filename)}&type=${encodeURIComponent(a.mimeType)}`}>
                  <Icon name="clip" size={14} />{a.filename} <span className="muted">({Math.max(1, Math.round(a.size / 1024))} KB)</span>
                </a>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </article>
  );
}

const TONES: [string, string][] = [['ejecutivo', 'Ejecutivo'], ['formal', 'Formal'], ['cercano', 'Cercano'], ['breve', 'Breve']];

function Reply({ threadId, last, lastIn, ai, onSent }: { threadId: string; last: Msg; lastIn: Msg; ai: AiInsight | null; onSent: (after: State | null) => void }) {
  const { me, toast } = useApp();
  const [mode, setMode] = useState<'uno' | 'todos'>('uno');
  const [draft, setDraft] = useState('');
  const [tone, setTone] = useState('ejecutivo');
  const [sigId, setSigId] = useState<string | null>(me.settings.sigReplyId || null);
  const [sigHtml, setSigHtml] = useState('');
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [after, setAfter] = useState<State>('esperando');
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!sigId) { setSigHtml(''); return; }
    api<{ signatures: { id: string; preview: string }[] }>('/api/signatures').then((r) => setSigHtml(r.signatures.find((s) => s.id === sigId)?.preview || '')).catch(() => setSigHtml(''));
  }, [sigId]);

  const meEmail = me.user.email.toLowerCase();
  const toList = mode === 'uno' ? [lastIn.mine ? (last.to[0]?.email || '') : lastIn.from.email] : [...new Set([lastIn.from.email, ...last.to.map((a) => a.email), ...last.cc.map((a) => a.email)].filter((e) => e && e.toLowerCase() !== meEmail))];
  const to = mode === 'uno' ? toList : toList.slice(0, 1);
  const cc = mode === 'todos' ? toList.slice(1) : [];

  const gen = async () => {
    setAiBusy(true);
    try { const r = await api<{ draft: string }>('/api/ai/draft', { body: { threadId, tone } }); setDraft(r.draft); ref.current?.focus(); toast('Borrador generado: revísalo antes de enviar'); }
    catch (e) { toast(e instanceof Error ? e.message : 'Error', { error: true }); }
    finally { setAiBusy(false); }
  };

  const send = async () => {
    if (!draft.trim()) { toast('Escribe o genera una respuesta primero', { error: true }); return; }
    setBusy(true);
    try {
      await api('/api/send', { body: { to: to.join(', '), cc: cc.join(', '), body: draft, signatureId: sigId, threadId, after } });
      toast(`Respuesta enviada. ${after === 'esperando' ? 'Queda en Esperando respuesta.' : after === 'finalizado' ? 'Conversación finalizada.' : 'Queda pendiente.'}`);
      setDraft('');
      onSent(after === 'pendiente' ? null : after);
    } catch (e) { toast(e instanceof Error ? e.message : 'Error', { error: true }); }
    finally { setBusy(false); }
  };

  return (
    <div className="aside-card" style={{ gap: 10 }}>
      <div className="row">
        <span style={{ fontWeight: 600 }}>Responder</span>
        <Pills label="A quién" value={mode} onChange={setMode} options={[['uno', 'Al remitente'], ['todos', 'A todos']]} />
        <span className="spacer" />
        {me.aiEnabled ? <Pills label="Tono" value={tone} onChange={setTone} options={TONES as [string, string][]} /> : null}
      </div>
      <span className="small muted">Para: {to.join(', ') || '—'}{cc.length ? ` · CC: ${cc.join(', ')}` : ''}</span>
      <label className="sr" htmlFor="reply">Texto de la respuesta</label>
      <textarea id="reply" ref={ref} className="textarea" rows={7} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={me.aiEnabled ? 'Escribe tu respuesta o genera un borrador con IA…' : 'Escribe tu respuesta…'} style={{ background: 'var(--surface-2)' }} />
      <div className="row" style={{ gap: 6 }}>
        <span className="small muted">Firma</span>
        <button className="pill" aria-pressed={!sigId} onClick={() => setSigId(null)}>Sin firma</button>
        {me.signatures.map((s) => <button key={s.id} className="pill" aria-pressed={sigId === s.id} onClick={() => setSigId(s.id)}>{s.name}</button>)}
      </div>
      {sigHtml ? <div style={{ padding: '10px 12px', border: '1px dashed var(--ctl)', borderRadius: 8, background: '#fff' }} dangerouslySetInnerHTML={{ __html: sigHtml }} /> : null}
      <div className="row" style={{ gap: 6 }}>
        <span className="small muted">Después de enviar, queda</span>
        <Pills label="Después de enviar" value={after} onChange={setAfter} options={[['esperando', 'Esperando respuesta'], ['pendiente', 'Pendiente'], ['finalizado', 'Finalizada']]} />
      </div>
      <div className="row">
        {me.aiEnabled ? <button className="btn" onClick={gen} disabled={aiBusy}><Icon name="spark" />{aiBusy ? 'Redactando…' : 'Borrador IA'}</button> : null}
        <span className="grow small muted">{ai?.nextAction ? `Sugerencia: ${ai.nextAction}` : 'La IA sugiere; el envío siempre lo apruebas tú.'}</span>
        <button className="btn btn-primary" onClick={send} disabled={busy}>{busy ? 'Enviando…' : 'Enviar'}</button>
      </div>
    </div>
  );
}

