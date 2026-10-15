import { api, HttpError, requireUser } from '@/lib/session';
import { loadThreadView, threadText } from '@/lib/thread';
import { draftReply } from '@/lib/ai';

export const maxDuration = 60;

export const POST = api(async (req: Request) => {
  const user = await requireUser();
  const { threadId, tone, instructions } = await req.json();
  if (!threadId) throw new HttpError(400, 'Falta el hilo');
  const view = await loadThreadView(user.id, user.email, threadId);
  const draft = await draftReply(threadText(view, user.name || user.email), (user.name || user.email).split(' ')[0], tone || 'ejecutivo', instructions || '');
  return Response.json({ draft });
});
