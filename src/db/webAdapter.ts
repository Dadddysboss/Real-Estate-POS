interface DatabaseResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

interface AuthResponse {
  success: boolean;
  data?: {
    token: string;
    user: {
      id: string;
      username: string;
      fullName: string;
      role: string;
    };
  };
  error?: string;
}

interface WebApi {
  dbExecute: (sql: string, args?: unknown[]) => Promise<DatabaseResponse>;
  dbQuery: <T = unknown>(sql: string, args?: unknown[]) => Promise<DatabaseResponse<T[]>>;
  authenticate: (username: string, pin: string) => Promise<AuthResponse>;
  onSyncStatusUpdate: (callback: (status: string) => void) => void;
  printReceipt: (receiptText: string) => Promise<DatabaseResponse>;
  getCashSessions: (branchId: string) => Promise<DatabaseResponse>;
  openCashSession: (branchId: string, openingBalance: number, userId: string, userName: string) => Promise<DatabaseResponse>;
  closeCashSession: (sessionId: string, closingBalance: number, expectedBalance: number, variance: number, userId: string, userName: string) => Promise<DatabaseResponse>;
}

const TURSO_DB_URL = 'libsql://real-estate-pos-huzaifabutt09.aws-ap-south-1.turso.io';
const TURSO_AUTH_TOKEN = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODg4NjEwMjgsImlkIjoiMDFhMDdiZTItMDYwMS03NjIxLWIyMDktNzNkZTNkMTYwZDdmIiwia2lkIjoicVVqVFhOWG5fZkhzVEkybDFnOXZ2V25hYzNzT1RrX1ZpRjVpaDQyM3VlayIsInJpZCI6IjM5MmJlNTExLTBjYjMtNDU5MS05MzU1LTFkOTc5OGM4OGFhOSJ9.ndKoI3XG5L4300owBOVqRdFRaX_ZbvFCuOfAmrRpu8rxPXc0ekYT1JklRrdq9G-JdN0wRk3GdqvvxKsXoNZHCg';

async function tursoExecute(sql: string, args: (string | number | null)[] = []): Promise<{ rows: Record<string, unknown>[] }> {
  const httpUrl = `https://${TURSO_DB_URL.replace('libsql://', '')}/v2/pipeline`;
  const response = await fetch(httpUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TURSO_AUTH_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: [{
        type: 'execute',
        stmt: {
          sql,
          args: args.map(a => a === null ? { type: 'null' } : typeof a === 'number' ? { type: 'integer', value: a } : { type: 'text', value: a }),
        },
      }],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Turso HTTP ${response.status}: ${text}`);
  }

  const data = await response.json();
  const result = data.results?.[0];
  if (!result || !result.response) {
    throw new Error('Empty response from Turso');
  }
  if (result.response.type === 'error') {
    throw new Error(result.response.message || 'Turso execution error');
  }
  return { rows: result.response.result?.rows || [] };
}

function initWebApi(): WebApi {
  return {
    dbExecute: async (sql: string, args: unknown[] = []): Promise<DatabaseResponse> => {
      try {
        const result = await tursoExecute(sql, args as (string | number | null)[]);
        return { success: true, data: result };
      } catch (err) {
        console.error('[Web DB Execute Error]', err);
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    },

    dbQuery: async <T = unknown>(sql: string, args: unknown[] = []): Promise<DatabaseResponse<T[]>> => {
      try {
        const result = await tursoExecute(sql, args as (string | number | null)[]);
        return { success: true, data: result.rows as unknown as T[] };
      } catch (err) {
        console.error('[Web DB Query Error]', err);
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    },

    authenticate: async (username: string, pin: string): Promise<AuthResponse> => {
      try {
        const result = await tursoExecute(
          'SELECT * FROM users WHERE username = ? AND password_hash = ? AND status = ? LIMIT 1',
          [username, pin, 'ACTIVE']
        );
        if (result.rows.length > 0) {
          const user = result.rows[0];
          return {
            success: true,
            data: {
              token: `web_session_${Date.now()}`,
              user: {
                id: String(user.id),
                username: String(user.username),
                fullName: String(user.full_name),
                role: String(user.role),
              },
            },
          };
        }
        return { success: false, error: 'Invalid credentials or inactive account.' };
      } catch (err) {
        console.error('[Web Auth Error]', err);
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    },

    onSyncStatusUpdate: (_callback: (status: string) => void) => {
      // No-op in web mode
    },

    printReceipt: async (receiptText: string): Promise<DatabaseResponse> => {
      try {
        const printWindow = window.open('', '_blank', 'width=400,height=600');
        if (printWindow) {
          printWindow.document.write(
            `<html><head><title>Receipt</title><style>body{font-family:monospace;padding:20px;}pre{white-space:pre-wrap;}</style></head><body><pre>${receiptText.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre></body></html>`
          );
          printWindow.document.close();
          setTimeout(() => printWindow.print(), 500);
        }
        return { success: true };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    },

    getCashSessions: async (branchId: string): Promise<DatabaseResponse> => {
      try {
        const result = await tursoExecute(
          'SELECT * FROM cash_sessions WHERE branch_id = ? ORDER BY opened_at DESC LIMIT 20',
          [branchId]
        );
        return { success: true, data: result.rows };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    },

    openCashSession: async (branchId: string, openingBalance: number, userId: string, _userName: string): Promise<DatabaseResponse> => {
      try {
        const id = `SESS_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        await tursoExecute(
          'INSERT INTO cash_sessions (id, branch_id, opened_by, opening_balance, status, opened_at) VALUES (?, ?, ?, ?, ?, ?)',
          [id, branchId, userId, openingBalance, 'OPEN', new Date().toISOString()]
        );
        return { success: true, data: { id } };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    },

    closeCashSession: async (sessionId: string, closingBalance: number, expectedBalance: number, variance: number, userId: string, _userName: string): Promise<DatabaseResponse> => {
      try {
        await tursoExecute(
          "UPDATE cash_sessions SET status = 'CLOSED', closed_by = ?, closing_balance = ?, expected_balance = ?, variance = ?, closed_at = ? WHERE id = ? AND status = 'OPEN'",
          [userId, closingBalance, expectedBalance, variance, new Date().toISOString(), sessionId]
        );
        return { success: true, data: { id: sessionId } };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}

export function initWebDatabase(): void {
  if (typeof window !== 'undefined' && !(window as unknown as Record<string, unknown>).api) {
    (window as unknown as Record<string, unknown>).api = initWebApi();
    console.log('[Web] Turso HTTP adapter initialized for browser mode');
  }
}
