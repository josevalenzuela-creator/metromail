'use client';
import { useEffect, useState } from 'react';
import { useApp } from './App';
import { api, fileToBase64, initials, type State } from './lib';
import { Icon, Pills } from './ui';

export type ComposeSeed = { to?: string; subject?: string; body?: string };
type Att = { filename: string; mimeType: string; base64: string; kb: number };

export default function Compose({ seed }: { seed?: ComposeSeed }) {
  const { me, toast, go } = useApp();
  const [to, setTo] = useState(seed?.to || '');
  const [cc, setCc] = useState('');
  const [showCc, setShowCc] = useState(false);
  const [subject, setSubject] = useState(seed?.subject || '');
  const [body, setBody] = useState(seed?.body || '');
  const [sigId, setSigId] = useState<string | null>(me.settings.sigNewId || null);
  const [sigs, setSigs] = useState<{ id: string; preview: string }[]>([]);
  const [files, setFiles] = useState<Att[]>([]);
  const [after, setAfter] = useState<State>('esperando');
  const [device, setDevice] = useState<'escritorio' | 'movil'>('escritorio');
  const [dark, setDark] = useState(false);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);

  useEffect(() => { api<{ signatures: { id: string; preview: string }[] }>('/api/signatures').then((r) => setSigs(r.signatures)).catch(() => null); }, []);
  const sigHtml = sigs.find((s) => s.id === sigId)?.preview || '';

  const addFiles = async (list: FileList | null) => {
    if (!list) return;
    const add: Att[] = [];
    for (const f of Array.from(list)) add.push({ filename: f.name, mimeType: f.type || 'application/octet-stream', base64: await fileToBase64(f), kb: Math.max(1, Math.round(f.size / 1024)) });
    const total = [...files, ...add].reduce((a, f) => a + f.kb, 0);
    if (total > 3500) { toast('Los adjuntos superan 3,5 MB, el máximo de esta versión. Comparte un enlace en su lugar.', { error: true }); return; }
    setFiles((x) => [...x, ...add]);
  };

  const improve = async () => {
    setAiBusy(true);
    try { const r = await api<{ text: string }>('/api/ai/improve', { body: { text: body, tone: 'ejecutivo' } }); setBody(r.text); toast('Texto mejorado: revísalo antes de enviar'); }
    catch (e) { toast(e instanceof Error ? e.message : 'Error', { error: true }); }
    finally { setAiBusy(false); }
  };

  const send = async () => {
    setBusy(true);
    try {
      const r = await api<{ threadId: string }>('/api/send', { body: { to, cc: showCc ? cc : '', subject, body, signatureId: sigId, after, attachments: files.map(({ filename, mimeType, base64 }) => ({ filename, mimeType, base64 })) } });
      toast(`Enviado desde ${me.user.email}. ${after === 'esperando' ? 'Queda en Esperando respuesta.' : after === 'finalizado' ? 'Queda finalizado.' : 'Queda pendiente.'}`);
      go('inbox', { t: r.threadId });
    } catch (e) { toast(e instanceof Error ? e.message : 'Error', { error: true }); }
    finally { setBusy(false); }
  };

  const fromName = me.user.name || me.user.email;
  const surface = dark ? '#202124' : '#FFFFFF', ink = dark ? '#E8EAED' : '#202124', mute = dark ? '#9AA0A6' : '#5F6368', rule = dark ? '#3C4043' : '#E4E8ED';
  const maxW = device === 'movil' ? 360 : 600;

  return (
    <div className="page">
      <h1>Nuevo mensaje</h1>
      <div className="row" style={{ alignItems: 'flex-start', gap: 20 }}>
        <section className="card" style={{ flex: '1 1 460px', minWidth: 0, overflow: 'hidden' }} aria-label="Editor">
          <div className="row" style={{ padding: '10px 16px', borderBottom: '1px solid var(--line-soft)' }}>
            <span className="muted" style={{ width: 56, fontWeight: 600, fontSize: 13 }}>De</span>
            <span>{fromName} &lt;{me.user.email}&gt;</span>
          </div>
          <div className="row" style={{ padding: '4px 16px', borderBottom: '1px solid var(--line-soft)', flexWrap: 'nowrap' }}>
            <label className="row grow" style={{ flexWrap: 'nowrap' }}><span className="muted" style={{ width: 56, fontWeight: 600, fontSize: 13 }}>Para</span>
              <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="nombre@empresa.cl, otra@empresa.cl" style={{ flex: 1, minWidth: 0, height: 40, border: 0, fontSize: 15 }} /></label>
            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--accent)' }} aria-expanded={showCc} onClick={() => setShowCc(!showCc)}>CC</button>
          </div>
          {showCc ? <label className="row" style={{ padding: '4px 16px', borderBottom: '1px solid var(--line-soft)', flexWrap: 'nowrap' }}><span className="muted" style={{ width: 56, fontWeight: 600, fontSize: 13 }}>CC</span><input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="Separa varios correos con comas" style={{ flex: 1, minWidth: 0, height: 40, border: 0, fontSize: 15 }} /></label> : null}
          <label className="row" style={{ padding: '4px 16px', borderBottom: '1px solid var(--line-soft)', flexWrap: 'nowrap' }}><span className="muted" style={{ width: 56, fontWeight: 600, fontSize: 13 }}>Asunto</span><input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="De qué trata el mensaje" style={{ flex: 1, minWidth: 0, height: 40, border: 0, fontSize: 15, fontWeight: 600 }} /></label>
          <label className="sr" htmlFor="cbody">Mensaje</label>
          <textarea id="cbody" rows={11} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Escribe tu mensaje…" style={{ display: 'block', width: '100%', border: 0, padding: 16, fontSize: 15, lineHeight: 1.6, resize: 'vertical' }} />
          <div className="col" style={{ padding: '12px 16px', borderTop: '1px dashed var(--ctl)' }}>
            <div className="row" style={{ gap: 6 }}>
              <span className="small muted" style={{ fontWeight: 600 }}>Firma</span>
              <button className="pill" aria-pressed={!sigId} onClick={() => setSigId(null)}>Sin firma</button>
              {me.signatures.map((s) => <button key={s.id} className="pill" aria-pressed={sigId === s.id} onClick={() => setSigId(s.id)}>{s.name}</button>)}
              {!me.signatures.length ? <button className="btn btn-ghost btn-sm" style={{ color: 'var(--accent)' }} onClick={() => go('settings', { tab: 'firmas' })}>Crear una firma</button> : null}
            </div>
            {sigHtml ? <div dangerouslySetInnerHTML={{ __html: sigHtml }} /> : null}
          </div>
          {files.length ? <div className="row" style={{ padding: '0 16px 12px', gap: 6 }}>{files.map((f, i) => <span key={i} className="attach">{f.filename} ({f.kb} KB)<button className="icon-btn" style={{ width: 24, height: 24, fontSize: 15 }} aria-label="Quitar adjunto" onClick={() => setFiles((x) => x.filter((_, j) => j !== i))}>×</button></span>)}</div> : null}
          <div className="row" style={{ padding: '12px 16px', background: 'var(--surface-2)', borderTop: '1px solid var(--line-soft)' }}>
            <label className="btn" style={{ position: 'relative' }}><Icon name="clip" />Adjuntar<input type="file" multiple className="sr" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} /></label>
            {me.aiEnabled ? <button className="btn" onClick={improve} disabled={aiBusy || !body.trim()}><Icon name="spark" />{aiBusy ? 'Mejorando…' : 'Mejorar con IA'}</button> : null}
            <span className="spacer" />
            <button className="btn btn-ghost" onClick={() => go('inbox')}>Descartar</button>
            <button className="btn btn-primary" onClick={send} disabled={busy}>{busy ? 'Enviando…' : 'Enviar'}</button>
          </div>
          <div className="row" style={{ padding: '10px 16px 14px', background: 'var(--surface-2)', gap: 6 }}>
            <span className="small muted">Después de enviar, la conversación queda</span>
            <Pills label="Después de enviar" value={after} onChange={setAfter} options={[['esperando', 'Esperando respuesta'], ['pendiente', 'Pendiente'], ['finalizado', 'Finalizada']]} />
          </div>
        </section>

        <section className="col" style={{ flex: '1 1 420px', minWidth: 0, gap: 12 }} aria-label="Vista previa">
          <div className="row">
            <h2 className="grow" style={{ fontSize: 15 }}>Así lo recibirá el destinatario</h2>
            <Pills label="Dispositivo" value={device} onChange={setDevice} options={[['escritorio', 'Escritorio'], ['movil', 'Móvil']]} />
            <Pills label="Tema" value={dark} onChange={setDark} options={[[false, 'Claro'], [true, 'Oscuro']]} />
          </div>
          <div className="col" style={{ background: '#DDE3EA', borderRadius: 10, padding: 16, alignItems: 'center', gap: 14 }}>
            <span className="small muted" style={{ alignSelf: 'flex-start', fontWeight: 600 }}>En su bandeja de entrada</span>
            <div style={{ width: '100%', maxWidth: maxW, display: 'flex', gap: 12, padding: '12px 14px', borderRadius: 8, background: surface, color: ink, boxShadow: '0 1px 3px rgba(15,30,46,.18)', fontFamily: 'Arial, sans-serif' }}>
              <span className="avatar" style={{ width: 36, height: 36, fontSize: 12, background: '#1546C9' }} aria-hidden="true">{initials(fromName)}</span>
              <span className="grow col" style={{ gap: 1 }}>
                <span className="row" style={{ flexWrap: 'nowrap' }}><b className="grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fromName}</b><span style={{ fontSize: 12, color: mute }}>Ahora</span></span>
                <b style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subject || '(sin asunto)'}</b>
                <span style={{ fontSize: 13, color: mute, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{body.trim() ? body.replace(/\s+/g, ' ').slice(0, 110) : 'El comienzo del mensaje aparece aquí'}</span>
              </span>
            </div>
            <span className="small muted" style={{ alignSelf: 'flex-start', fontWeight: 600 }}>Al abrirlo</span>
            <div style={{ width: '100%', maxWidth: maxW, borderRadius: 8, overflow: 'hidden', background: surface, color: ink, boxShadow: '0 1px 3px rgba(15,30,46,.18)', fontFamily: 'Arial, sans-serif' }}>
              <div style={{ padding: '12px 20px', borderBottom: `1px solid ${rule}`, fontSize: 12.5, display: 'flex', flexDirection: 'column', gap: 3 }}>
                <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>{subject || '(sin asunto)'}</div>
                <div><span style={{ color: mute, display: 'inline-block', width: 52 }}>De</span>{fromName} &lt;{me.user.email}&gt;</div>
                <div><span style={{ color: mute, display: 'inline-block', width: 52 }}>Para</span>{to || 'destinatario@empresa.cl'}</div>
                {showCc && cc ? <div><span style={{ color: mute, display: 'inline-block', width: 52 }}>CC</span>{cc}</div> : null}
              </div>
              <div style={{ padding: '18px 20px 22px', fontSize: 14, lineHeight: 1.55 }}>
                <div style={{ whiteSpace: 'pre-line', opacity: body.trim() ? 1 : 0.55, fontStyle: body.trim() ? 'normal' : 'italic' }}>{body.trim() ? body : 'Escribe tu mensaje y aquí verás cómo le llegará.'}</div>
                {sigHtml ? <div style={{ marginTop: 18, filter: dark ? 'none' : undefined }} dangerouslySetInnerHTML={{ __html: sigHtml }} /> : null}
                {files.length ? <div className="row" style={{ marginTop: 18, paddingTop: 12, borderTop: `1px solid ${rule}`, gap: 6 }}>{files.map((f, i) => <span key={i} style={{ fontSize: 12, fontWeight: 600, padding: '6px 10px', borderRadius: 6, border: `1px solid ${rule}` }}>{f.filename}</span>)}</div> : null}
              </div>
            </div>
          </div>
          <p className="small muted">Vista aproximada de Gmail u Outlook. Las imágenes de firma viajan dentro del correo para que se vean sin descargarlas de internet.</p>
        </section>
      </div>
    </div>
  );
}
