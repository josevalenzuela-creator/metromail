import sanitizeHtml from 'sanitize-html';
import { extractBody, getAttachment, getThread, header, isFromMe, parseAddress, parseAddressList, type GThread } from './gmail';

export type MessageView = {
  id: string;
  from: { name: string; email: string };
  to: { name: string; email: string }[];
  cc: { name: string; email: string }[];
  date: string;
  subject: string;
  html: string;
  text: string;
  mine: boolean;
  attachments: { filename: string; mimeType: string; size: number; attachmentId: string; messageId: string }[];
  messageIdHeader: string;
  references: string;
};

export function htmlToText(html: string): string {
  return sanitizeHtml(html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|li|h\d)>/gi, '\n'), { allowedTags: [], allowedAttributes: {} })
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Quita el texto citado ("El ... escribió:") para que la IA lea solo lo nuevo de cada mensaje. */
export function stripQuoted(text: string): string {
  const cut = text.search(/\n(El .{5,120} escribió:|On .{5,120} wrote:|-{2,} ?Mensaje original|De: .+\nEnviado:|From: .+\nSent:)/);
  return (cut > 0 ? text.slice(0, cut) : text).trim();
}

export async function loadThreadView(userId: string, me: string, threadId: string) {
  const t: GThread = await getThread(userId, threadId, 'full');
  const msgs = [...(t.messages || [])].sort((a, b) => Number(a.internalDate) - Number(b.internalDate));
  let inlineBudget = 1_500_000;
  const views: MessageView[] = [];
  for (const m of msgs) {
    const { html, text, attachments } = extractBody(m);
    let body = html;
    // Imágenes en línea (cid:) → data URI, con un tope de tamaño total.
    for (const a of attachments.filter((x) => x.contentId && body.includes(`cid:${x.contentId}`))) {
      if (a.size > inlineBudget) continue;
      try {
        const data = await getAttachment(userId, m.id, a.attachmentId);
        inlineBudget -= a.size;
        const b64 = data.data.replace(/-/g, '+').replace(/_/g, '/');
        body = body.split(`cid:${a.contentId}`).join(`data:${a.mimeType};base64,${b64}`);
      } catch { /* se muestra como adjunto */ }
    }
    views.push({
      id: m.id,
      from: parseAddress(header(m, 'From')),
      to: parseAddressList(header(m, 'To')),
      cc: parseAddressList(header(m, 'Cc')),
      date: new Date(Number(m.internalDate)).toISOString(),
      subject: header(m, 'Subject'),
      html: body,
      text: text || (html ? htmlToText(html) : ''),
      mine: isFromMe(m, me),
      attachments: attachments.filter((a) => !a.inline || !a.contentId || !html.includes(`cid:${a.contentId}`)).map(({ filename, mimeType, size, attachmentId, messageId }) => ({ filename, mimeType, size, attachmentId, messageId })),
      messageIdHeader: header(m, 'Message-ID') || header(m, 'Message-Id'),
      references: header(m, 'References'),
    });
  }
  const unread = msgs.some((m) => (m.labelIds || []).includes('UNREAD'));
  return { id: t.id, subject: header(msgs[0], 'Subject') || '(sin asunto)', messages: views, unread };
}

/** Texto plano del hilo para la IA (últimos mensajes, sin citas). */
export function threadText(view: { messages: MessageView[] }, myName: string): string {
  return view.messages.slice(-8).map((m) => {
    const who = m.mine ? `${myName} (yo)` : `${m.from.name} <${m.from.email}>`;
    return `--- ${who}, ${new Date(m.date).toLocaleString('es-CL', { timeZone: 'America/Santiago' })}\n${stripQuoted(m.text || htmlToText(m.html)).slice(0, 4000)}`;
  }).join('\n\n');
}
