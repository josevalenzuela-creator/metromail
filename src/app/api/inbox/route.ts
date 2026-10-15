import { api, requireUser } from '@/lib/session';
import { syncInbox } from '@/lib/inbox';

export const maxDuration = 60;

export const GET = api(async (req: Request) => {
  const user = await requireUser();
  const q = new URL(req.url).searchParams.get('q')?.trim();
  const items = await syncInbox(user, q ? `${q} -in:chats` : 'in:inbox');
  return Response.json({ items, searched: !!q });
});
