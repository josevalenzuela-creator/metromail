'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from './App';
import { addDaysISO, api, dueLabel, longDate, nextWeekdayISO, todayISO, type Project, type Task } from './lib';
import { Avatar, Drawer, EmailFrame, Icon, Pills, Spinner, Switch } from './ui';
import { flagsOf, TS, tsLabel } from './taskKpi';

const FLAG_LABEL: Record<string, string> = { overdue: 'Vencidas', noResp: 'Sin respuesta del equipo', stale: 'Sin avance hace 3 días o más', urgent: 'Urgentes' };

export default function Tasks() {
  const { me, params, go, toast, createTask, setCounts } = useApp();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [view, setView] = useState<'tablero' | 'lista'>(params.get('flag') ? 'lista' : 'tablero');
  const [scope, setScope] = useState<'todas' | 'mias'>('todas');
  const [proj, setProj] = useState(params.get('project') || 'todos');
  const flag = params.get('flag');
  const openId = params.get('task');

  const load = useCallback(async () => {
    try {
      const r = await api<{ tasks: Task[]; projects: Project[] }>('/api/tasks');
      setTasks(r.tasks); setProjects(r.projects);
      setCounts({ myTasks: r.tasks.filter((t) => t.status !== 'hecho' && (t.assigneeEmail === me.user.email || t.collaborators.includes(me.user.email))).length });
    } catch (e) { toast(e instanceof Error ? e.message : 'Error', { error: true }); }
  }, [me.user.email, setCounts, toast]);
  useEffect(() => { load(); }, [load]);

  const name = (email: string) => me.members.find((m) => m.email === email)?.name || email;
  const visible = useMemo(() => (tasks || []).filter((t) =>
    (scope === 'todas' || t.assigneeEmail === me.user.email || t.collaborators.includes(me.user.email)) &&
    (proj === 'todos' || t.projectId === proj) &&
    (!flag || flagsOf(t, me.user.email)[flag as keyof ReturnType<typeof flagsOf>])), [tasks, scope, proj, flag, me.user.email]);

  const update = async (id: string, body: Record<string, unknown>, msg?: string) => {
    setTasks((ts) => ts?.map((t) => (t.id === id ? { ...t, ...body, updatedAt: new Date().toISOString() } as Task : t)) || ts);
    try { const r = await api<{ task: Task }>(`/api/tasks/${id}`, { method: 'PATCH', body }); setTasks((ts) => ts?.map((t) => (t.id === id ? r.task : t)) || ts); if (msg) toast(msg); }
    catch (e) { toast(e instanceof Error ? e.message : 'Error', { error: true }); load(); }
  };

  const projOf = (id: string | null) => projects.find((p) => p.id === id);
  const open = tasks?.find((t) => t.id === openId) || null;
  const setParam = (p: Record<string, string>) => { const sp: Record<string, string> = {}; if (flag) sp.flag = flag; if (proj !== 'todos') sp.project = proj; go('tasks', { ...sp, ...p }); };

  return (
    <div className="page">
      <div className="row" style={{ gap: 12 }}>
        <h1 className="grow">Tareas y proyectos</h1>
        <div className="seg"><button aria-pressed={view === 'tablero'} onClick={() => setView('tablero')}>Tablero</button><button aria-pressed={view === 'lista'} onClick={() => setView('lista')}>Lista</button></div>
        <button className="btn btn-primary" onClick={() => createTask({})}>Nueva tarea</button>
      </div>
      <div className="row" style={{ gap: 6 }}>
        <Pills label="Alcance" value={scope} onChange={setScope} options={[['todas', me.user.role === 'admin' ? 'Toda la organización' : 'Todas las mías y compartidas'], ['mias', 'Donde participo']]} />
        {flag ? <button className="pill" style={{ background: 'var(--warn-bg)', borderColor: 'var(--warn-bg)', color: 'var(--warn)' }} onClick={() => go('tasks')}>Mostrando: {FLAG_LABEL[flag]} ×</button> : null}
        <span style={{ width: 1, height: 24, background: 'var(--line)', margin: '0 6px' }} />
        <button className="pill" aria-pressed={proj === 'todos'} onClick={() => setProj('todos')}>Todos los proyectos</button>
        {projects.map((p) => <button key={p.id} className="pill" aria-pressed={proj === p.id} onClick={() => setProj(p.id)}><span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color }} />{p.name}</button>)}
      </div>

      {!tasks ? <Spinner /> : view === 'tablero' ? (
        <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
          <div className="board">
            {TS.map(([k, l]) => {
              const list = visible.filter((t) => t.status === k);
              return (
                <section key={k} className="lane" aria-label={l}>
                  <h2 className="row" style={{ padding: '4px 6px', fontSize: 13 }}><span className="grow">{l}</span><span className="muted">{list.length}</span></h2>
                  {list.map((t) => <Card key={t.id} t={t} p={projOf(t.projectId)} name={name} onOpen={() => setParam({ task: t.id })} onAdvance={() => { const i = TS.findIndex((x) => x[0] === t.status); if (i < 3) update(t.id, { status: TS[i + 1][0] }, `Movida a ${TS[i + 1][1]}`); }} />)}
                  {!list.length ? <p className="small muted" style={{ padding: '10px 6px' }}>Sin tareas</p> : null}
                </section>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table className="table" style={{ minWidth: 760 }}>
            <thead><tr><th>Tarea</th><th>Estado</th><th>Responsable</th><th>Fecha límite</th><th className="r">Avance</th></tr></thead>
            <tbody>
              {[...visible].sort((a, b) => Number(a.status === 'hecho') - Number(b.status === 'hecho') || (a.dueDate || '9999').localeCompare(b.dueDate || '9999')).map((t) => {
                const done = t.checklist.filter((c) => c.done).length, p = projOf(t.projectId), f = flagsOf(t, me.user.email);
                return (
                  <tr key={t.id}>
                    <td><button className="btn btn-ghost" style={{ padding: 0, minHeight: 0, color: 'var(--ink)', fontWeight: 600, textAlign: 'left', whiteSpace: 'normal' }} onClick={() => setParam({ task: t.id })}>{t.title}</button>{p ? <div className="small muted row" style={{ gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color }} />{p.name}</div> : null}</td>
                    <td><span className={`chip ${t.status === 'hecho' ? 'green' : 'blue'}`}>{tsLabel(t.status)}</span></td>
                    <td><span className="row" style={{ flexWrap: 'nowrap' }}><Avatar name={name(t.assigneeEmail)} size={24} />{name(t.assigneeEmail)}</span></td>
                    <td><span className={`chip ${t.status === 'hecho' ? 'green' : f.overdue ? 'red' : t.dueDate === todayISO() ? 'amber' : ''}`}>{t.status === 'hecho' ? 'Hecha' : dueLabel(t.dueDate)}</span></td>
                    <td className="r muted">{t.checklist.length ? `${done}/${t.checklist.length}` : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!visible.length ? <div className="empty"><strong>Sin tareas</strong><span>Crea una desde un correo con «Crear tarea» o con «Nueva tarea».</span></div> : null}
        </div>
      )}
      {open ? <TaskDrawer t={open} projects={projects} name={name} onClose={() => setParam({})} onUpdate={(b, m) => update(open.id, b, m)} reload={load} /> : null}
    </div>
  );
}

function Card({ t, p, name, onOpen, onAdvance }: { t: Task; p?: Project; name: (e: string) => string; onOpen: () => void; onAdvance: () => void }) {
  const { me } = useApp();
  const f = flagsOf(t, me.user.email), done = t.checklist.filter((c) => c.done).length;
  const people = [t.assigneeEmail, ...t.collaborators].slice(0, 4);
  return (
    <article className="tcard">
      <button onClick={onOpen}>
        {p ? <span className="row small muted" style={{ gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color }} />{p.name}</span> : null}
        <span style={{ fontWeight: 600, lineHeight: 1.35, textDecoration: t.status === 'hecho' ? 'line-through' : undefined, color: t.status === 'hecho' ? 'var(--muted)' : undefined }}>{t.title}</span>
        <span className="row" style={{ gap: 6 }}>
          <span className={`chip ${t.status === 'hecho' ? 'green' : f.overdue ? 'red' : t.dueDate === todayISO() ? 'amber' : ''}`}>{t.status === 'hecho' ? 'Hecha' : dueLabel(t.dueDate)}</span>
          {t.priority === 'Alta' && t.status !== 'hecho' ? <span className="small" style={{ fontWeight: 700, color: 'var(--bad)' }}>Prioridad alta</span> : null}
        </span>
      </button>
      <div className="row small muted" style={{ padding: '0 12px 10px', flexWrap: 'nowrap' }}>
        <span className="row" style={{ gap: 0, flexWrap: 'nowrap' }}>{people.map((e, i) => <span key={e} style={{ marginLeft: i ? -6 : 0 }}><Avatar name={name(e)} size={26} /></span>)}</span>
        <span className="spacer" />
        {t.checklist.length ? <span className="row" style={{ gap: 3 }}><Icon name="check" size={13} />{done}/{t.checklist.length}</span> : null}
        {t.threadId ? <span aria-label="Creada desde un correo"><Icon name="mail" size={14} /></span> : null}
        {t.comments.length ? <span>{t.comments.length} coment.</span> : null}
        {t.status !== 'hecho' ? <button className="btn btn-sm" style={{ width: 30, padding: 0 }} aria-label={`Mover a ${tsLabel(TS[Math.min(3, TS.findIndex((x) => x[0] === t.status) + 1)][0])}`} onClick={onAdvance}><Icon name="arrow" size={14} /></button> : null}
      </div>
    </article>
  );
}

function TaskDrawer({ t, projects, name, onClose, onUpdate, reload }: { t: Task; projects: Project[]; name: (e: string) => string; onClose: () => void; onUpdate: (b: Record<string, unknown>, m?: string) => void; reload: () => void }) {
  const { me, toast, go } = useApp();
  const [title, setTitle] = useState(t.title);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [newItem, setNewItem] = useState('');
  const [comment, setComment] = useState('');
  const [mail, setMail] = useState<{ subject: string; messages: { id: string; from: { name: string }; date: string; html: string; text: string }[] } | null>(null);
  const [mailErr, setMailErr] = useState('');
  useEffect(() => setTitle(t.title), [t.title]);
  const p = projects.find((x) => x.id === t.projectId);
  const isOwner = t.threadOwnerId === me.user.id;
  const today = todayISO();
  const DUE: [string | null, string][] = [[today, 'Hoy'], [addDaysISO(today, 1), 'Mañana'], [nextWeekdayISO(5), 'Viernes'], [nextWeekdayISO(1), 'Lunes'], [null, 'Sin fecha']];

  const post = async () => {
    if (!comment.trim()) return;
    try { const r = await api<{ mentioned: string[] }>(`/api/tasks/${t.id}/comments`, { body: { body: comment } }); setComment(''); reload(); toast(r.mentioned.length ? `Comentario publicado. Avisamos a ${r.mentioned.join(' y ')}.` : 'Comentario publicado'); }
    catch (e) { toast(e instanceof Error ? e.message : 'Error', { error: true }); }
  };
  const loadMail = async () => {
    setMailErr('');
    if (isOwner && t.threadId) { go('inbox', { t: t.threadId }); return; }
    try { setMail(await api(`/api/tasks/${t.id}/email`)); } catch (e) { setMailErr(e instanceof Error ? e.message : 'Error'); }
  };
  const del = async () => {
    if (!confirm('¿Eliminar esta tarea? No se puede deshacer.')) return;
    try { await api(`/api/tasks/${t.id}`, { method: 'DELETE' }); toast('Tarea eliminada'); onClose(); reload(); } catch (e) { toast(e instanceof Error ? e.message : 'Error', { error: true }); }
  };
  const candidates = me.members.filter((m) => m.email !== t.assigneeEmail && !t.collaborators.includes(m.email));

  return (
    <Drawer label={t.title} onClose={onClose} head={<><span className="row grow small muted" style={{ gap: 6 }}>{p ? <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color }} /> : null}{p?.name || 'Sin proyecto'}</span>{t.createdById === me.user.id || me.user.role === 'admin' ? <button className="btn btn-ghost btn-sm btn-danger" onClick={del}>Eliminar</button> : null}</>}>
      <label><span className="sr">Título</span><textarea className="textarea" rows={2} value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => title.trim() && title !== t.title && onUpdate({ title }, 'Título actualizado')} style={{ border: 0, borderBottom: '1px solid var(--line-soft)', borderRadius: 0, padding: '4px 0 8px', fontSize: 21, fontWeight: 700, resize: 'none' }} /></label>
      <Pills label="Estado" value={t.status} onChange={(s) => onUpdate({ status: s }, `Estado: ${tsLabel(s)}`)} options={TS as [string, string][]} />
      <div className="col"><span style={{ fontSize: 13, fontWeight: 600 }}>Responsable</span>
        <div className="row" style={{ gap: 6 }}>{me.members.map((m) => <button key={m.email} className="pill" aria-pressed={t.assigneeEmail === m.email} onClick={() => t.assigneeEmail !== m.email && onUpdate({ assigneeEmail: m.email }, `${m.name || m.email} es ahora responsable`)}>{(m.name || m.email).split(' ')[0]}</button>)}</div>
        {!me.members.some((m) => m.email === t.assigneeEmail) ? <span className="small muted">Responsable actual: {t.assigneeEmail}</span> : null}
      </div>
      <div className="col">
        <div className="row"><span className="grow" style={{ fontSize: 13, fontWeight: 600 }}>Colaboradores</span><button className="btn btn-sm" aria-expanded={inviteOpen} onClick={() => setInviteOpen(!inviteOpen)}>Invitar</button></div>
        {t.collaborators.map((e) => <div key={e} className="row" style={{ flexWrap: 'nowrap' }}><Avatar name={name(e)} size={28} /><span className="grow">{name(e)}{name(e) === e ? '' : <span className="small muted"> {e}</span>}</span><button className="icon-btn" aria-label={`Quitar a ${name(e)}`} onClick={() => onUpdate({ removeCollaborators: [e] }, `${name(e)} ya no colabora`)}>×</button></div>)}
        {!t.collaborators.length ? <span className="small muted">Nadie más trabaja en esta tarea todavía.</span> : null}
        {inviteOpen ? (
          <div className="col" style={{ padding: 12, borderRadius: 10, background: 'var(--surface-2)' }}>
            {candidates.length ? <><span className="small muted" style={{ fontWeight: 600 }}>De tu organización</span><div className="row" style={{ gap: 6 }}>{candidates.map((m) => <button key={m.email} className="pill" onClick={() => onUpdate({ addCollaborators: [m.email] }, `Invitaste a ${m.name || m.email}. Le llega un aviso por correo.`)}>{m.name || m.email}</button>)}</div></> : null}
            {me.user.role !== 'miembro' ? (
              <form className="row" style={{ flexWrap: 'nowrap' }} onSubmit={(e) => { e.preventDefault(); if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail)) { onUpdate({ addCollaborators: [inviteEmail] }, `Invitación enviada a ${inviteEmail}. Verá solo esta tarea.`); setInviteEmail(''); } else toast('Escribe un correo válido', { error: true }); }}>
                <input className="input" type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="Correo de otra persona" aria-label="Correo" />
                <button className="btn btn-primary">Invitar</button>
              </form>
            ) : <span className="small muted">Para sumar a alguien externo, pídeselo a un administrador o jefe de área.</span>}
          </div>
        ) : null}
      </div>
      <div className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
        <div className="col"><span style={{ fontSize: 13, fontWeight: 600 }}>Fecha límite</span>
          <div className="row" style={{ gap: 6 }}>{DUE.map(([v, l]) => <button key={l} className="pill" aria-pressed={t.dueDate === v} onClick={() => onUpdate({ dueDate: v })}>{l}</button>)}<input type="date" className="input" style={{ width: 150, height: 32 }} aria-label="Otra fecha" value={t.dueDate || ''} onChange={(e) => onUpdate({ dueDate: e.target.value || null })} /></div>
        </div>
        <div className="col"><span style={{ fontSize: 13, fontWeight: 600 }}>Prioridad</span><Pills label="Prioridad" value={t.priority} onChange={(v) => onUpdate({ priority: v })} options={[['Alta', 'Alta'], ['Media', 'Media'], ['Baja', 'Baja']]} /></div>
        <div className="col"><span style={{ fontSize: 13, fontWeight: 600 }}>Proyecto</span>
          <select className="input" style={{ height: 34 }} value={t.projectId || ''} onChange={(e) => onUpdate({ projectId: e.target.value || null })}><option value="">Sin proyecto</option>{projects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        </div>
      </div>
      <div className="col" style={{ gap: 6 }}>
        <div className="row"><span className="grow" style={{ fontSize: 13, fontWeight: 600 }}>Pasos</span><span className="small muted">{t.checklist.length ? `${t.checklist.filter((c) => c.done).length} de ${t.checklist.length} listos` : 'Sin pasos todavía'}</span></div>
        {t.checklist.map((c, i) => (
          <div key={i} className="row" style={{ flexWrap: 'nowrap', gap: 4 }}>
            <button className="check" aria-pressed={c.done} onClick={() => onUpdate({ checklist: t.checklist.map((x, j) => (j === i ? { ...x, done: !x.done } : x)) })}><span className={'box' + (c.done ? ' on' : '')}>{c.done ? '✓' : ''}</span><span style={{ textDecoration: c.done ? 'line-through' : undefined, color: c.done ? 'var(--muted)' : undefined }}>{c.t}</span></button>
            <button className="icon-btn" aria-label="Quitar paso" onClick={() => onUpdate({ checklist: t.checklist.filter((_, j) => j !== i) })}>×</button>
          </div>
        ))}
        <form className="row" style={{ flexWrap: 'nowrap' }} onSubmit={(e) => { e.preventDefault(); if (newItem.trim()) { onUpdate({ checklist: [...t.checklist, { t: newItem.trim(), done: false }] }); setNewItem(''); } }}>
          <input className="input" value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="Agregar un paso" aria-label="Nuevo paso" /><button className="btn">Agregar</button>
        </form>
      </div>
      {t.threadId ? (
        <div className="col" style={{ padding: 14, border: '1px solid var(--line)', borderRadius: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Correo de origen</span>
          <div className="col" style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '10px 12px', gap: 3 }}>
            <b>{t.threadSubject}</b><span className="small muted">{t.threadFrom}</span>{t.threadSummary ? <span style={{ fontSize: 13, marginTop: 4 }}>{t.threadSummary}</span> : null}
          </div>
          {isOwner || t.shareEmail ? <button className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={loadMail}>{isOwner ? 'Abrir en la bandeja' : 'Ver el correo original'}</button> : <span className="small muted">Quien creó la tarea no compartió el correo original.</span>}
          {mailErr ? <span className="small" style={{ color: 'var(--bad)' }}>{mailErr}</span> : null}
          {mail ? mail.messages.map((m) => <div key={m.id} className="msg"><div className="msg-head"><b>{m.from.name}</b><span className="small muted">{longDate(m.date)}</span></div><EmailFrame html={m.html} text={m.text} allowImages={false} /></div>) : null}
          {isOwner ? <div className="row" style={{ flexWrap: 'nowrap' }}><span className="grow small muted">{t.shareEmail ? 'Los colaboradores ven el correo original.' : 'Los colaboradores ven solo el asunto y el resumen.'}</span><Switch on={t.shareEmail} onChange={(v) => onUpdate({ shareEmail: v }, v ? 'Ahora los colaboradores ven el correo original' : 'Ahora ven solo el resumen')} label="Compartir el correo original" /></div> : null}
        </div>
      ) : null}
      <div className="col" style={{ gap: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Comentarios</span>
        {t.comments.map((c) => <div key={c.id} className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}><Avatar name={name(c.authorEmail)} size={30} /><div className="grow col" style={{ gap: 3, padding: '8px 12px', borderRadius: 10, background: 'var(--surface-2)' }}><span className="small"><b>{name(c.authorEmail)}</b> <span className="muted">{longDate(c.createdAt)}</span></span><span style={{ whiteSpace: 'pre-line' }}>{c.body}</span></div></div>)}
        {!t.comments.length ? <span className="small muted">Sin comentarios todavía.</span> : null}
        <textarea className="textarea" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} aria-label="Comentario" placeholder={`Escribe un comentario. Usa @ para avisar, por ejemplo @${(name(t.assigneeEmail) || '').split(' ')[0]}`} />
        <button className="btn btn-primary" style={{ alignSelf: 'flex-end' }} onClick={post}>Comentar</button>
      </div>
      <div className="col" style={{ gap: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Actividad</span>
        {[...t.activity].reverse().map((a) => <span key={a.id} className="small muted">{longDate(a.createdAt)}: {a.text}</span>)}
      </div>
    </Drawer>
  );
}
