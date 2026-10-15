'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from './App';
import { api, ago, CAT_COLOR, isoWeek, localISODate, shortTime, STATE_META, type InboxItem, type State } from './lib';
import { Avatar, Icon, Spinner } from './ui';
import ThreadPane from './ThreadPane';

type Filter = 'bandeja' | 'esperando' | 'apartado' | 'pospuesto';
const FILTERS: [Filter, string][] = [['bandeja', 'Bandeja'], ['esperando', 'Esperando'], ['apartado', 'Apartados'], ['pospuesto', 'Pospuestos']];
const CATS = ['Todas', 'Clientes', 'Equipo', 'Proveedores', 'Notificaciones', 'Boletines'];
const active = (s: State) => s === 'pendiente' || s === 'gestion';

export default function Inbox() {
  const { me, params, go, setCounts, toast } = useApp();
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>(() => (FILTERS.some((x) => x[0] === params.get('f')) ? params.get('f') as Filter : 'bandeja'));
  const [cat, setCat] = useState('Todas');
  const [q, setQ] = useState('');
  const [searched, setSearched] = useState('');
  const [groupBy, setGroupBy] = useState(me.settings.groupBy || 'semana');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const selected = params.get('t');

  const load = useCallback(async (query = '') => {
    setLoading(true); setError('');
    try {
      const r = await api<{ items: InboxItem[] }>(`/api/inbox${query ? `?q=${encodeURIComponent(query)}` : ''}`);
      setItems(r.items);
      setSearched(query);
      if (!query) setCounts({ inbox: r.items.filter((i) => active(i.state)).length });
    } catch (e) { setError(e instanceof Error ? e.message : 'Error'); }
    finally { setLoading(false); }
  }, [setCounts]);

  useEffect(() => { load(); }, [load]);

  const select = (id: string | null) => {
    const p: Record<string, string> = {};
    if (id) p.t = id;
    go('inbox', p);
    if (id) setItems((xs) => xs?.map((x) => (x.id === id ? { ...x, unread: false } : x)) || xs);
  };

  const patchItem = useCallback((id: string, ch: Partial<InboxItem>) => setItems((xs) => xs?.map((x) => (x.id === id ? { ...x, ...ch } : x)) || xs), []);

  const setGroup = async (g: string) => {
    setGroupBy(g);
    api('/api/settings', { method: 'PUT', body: { groupBy: g } }).catch(() => null);
  };

  const visible = useMemo(() => (items || []).filter((i) => {
    const okF = searched ? true : filter === 'bandeja' ? active(i.state) : i.state === filter;
    return okF && (cat === 'Todas' || i.category === cat);
  }), [items, filter, cat, searched]);

  const counts = useMemo(() => Object.fromEntries(FILTERS.map(([f]) => [f, (items || []).filter((i) => (f === 'bandeja' ? active(i.state) : i.state === f)).length])), [items]);

  // Secciones: por semana (por defecto) o por prioridad estilo Spark.
  const sections = useMemo(() => {
    if (groupBy === 'semana' || searched || filter !== 'bandeja') {
      const by = new Map<string, InboxItem[]>();
      visible.forEach((i) => { const k = isoWeek(i.date).monday; by.set(k, [...(by.get(k) || []), i]); });
      const cur = isoWeek(new Date().toISOString());
      return [...by.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([k, list]) => {
        const w = isoWeek(list[0].date);
        const diff = Math.round((new Date(cur.monday).getTime() - new Date(k).getTime()) / (7 * 86_400_000));
        const end = new Date(new Date(k + 'T12:00:00Z').getTime() + 6 * 86_400_000);
        const fmt = (d: Date) => new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(d);
        return { key: k, week: w.week, current: diff === 0, title: diff === 0 ? 'Esta semana' : diff === 1 ? 'Semana pasada' : `Hace ${diff} semanas`, meta: `Del ${fmt(new Date(k + 'T12:00:00Z'))} al ${fmt(end)}. ${list.length} ${list.length === 1 ? 'conversación' : 'conversaciones'}`, items: list, collapsible: true, bulk: false };
      });
    }
    const people = ['Clientes', 'Equipo', 'Proveedores'];
    return [
      { key: 'pin', title: 'Fijados', items: visible.filter((i) => i.pinned) },
      { key: 'vip', title: 'Prioritarios', items: visible.filter((i) => !i.pinned && i.vip) },
      { key: 'people', title: 'Personas', items: visible.filter((i) => !i.pinned && !i.vip && people.includes(i.category)) },
      { key: 'Notificaciones', title: 'Notificaciones', items: visible.filter((i) => !i.pinned && !i.vip && i.category === 'Notificaciones'), collapsible: true, bulk: true, closedByDefault: true },
      { key: 'Boletines', title: 'Boletines', items: visible.filter((i) => !i.pinned && !i.vip && i.category === 'Boletines'), collapsible: true, bulk: true, closedByDefault: true },
    ].filter((s) => s.items.length).map((s) => ({ week: 0, current: false, meta: '', ...s }));
  }, [visible, groupBy, searched, filter]);

  const finishAll = async (list: InboxItem[]) => {
    for (const i of list) patchItem(i.id, { state: 'finalizado' });
    let failed = 0;
    for (const i of list) { try { await api(`/api/threads/${i.id}/state`, { body: { state: 'finalizado' } }); } catch { failed++; } }
    toast(failed ? `No se pudieron finalizar ${failed}` : `${list.length} finalizadas y archivadas en Gmail`, { error: !!failed });
  };

  const sel = items?.find((i) => i.id === selected) || null;

  return (
    <div className="inbox">
      <header className="inbox-head">
        <div className="row" style={{ gap: 12 }}>
          <h1 style={{ fontSize: 24 }} className="grow">Smart Inbox</h1>
          <form className="row" role="search" onSubmit={(e) => { e.preventDefault(); load(q.trim()); }} style={{ flex: '0 1 380px', minWidth: 220 }}>
            <label className="row grow" style={{ border: '1px solid var(--ctl)', borderRadius: 10, padding: '0 10px', height: 40, background: 'var(--surface-2)', flexWrap: 'nowrap' }}>
              <Icon name="search" /><span className="sr">Buscar en Gmail</span>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en todo Gmail" style={{ border: 0, background: 'transparent', flex: 1, minWidth: 0, height: 36 }} />
            </label>
            {searched ? <button type="button" className="btn btn-sm" onClick={() => { setQ(''); load(); }}>Limpiar</button> : null}
          </form>
          <div className="seg" role="group" aria-label="Agrupar">
            <button aria-pressed={groupBy === 'semana'} onClick={() => setGroup('semana')}>Por semana</button>
            <button aria-pressed={groupBy === 'prioridad'} onClick={() => setGroup('prioridad')}>Por prioridad</button>
          </div>
          <button className="btn btn-sm" onClick={() => load(searched)} disabled={loading} aria-label="Actualizar"><Icon name="refresh" />{loading ? 'Actualizando…' : 'Actualizar'}</button>
        </div>
        {!searched ? (
          <div className="row" style={{ gap: 6 }}>
            {FILTERS.map(([f, l]) => <button key={f} className="pill" aria-pressed={filter === f} onClick={() => setFilter(f)}>{l} <span style={{ opacity: 0.7 }}>{counts[f]}</span></button>)}
            <span style={{ width: 1, height: 24, background: 'var(--line)', margin: '0 6px' }} />
            {CATS.map((c) => <button key={c} className="pill accent" aria-pressed={cat === c} onClick={() => setCat(c)}>{c}</button>)}
          </div>
        ) : <p className="muted">Resultados de «{searched}» en todo Gmail.</p>}
      </header>
      <div className="inbox-body">
        <section className="list" aria-label="Conversaciones">
          {error ? <div className="banner bad" style={{ margin: 16 }}>{error} <button className="btn btn-sm" onClick={() => load(searched)}>Reintentar</button></div> : null}
          {!items && !error ? <div style={{ padding: 24 }}><Spinner label="Leyendo tu Gmail…" /></div> : null}
          {sections.map((s) => {
            const isOpen = s.key in open ? open[s.key] : !(s as { closedByDefault?: boolean }).closedByDefault;
            return (
              <div key={s.key}>
                {s.week ? (
                  <div className="week-head">
                    <span className={'week-num' + (s.current ? ' current' : '')} aria-hidden="true">{s.week}</span>
                    <span className="grow col" style={{ gap: 2 }}><span style={{ fontSize: 16, fontWeight: 700 }}>{s.title}</span><span className="muted" style={{ fontSize: 13 }}>Semana {s.week}. {s.meta}</span></span>
                    <button className="btn btn-sm" aria-expanded={isOpen} onClick={() => setOpen((o) => ({ ...o, [s.key]: !isOpen }))}>{isOpen ? 'Ocultar' : 'Ver'}</button>
                  </div>
                ) : (
                  <div className="sec-head">
                    <span className="grow">{s.title} ({s.items.length})</span>
                    {s.bulk && filter === 'bandeja' ? <button className="btn btn-ghost btn-sm" style={{ color: 'var(--good)' }} onClick={() => finishAll(s.items)}>Finalizar todas</button> : null}
                    {s.collapsible ? <button className="btn btn-sm" aria-expanded={isOpen} onClick={() => setOpen((o) => ({ ...o, [s.key]: !isOpen }))}>{isOpen ? 'Ocultar' : 'Ver'}</button> : null}
                  </div>
                )}
                {isOpen ? s.items.map((t) => <Row key={t.id} t={t} current={t.id === selected} onClick={() => select(t.id)} />) : null}
              </div>
            );
          })}
          {items && !sections.length ? (
            <div className="empty"><Icon name="check" size={36} /><strong>{searched ? 'Sin resultados' : filter === 'bandeja' ? 'Bandeja en cero' : 'Nada aquí'}</strong><span>{searched ? 'Prueba con otras palabras.' : filter === 'bandeja' ? 'Todo está gestionado. Lo que espera respuesta sigue en Seguimientos.' : 'No hay conversaciones con este estado.'}</span></div>
          ) : null}
        </section>
        <section className="detail" aria-label="Detalle">
          {selected ? <ThreadPane key={selected} id={selected} item={sel} onPatch={(ch) => patchItem(selected, ch)} onLeave={(nextId) => select(nextId)} siblings={visible.map((v) => v.id)} /> : (
            <div className="empty" style={{ paddingTop: 100 }}><strong>Selecciona una conversación</strong><span>Leer un correo no lo finaliza: sigue pendiente hasta que decidas qué hacer.</span></div>
          )}
        </section>
      </div>
    </div>
  );
}

function Row({ t, current, onClick }: { t: InboxItem; current: boolean; onClick: () => void }) {
  const st = STATE_META[t.state];
  let chip = t.state !== 'pendiente' ? st.label : '';
  if (t.state === 'esperando' && t.waitingSince) chip = `Esperando hace ${ago(t.waitingSince)}`;
  if (t.state === 'pospuesto' && t.snoozeUntil) chip = `Vuelve ${shortTime(t.snoozeUntil)}`;
  const fuOver = t.followUpAt && new Date(t.followUpAt) < new Date();
  return (
    <button className={'trow' + (t.unread ? ' unread' : '')} aria-current={current} onClick={onClick}>
      <span className="avatar" aria-hidden="true" style={{ width: 36, height: 36, fontSize: 12, background: CAT_COLOR[t.category] || '#4A4F5A' }}>{(t.fromName || '?').replace(/[^\p{L}\s]/gu, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'}</span>
      <span className="grow col" style={{ gap: 2 }}>
        <span className="t-top">
          {t.unread ? <span className="dot" aria-label="No leído" /> : null}
          <span className="t-name">{t.lastFromMe ? `Para: ${t.fromName}` : t.fromName}</span>
          {t.vip ? <span style={{ color: '#D99A0B' }} aria-label="Prioritario"><Icon name="star" size={14} /></span> : null}
          {t.pinned ? <span className="muted" aria-label="Fijado"><Icon name="pin" size={14} /></span> : null}
          {t.messageCount > 1 ? <span className="muted small">{t.messageCount}</span> : null}
          <span className="spacer" /><span className="muted small" style={{ flex: 'none' }}>{shortTime(t.date)}</span>
        </span>
        <span className="t-subj">{t.subject}</span>
        <span className="t-snip">{t.snippet}</span>
        <span className="row" style={{ gap: 6, marginTop: 4 }}>
          <span className="chip">{t.category}</span>
          {chip ? <span className={`chip ${st.cls}`}>{chip}</span> : null}
          {t.followUpAt ? <span className={`chip ${fuOver ? 'red' : 'amber'}`}>Recordatorio {localISODate(new Date(t.followUpAt)) === localISODate(new Date()) ? 'hoy' : shortTime(t.followUpAt)}</span> : null}
        </span>
      </span>
    </button>
  );
}
