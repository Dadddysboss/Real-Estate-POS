import { contextBridge, ipcRenderer } from 'electron';

export interface DatabaseResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  /** True when a failed write was stored in the offline queue instead of applied */
  queued?: boolean;
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
    const handler = (_event: Electron.IpcRendererEvent, status: string) => callback(status);
    ipcRenderer.on('sync:status-change', handler);
    return () => { ipcRenderer.removeListener('sync:status-change', handler); };
  },
  // Network Status
  getNetworkStatus: (): Promise<{ success: boolean; data?: { isOnline: boolean; lastSyncTime: string | null; queuedWrites: number }; error?: string }> => {
    return ipcRenderer.invoke('network:status');
  },
  onNetworkStatusChange: (callback: (isOnline: boolean) => void) => {
    ipcRenderer.on('network:status-change', (_event, isOnline) => callback(isOnline));
  },
  subscribeToSyncUpdates: (): void => {
    ipcRenderer.send('network:subscribe');
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
    const handler = (_event: Electron.IpcRendererEvent, status: string, info?: string) => callback(status, info);
    ipcRenderer.on('update:status', handler);
    return () => { ipcRenderer.removeListener('update:status', handler); };
  },
  onUpdateProgress: (callback: (percent: number) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, percent: number) => callback(percent);
    ipcRenderer.on('update:progress', handler);
    return () => { ipcRenderer.removeListener('update:progress', handler); };
  },
  // Directory Picker
  selectDirectory: (): Promise<{ success: boolean; path?: string; canceled?: boolean }> => {
    return ipcRenderer.invoke('dialog:select-directory');
  },
  // Save Image (local file storage)
  saveImage: (name: string, base64Data: string): Promise<{ success: boolean; path?: string; filename?: string; error?: string }> => {
    return ipcRenderer.invoke('save-image', { name, base64Data });
  },
  // Sync Status & Manual Sync
  getSyncStatus: (): Promise<{ success: boolean; data?: { isOnline: boolean; lastSyncTime: string | null; syncInProgress: boolean; queuedWrites: number; localDbPath: string }; error?: string }> => {
    return ipcRenderer.invoke('sync:status');
  },
  forceSync: (): Promise<{ success: boolean; data?: { isOnline: boolean; lastSyncTime: string | null; queuedWrites: number }; error?: string }> => {
    return ipcRenderer.invoke('sync:force');
  },
});