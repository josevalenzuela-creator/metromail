import { api, requireUser } from '@/lib/session';
import { slaSyncStep } from '@/lib/sla';

export const maxDuration = 60;

export const POST = api(async (req: Request) => {
  const user = await requireUser();
  const force = new URL(req.url).searchParams.get('force') === '1';
  return Response.json(await slaSyncStep(user, { budget: 30, force }));
});
