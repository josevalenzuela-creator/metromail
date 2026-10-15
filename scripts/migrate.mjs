// Aplica las migraciones SQL de /drizzle. Se ejecuta en cada despliegue (vercel-build).
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) { console.error('Falta DATABASE_URL'); process.exit(1); }
const client = postgres(url, { max: 1, ssl: url.includes('localhost') ? false : 'require' });
await migrate(drizzle(client), { migrationsFolder: './drizzle' });
await client.end();
console.log('Migraciones aplicadas');
