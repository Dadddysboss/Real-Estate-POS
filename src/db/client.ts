import { createClient, Client } from '@libsql/client';
import { runMigrations } from './migrations';
import { seedInitialData } from './seed';

let dbClient: Client | null = null;

export function getDbClient(): Client {
  if (!dbClient) {
    dbClient = createClient({
      url: process.env.TURSO_DATABASE_URL || 'libsql://real-estate-pos-huzaifabutt09.aws-ap-south-1.turso.io',
      authToken: process.env.TURSO_AUTH_TOKEN || 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODg4NjEwMjgsImlkIjoiMDFhMDdiZTItMDYwMS03NjIxLWIyMDktNzNkZTNkMTYwZDdmIiwia2lkIjoicVVqVFhOWG5fZkhzVEkybDFnOXZ2V25hYzNzT1RrX1ZpRjVpaDQyM3VlayIsInJpZCI6IjM5MmJlNTExLTBjYjMtNDU5MS05MzU1LTFkOTc5OGM4OGFhOSJ9.ndKoI3XG5L4300owBOVqRdFRaX_ZbvFCuOfAmrRpu8rxPXc0ekYT1JklRrdq9G-JdN0wRk3GdqvvxKsXoNZHCg',
    });
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