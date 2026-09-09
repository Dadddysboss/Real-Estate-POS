import { createClient } from '@libsql/client';

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

function initWebApi(): WebApi {
  const tursoUrl = import.meta.env.VITE_TURSO_DATABASE_URL || 'libsql://real-estate-pos-huzaifabutt09.aws-ap-south-1.turso.io';
  const tursoToken = import.meta.env.VITE_TURSO_AUTH_TOKEN || '';

  const client = createClient({
    url: tursoUrl.includes('://') ? tursoUrl : `libsql://${tursoUrl}`,
    authToken: tursoToken,
  });

  return {
    dbExecute: async (sql: string, args: unknown[] = []): Promise<DatabaseResponse> => {
      try {
        const result = await client.execute({ sql, args: args as (string | number | null)[] });
        return { success: true, data: result };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    },

    dbQuery: async <T = unknown>(sql: string, args: unknown[] = []): Promise<DatabaseResponse<T[]>> => {
      try {
        const result = await client.execute({ sql, args: args as (string | number | null)[] });
        return { success: true, data: result.rows as unknown as T[] };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    },

    authenticate: async (_username: string, _pin: string): Promise<AuthResponse> => {
      try {
        const result = await client.execute({
          sql: 'SELECT * FROM users WHERE username = ? AND password_hash = ? LIMIT 1',
          args: [_username, _pin],
        });
        if (result.rows.length > 0) {
          const user = result.rows[0] as Record<string, unknown>;
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
        return { success: false, error: 'Invalid credentials' };
      } catch (err) {
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
          printWindow.document.write(`<html><head><title>Receipt</title><style>body{font-family:monospace;padding:20px;}pre{white-space:pre;}</style></head><body><pre>${receiptText.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre></body></html>`);
          printWindow.document.close();
          printWindow.print();
        }
        return { success: true };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    },

    getCashSessions: async (branchId: string): Promise<DatabaseResponse> => {
      try {
        const result = await client.execute({
          sql: 'SELECT * FROM cash_sessions WHERE branch_id = ? ORDER BY opened_at DESC LIMIT 20',
          args: [branchId],
        });
        return { success: true, data: result.rows };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    },

    openCashSession: async (branchId: string, openingBalance: number, userId: string, _userName: string): Promise<DatabaseResponse> => {
      try {
        const id = `SESS_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        await client.execute({
          sql: 'INSERT INTO cash_sessions (id, branch_id, opened_by, opening_balance, status, opened_at) VALUES (?, ?, ?, ?, ?)',
          args: [id, branchId, userId, openingBalance, 'OPEN'],
        });
        return { success: true, data: { id } };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    },

    closeCashSession: async (sessionId: string, closingBalance: number, expectedBalance: number, variance: number, userId: string, _userName: string): Promise<DatabaseResponse> => {
      try {
        await client.execute({
          sql: "UPDATE cash_sessions SET status = 'CLOSED', closed_by = ?, closing_balance = ?, expected_balance = ?, variance = ?, closed_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'OPEN'",
          args: [userId, closingBalance, expectedBalance, variance, sessionId],
        });
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
    console.log('[Web] Turso API adapter initialized for browser mode');
  }
}
