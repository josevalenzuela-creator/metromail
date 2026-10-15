'use client';
import { useEffect, useState } from 'react';
import { useApp } from './App';
import { addDaysISO, api, nextWeekdayISO, todayISO, type AiInsight, type Project } from './lib';
import { Modal, Pills, Switch } from './ui';

export type TaskSeed = { threadId?: string; subject?: string; from?: string; ai?: AiInsight | null; mode?: 'tarea' | 'proyecto' };

export default function CreateTask({ seed, onClose }: { seed: TaskSeed; onClose: () => void }) {
  const { me, toast, go } = useApp();
  const fromMail = !!seed.threadId;
  const reqs = seed.ai ? (seed.ai.requests.length ? seed.ai.requests : seed.ai.commitments) : [];
  const [mode, setMode] = useState<'tarea' | 'proyecto'>(seed.mode || 'tarea');
  const [title, setTitle] = useState(seed.subject ? seed.subject.replace(/^(re|rv|fw|fwd):\s*/i, '') : '');
  const [projName, setProjName] = useState(seed.subject ? seed.subject.replace(/^(re|rv|fw|fwd):\s*/i, '').split(/[—:-]/)[0].trim() : '');
  const [items, setItems] = useState(reqs.map((r) => ({ text: r, on: true })));
  const [draft, setDraft] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<string>('ninguno');
  const [newProj, setNewProj] = useState('');
  const [assignee, setAssignee] = useState(me.user.email);
  const [collabs, setCollabs] = useState<string[]>([]);
  const [external, setExternal] = useState('');
  const [due, setDue] = useState<string | null>(null);
  const [prio, setPrio] = useState(seed.ai?.priority?.startsWith('Alta') ? 'Alta' : seed.ai?.priority?.startsWith('Baja') ? 'Baja' : 'Media');
  const [share, setShare] = useState(false);
  const [gestion, setGestion] = useState(true);
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api<{ projects: Project[] }>('/api/tasks').then((r) => setProjects(r.projects)).catch(() => null); }, []);

  const t = todayISO();
  const DUE: [string | null, string][] = [[t, 'Hoy'], [addDaysISO(t, 1), 'Mañana'], [nextWeekdayISO(5), 'Este viernes'], [nextWeekdayISO(1), 'El lunes'], [null, 'Sin fecha']];
  const members = me.members;
  const toggleCollab = (e: string) => setCollabs((c) => (c.includes(e) ? c.filter((x) => x !== e) : [...c, e]));

  const create = async () => {
    const isProj = mode === 'proyecto';
    const titles = isProj ? items.filter((i) => i.on).map((i) => i.text) : [title];
    if (isProj && !projName.trim()) { toast('Ponle nombre al proyecto', { error: true }); return; }
    if (!titles.filter((x) => x.trim()).length) { toast(isProj ? 'Agrega al menos una tarea al proyecto' : 'Escribe un título', { error: true }); return; }
    setBusy(true);
    try {
      const extra = external.split(',').map((x) => x.trim().toLowerCase()).filter((x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x));
      const r = await api<{ tasks: { id: string }[] }>('/api/tasks', { body: {
        titles, checklist: isProj ? [] : items.filter((i) => i.on).map((i) => i.text),
        projectId: !isProj && project !== 'ninguno' && project !== 'nuevo' ? project : null,
        newProjectName: isProj ? projName : project === 'nuevo' ? newProj : null,
        assigneeEmail: assignee, collaborators: [...collabs, ...extra], dueDate: due, priority: prio,
        threadId: seed.threadId || null, threadSubject: seed.subject || null, threadFrom: seed.from || null, threadSummary: seed.ai?.summary || null,
        shareEmail: share, toGestion: fromMail && gestion, notify,
      } });
      const n = r.tasks.length;
      toast(isProj ? `Proyecto creado con ${n} ${n === 1 ? 'tarea' : 'tareas'}` : 'Tarea creada' + (notify && (assignee !== me.user.email || collabs.length || extra.length) ? '. Avisamos por correo a quienes sumaste.' : '.'));
      onClose();
      if (!fromMail) go('tasks', { task: r.tasks[0].id });
    } catch (e) { toast(e instanceof Error ? e.message : 'Error', { error: true }); }
    finally { setBusy(false); }
  };

  return (
    <Modal title={mode === 'proyecto' ? 'Crear proyecto desde el correo' : fromMail ? 'Crear tarea desde el correo' : 'Nueva tarea'} onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancelar</button><button className="btn btn-primary" onClick={create} disabled={busy}>{busy ? 'Creando…' : mode === 'proyecto' ? 'Crear proyecto' : 'Crear tarea'}</button></>}>
      {fromMail ? (
        <>
          <div className="banner" style={{ background: 'var(--surface-2)' }}><b>{seed.subject}</b><br /><span className="muted">{seed.from}</span></div>
          <Pills label="Qué crear" value={mode} onChange={setMode} options={[['tarea', 'Una tarea'], ['proyecto', 'Un proyecto con varias tareas']]} />
        </>
      ) : null}
      {mode === 'tarea' ? (
        <>
          <label className="field">Título de la tarea<input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Qué hay que hacer" /></label>
          <div className="col"><span style={{ fontSize: 13, fontWeight: 600 }}>Proyecto</span>
            <div className="row" style={{ gap: 6 }}>
              <button className="pill" aria-pressed={project === 'ninguno'} onClick={() => setProject('ninguno')}>Sin proyecto</button>
              {projects.map((p) => <button key={p.id} className="pill" aria-pressed={project === p.id} onClick={() => setProject(p.id)}><span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color }} />{p.name}</button>)}
              <button className="pill accent" aria-pressed={project === 'nuevo'} onClick={() => setProject('nuevo')}>+ Nuevo proyecto</button>
            </div>
            {project === 'nuevo' ? <input className="input" aria-label="Nombre del proyecto" value={newProj} onChange={(e) => setNewProj(e.target.value)} placeholder="Nombre del proyecto" /> : null}
          </div>
        </>
      ) : <label className="field">Nombre del proyecto<input className="input" value={projName} onChange={(e) => setProjName(e.target.value)} /></label>}

      <div className="col" style={{ gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{mode === 'proyecto' ? 'Tareas del proyecto' : 'Pasos'}{reqs.length ? ', desde lo que te piden en el correo' : ''}</span>
        {items.map((it, i) => <button key={i} className="check" aria-pressed={it.on} onClick={() => setItems((x) => x.map((y, j) => (j === i ? { ...y, on: !y.on } : y)))}><span className={'box' + (it.on ? ' on' : '')}>{it.on ? '✓' : ''}</span>{it.text}</button>)}
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <input className="input" aria-label="Agregar" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && draft.trim()) { setItems((x) => [...x, { text: draft.trim(), on: true }]); setDraft(''); } }} placeholder={mode === 'proyecto' ? 'Agregar otra tarea' : 'Agregar un paso'} />
          <button className="btn" onClick={() => { if (draft.trim()) { setItems((x) => [...x, { text: draft.trim(), on: true }]); setDraft(''); } }}>Agregar</button>
        </div>
      </div>

      <div className="col"><span style={{ fontSize: 13, fontWeight: 600 }}>Responsable</span>
        <div className="row" style={{ gap: 6 }}>{members.map((m) => <button key={m.email} className="pill" aria-pressed={assignee === m.email} onClick={() => { setAssignee(m.email); setCollabs((c) => c.filter((x) => x !== m.email)); }}>{m.email === me.user.email ? 'Yo' : (m.name || m.email).split(' ')[0]}</button>)}</div>
      </div>
      <div className="col"><span style={{ fontSize: 13, fontWeight: 600 }}>Invitar a colaborar</span>
        <div className="row" style={{ gap: 6 }}>{members.filter((m) => m.email !== assignee).map((m) => <button key={m.email} className="pill" aria-pressed={collabs.includes(m.email)} onClick={() => toggleCollab(m.email)}>{m.email === me.user.email ? 'Yo' : m.name || m.email}</button>)}</div>
        {me.user.role !== 'miembro' ? <input className="input" value={external} onChange={(e) => setExternal(e.target.value)} placeholder="Correos de personas externas, separados por comas (opcional)" aria-label="Invitar por correo" /> : null}
        <span className="small muted">Solo aparecen quienes ya entraron a MetroMail con su cuenta de {me.user.domain}. Ven la tarea, no tu bandeja.</span>
      </div>
      <div className="row" style={{ gap: 16, alignItems: 'flex-start' }}>
        <div className="col"><span style={{ fontSize: 13, fontWeight: 600 }}>Fecha límite</span>
          <div className="row" style={{ gap: 6 }}>{DUE.map(([v, l]) => <button key={l} className="pill" aria-pressed={due === v} onClick={() => setDue(v)}>{l}</button>)}<input type="date" className="input" style={{ width: 150, height: 32 }} aria-label="Otra fecha" value={due && !DUE.some((d) => d[0] === due) ? due : ''} min={t} onChange={(e) => setDue(e.target.value || null)} /></div>
        </div>
        <div className="col"><span style={{ fontSize: 13, fontWeight: 600 }}>Prioridad</span><Pills label="Prioridad" value={prio} onChange={setPrio} options={[['Alta', 'Alta'], ['Media', 'Media'], ['Baja', 'Baja']]} /></div>
      </div>
      <div className="col" style={{ paddingTop: 12, borderTop: '1px solid var(--line-soft)', gap: 12 }}>
        {fromMail ? <div className="row" style={{ flexWrap: 'nowrap' }}><span className="grow"><b>Compartir el correo original</b><br /><span className="small muted">Si está apagado, los colaboradores ven solo el asunto y el resumen.</span></span><Switch on={share} onChange={setShare} label="Compartir el correo original" /></div> : null}
        {fromMail ? <div className="row" style={{ flexWrap: 'nowrap' }}><b className="grow">Pasar el correo a «En gestión»</b><Switch on={gestion} onChange={setGestion} label="Pasar a En gestión" /></div> : null}
        <div className="row" style={{ flexWrap: 'nowrap' }}><span className="grow"><b>Avisar por correo</b><br /><span className="small muted">Enviamos el aviso desde tu cuenta a quienes sumaste.</span></span><Switch on={notify} onChange={setNotify} label="Avisar por correo" /></div>
      </div>
    </Modal>
  );
}
