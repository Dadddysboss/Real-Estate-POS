import { contextBridge, ipcRenderer } from 'electron';

export interface DatabaseResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface AuthResponse {
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

export interface PrintReceiptData {
  type: 'CASH_IN' | 'CASH_OUT' | 'DRAWER_OPENING' | 'DRAWER_CLOSING' | 'DENOMINATION_AUDIT';
  transactionId: string;
  timestamp: string;
  branchName: string;
  userName: string;
  amount: number;
  category: string;
  notes?: string;
  denominations?: {
    notes_5000: number;
    notes_1000: number;
    notes_500: number;
    notes_100: number;
    notes_50: number;
    notes_20: number;
    notes_10: number;
  };
  variance?: number;
}

export interface CashSessionData {
  id: string;
  branch_id: string;
  opened_by: string;
  opening_balance: number;
  status: 'OPEN' | 'CLOSED';
  opened_at: string;
}

contextBridge.exposeInMainWorld('api', {
  // DB IPC Wrapper
  dbExecute: (sql: string, args: unknown[] = []): Promise<DatabaseResponse> => {
    return ipcRenderer.invoke('db:execute', { sql, args });
  },
  dbQuery: <T = unknown>(sql: string, args: unknown[] = []): Promise<DatabaseResponse<T[]>> => {
    return ipcRenderer.invoke('db:query', { sql, args });
  },
  // Auth IPC Wrapper
  authenticate: (username: string, pin: string): Promise<AuthResponse> => {
    return ipcRenderer.invoke('auth:login', { username, pin });
  },
  // System Sync Listener
  onSyncStatusUpdate: (callback: (status: string) => void) => {
    ipcRenderer.on('sync:status-change', (_event, status) => callback(status));
  },
  // Print Receipt IPC (80mm thermal)
  printReceipt: (receiptText: string): Promise<DatabaseResponse> => {
    return ipcRenderer.invoke('print:receipt', receiptText);
  },
  // Cash Counter IPC
  getCashSessions: (branchId: string): Promise<DatabaseResponse<CashSessionData[]>> => {
    return ipcRenderer.invoke('cash:get-sessions', branchId);
  },
  openCashSession: (branchId: string, openingBalance: number, userId: string, userName: string): Promise<DatabaseResponse<{ id: string }>> => {
    return ipcRenderer.invoke('cash:open-session', { branchId, openingBalance, userId, userName });
  },
  closeCashSession: (sessionId: string, closingBalance: number, expectedBalance: number, variance: number, userId: string, userName: string): Promise<DatabaseResponse<{ id: string }>> => {
    return ipcRenderer.invoke('cash:close-session', { sessionId, closingBalance, expectedBalance, variance, userId, userName });
  },
  // Shell: open external URLs (wa.me, browser links, etc.)
  openExternalUrl: (url: string): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('shell:open-url', url);
  },
  // Auto-Update IPC
  checkForUpdates: (): Promise<{ success: boolean; updateInfo?: any; error?: string }> => {
    return ipcRenderer.invoke('update:check');
  },
  installUpdate: (): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('update:install');
  },
  onUpdateStatus: (callback: (status: string, info?: string) => void) => {
    ipcRenderer.on('update:status', (_event, status, info) => callback(status, info));
  },
  onUpdateProgress: (callback: (percent: number) => void) => {
    ipcRenderer.on('update:progress', (_event, percent) => callback(percent));
  },
  // Sync Status & Manual Sync
  getSyncStatus: (): Promise<{ success: boolean; data?: { isOnline: boolean; lastSyncTime: string | null; syncInProgress: boolean; queuedWrites: number; localDbPath: string }; error?: string }> => {
    return ipcRenderer.invoke('sync:status');
  },
  forceSync: (): Promise<{ success: boolean; data?: { isOnline: boolean; lastSyncTime: string | null; queuedWrites: number }; error?: string }> => {
    return ipcRenderer.invoke('sync:force');
  },
});