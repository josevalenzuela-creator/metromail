import { eq } from 'drizzle-orm';
import { db, schema } from './db';
import { gmail } from './google';

export type GHeader = { name: string; value: string };
export type GPart = { partId?: string; mimeType: string; filename?: string; headers?: GHeader[]; body?: { size: number; data?: string; attachmentId?: string }; parts?: GPart[] };
export type GMessage = { id: string; threadId: string; labelIds?: string[]; snippet?: string; internalDate: string; payload: GPart; historyId?: string };
export type GThread = { id: string; historyId: string; snippet?: string; messages: GMessage[] };
export type Addr = { name: string; email: string };

export function header(m: { payload: GPart }, name: string): string {
  const h = m.payload.headers?.find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h?.value ?? '';
}

export function parseAddress(raw: string): Addr {
  const s = raw.trim();
  const m = s.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim() || m[2].trim(), email: m[2].trim().toLowerCase() };
  return { name: s, email: s.toLowerCase() };
}

/** Separa una lista de direcciones respetando comas dentro de comillas. */
export function parseAddressList(raw: string): Addr[] {
  if (!raw) return [];
  const out: string[] = [];
  let cur = '', q = false, a = false;
  for (const ch of raw) {
    if (ch === '"') q = !q;
    if (ch === '<') a = true;
    if (ch === '>') a = false;
    if (ch === ',' && !q && !a) { out.push(cur); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.filter((x) => x.trim()).map(parseAddress);
}

export function b64urlToBuffer(data: string): Buffer {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function charsetOf(part: GPart): string {
  const ct = part.headers?.find((h) => h.name.toLowerCase() === 'content-type')?.value || '';
  const m = ct.match(/charset="?([^";]+)"?/i);
  return (m?.[1] || 'utf-8').toLowerCase();
}

function decodeText(part: GPart): string {
  if (!part.body?.data) return '';
  const buf = b64urlToBuffer(part.body.data);
  const cs = charsetOf(part);
  try {
    return new TextDecoder(cs === 'us-ascii' ? 'utf-8' : cs).decode(buf);
  } catch {
    return buf.toString('utf8');
  }
}

export type Attachment = { filename: string; mimeType: string; size: number; attachmentId: string; contentId?: string; inline: boolean; messageId: string };

export function extractBody(msg: GMessage): { html: string; text: string; attachments: Attachment[] } {
  let html = '', text = '';
  const attachments: Attachment[] = [];
  const walk = (p: GPart) => {
    const disp = p.headers?.find((h) => h.name.toLowerCase() === 'content-disposition')?.value || '';
    const cid = p.headers?.find((h) => h.name.toLowerCase() === 'content-id')?.value?.replace(/[<>]/g, '');
    if (p.body?.attachmentId && (p.filename || cid)) {
      attachments.push({ filename: p.filename || 'adjunto', mimeType: p.mimeType, size: p.body.size, attachmentId: p.body.attachmentId, contentId: cid, inline: /inline/i.test(disp) || (!!cid && !p.filename), messageId: msg.id });
    } else if (p.mimeType === 'text/html' && !p.filename && p.body?.data) {
      html += decodeText(p);
    } else if (p.mimeType === 'text/plain' && !p.filename && p.body?.data) {
      text += decodeText(p);
    }
    p.parts?.forEach(walk);
  };
  walk(msg.payload);
  return { html, text, attachments };
}

export function isFromMe(msg: GMessage, me: string): boolean {
  return (msg.labelIds || []).includes('SENT') || parseAddress(header(msg, 'From')).email === me.toLowerCase();
}

export function isToMe(msg: GMessage, me: string): boolean {
  return parseAddressList(header(msg, 'To')).some((a) => a.email === me.toLowerCase());
}

export function msgDate(msg: GMessage): Date {
  return new Date(Number(msg.internalDate));
}

/** Resume un hilo (en formato metadata o full) para la caché de la bandeja. */
export function summarizeThread(t: GThread, me: string) {
  const msgs = [...(t.messages || [])].sort((a, b) => Number(a.internalDate) - Number(b.internalDate));
  const first = msgs[0], last = msgs[msgs.length - 1];
  const lastInbound = [...msgs].reverse().find((m) => !isFromMe(m, me));
  const shown = lastInbound || last;
  const from = parseAddress(header(shown, 'From') || '');
  const labels = new Set<string>();
  msgs.forEach((m) => (m.labelIds || []).forEach((l) => labels.add(l)));
  // Para un hilo iniciado por mí, mostrar al destinatario.
  let fromName = from.name, fromEmail = from.email;
  if (!lastInbound) {
    const to = parseAddressList(header(first, 'To'))[0];
    if (to) { fromName = to.name; fromEmail = to.email; }
  }
  return {
    threadId: t.id,
    historyId: t.historyId,
    subject: header(first, 'Subject') || '(sin asunto)',
    fromName: fromName || fromEmail || '(desconocido)',
    fromEmail: fromEmail || '',
    snippet: decodeEntities(last.snippet || t.snippet || ''),
    date: msgDate(last),
    labelIds: [...labels],
    messageCount: msgs.length,
    lastFromMe: isFromMe(last, me),
    toMe: msgs.some((m) => isToMe(m, me)),
  };
}

export function decodeEntities(s: string): string {
  return s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

// ---------- Operaciones ----------

export function listThreads(userId: string, q: string, max = 50, pageToken?: string) {
  const p = new URLSearchParams({ q, maxResults: String(max) });
  if (pageToken) p.set('pageToken', pageToken);
  return gmail<{ threads?: { id: string; historyId: string; snippet: string }[]; nextPageToken?: string }>(userId, `threads?${p}`);
}

export function getThread(userId: string, id: string, format: 'full' | 'metadata' = 'full') {
  const p = new URLSearchParams({ format });
  if (format === 'metadata') ['From', 'To', 'Cc', 'Subject', 'Date', 'List-Unsubscribe', 'Auto-Submitted', 'Precedence'].forEach((h) => p.append('metadataHeaders', h));
  return gmail<GThread>(userId, `threads/${encodeURIComponent(id)}?${p}`);
}

export function modifyThread(userId: string, id: string, add: string[], remove: string[]) {
  return gmail(userId, `threads/${encodeURIComponent(id)}/modify`, { method: 'POST', json: { addLabelIds: add, removeLabelIds: remove } });
}

export function getAttachment(userId: string, messageId: string, attachmentId: string) {
  return gmail<{ data: string; size: number }>(userId, `messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`);
}

export function sendRaw(userId: string, raw: string, threadId?: string) {
  return gmail<{ id: string; threadId: string }>(userId, 'messages/send', { method: 'POST', json: threadId ? { raw, threadId } : { raw } });
}

export function listMessages(userId: string, q: string, max = 100, pageToken?: string) {
  const p = new URLSearchParams({ q, maxResults: String(max) });
  if (pageToken) p.set('pageToken', pageToken);
  return gmail<{ messages?: { id: string; threadId: string }[]; nextPageToken?: string }>(userId, `messages?${p}`);
}

export const STATE_LABELS: Record<string, string> = {
  gestion: 'MetroMail/En gestión',
  esperando: 'MetroMail/Esperando respuesta',
  apartado: 'MetroMail/Apartado',
  pospuesto: 'MetroMail/Pospuesto',
};

/** Crea (si hace falta) las etiquetas de estado en Gmail y devuelve sus IDs. */
export async function stateLabelIds(userId: string): Promise<Record<string, string>> {
  const [acc] = await db().select().from(schema.accounts).where(eq(schema.accounts.userId, userId)).limit(1);
  const map: Record<string, string> = { ...(acc?.labelMap || {}) };
  const missing = Object.keys(STATE_LABELS).filter((k) => !map[k]);
  if (!missing.length) return map;
  const existing = await gmail<{ labels: { id: string; name: string }[] }>(userId, 'labels');
  for (const k of missing) {
    const name = STATE_LABELS[k];
    let l = existing.labels.find((x) => x.name === name);
    if (!l) l = await gmail<{ id: string; name: string }>(userId, 'labels', { method: 'POST', json: { name, labelListVisibility: 'labelShow', messageListVisibility: 'show' } });
    map[k] = l.id;
  }
  await db().update(schema.accounts).set({ labelMap: map }).where(eq(schema.accounts.userId, userId));
  return map;
}

/** Ejecuta tareas con concurrencia limitada. */
export async function pool<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  });
  await Promise.all(workers);
  return out;
}
