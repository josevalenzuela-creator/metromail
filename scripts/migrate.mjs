// Aplica las migraciones SQL de /drizzle. Se ejecuta en cada despliegue (vercel-build).
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const url = process.env.DIRECT_URL || process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) { console.warn('Sin base de datos conectada todavía: se omiten las migraciones.'); process.exit(0); }
const client = postgres(url, { max: 1, ssl: url.includes('localhost') ? false : 'require' });
await migrate(drizzle(client), { migrationsFolder: './drizzle' });
await client.end();
console.log('Migraciones aplicadas');
