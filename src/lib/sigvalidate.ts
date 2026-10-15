import { HttpError } from './session';

export type SigInput = { name: string; type: string; body?: string; html?: string; imageData?: string | null; imageWidth?: number; imagePos?: string };

export function validateSig(b: SigInput) {
  if (!b.name?.trim()) throw new HttpError(400, 'Ponle un nombre a la firma');
  if (!['texto', 'imagen', 'html'].includes(b.type)) throw new HttpError(400, 'Tipo de firma no válido');
  if (b.imageData && !/^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(b.imageData)) throw new HttpError(400, 'Imagen no válida: usa PNG, JPG, GIF o WebP');
  if (b.imageData && b.imageData.length > 1_400_000) throw new HttpError(413, 'La imagen pesa más de 1 MB');
  return {
    name: b.name.trim().slice(0, 80), type: b.type, body: (b.body || '').slice(0, 2000), html: (b.html || '').slice(0, 20000),
    imageData: b.type === 'imagen' ? b.imageData || null : null, imageWidth: Math.max(40, Math.min(320, Number(b.imageWidth) || 120)),
    imagePos: ['izquierda', 'arriba', 'abajo'].includes(b.imagePos || '') ? b.imagePos! : 'izquierda',
  };
}

