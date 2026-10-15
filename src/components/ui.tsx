'use client';
import { useEffect, useRef, useState } from 'react';
import { colorFor, initials } from './lib';

export function Avatar({ name, size = 32, color }: { name: string; size?: number; color?: string }) {
  return <span className="avatar" title={name} aria-hidden="true" style={{ width: size, height: size, fontSize: Math.round(size * 0.38), background: color || colorFor(name) }}>{initials(name)}</span>;
}

export function Pills<T extends string | number | boolean | null>({ options, value, onChange, label, accent }: { options: [T, string][]; value: T; onChange: (v: T) => void; label: string; accent?: boolean }) {
  return (
    <div role="group" aria-label={label} className="row" style={{ gap: 6 }}>
      {options.map(([v, l]) => <button key={String(v)} type="button" className={'pill' + (accent ? ' accent' : '')} aria-pressed={value === v} onClick={() => onChange(v)}>{l}</button>)}
    </div>
  );
}

export function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" className="switch" aria-pressed={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)} />;
}

export function Spinner({ label = 'Cargando' }: { label?: string }) {
  return <span className="row muted" role="status"><span className="spinner" aria-hidden="true" />{label}</span>;
}

/**
 * Muestra HTML de correo aislado: iframe sin scripts y con CSP.
 * Las imágenes remotas se bloquean hasta que la persona las permita (privacidad y rastreadores).
 */
export function EmailFrame({ html, text, allowImages, dark }: { html: string; text: string; allowImages: boolean; dark?: boolean }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [h, setH] = useState(120);
  const csp = `default-src 'none'; style-src 'unsafe-inline'; img-src data: ${allowImages ? 'https: http:' : ''}; font-src data:;`;
  const body = html || `<pre style="white-space:pre-wrap;font-family:inherit;margin:0">${(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>`;
  const doc = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><style>body{margin:0;padding:4px 16px 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:${dark ? '#E8EAED' : '#202124'};background:${dark ? '#202124' : '#fff'};overflow-wrap:anywhere}img{max-width:100%;height:auto}blockquote{margin:0 0 0 .8ex;border-left:1px solid #ccc;padding-left:1ex;color:#5f6368}table{max-width:100%}</style></head><body>${body}</body></html>`;
  useEffect(() => {
    const f = ref.current;
    if (!f) return;
    const measure = () => { try { const d = f.contentDocument; if (d?.body) setH(Math.min(4000, Math.max(60, d.documentElement.scrollHeight + 4))); } catch { /* aislado */ } };
    f.addEventListener('load', measure);
    const t = setInterval(measure, 600);
    const stop = setTimeout(() => clearInterval(t), 5000);
    return () => { f.removeEventListener('load', measure); clearInterval(t); clearTimeout(stop); };
  }, [doc]);
  // allow-same-origin solo para medir la altura; sin allow-scripts el contenido no puede ejecutar código.
  return <iframe ref={ref} className="msg-frame" title="Contenido del correo" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" srcDoc={doc} style={{ height: h }} />;
}

export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="dialog" role="dialog" aria-modal="true" aria-label={title} style={wide ? { maxWidth: 900 } : undefined}>
        <div className="dialog-head"><h2 className="grow" style={{ fontSize: 18 }}>{title}</h2><button className="icon-btn" aria-label="Cerrar" onClick={onClose}>×</button></div>
        <div className="dialog-body">{children}</div>
        {footer ? <div className="dialog-foot">{footer}</div> : null}
      </section>
    </div>
  );
}

export function Drawer({ label, onClose, head, children }: { label: string; onClose: () => void; head: React.ReactNode; children: React.ReactNode }) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return (
    <div className="drawer-wrap">
      <button className="drawer-scrim" aria-label="Cerrar" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label={label}>
        <div className="drawer-head">{head}<button className="icon-btn" aria-label="Cerrar" onClick={onClose}>×</button></div>
        <div className="drawer-body">{children}</div>
      </aside>
    </div>
  );
}

export function Bar({ pct, target, color }: { pct: number; target?: number; color?: string }) {
  return <div className="bar" aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />{target !== undefined ? <b style={{ left: `${target}%` }} /> : null}</div>;
}

export function Icon({ name, size = 16 }: { name: string; size?: number }) {
  const p: Record<string, React.ReactNode> = {
    home: <path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z" />,
    inbox: <><path d="M3 13h5l2 3h4l2-3h5" /><path d="M5 5h14l2 8v6H3v-6z" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    board: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16M15 4v10" /></>,
    team: <><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" /><path d="M16 5.5a3 3 0 0 1 0 5.6M18 14.5c1.5.7 2.4 2.2 2.6 4.5" /></>,
    gear: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" /></>,
    pen: <path d="M4 20h4L19 9l-4-4L4 16z" />,
    check: <path d="m5 12 5 5 9-10" />,
    spark: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />,
    clip: <path d="m20 11-8 8a5 5 0 0 1-7-7l8-8a3.5 3.5 0 0 1 5 5l-8 8a2 2 0 0 1-3-3l7-7" />,
    mail: <><path d="M3 6h18v12H3z" /><path d="m3 7 9 6 9-6" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
    arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
    star: <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />,
    pin: <path d="M9 3h6l-1 6 4 4H6l4-4zM12 13v8" />,
    refresh: <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />,
    upload: <path d="M12 16V4M6 10l6-6 6 6M4 20h16" />,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{p[name]}</svg>;
}
