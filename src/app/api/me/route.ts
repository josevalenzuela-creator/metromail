import { eq } from 'drizzle-orm';
import { api, requireUser } from '@/lib/session';
import { getSettings } from '@/lib/settings';
import { getOrg, orgMembers } from '@/lib/org';
import { aiEnabled } from '@/lib/ai';
import { db, schema } from '@/lib/db';

export const GET = api(async () => {
  const user = await requireUser();
  const [settings, org, members, sigs] = await Promise.all([
    getSettings(user.id),
    getOrg(user.domain),
    orgMembers(user.domain),
    db().select({ id: schema.signatures.id, name: schema.signatures.name, type: schema.signatures.type }).from(schema.signatures).where(eq(schema.signatures.userId, user.id)),
  ]);
  return Response.json({
    user: { id: user.id, email: user.email, name: user.name, picture: user.picture, role: user.role, area: user.area, domain: user.domain },
    settings,
    org,
    members: members.map((m) => ({ email: m.email, name: m.name, role: m.role, area: m.area })),
    signatures: sigs,
    aiEnabled: aiEnabled(),
  });
});
