import { randomBytes } from 'node:crypto';

export type MimeFile = { filename: string; mimeType: string; base64: string };
export type InlineImage = { cid: string; mimeType: string; base64: string };

export type MailInput = {
  from: string;
  to: string;
  cc?: string;
  subject: string;
  text: string;
  html: string;
  inReplyTo?: string;
  references?: string;
  inline?: InlineImage[];
  attachments?: MimeFile[];
};

function encodeWord(s: string): string {
  // RFC 2047: solo si hay caracteres fuera de ASCII.
  return /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`;
}

/** Codifica el nombre visible de cada dirección, respetando el correo. */
export function encodeAddressList(list: string): string {
  return list.split(',').map((a) => a.trim()).filter(Boolean).map((a) => {
    const m = a.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
    if (!m || !m[1].trim()) return a;
    return `${encodeWord(m[1].trim())} <${m[2].trim()}>`;
  }).join(', ');
}

function wrap76(b64: string): string {
  return b64.replace(/.{1,76}/g, (l) => l + '\r\n').trimEnd();
}

function b64(s: string): string {
  return wrap76(Buffer.from(s, 'utf8').toString('base64'));
}

function boundary(tag: string) {
  return `mm_${tag}_${randomBytes(8).toString('hex')}`;
}

function sanitizeFilename(n: string) {
  return n.replace(/[\r\n"]/g, '_');
}

/** Construye un mensaje MIME (texto + HTML, imágenes en línea y adjuntos). */
export function buildMime(m: MailInput): string {
  const lines: string[] = [];
  const h = (k: string, v: string) => lines.push(`${k}: ${v}`);
  h('From', encodeAddressList(m.from));
  h('To', encodeAddressList(m.to));
  if (m.cc?.trim()) h('Cc', encodeAddressList(m.cc));
  h('Subject', encodeWord(m.subject));
  h('MIME-Version', '1.0');
  if (m.inReplyTo) h('In-Reply-To', m.inReplyTo);
  if (m.references) h('References', m.references);

  const alt = boundary('alt');
  const altBody = [
    `--${alt}`, 'Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '', b64(m.text),
    `--${alt}`, 'Content-Type: text/html; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '', b64(m.html),
    `--${alt}--`,
  ].join('\r\n');

  let body = altBody, contentType = `multipart/alternative; boundary="${alt}"`;

  if (m.inline?.length) {
    const rel = boundary('rel');
    body = [
      `--${rel}`, `Content-Type: ${contentType}`, '', altBody,
      ...m.inline.flatMap((img) => [
        `--${rel}`, `Content-Type: ${img.mimeType}`, 'Content-Transfer-Encoding: base64', `Content-ID: <${img.cid}>`, `Content-Disposition: inline; filename="${img.cid}"`, '', wrap76(img.base64),
      ]),
      `--${rel}--`,
    ].join('\r\n');
    contentType = `multipart/related; boundary="${rel}"`;
  }

  if (m.attachments?.length) {
    const mix = boundary('mix');
    body = [
      `--${mix}`, `Content-Type: ${contentType}`, '', body,
      ...m.attachments.flatMap((f) => [
        `--${mix}`, `Content-Type: ${f.mimeType || 'application/octet-stream'}; name="${sanitizeFilename(f.filename)}"`, 'Content-Transfer-Encoding: base64',
        `Content-Disposition: attachment; filename="${sanitizeFilename(f.filename)}"`, '', wrap76(f.base64),
      ]),
      `--${mix}--`,
    ].join('\r\n');
    contentType = `multipart/mixed; boundary="${mix}"`;
  }

  h('Content-Type', contentType);
  return lines.join('\r\n') + '\r\n\r\n' + body;
}

export function toBase64Url(s: string): string {
  return Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
