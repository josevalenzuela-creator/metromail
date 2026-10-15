import { api, HttpError, requireUser } from '@/lib/session';
import { improveText } from '@/lib/ai';

export const maxDuration = 60;

export const POST = api(async (req: Request) => {
  await requireUser();
  const { text, tone } = await req.json();
  if (!text?.trim()) throw new HttpError(400, 'Escribe algo primero');
  return Response.json({ text: await improveText(text, tone || 'ejecutivo') });
});
