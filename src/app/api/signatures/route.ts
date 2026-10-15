import { eq } from 'drizzle-orm';
import { api, requireUser } from '@/lib/session';
import { validateSig } from '@/lib/sigvalidate';
import { db, schema } from '@/lib/db';
import { signaturePreviewHtml } from '@/lib/signature';
import { getSettings } from '@/lib/settings';

export const GET = api(async () => {
  const user = await requireUser();
  const sigs = await db().select().from(schema.signatures).where(eq(schema.signatures.userId, user.id));
  const s = await getSettings(user.id);
  return Response.json({ signatures: sigs.map((x) => ({ ...x, preview: signaturePreviewHtml(x) })), sigNewId: s.sigNewId, sigReplyId: s.sigReplyId });
});

export const POST = api(async (req: Request) => {
  const user = await requireUser();
  const v = validateSig(await req.json());
  const [sig] = await db().insert(schema.signatures).values({ userId: user.id, ...v }).returning();
  const s = await getSettings(user.id);
  if (!s.sigNewId || !s.sigReplyId) await db().update(schema.userSettings).set({ sigNewId: s.sigNewId || sig.id, sigReplyId: s.sigReplyId || sig.id }).where(eq(schema.userSettings.userId, user.id));
  return Response.json({ signature: sig });
});
