import sanitizeHtml from 'sanitize-html';
import type { InlineImage } from './mime';

export type SignatureLike = { id?: string; name: string; type: string; body: string; html: string; imageData: string | null; imageWidth: number; imagePos: string };

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function textToHtml(s: string): string {
  return escapeHtml(s).replace(/\r?\n/g, '<br>');
}

const ALLOWED_TAGS = ['a', 'b', 'strong', 'i', 'em', 'u', 'br', 'p', 'div', 'span', 'table', 'tbody', 'thead', 'tr', 'td', 'th', 'img', 'font', 'small', 'hr', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'center', 'blockquote'];

/** Limpia HTML de firma igual que lo harían Gmail u Outlook. Devuelve el HTML seguro y avisos. */
export function sanitizeSignature(html: string): { html: string; warnings: string[] } {
  const warnings = new Set<string>();
  if (/<script/i.test(html)) warnings.add('Se quitaron scripts: los clientes de correo los bloquean.');
  if (/<style/i.test(html)) warnings.add('Se quitó <style>: usa estilos en línea (style="…").');
  if (/\son\w+\s*=/i.test(html)) warnings.add('Se quitaron eventos JavaScript (onclick, onload…).');
  if (/<(form|input|button|iframe)/i.test(html)) warnings.add('Se quitaron formularios o iframes.');
  if (/src\s*=\s*["']?data:image/i.test(html)) warnings.add('Hay imágenes en base64: Gmail no las muestra. Usa una dirección https o el tipo «Imagen y texto».');
  if (/src\s*=\s*["']?http:/i.test(html)) warnings.add('Hay imágenes por http: muchos clientes las bloquean. Usa https.');
  if (html.length > 10000) warnings.add(`Tiene ${html.length.toLocaleString('es-CL')} caracteres; Gmail acepta firmas de hasta 10.000.`);
  const clean = sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      '*': ['style', 'align', 'valign', 'width', 'height', 'bgcolor', 'color', 'border', 'cellpadding', 'cellspacing'],
      a: ['href', 'title', 'target'],
      img: ['src', 'alt', 'width', 'height', 'style'],
    },
    allowedSchemes: ['https', 'http', 'mailto', 'tel'],
    allowedSchemesByTag: { img: ['https', 'http', 'cid'] },
    allowProtocolRelative: false,
  });
  return { html: clean, warnings: [...warnings] };
}

/** Convierte una firma en HTML + texto plano + imágenes en línea (CID) para el envío. */
export function renderSignature(sig: SignatureLike | null | undefined): { html: string; text: string; inline: InlineImage[] } {
  if (!sig) return { html: '', text: '', inline: [] };
  const type = sig.type || 'texto';
  const lines = (sig.body || '').split('\n');
  const textHtml = (boldFirst: boolean) => lines.map((l, i) => (boldFirst && i === 0 ? `<b>${escapeHtml(l)}</b>` : escapeHtml(l))).join('<br>');
  const wrapStyle = 'font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.45;color:#202124';
  if (type === 'html') {
    const { html } = sanitizeSignature(sig.html || '');
    return { html: `<div style="${wrapStyle}">${html}</div>`, text: sanitizeHtml(sig.html || '', { allowedTags: [], allowedAttributes: {} }).replace(/\s+\n/g, '\n').trim(), inline: [] };
  }
  if (type === 'imagen' && sig.imageData) {
    const m = sig.imageData.match(/^data:(image\/(png|jpeg|gif|webp));base64,(.+)$/);
    if (m) {
      const cid = `firma-${sig.id || 'img'}@metromail`;
      const img = `<img src="cid:${cid}" alt="${escapeHtml(sig.name)}" width="${sig.imageWidth}" style="display:block;width:${sig.imageWidth}px;max-width:100%;height:auto;border:0">`;
      const txt = sig.body?.trim() ? textHtml(true) : '';
      let html: string;
      if (!txt) html = img;
      else if (sig.imagePos === 'izquierda') html = `<table cellpadding="0" cellspacing="0" border="0"><tr><td valign="middle" style="padding-right:14px">${img}</td><td valign="middle" style="padding-left:14px;border-left:2px solid #C9D1DA">${txt}</td></tr></table>`;
      else if (sig.imagePos === 'abajo') html = `<div>${txt}</div><div style="margin-top:8px">${img}</div>`;
      else html = `<div style="margin-bottom:8px">${img}</div><div>${txt}</div>`;
      return { html: `<div style="${wrapStyle}">${html}</div>`, text: sig.body || '', inline: [{ cid, mimeType: m[1], base64: m[3] }] };
    }
  }
  return { html: `<div style="${wrapStyle}">${textHtml(type === 'imagen')}</div>`, text: sig.body || '', inline: [] };
}

/** HTML de vista previa: reemplaza CID por el data URI para mostrarlo en el navegador. */
export function signaturePreviewHtml(sig: SignatureLike | null | undefined): string {
  const r = renderSignature(sig);
  let html = r.html;
  for (const i of r.inline) html = html.replace(`cid:${i.cid}`, `data:${i.mimeType};base64,${i.base64}`);
  return html;
}
