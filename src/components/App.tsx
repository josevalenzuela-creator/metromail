'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, type Me } from './lib';
import { Avatar, Icon, Spinner } from './ui';
import Home from './Home';
import Inbox from './Inbox';
import Compose, { type ComposeSeed } from './Compose';
import Followups from './Followups';
import Tasks from './Tasks';
import Perf from './Perf';
import SettingsView from './Settings';
import CreateTask, { type TaskSeed } from './CreateTask';

export type View = 'home' | 'inbox' | 'compose' | 'followups' | 'tasks' | 'perf' | 'settings';

type Ctx = {
  me: Me;
  reloadMe: () => Promise<void>;
  go: (v: View, params?: Record<string, string>) => void;
  params: URLSearchParams;
  toast: (msg: string, opts?: { error?: boolean; undo?: () => void }) => void;
  compose: (seed?: ComposeSeed) => void;
  createTask: (seed: TaskSeed) => void;
  counts: { inbox: number; overdue: number; myTasks: number };
  setCounts: (c: Partial<{ inbox: number; overdue: number; myTasks: number }>) => void;
};

const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => { const c = useContext(AppCtx); if (!c) throw new Error('Sin contexto'); return c; };

const NAV: [View, string, string][] = [
  ['home', 'Inicio', 'home'], ['inbox', 'Smart Inbox', 'inbox'], ['followups', 'Seguimientos', 'clock'],
  ['tasks', 'Tareas', 'board'], ['perf', 'Rendimiento del equipo', 'team'], ['settings', 'Configuración', 'gear'],
];

export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [err, setErr] = useState('');
  const [view, setView] = useState<View>('home');
  const [params, setParams] = useState(new URLSearchParams());
  const [toastState, setToast] = useState<{ msg: string; error?: boolean; undo?: () => void } | null>(null);
  const [seed, setSeed] = useState<ComposeSeed | undefined>();
  const [taskSeed, setTaskSeed] = useState<TaskSeed | null>(null);
  const [counts, setCountsState] = useState({ inbox: 0, overdue: 0, myTasks: 0 });
  const tRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const reloadMe = useCallback(async () => { setMe(await api<Me>('/api/me')); }, []);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const v = sp.get('v') as View | null;
    if (v && NAV.some((n) => n[0] === v)) setView(v);
    setParams(sp);
    reloadMe().catch((e) => setErr(e.message));
    const onPop = () => { const p = new URLSearchParams(window.location.search); setView((p.get('v') as View) || 'home'); setParams(p); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [reloadMe]);

  const go = useCallback((v: View, p: Record<string, string> = {}) => {
    const sp = new URLSearchParams({ v, ...p });
    window.history.pushState(null, '', `/app?${sp}`);
    setParams(sp);
    setView(v);
    window.scrollTo({ top: 0 });
  }, []);

  const toast = useCallback((msg: string, opts: { error?: boolean; undo?: () => void } = {}) => {
    clearTimeout(tRef.current);
    setToast({ msg, ...opts });
    tRef.current = setTimeout(() => setToast(null), opts.error ? 8000 : 5000);
  }, []);

  const compose = useCallback((s?: ComposeSeed) => { setSeed(s); go('compose'); }, [go]);
  const setCounts = useCallback((c: Partial<typeof counts>) => setCountsState((p) => ({ ...p, ...c })), []);

  const ctx = useMemo<Ctx | null>(() => me ? { me, reloadMe, go, params, toast, compose, createTask: setTaskSeed, counts, setCounts } : null, [me, reloadMe, go, params, toast, compose, counts, setCounts]);

  if (err) return <div className="login"><div className="login-card"><h1>No se pudo cargar MetroMail</h1><p>{err}</p><a className="btn btn-primary" href="/api/auth/login">Volver a entrar</a></div></div>;
  if (!ctx || !me) return <div className="login"><div className="login-card"><Spinner label="Cargando tu correo…" /></div></div>;

  const logout = async () => { const r = await api<{ redirect: string }>('/api/auth/logout', { body: {} }); window.location.href = r.redirect; };

  return (
    <AppCtx.Provider value={ctx}>
      <div className="shell">
        <nav className="side" aria-label="Navegación principal">
          <div className="brand"><span className="brand-mark" aria-hidden="true">M</span><span className="brand-name">MetroMail</span><span className="brand-ai">AI</span></div>
          <button className="side-org" onClick={() => go('settings', { tab: 'organizacion' })}>
            <span className="brand-mark" style={{ width: 22, height: 22, fontSize: 11, background: '#F2C14E', color: '#0F1E2E' }} aria-hidden="true">{(me.org?.name || me.user.domain).slice(0, 2).toUpperCase()}</span>
            <span className="grow"><span style={{ fontSize: 12.5, fontWeight: 600 }}>{me.org?.name || me.user.domain}</span><small>{me.members.length} {me.members.length === 1 ? 'persona' : 'personas'}</small></span>
          </button>
          <button className="btn btn-primary compose-btn" onClick={() => compose()}><Icon name="pen" />Redactar</button>
          {NAV.map(([v, label, icon]) => (
            <button key={v} className="nav" aria-current={view === v ? 'page' : undefined} onClick={() => go(v)}>
              <Icon name={icon} size={18} /><span className="grow">{label}</span>
              {v === 'inbox' && counts.inbox ? <span className="count">{counts.inbox}</span> : null}
              {v === 'followups' && counts.overdue ? <span className="badge">{counts.overdue}</span> : null}
              {v === 'tasks' && counts.myTasks ? <span className="count">{counts.myTasks}</span> : null}
            </button>
          ))}
          <div className="side-foot">
            <Avatar name={me.user.name || me.user.email} size={30} />
            <span className="who"><span style={{ fontWeight: 600 }}>{me.user.name || me.user.email}</span><small>{me.user.email}</small></span>
            <button className="btn btn-ghost btn-sm" style={{ color: '#AEB8C6' }} onClick={logout}>Salir</button>
          </div>
        </nav>
        <main className="main">
          {view === 'home' && <Home />}
          {view === 'inbox' && <Inbox />}
          {view === 'compose' && <Compose seed={seed} />}
          {view === 'followups' && <Followups />}
          {view === 'tasks' && <Tasks />}
          {view === 'perf' && <Perf />}
          {view === 'settings' && <SettingsView />}
        </main>
      </div>
      {taskSeed ? <CreateTask seed={taskSeed} onClose={() => setTaskSeed(null)} /> : null}
      {toastState ? (
        <div className={'toast' + (toastState.error ? ' error' : '')} role="status">
          <span>{toastState.msg}</span>
          {toastState.undo ? <button onClick={() => { toastState.undo?.(); setToast(null); }}>Deshacer</button> : null}
        </div>
      ) : null}
    </AppCtx.Provider>
  );
}
