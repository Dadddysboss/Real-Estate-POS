import { createClient, Client } from '@libsql/client';
import { runMigrations } from './migrations';
import { seedInitialData } from './seed';

let dbClient: Client | null = null;

export function getDbClient(): Client {
  if (!dbClient) {
    const url = import.meta.env?.VITE_TURSO_DATABASE_URL || process.env.TURSO_DATABASE_URL || '';
    const token = import.meta.env?.VITE_TURSO_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN || '';
    if (!url || !token) {
      throw new Error('TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be configured in .env');
    }
    dbClient = createClient({ url, authToken: token });
  }
  return dbClient;
}

export async function executeQuery(sql: string, args: (string | number | null)[] = []) {
  const client = getDbClient();
  return await client.execute({ sql, args });
}

export async function selectQuery<T = unknown>(sql: string, args: (string | number | null)[] = []): Promise<T[]> {
  const client = getDbClient();
  const res = await client.execute({ sql, args });
  return res.rows as unknown as T[];
}

export async function initializeLocalDatabase() {
  try {
    const client = getDbClient();
    console.log('[Database] Initializing local database tables...');
    await runMigrations(client);
    await seedInitialData(client);
    console.log('[Database] Local database initialized successfully.');
  } catch (error) {
    console.error('[Database Initialization Error]', error);
    throw error;
  }
}