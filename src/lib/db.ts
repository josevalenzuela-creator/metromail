import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/db/schema';

type DB = PostgresJsDatabase<typeof schema>;
const g = globalThis as unknown as { __mmDb?: DB };

/** Conexión perezosa: no se abre durante el build, solo al primer uso. */
export function db(): DB {
  if (g.__mmDb) return g.__mmDb;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Falta la variable DATABASE_URL');
  const local = /localhost|127\.0\.0\.1/.test(url);
  const client = postgres(url, { max: 5, prepare: false, ssl: local ? false : 'require', idle_timeout: 20 });
  g.__mmDb = drizzle(client, { schema });
  return g.__mmDb;
}

export { schema };
