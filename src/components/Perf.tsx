'use client';
import { useEffect, useState } from 'react';
import { useApp } from './App';
import { api, fmtHours } from './lib';
import { Avatar, Bar, Icon, Spinner } from './ui';

type Agg = { count: number; n: number; ok: number; pct: number | null; medianH: number | null; lateNow: number };
type Person = { id: string; name: string; area: string; isMe: boolean; n: number; ok: number; pct: number | null; prevPct: number | null; medianH: number | null; p90H: number | null; lateNow: number; byCat: { cat: string; n: number; ok: number; medianH: number | null; target: number }[]; synced: boolean };
type PerfData = { role: string; myArea: string | null; days: number; org: Agg; scope: Agg; me: Person | null; areas: (Agg & { name: string; hidden: boolean })[]; people: Person[]; showNames: boolean; minGroup: boolean };

const color = (p: number | null) => (p === null ? 'var(--line)' : p >= 85 ? 'var(--good)' : p >= 70 ? 'var(--warn)' : 'var(--bad)');

export default function Perf() {
  const { me, go, toast } = useApp();
  const [days, setDays] = useState(30);
  const [d, setD] = useState<PerfData | null>(null);
  const [sort, setSort] = useState<'pct' | 'medianH' | 'lateNow' | 'n'>('pct');

  useEffect(() => { setD(null); api<PerfData>(`/api/team/perf?days=${days}`).then(setD).catch((e) => toast(e.message, { error: true })); }, [days, toast]);

  const people = d ? [...d.people].sort((a, b) => {
    if (sort === 'pct') return (b.pct ?? -1) - (a.pct ?? -1);
    if (sort === 'medianH') return (a.medianH ?? 1e9) - (b.medianH ?? 1e9);
    return (b[sort] as number) - (a[sort] as number);
  }) : [];
  const scopeLabel = d?.role === 'admin' ? 'Toda la organización' : d?.role === 'jefe' ? `Tu área: ${d.myArea || 'Sin área'}` : 'Tus indicadores';

  return (
    <div className="page">
      <div className="row" style={{ gap: 12 }}>
        <div className="grow"><h1>Rendimiento del equipo</h1><p className="muted" style={{ margin: '4px 0 0' }}>{me.org?.name || me.user.domain} · {scopeLabel}</p></div>
        <div className="seg">{[7, 30, 90].map((x) => <button key={x} aria-pressed={days === x} onClick={() => setDays(x)}>{x} días</button>)}</div>
      </div>
      <div className="banner info row" style={{ gap: 10, flexWrap: 'nowrap' }}>
        <Icon name="lock" size={18} />
        <span>Solo usamos metadatos: cuándo llegó un correo dirigido a cada persona y cuándo respondió. Nadie ve asuntos ni contenido de correos ajenos.
          {d?.role !== 'admin' ? ' Ves tus números y los promedios de la organización.' : d && !d.showNames ? ' Los nombres están anonimizados.' : ''}</span>
      </div>

      {!d ? <Spinner /> : (
        <>
          <section className="tiles">
            <div className="tile"><span className="tile-label">A tiempo, {d.role === 'miembro' ? 'organización' : 'alcance'}</span><span className="tile-value" style={{ color: color(d.scope.pct) }}>{d.role === 'miembro' ? (d.org.pct ?? '—') : (d.scope.pct ?? '—')}{(d.role === 'miembro' ? d.org.pct : d.scope.pct) !== null ? '%' : ''}</span><span className="small muted">{(d.role === 'miembro' ? d.org : d.scope).n} correos medidos</span></div>
            <div className="tile"><span className="tile-label">Respuesta típica</span><span className="tile-value">{fmtHours(d.role === 'miembro' ? d.org.medianH : d.scope.medianH)}</span><span className="small muted">mediana ponderada</span></div>
            <div className="tile"><span className="tile-label">Fuera de plazo ahora</span><span className="tile-value">{d.role === 'miembro' ? d.org.lateNow : d.scope.lateNow}</span><span className="small muted">en {(d.role === 'miembro' ? d.org : d.scope).count} personas</span></div>
            {d.me ? <div className="tile" style={{ background: 'var(--accent-soft)' }}><span className="tile-label">Tú</span><span className="tile-value" style={{ color: color(d.me.pct) }}>{d.me.pct ?? '—'}{d.me.pct !== null ? '%' : ''}</span><span className="small muted">{fmtHours(d.me.medianH)} típico · {d.me.lateNow} fuera de plazo</span></div> : null}
          </section>

          {d.areas.length > 1 || d.role === 'admin' ? (
            <section className="card pad col" style={{ gap: 10 }}>
              <h2 style={{ fontSize: 16 }}>Por área</h2>
              {d.areas.map((a) => (
                <div key={a.name} className="col" style={{ gap: 4 }}>
                  <div className="row small"><b className="grow">{a.name} <span className="muted" style={{ fontWeight: 400 }}>· {a.count} {a.count === 1 ? 'persona' : 'personas'}</span></b>
                    <span className="num">{a.hidden ? 'Oculto: menos de 3 personas' : `${a.pct ?? '—'}${a.pct !== null ? '%' : ''} · ${fmtHours(a.medianH)} · ${a.lateNow} fuera de plazo`}</span></div>
                  {!a.hidden ? <Bar pct={a.pct ?? 0} target={85} color={color(a.pct)} /> : null}
                </div>
              ))}
            </section>
          ) : null}

          <section className="card" style={{ overflow: 'auto' }}>
            <div className="row pad" style={{ paddingBottom: 8 }}><h2 className="grow" style={{ fontSize: 16 }}>Personas</h2>
              <span className="small muted">Ordenar por</span>
              <div className="seg">{([['pct', 'A tiempo'], ['medianH', 'Rapidez'], ['lateNow', 'Atrasos'], ['n', 'Volumen']] as const).map(([k, l]) => <button key={k} aria-pressed={sort === k} onClick={() => setSort(k)}>{l}</button>)}</div>
            </div>
            <table className="table">
              <thead><tr><th>Persona</th><th>Área</th><th style={{ width: '28%' }}>A tiempo</th><th className="r">Típico</th><th className="r">P90</th><th className="r">Medidos</th><th className="r">Fuera de plazo</th></tr></thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.id} style={p.isMe ? { background: 'var(--accent-soft)' } : undefined}>
                    <td><span className="row" style={{ gap: 8, flexWrap: 'nowrap' }}><Avatar name={p.name} size={26} />{p.name}</span></td>
                    <td className="muted">{p.area}</td>
                    <td>{!p.synced ? <span className="small muted">Aún no sincroniza</span> : <span className="row" style={{ gap: 8, flexWrap: 'nowrap' }}><span style={{ flex: 1 }}><Bar pct={p.pct ?? 0} target={85} color={color(p.pct)} /></span><b className="num" style={{ width: 44, textAlign: 'right' }}>{p.pct ?? '—'}{p.pct !== null ? '%' : ''}</b>{p.prevPct !== null && p.pct !== null ? <span className="small" style={{ color: p.pct >= p.prevPct ? 'var(--good)' : 'var(--bad)' }}>{p.pct >= p.prevPct ? '▲' : '▼'}{Math.abs(p.pct - p.prevPct)}</span> : null}</span>}</td>
                    <td className="r">{fmtHours(p.medianH)}</td><td className="r">{fmtHours(p.p90H)}</td><td className="r">{p.n}</td>
                    <td className="r" style={{ color: p.lateNow ? 'var(--bad)' : undefined, fontWeight: p.lateNow ? 700 : 400 }}>{p.lateNow}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {d.people.some((p) => !p.synced) ? <p className="small muted pad" style={{ margin: 0 }}>Quien aparece «Aún no sincroniza» debe entrar a MetroMail una vez para que se calculen sus tiempos.</p> : null}
          </section>
          {me.user.role === 'admin' ? <button className="btn btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => go('settings', { tab: 'organizacion' })}>Configurar privacidad y áreas<Icon name="arrow" /></button> : null}
        </>
      )}
    </div>
  );
}
