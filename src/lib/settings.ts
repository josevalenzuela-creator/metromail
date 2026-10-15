import { eq } from 'drizzle-orm';
import { db, schema } from './db';

export type Settings = typeof schema.userSettings.$inferSelect;

export async function getSettings(userId: string): Promise<Settings> {
  const [s] = await db().select().from(schema.userSettings).where(eq(schema.userSettings.userId, userId)).limit(1);
  if (s) return s;
  const [created] = await db().insert(schema.userSettings).values({ userId }).onConflictDoNothing().returning();
  if (created) return created;
  const [again] = await db().select().from(schema.userSettings).where(eq(schema.userSettings.userId, userId)).limit(1);
  return again;
}
