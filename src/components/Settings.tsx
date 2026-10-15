'use client';
import { useEffect, useState } from 'react';
import { useApp } from './App';
import { api, fileToDataUrl, type Member } from './lib';
import { Avatar, EmailFrame, Icon, Pills, Spinner, Switch } from './ui';

type Tab = 'firmas' | 'sla' | 'organizacion' | 'cuenta';
type Sig = { id: string; name: string; type: 'texto' | 'imagen' | 'html'; body: string; html: string; imageData: string | null; imageWidth: number; imagePos: string; preview: string };
type Draft = Omit<Sig, 'id' | 'preview'> & { id?: string };

export default function SettingsView() {
  const { params, go, me } = useApp();
  const tab = (['firmas', 'sla', 'organizacion', 'cuenta'].includes(params.get('tab') || '') ? params.get('tab') : 'firmas') as Tab;
  return (
    <div className="page">
      <h1>Configuración</h1>
      <div className="seg" style={{ alignSelf: 'flex-start' }}>
        {([['firmas', 'Firmas'], ['sla', 'SLA y reglas'], ['organizacion', me.user.role === 'admin' ? 'Organización y equipo' : 'Organización'], ['cuenta', 'Cuenta']] as [Tab, string][]).map(([k, l]) => <button key={k} aria-pressed={tab === k} onClick={() => go('settings', { tab: k })}>{l}</button>)}
      </div>
      {tab === 'firmas' && <Signatures />}
      {tab === 'sla' && <SlaRules />}
      {tab === 'organizacion' && <Org />}
      {tab === 'cuenta' && <Account />}
    </div>
  );
}

const EMPTY: Draft = { name: '', type: 'texto', body: '', html: '', imageData: null, imageWidth: 120, imagePos: 'izquierda' };

function Signatures() {
  const { me, reloadMe, toast } = useApp();
  const [sigs, setSigs] = useState<Sig[] | null>(null);
  const [defs, setDefs] = useState<{ sigNewId: string | null; sigReplyId: string | null }>({ sigNewId: null, sigReplyId: null });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [preview, setPreview] = useState<{ html: string; warnings: string[] } | null>(null);
  const [dark, setDark] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => { const r = await api<{ signatures: Sig[]; sigNewId: string | null; sigReplyId: string | null }>('/api/signatures'); setSigs(r.signatures); setDefs({ sigNewId: r.sigNewId, sigReplyId: r.sigReplyId }); };
  useEffect(() => { load().catch((e) => toast(e.message, { error: true })); }, [toast]);

  useEffect(() => {
    if (!draft) { setPreview(null); return; }
    const t = setTimeout(() => { api<{ html: string; warnings: string[] }>('/api/signatures/preview', { body: draft }).then(setPreview).catch((e) => setPreview({ html: '', warnings: [e.message] })); }, 350);
    return () => clearTimeout(t);
  }, [draft]);

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      if (draft.id) await api(`/api/signatures/${draft.id}`, { method: 'PUT', body: draft });
      else await api('/api/signatures', { body: draft });
      toast('Firma guardada'); setDraft(null); await load(); await reloadMe();
    } catch (e) { toast(e instanceof Error ? e.message : 'Error', { error: true }); }
    finally { setBusy(false); }
  };
  const del = async (s: Sig) => {
    if (!confirm(`¿Eliminar la firma «${s.name}»?`)) return;
    try { await api(`/api/signatures/${s.id}`, { method: 'DELETE' }); toast('Firma eliminada'); if (draft?.id === s.id) setDraft(null); await load(); await reloadMe(); }
    catch (e) { toast(e instanceof Error ? e.message : 'Error', { error: true }); }
  };
  const setDefault = async (k: 'sigNewId' | 'sigReplyId', v: string | null) => {
    setDefs((d) => ({ ...d, [k]: v }));
    try { await api('/api/settings', { method: 'PUT', body: { [k]: v } }); await reloadMe(); } catch (e) { toast(e instanceof Error ? e.message : 'Error', { error: true }); }
  };
  const upload = async (f: File | undefined) => {
    if (!f || !draft) return;
    if (!/^image\/(png|jpeg|gif|webp)$/.test(f.type)) { toast('Usa una imagen PNG, JPG, GIF o WebP', { error: true }); return; }
    if (f.size > 1024 * 1024) { toast('La imagen pesa más de 1 MB', { error: true }); return; }
    setDraft({ ...draft, imageData: await fileToDataUrl(f) });
  };

  if (!sigs) return <Spinner />;
  const opts: [string | null, string][] = [[null, 'Sin firma'], ...sigs.map((s) => [s.id, s.name] as [string, string])];

  return (
    <div className="row" style={{ gap: 18, alignItems: 'flex-start' }}>
      <section className="card pad col grow" style={{ gap: 14, minWidth: 300, flexBasis: 340 }}>
        <div className="row"><h2 className="grow" style={{ fontSize: 16 }}>Tus firmas</h2><button className="btn btn-primary btn-sm" onClick={() => setDraft({ ...EMPTY, name: sigs.length ? '' : 'Principal', body: sigs.length ? '' : `${me.user.name || ''}\n${me.org?.name || ''}` })}>Nueva firma</button></div>
        {!sigs.length ? <span className="small muted">Aún no tienes firmas. Crea una para usarla al redactar y responder.</span> : sigs.map((s) => (
          <div key={s.id} className="trow">
            <span className="grow"><b>{s.name}</b> <span className="chip">{s.type === 'texto' ? 'Texto' : s.type === 'imagen' ? 'Con imagen' : 'HTML'}</span>
              {defs.sigNewId === s.id ? <span className="chip blue" style={{ marginLeft: 4 }}>Nuevos</span> : null}{defs.sigReplyId === s.id ? <span className="chip violet" style={{ marginLeft: 4 }}>Respuestas</span> : null}</span>
            <button className="btn btn-sm" onClick={() => setDraft({ id: s.id, name: s.name, type: s.type, body: s.body, html: s.html, imageData: s.imageData, imageWidth: s.imageWidth, imagePos: s.imagePos })}>Editar</button>
            <button className="btn btn-sm btn-ghost" onClick={() => del(s)}>Eliminar</button>
          </div>
        ))}
        <div className="col" style={{ gap: 8, borderTop: '1px solid var(--line-soft)', paddingTop: 12 }}>
          <b style={{ fontSize: 13 }}>Firma por defecto en {me.user.email}</b>
          <span className="small muted">Correos nuevos</span><Pills label="Firma para correos nuevos" value={defs.sigNewId} onChange={(v) => setDefault('sigNewId', v)} options={opts} />
          <span className="small muted">Respuestas y reenvíos</span><Pills label="Firma para respuestas" value={defs.sigReplyId} onChange={(v) => setDefault('sigReplyId', v)} options={opts} />
        </div>
      </section>

      {draft ? (
        <section className="card pad col grow" style={{ gap: 12, minWidth: 320, flexBasis: 520 }}>
          <h2 style={{ fontSize: 16 }}>{draft.id ? 'Editar firma' : 'Nueva firma'}</h2>
          <label className="field">Nombre<input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Ej.: Principal, Corta, Comercial" /></label>
          <Pills label="Tipo de firma" value={draft.type} onChange={(v) => setDraft({ ...draft, type: v })} options={[['texto', 'Texto'], ['imagen', 'Texto con imagen'], ['html', 'HTML']]} />
          {draft.type !== 'html' ? <label className="field">Texto<textarea className="textarea" rows={5} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} placeholder={'Nombre Apellido\nCargo · Empresa\n+56 9 1234 5678'} /></label> : (
            <label className="field">Código HTML<textarea className="textarea mono" rows={9} value={draft.html} onChange={(e) => setDraft({ ...draft, html: e.target.value })} placeholder="<table>…</table>" />
              <span className="small muted">Quitamos scripts, formularios y estilos peligrosos. Las imágenes deben ser enlaces https.</span></label>
          )}
          {draft.type === 'imagen' ? (
            <div className="col" style={{ gap: 8 }}>
              <div className="row" style={{ gap: 8 }}>
                <label className="btn"><Icon name="upload" />{draft.imageData ? 'Cambiar imagen' : 'Subir imagen'}<input type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={(e) => upload(e.target.files?.[0])} /></label>
                {draft.imageData ? <button className="btn btn-ghost btn-sm" onClick={() => setDraft({ ...draft, imageData: null })}>Quitar</button> : null}
                <span className="small muted">Se envía incrustada en el correo, sin enlaces externos.</span>
              </div>
              <label className="field">Ancho: {draft.imageWidth} px<input type="range" min={40} max={320} step={10} value={draft.imageWidth} onChange={(e) => setDraft({ ...draft, imageWidth: Number(e.target.value) })} /></label>
              <Pills label="Posición" value={draft.imagePos} onChange={(v) => setDraft({ ...draft, imagePos: v })} options={[['izquierda', 'A la izquierda'], ['arriba', 'Arriba'], ['abajo', 'Abajo']]} />
            </div>
          ) : null}
          <div className="col" style={{ gap: 6 }}>
            <div className="row"><b className="grow" style={{ fontSize: 13 }}>Así se verá en el correo</b><Pills label="Fondo" value={dark} onChange={setDark} options={[[false, 'Claro'], [true, 'Oscuro']]} /></div>
            <div style={{ border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden' }}>
              {preview ? <EmailFrame html={`<p>Hola Carla,</p><p>Te envío lo conversado. Quedo atento.</p><p>Saludos,</p>${preview.html}`} text="" allowImages dark={dark} /> : <div className="pad"><Spinner /></div>}
            </div>
            {preview?.warnings.map((w, i) => <div key={i} className="banner warn">{w}</div>)}
          </div>
          <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn btn-ghost" onClick={() => setDraft(null)}>Cancelar</button><button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'Guardando…' : 'Guardar firma'}</button></div>
        </section>
      ) : null}
    </div>
  );
}

function SlaRules() {
  const { me, reloadMe, toast } = useApp();
  const [s, setS] = useState(me.settings);
  const [vip, setVip] = useState(me.settings.vipEmails.join(', '));
  const [sup, setSup] = useState(me.settings.supplierDomains.join(', '));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api('/api/settings', { method: 'PUT', body: { slaTargets: s.slaTargets, slaBiz: s.slaBiz, reopenRule: s.reopenRule, orgMetrics: s.orgMetrics, vipEmails: vip.split(/[,\s]+/).filter(Boolean), supplierDomains: sup.split(/[,\s]+/).filter(Boolean) } });
      await reloadMe(); toast('Preferencias guardadas. El SLA se recalcula con las nuevas metas.');
    } catch (e) { toast(e instanceof Error ? e.message : 'Error', { error: true }); }
    finally { setBusy(false); }
  };
  const Toggle = ({ k, title, desc }: { k: 'slaBiz' | 'reopenRule' | 'orgMetrics'; title: string; desc: string }) => (
    <div className="row" style={{ flexWrap: 'nowrap', gap: 12 }}><span className="grow"><b>{title}</b><br /><span className="small muted">{desc}</span></span><Switch on={s[k]} onChange={(v) => setS({ ...s, [k]: v })} label={title} /></div>
  );
  return (
    <section className="card pad col" style={{ gap: 16, maxWidth: 760 }}>
      <h2 style={{ fontSize: 16 }}>Metas de respuesta</h2>
      <div className="row" style={{ gap: 12 }}>
        {(['Clientes', 'Equipo', 'Proveedores'] as const).map((c) => (
          <label key={c} className="field" style={{ width: 160 }}>{c} (horas)<input className="input num" type="number" min={1} max={72} value={s.slaTargets[c]} onChange={(e) => setS({ ...s, slaTargets: { ...s.slaTargets, [c]: Number(e.target.value) } })} /></label>
        ))}
      </div>
      <Toggle k="slaBiz" title="Contar solo horario hábil" desc="Lunes a viernes de 9:00 a 19:00, hora de Santiago. Un correo del viernes a las 18:00 no vence el fin de semana." />
      <Toggle k="reopenRule" title="Reabrir al recibir respuesta" desc="Si llega un mensaje nuevo en un correo finalizado, apartado o esperando, vuelve a tu bandeja como pendiente." />
      <Toggle k="orgMetrics" title="Incluirme en el rendimiento del equipo" desc="Comparte solo tiempos de respuesta (nunca asuntos ni contenido) con tu organización." />
      <label className="field">Personas VIP<input className="input" value={vip} onChange={(e) => setVip(e.target.value)} placeholder="gerente@cliente.cl, ceo@empresa.cl" /><span className="small muted">Se destacan en la bandeja y cuentan como clientes.</span></label>
      <label className="field">Dominios de proveedores<input className="input" value={sup} onChange={(e) => setSup(e.target.value)} placeholder="proveedor.cl, courier.com" /><span className="small muted">Los correos de estos dominios usan la meta de proveedores. Tu dominio ({me.user.domain}) cuenta como equipo.</span></label>
      <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'Guardando…' : 'Guardar'}</button></div>
    </section>
  );
}

type OrgT = { domain: string; name: string; showNames: boolean; minGroup: boolean; perfVisibility: string; areas: string[] };

function Org() {
  const { me, reloadMe, toast } = useApp();
  const [org, setOrg] = useState<OrgT | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [areasTxt, setAreasTxt] = useState('');
  const load = async () => { const r = await api<{ org: OrgT; members: Member[]; canEdit: boolean }>('/api/org'); setOrg(r.org); setMembers(r.members); setCanEdit(r.canEdit); setAreasTxt(r.org?.areas.join(', ') || ''); };
  useEffect(() => { load().catch((e) => toast(e.message, { error: true })); }, [toast]);

  const putOrg = async (body: Partial<OrgT>) => {
    try { const r = await api<{ org: OrgT }>('/api/org', { method: 'PUT', body }); setOrg(r.org); setAreasTxt(r.org.areas.join(', ')); await reloadMe(); toast('Organización actualizada'); }
    catch (e) { toast(e instanceof Error ? e.message : 'Error', { error: true }); }
  };
  const putMember = async (email: string, body: { role?: string; area?: string | null }) => {
    setMembers((ms) => ms.map((m) => (m.email === email ? { ...m, ...body } as Member : m)));
    try { await api('/api/org/members', { method: 'PUT', body: { email, ...body } }); await reloadMe(); }
    catch (e) { toast(e instanceof Error ? e.message : 'Error', { error: true }); load(); }
  };

  if (!org) return <Spinner />;
  return (
    <div className="col" style={{ gap: 18, maxWidth: 980 }}>
      <section className="card pad col" style={{ gap: 14 }}>
        <div className="row" style={{ gap: 12 }}>
          <span className="brand-mark" style={{ width: 40, height: 40, fontSize: 16, background: '#F2C14E', color: '#0F1E2E' }} aria-hidden="true">{org.name.slice(0, 2).toUpperCase()}</span>
          <div className="grow"><h2 style={{ fontSize: 18 }}>{org.name}</h2><span className="small muted">Dominio {org.domain} · {members.length} {members.length === 1 ? 'persona' : 'personas'} · tu rol: {me.user.role}</span></div>
        </div>
        {canEdit ? (
          <>
            <label className="field">Nombre de la organización<input className="input" defaultValue={org.name} onBlur={(e) => e.target.value.trim() && e.target.value !== org.name && putOrg({ name: e.target.value })} /></label>
            <label className="field">Áreas (separadas por comas)<input className="input" value={areasTxt} onChange={(e) => setAreasTxt(e.target.value)} onBlur={() => putOrg({ areas: areasTxt.split(',').map((x) => x.trim()).filter(Boolean) })} /></label>
            <h3 style={{ fontSize: 14, marginTop: 6 }}>Privacidad del rendimiento</h3>
            <div className="row" style={{ flexWrap: 'nowrap', gap: 12 }}><span className="grow"><b>Mostrar nombres a administradores</b><br /><span className="small muted">Si lo apagas, el detalle por persona aparece como «Persona A», «Persona B».</span></span><Switch on={org.showNames} onChange={(v) => putOrg({ showNames: v })} label="Mostrar nombres" /></div>
            <div className="row" style={{ flexWrap: 'nowrap', gap: 12 }}><span className="grow"><b>Ocultar grupos de menos de 3 personas</b><br /><span className="small muted">Evita que un promedio de área identifique a alguien.</span></span><Switch on={org.minGroup} onChange={(v) => putOrg({ minGroup: v })} label="Ocultar grupos pequeños" /></div>
          </>
        ) : <div className="banner info">Solo quien administra la organización puede cambiar áreas, roles y privacidad. Ves tus propios indicadores y los promedios.</div>}
      </section>

      <section className="card" style={{ overflow: 'auto' }}>
        <div className="pad" style={{ paddingBottom: 8 }}><h2 style={{ fontSize: 16 }}>Equipo</h2><span className="small muted">Las personas aparecen al entrar por primera vez con su cuenta de {org.domain}. Comparte el enlace de MetroMail con tu equipo.</span></div>
        <table className="table">
          <thead><tr><th>Persona</th><th>Rol</th><th>Área</th></tr></thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.email}>
                <td><span className="row" style={{ gap: 8, flexWrap: 'nowrap' }}><Avatar name={m.name || m.email} size={26} /><span>{m.name || m.email}<br /><span className="small muted">{m.email}</span></span></span></td>
                <td>{canEdit ? (
                  <select className="input" style={{ height: 32, width: 140 }} value={m.role} onChange={(e) => putMember(m.email, { role: e.target.value })} aria-label={`Rol de ${m.email}`}>
                    <option value="admin">Administrador</option><option value="jefe">Jefatura</option><option value="miembro">Miembro</option>
                  </select>) : ({ admin: 'Administrador', jefe: 'Jefatura', miembro: 'Miembro' } as Record<string, string>)[m.role] || m.role}</td>
                <td>{canEdit ? (
                  <select className="input" style={{ height: 32, width: 180 }} value={m.area || ''} onChange={(e) => putMember(m.email, { area: e.target.value || null })} aria-label={`Área de ${m.email}`}>
                    <option value="">Sin área</option>{org.areas.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>) : m.area || 'Sin área'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="small muted pad" style={{ margin: 0 }}>Administrador: ve a todo el equipo. Jefatura: ve su área. Miembro: ve lo propio y los promedios.</p>
      </section>
    </div>
  );
}

function Account() {
  const { me } = useApp();
  return (
    <section className="card pad col" style={{ gap: 14, maxWidth: 760 }}>
      <h2 style={{ fontSize: 16 }}>Cuentas de correo</h2>
      <div className="trow"><Avatar name={me.user.name || me.user.email} /><span className="grow"><b>{me.user.email}</b><br /><span className="small muted">Google Workspace · conectada con Gmail</span></span><span className="chip green">Activa</span></div>
      <div className="banner info">Microsoft 365 e IMAP llegan en la siguiente etapa. Por ahora MetroMail funciona con tu cuenta de Google.</div>
      <h3 style={{ fontSize: 14 }}>Permisos</h3>
      <span className="small muted">MetroMail lee y organiza tu correo con etiquetas «MetroMail/…» en Gmail, envía en tu nombre y guarda tus credenciales cifradas. Puedes revocar el acceso cuando quieras desde la seguridad de tu cuenta de Google.</span>
      <div className="row"><a className="btn" href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">Revisar permisos en Google</a><a className="btn btn-ghost" href="/api/auth/login">Volver a conectar</a></div>
      {me.aiEnabled ? <span className="small muted"><Icon name="spark" /> Asistente IA activo: los correos que analizas se envían al modelo solo cuando pulsas «Analizar» o «Redactar con IA».</span> : <span className="small muted">Asistente IA desactivado en este servidor.</span>}
    </section>
  );
}
