import { and, eq } from 'drizzle-orm';
import { api, HttpError, requireUser } from '@/lib/session';
import { buildMime, toBase64Url, type MimeFile } from '@/lib/mime';
import { renderSignature, textToHtml, escapeHtml } from '@/lib/signature';
import { sendRaw } from '@/lib/gmail';
import { loadThreadView } from '@/lib/thread';
import { setThreadState, STATES, type State } from '@/lib/inbox';
import { db, schema } from '@/lib/db';

export const maxDuration = 60;

type Body = {
  to: string; cc?: string; subject?: string; body: string;
  signatureId?: string | null; threadId?: string | null;
  after?: State | 'none'; attachments?: MimeFile[];
};

const EMAIL_RE = /[^\s@<>,]+@[^\s@<>,]+\.[^\s@<>,]+/;

export const POST = api(async (req: Request) => {
  const user = await requireUser();
  const b = (await req.json()) as Body;
  const recipients = (b.to || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!recipients.length || !recipients.every((r) => EMAIL_RE.test(r))) throw new HttpError(400, 'Revisa los destinatarios: hay una dirección no válida.');
  if (b.cc && !b.cc.split(',').map((s) => s.trim()).filter(Boolean).every((r) => EMAIL_RE.test(r))) throw new HttpError(400, 'Revisa las direcciones en copia.');
  const files = b.attachments || [];
  const size = files.reduce((a, f) => a + f.base64.length * 0.75, 0);
  if (size > 3.5 * 1024 * 1024) throw new HttpError(413, 'Los adjuntos superan 3,5 MB, el máximo de esta versión. Comparte un enlace en su lugar.');

  let sig = null;
  if (b.signatureId) {
    [sig] = await db().select().from(schema.signatures).where(and(eq(schema.signatures.id, b.signatureId), eq(schema.signatures.userId, user.id))).limit(1);
  }
  const s = renderSignature(sig);

  let subject = (b.subject || '').trim(), inReplyTo: string | undefined, references: string | undefined, quoteHtml = '', quoteText = '';
  if (b.threadId) {
    const view = await loadThreadView(user.id, user.email, b.threadId);
    const last = view.messages[view.messages.length - 1];
    if (last) {
      inReplyTo = last.messageIdHeader || undefined;
      references = [last.references, last.messageIdHeader].filter(Boolean).join(' ') || undefined;
      if (!subject) subject = /^re:/i.test(view.subject) ? view.subject : `Re: ${view.subject}`;
      const when = new Date(last.date).toLocaleString('es-CL', { timeZone: 'America/Santiago', dateStyle: 'medium', timeStyle: 'short' });
      const intro = `El ${when}, ${last.from.name} <${last.from.email}> escribió:`;
      const orig = (last.text || '').slice(0, 20000);
      quoteText = `\n\n${intro}\n${orig.split('\n').map((l) => '> ' + l).join('\n')}`;
      quoteHtml = `<br><div class="gmail_quote"><div>${escapeHtml(intro)}</div><blockquote style="margin:0 0 0 .8ex;border-left:1px solid #ccc;padding-left:1ex">${textToHtml(orig)}</blockquote></div>`;
    }
  }
  if (!subject) throw new HttpError(400, 'Escribe un asunto.');

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#202124">${textToHtml(b.body || '')}${s.html ? `<br><br>${s.html}` : ''}</div>${quoteHtml}`;
  const text = `${b.body || ''}${s.text ? `\n\n${s.text}` : ''}${quoteText}`;
  const from = user.name ? `${user.name} <${user.email}>` : user.email;

  const mime = buildMime({ from, to: recipients.join(', '), cc: b.cc, subject, text, html, inReplyTo, references, inline: s.inline, attachments: files });
  const sent = await sendRaw(user.id, toBase64Url(mime), b.threadId || undefined);

  if (b.after && b.after !== 'none' && STATES.includes(b.after)) {
    await setThreadState(user, sent.threadId, b.after).catch((e) => console.warn('No se pudo aplicar el estado', e));
  }
  return Response.json({ ok: true, threadId: sent.threadId, messageId: sent.id });
});
