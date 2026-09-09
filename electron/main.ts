import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { initializeLocalDatabase, executeQuery, selectQuery } from '../src/db/client';
import { verifyCredentials } from '../src/services/auth.service';

let mainWindow: BrowserWindow | null = null;
let printWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1024,
    minHeight: 600,
    title: 'Dripp Real Estate & DigiKhata ERP',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

function printReceiptText(receiptText: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const safeText = receiptText
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      printWindow = new BrowserWindow({
        show: false,
        width: 380,
        height: 640,
        webPreferences: { contextIsolation: true, nodeIntegration: false },
      });

      const html = `<!DOCTYPE html><html><head><title>Thermal Receipt</title>
        <style>
          @page { margin: 0; size: 80mm auto; }
          html, body { margin: 0; padding: 0; background: #fff; }
          body { padding: 4mm 2mm; }
          pre { font-family: 'Courier New', monospace; font-size: 11px; line-height: 1.25; margin: 0; white-space: pre; }
        </style></head>
        <body><pre>${safeText}</pre></body></html>`;

      printWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

      printWindow.webContents.once('did-finish-load', () => {
        if (!printWindow) return reject(new Error('Print window was closed'));
        printWindow.webContents.print({ silent: false, printBackground: false }, (success) => {
          if (printWindow) {
            printWindow.close();
            printWindow = null;
          }
          if (success) resolve();
          else reject(new Error('Printer dialog was cancelled or failed'));
        });
      });
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

app.whenReady().then(async () => {
  await initializeLocalDatabase();

  // Register Database IPC Handlers
  ipcMain.handle('db:execute', async (_event, { sql, args }) => {
    try {
      const result = await executeQuery(sql, args);
      return { success: true, data: result };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('db:query', async (_event, { sql, args }) => {
    try {
      const rows = await selectQuery(sql, args);
      return { success: true, data: rows };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // Register Auth IPC Handler (Enforces dripp / 5821 Gate)
  ipcMain.handle('auth:login', async (_event, { username, pin }) => {
    try {
      const authResult = await verifyCredentials(username, pin);
      return authResult;
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // Thermal Receipt IPC Handler (80mm)
  ipcMain.handle('print:receipt', async (_event, receiptText: string) => {
    try {
      await printReceiptText(receiptText);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // Cash Counter Session IPC Handlers
  ipcMain.handle('cash:get-sessions', async (_event, branchId: string) => {
    try {
      const sql = `
        SELECT id, branch_id, opened_by, opening_balance, status, opened_at
        FROM cash_sessions
        WHERE branch_id = ?
        ORDER BY opened_at DESC
        LIMIT 20
      `;
      const rows = await selectQuery<{
        id: string;
        branch_id: string;
        opened_by: string;
        opening_balance: number;
        status: string;
        opened_at: string;
      }>(sql, [branchId]);
      return { success: true, data: rows };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('cash:open-session', async (_event, { branchId, openingBalance, userId }) => {
    try {
      const open = await selectQuery<{ id: string }>(
        `SELECT id FROM cash_sessions WHERE branch_id = ? AND status = 'OPEN' LIMIT 1`,
        [branchId]
      );
      if (open.length > 0) {
        return { success: false, error: 'A cash drawer session is already OPEN for this branch.' };
      }
      const id = `SESS_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const sql = `
        INSERT INTO cash_sessions (id, branch_id, opened_by, opening_balance, status, opened_at)
        VALUES (?, ?, ?, ?, 'OPEN', CURRENT_TIMESTAMP)
      `;
      await executeQuery(sql, [id, branchId, userId, openingBalance]);

      await executeQuery(
        `INSERT INTO sync_queue (id, action_type, target_table, payload_json, status, created_at) VALUES (?, 'INSERT', 'cash_sessions', ?, 'PENDING', CURRENT_TIMESTAMP)`,
        [`SYNC_${id}`, JSON.stringify({ id, branch_id: branchId, opened_by: userId, opening_balance: openingBalance, status: 'OPEN' })]
      );

      return { success: true, data: { id } };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('cash:close-session', async (_event, { sessionId, closingBalance, expectedBalance, variance, userId }) => {
    try {
      const sql = `
        UPDATE cash_sessions
        SET status = 'CLOSED', closed_by = ?, closing_balance = ?, expected_balance = ?, variance = ?, closed_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'OPEN'
      `;
      await executeQuery(sql, [userId, closingBalance, expectedBalance, variance, sessionId]);

      await executeQuery(
        `INSERT INTO sync_queue (id, action_type, target_table, payload_json, status, created_at) VALUES (?, 'UPDATE', 'cash_sessions', ?, 'PENDING', CURRENT_TIMESTAMP)`,
        [`SYNC_${sessionId}`, JSON.stringify({ id: sessionId, closing_balance: closingBalance, expected_balance: expectedBalance, variance, status: 'CLOSED' })]
      );

      return { success: true, data: { id: sessionId } };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
