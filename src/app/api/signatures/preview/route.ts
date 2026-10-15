import { api, requireUser } from '@/lib/session';
import { sanitizeSignature, signaturePreviewHtml } from '@/lib/signature';
import { validateSig } from '@/lib/sigvalidate';

export const POST = api(async (req: Request) => {
  await requireUser();
  const b = await req.json();
  const v = validateSig({ ...b, name: b.name || 'Vista previa' });
  const warnings = v.type === 'html' ? sanitizeSignature(v.html).warnings : [];
  if (v.type === 'imagen' && v.imageData && v.imageData.length * 0.75 > 100 * 1024) warnings.push(`La imagen pesa ${Math.round((v.imageData.length * 0.75) / 1024)} KB. Bajo 100 KB carga más rápido.`);
  return Response.json({ html: signaturePreviewHtml(v), warnings });
});
