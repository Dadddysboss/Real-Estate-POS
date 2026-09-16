import { app, BrowserWindow, ipcMain, shell, dialog, net } from 'electron';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import { autoUpdater } from 'electron-updater';
import { createClient, Client } from '@libsql/client';

// Load .env from project root (dev) or app root (packaged)
try {
  const dotenvPath = app.isPackaged
    ? path.join(process.resourcesPath, '.env')
    : path.join(__dirname, '..', '.env');
  if (fs.existsSync(dotenvPath)) {
    const envContent = fs.readFileSync(dotenvPath, 'utf-8');
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.substring(0, eqIdx).trim();
        const value = trimmed.substring(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) process.env[key] = value;
      }
    }
  }
} catch { /* .env not critical if env vars already set */ }

function logToFile(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try {
    const logPath = path.join(app.getPath('userData'), 'crash.log');
    fs.appendFileSync(logPath, line, 'utf-8');
  } catch { /* best effort */ }
  console.log(msg);
}

const TURSO_DB_URL = process.env.TURSO_DATABASE_URL || '';
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN || '';

if (!TURSO_DB_URL || !TURSO_AUTH_TOKEN) {
  console.error('[Desktop] CRITICAL: TURSO_DATABASE_URL or TURSO_AUTH_TOKEN not set. Configure .env or environment variables.');
}

// ── Embedded Replica Client ──
const LOCAL_DB_PATH = path.join(app.getPath('userData'), 'dripp_erp.db');
let db: Client;
let isOnline = false;
let lastSyncTime: string | null = null;
let syncInProgress = false;
let mainWindowRef: BrowserWindow | null = null;

// ── Network Detection ──
function checkNetworkConnectivity(): boolean {
  try {
    return net.isOnline();
  } catch {
    return false;
  }
}

function updateOnlineStatus(status: boolean) {
  if (isOnline !== status) {
    isOnline = status;
    logToFile(`[Network] Status changed: ${status ? 'ONLINE' : 'OFFLINE'}`);
    if (mainWindowRef && !mainWindowRef.isDestroyed()) {
      mainWindowRef.webContents.send('network:status-change', status);
    }
  }
}

// ── Offline Write Queue (file-persisted, survives crashes) ──
interface OfflineQueueItem {
  sql: string;
  args: unknown[];
  timestamp: number;
  id: string;
}

const offlineQueue: OfflineQueueItem[] = [];
const OFFLINE_QUEUE_FILE = path.join(app.getPath('userData'), 'offline_queue.json');

function loadOfflineQueue() {
  try {
    if (fs.existsSync(OFFLINE_QUEUE_FILE)) {
      const data = fs.readFileSync(OFFLINE_QUEUE_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) offlineQueue.push(...parsed);
      logToFile(`[Desktop] Loaded ${offlineQueue.length} queued offline writes`);
    }
  } catch { /* best effort */ }
}

function saveOfflineQueue() {
  try {
    fs.writeFileSync(OFFLINE_QUEUE_FILE, JSON.stringify(offlineQueue, null, 2), 'utf-8');
  } catch { /* best effort */ }
}

function queueWriteOffline(sql: string, args: unknown[]) {
  const item: OfflineQueueItem = {
    sql,
    args,
    timestamp: Date.now(),
    id: `OFF_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`,
  };
  offlineQueue.push(item);
  saveOfflineQueue();
  logToFile(`[Offline Queue] Queued write: ${sql.substring(0, 80)} (queue size: ${offlineQueue.length})`);

  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    mainWindowRef.webContents.send('sync:status-change', {
      isOnline,
      queuedWrites: offlineQueue.length,
      lastSyncTime,
    });
  }
}

function initDatabase() {
  const hasRemote = !!TURSO_DB_URL && !!TURSO_AUTH_TOKEN;
  console.log(`[Desktop] Initializing DB: local=${LOCAL_DB_PATH}, remote=${hasRemote ? 'yes' : 'none'}`);

  db = createClient({
    url: `file:${LOCAL_DB_PATH}`,
    syncUrl: hasRemote ? TURSO_DB_URL : undefined,
    authToken: hasRemote ? TURSO_AUTH_TOKEN : undefined,
    syncInterval: 30,
  });

  loadOfflineQueue();
}

async function syncDatabase() {
  if (syncInProgress) return;
  syncInProgress = true;
  try {
    // Update online status before attempting sync
    updateOnlineStatus(checkNetworkConnectivity());

    await db.sync();
    updateOnlineStatus(true);
    lastSyncTime = new Date().toISOString();
    logToFile('[Desktop] DB sync completed');

    // Notify renderer of successful sync
    if (mainWindowRef && !mainWindowRef.isDestroyed()) {
      mainWindowRef.webContents.send('sync:status-change', {
        isOnline: true,
        lastSyncTime,
        queuedWrites: offlineQueue.length,
      });
    }
  } catch (err) {
    updateOnlineStatus(false);
    console.warn('[Desktop] DB sync failed (offline?):', err instanceof Error ? err.message : String(err));
    logToFile(`[Desktop] DB sync failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    syncInProgress = false;
  }
}

// ── Required Field Defaults (auto-inject for stale queued writes) ──
const REQUIRED_FIELD_DEFAULTS: Record<string, Record<string, string>> = {
  investor_pools: { branch_id: 'BRANCH_MAIN' },
  agency_settings: { updated_at: new Date().toISOString() },
  office_expenses: { branch_id: 'BRANCH_MAIN' },
  fixed_assets: { branch_id: 'BRANCH_MAIN' },
  inventory_plots: { branch_id: 'BRANCH_MAIN' },
  leads: { branch_id: 'BRANCH_MAIN' },
  cash_sessions: { branch_id: 'BRANCH_MAIN' },
  cash_counter: { branch_id: 'BRANCH_MAIN' },
  daily_expenses: { branch_id: 'BRANCH_MAIN' },
  construction_projects: { branch_id: 'BRANCH_MAIN' },
  expenses: { branch_id: 'BRANCH_MAIN' },
};

const DROP_ERROR_PATTERNS = [
  'NOT NULL constraint',
  'UNIQUE constraint',
  'FOREIGN KEY constraint',
  'CHECK constraint',
  'no such column',
  'no such table',
  'has no column',
  'UNIQUE constraint failed',
  'NOT NULL constraint failed',
  'Number of arguments mismatch',
  'Input error',
  'argument mismatch',
];

function isFatalQueueError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return DROP_ERROR_PATTERNS.some(p => msg.toLowerCase().includes(p.toLowerCase()));
}

function sanitizeQueuedSQL(item: OfflineQueueItem): { sql: string; args: unknown[] } {
  let sql = item.sql;
  const args = [...item.args];

  const insertMatch = sql.match(/INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
  if (insertMatch) {
    const tableName = insertMatch[1].toLowerCase();
    const columnsStr = insertMatch[2];
    const columns = columnsStr.split(',').map(c => c.trim().toLowerCase().replace(/["`]/g, ''));
    const defaults = REQUIRED_FIELD_DEFAULTS[tableName];
    if (defaults) {
      let modified = false;
      for (const [col, defaultVal] of Object.entries(defaults)) {
        if (!columns.includes(col)) {
          columns.push(col);
          args.push(col === 'updated_at' ? new Date().toISOString() : defaultVal);
          modified = true;
        } else {
          const idx = columns.indexOf(col);
          if (idx >= 0 && (args[idx] === null || args[idx] === undefined || args[idx] === '')) {
            args[idx] = col === 'updated_at' ? new Date().toISOString() : defaultVal;
            modified = true;
          }
        }
      }
      if (modified) {
        const placeholders = columns.map(() => '?').join(', ');
        sql = `INSERT OR IGNORE INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
        return { sql, args };
      }
    }
  }

  const updateMatch = sql.match(/UPDATE\s+(\w+)\s+SET\s+(.+?)\s+WHERE\s+(.+)/i);
  if (updateMatch) {
    const tableName = updateMatch[1].toLowerCase();
    const setClause = updateMatch[2];
    const whereClause = updateMatch[3];
    const defaults = REQUIRED_FIELD_DEFAULTS[tableName];
    if (defaults) {
      const setParts = setClause.split(',').map(s => s.trim());
      const setColumns: string[] = [];
      let argIdx = 0;
      for (const part of setParts) {
        const eqMatch = part.match(/(\w+)\s*=/);
        if (eqMatch) setColumns.push(eqMatch[1].toLowerCase());
        argIdx++;
      }
      let modified = false;
      argIdx = 0;
      for (let i = 0; i < setParts.length; i++) {
        const eqMatch = setParts[i].match(/(\w+)\s*=/);
        if (eqMatch) {
          const col = eqMatch[1].toLowerCase();
          if (defaults[col] && (args[i] === null || args[i] === undefined || args[i] === '')) {
            args[i] = col === 'updated_at' ? new Date().toISOString() : defaults[col];
            modified = true;
          }
        }
      }
      if (defaults['updated_at'] && !setColumns.includes('updated_at')) {
        setParts.push('updated_at = ?');
        args.push(new Date().toISOString());
        modified = true;
      }
      if (modified) {
        sql = `UPDATE ${tableName} SET ${setParts.join(', ')} WHERE ${whereClause}`;
        return { sql, args };
      }
    }
  }

  // ── Arg-count validation: count ? placeholders vs bound args ──
  const placeholderCount = (sql.match(/\?/g) || []).length;
  if (placeholderCount !== args.length) {
    if (placeholderCount > args.length) {
      while (args.length < placeholderCount) {
        args.push(null);
      }
    } else {
      args.length = placeholderCount;
    }
  }

  return { sql, args };
}

async function flushOfflineQueue() {
  if (offlineQueue.length === 0) return;
  logToFile(`[Desktop] Flushing ${offlineQueue.length} queued writes...`);
  const remaining: OfflineQueueItem[] = [];
  let droppedCount = 0;
  for (const item of offlineQueue) {
    try {
      const sanitized = sanitizeQueuedSQL(item);
      await db.execute({ sql: sanitized.sql, args: sanitized.args as any[] });
    } catch (err) {
      const isFatal = isFatalQueueError(err);
      const errorMsg = err instanceof Error ? err.message : String(err);
      logToFile(`[Desktop] Queued write ${isFatal ? 'DROPPED (fatal error)' : 'FAILED (retry)'}: ${item.sql.substring(0, 80)} — ${errorMsg}`);

      if (isFatal) {
        droppedCount++;
      } else if (Date.now() - item.timestamp < 24 * 60 * 60 * 1000) {
        remaining.push(item);
      } else {
        logToFile(`[Desktop] Dropping stale queued write (>24h): ${item.sql.substring(0, 60)}`);
        droppedCount++;
      }
    }
  }
  offlineQueue.length = 0;
  offlineQueue.push(...remaining);
  saveOfflineQueue();
  if (remaining.length === 0) {
    logToFile(`[Desktop] Queue flush complete. ${droppedCount > 0 ? `${droppedCount} stale items dropped.` : 'All writes flushed.'}`);
  } else {
    logToFile(`[Desktop] ${remaining.length} writes still queued (${droppedCount} dropped)`);
  }

  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    mainWindowRef.webContents.send('sync:status-change', {
      isOnline,
      lastSyncTime,
      queuedWrites: offlineQueue.length,
    });
  }
}

async function dbExecute(sql: string, args: unknown[] = []): Promise<{ rows: Record<string, unknown>[] }> {
  const isWrite = /^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP)\b/i.test(sql);
  try {
    const result = await db.execute({ sql, args: args as any[] });
    updateOnlineStatus(true);
    if (isWrite) syncDatabase().catch(() => {});
    return {
      rows: result.rows.map(row => {
        const obj: Record<string, unknown> = {};
        for (const key in row) {
          const val = row[key];
          // Convert BigInt to number (better-sqlite3 returns BigInt for COUNT/SUM)
          if (typeof val === 'bigint') {
            obj[key] = Number(val);
          } else if (val === null || val === undefined) {
            obj[key] = '';
          } else if (typeof val === 'object' && !(val instanceof Date)) {
            // Safeguard: serialize unexpected objects to string
            obj[key] = JSON.stringify(val);
          } else {
            obj[key] = val;
          }
        }
        return obj;
      }),
    };
  } catch (err) {
    // Queue ALL failed writes offline — not just when isOnline=false
    // This ensures data is never lost even if the connection drops mid-operation
    if (isWrite) {
      queueWriteOffline(sql, args);
      return { rows: [] };
    }
    throw err;
  }
}

async function dbExecuteMulti(requests: { sql: string; args?: unknown[] }[]): Promise<void> {
  try {
    await db.batch(requests.map(r => ({ sql: r.sql, args: (r.args || []) as any[] })));
    isOnline = true;
  } catch (err) {
    console.error('[Desktop] Batch execute failed:', err);
    throw err;
  }
}

// Global crash handler — show native dialog instead of silent failure
process.on('uncaughtException', (error) => {
  logToFile(`[FATAL] Uncaught Exception: ${error.stack || error.message}`);
  dialog.showErrorBox(
    'Application Crash',
    `An unexpected error occurred and the app needs to close.\n\n${error.stack || error.message}`
  );
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logToFile(`[ERROR] Unhandled Rejection: ${reason instanceof Error ? (reason.stack || reason.message) : String(reason)}`);
  dialog.showErrorBox(
    'Application Error',
    `An unhandled promise rejection occurred:\n\n${reason instanceof Error ? (reason.stack || reason.message) : String(reason)}`
  );
});

let mainWindow: BrowserWindow | null = null;
let printWindow: BrowserWindow | null = null;

function createWindow() {
  logToFile(`[Desktop] createWindow called. isPackaged=${app.isPackaged}, __dirname=${__dirname}`);

  const iconPath = path.join(__dirname, '../build/icon.png');
  logToFile(`[Desktop] App icon path: ${iconPath}, exists: ${fs.existsSync(iconPath)}`);

  mainWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1024,
    minHeight: 600,
    title: 'Dripp Real Estate & DigiKhata ERP',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    logToFile(`[Desktop] Loading dev URL: ${process.env.VITE_DEV_SERVER_URL}`);
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    // __dirname is dist-electron/ in both dev and packaged (asar) mode
    // so ../dist/index.html resolves correctly in both cases
    const indexPath = path.join(__dirname, '../dist/index.html');
    logToFile(`[Desktop] Loading production file: ${indexPath}`);
    logToFile(`[Desktop] index.html exists: ${fs.existsSync(indexPath)}`);
    mainWindow.loadFile(indexPath).catch((err) => {
      logToFile(`[Desktop] FAILED to load app view: ${err.message}`);
      dialog.showErrorBox('Launch Error', `Failed to load app view: ${err.message}`);
    });
  }

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    logToFile(`[Desktop] did-fail-load: code=${errorCode} desc=${errorDescription}`);
  });

  mainWindowRef = mainWindow;
}

function printReceiptText(receiptText: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const safeText = (receiptText || '')
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

const TABLES_TO_ENSURE = [
  // ── Core tables (identical to webAdapter.ts) ──
  "CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, full_name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'STAFF', status TEXT NOT NULL DEFAULT 'ACTIVE', created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS branches (id TEXT PRIMARY KEY, branch_name TEXT NOT NULL, branch_code TEXT, city TEXT, address TEXT, phone_number TEXT, email TEXT, manager_name TEXT, is_active INTEGER DEFAULT 1, status TEXT DEFAULT 'ACTIVE', created_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS cash_sessions (id TEXT PRIMARY KEY, branch_id TEXT, opened_by TEXT, opening_balance REAL DEFAULT 0, status TEXT DEFAULT 'OPEN', opened_at TEXT, closed_by TEXT, closing_balance REAL, expected_balance REAL, variance REAL, closed_at TEXT)",
  "CREATE TABLE IF NOT EXISTS cash_counter (id TEXT PRIMARY KEY, branch_id TEXT, user_id TEXT, transaction_type TEXT, category TEXT, amount REAL, notes TEXT, handed_over_by TEXT, received_by TEXT, created_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS inventory_plots (id TEXT PRIMARY KEY, branch_id TEXT, plot_number TEXT, society_name TEXT, block_phase TEXT, size_dimension TEXT, size_value REAL DEFAULT 0, size_unit TEXT DEFAULT 'Marla', category TEXT, feature_tags TEXT, purchase_date TEXT, purchase_price REAL, target_asking_price REAL, floor_price REAL, gps_coordinates TEXT, status TEXT DEFAULT 'AVAILABLE', construction_status TEXT DEFAULT 'NONE', notes TEXT, image_url TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS leads (id TEXT PRIMARY KEY, branch_id TEXT, prospect_name TEXT, phone_number TEXT, interested_category TEXT, budget_range REAL, lead_source TEXT, assigned_agent_id TEXT, pipeline_stage TEXT DEFAULT 'NEW_LEAD', priority TEXT DEFAULT 'WARM', created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS sales_transactions (id TEXT PRIMARY KEY, plot_id TEXT, buyer_name TEXT, buyer_phone TEXT, buyer_cnic TEXT, final_sale_price REAL, cost_basis REAL, development_costs REAL DEFAULT 0, agent_commission REAL DEFAULT 0, government_taxes REAL DEFAULT 0, net_profit_calculated REAL, payment_method TEXT, agent_id TEXT, sale_date TEXT, created_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS sale_payment_breakdowns (id TEXT PRIMARY KEY, sale_id TEXT NOT NULL, payment_method TEXT NOT NULL, transaction_ref TEXT, amount REAL NOT NULL, created_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS sales_deals (id TEXT PRIMARY KEY, plot_id TEXT NOT NULL, cash_counter_id TEXT, buyer_name TEXT NOT NULL, buyer_phone TEXT NOT NULL, buyer_cnic TEXT, total_deal_price REAL NOT NULL, down_payment REAL DEFAULT 0, balance_amount REAL DEFAULT 0, sales_agent TEXT, payment_mode TEXT DEFAULT 'CASH', sale_date TEXT NOT NULL, notes TEXT, created_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS installment_plans (id TEXT PRIMARY KEY, plot_id TEXT, buyer_name TEXT, buyer_phone TEXT, buyer_cnic TEXT, total_sale_price REAL, down_payment REAL, plan_duration_months INTEGER, monthly_installment_amount REAL, start_date TEXT, due_day_of_month INTEGER, grace_period_days INTEGER DEFAULT 5, late_penalty_fee REAL DEFAULT 0, status TEXT DEFAULT 'ACTIVE', created_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS installment_schedules (id TEXT PRIMARY KEY, plan_id TEXT, installment_number INTEGER, due_date TEXT, amount_due REAL, amount_paid REAL DEFAULT 0, late_fine_charged REAL DEFAULT 0, discount_applied REAL DEFAULT 0, payment_date TEXT, payment_method TEXT, status TEXT DEFAULT 'PENDING', created_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS installment_payments (id TEXT PRIMARY KEY, plan_id TEXT NOT NULL, plot_id TEXT, amount_paid REAL NOT NULL, payment_date TEXT DEFAULT (datetime('now')), payment_mode TEXT DEFAULT 'CASH', receipt_no TEXT, created_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS digikhata_parties (id TEXT PRIMARY KEY, party_name TEXT, phone_number TEXT, party_type TEXT, current_balance REAL DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS digikhata_entries (id TEXT PRIMARY KEY, party_id TEXT, entry_type TEXT, amount REAL, description TEXT, due_date TEXT, attachment_url TEXT, created_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS agents (id TEXT PRIMARY KEY, agency_name TEXT, agent_name TEXT, phone_number TEXT, cnic TEXT, commission_type TEXT, commission_rate REAL, created_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS agent_commissions (id TEXT PRIMARY KEY, agent_id TEXT, transaction_id TEXT, commission_earned REAL, commission_paid REAL DEFAULT 0, balance_due REAL, status TEXT DEFAULT 'UNPAID', created_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS land_acquisitions (id TEXT PRIMARY KEY, seller_name TEXT, seller_phone TEXT, seller_cnic TEXT, land_title_khata TEXT, total_agreed_price REAL, advance_paid REAL, debt_remaining REAL, acquisition_date TEXT, registry_doc_url TEXT, image_url TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')))",
  // ── Investor tables (IDENTICAL to webAdapter — project_type, total_target_capital, investors table name) ──
  "CREATE TABLE IF NOT EXISTS investor_pools (id TEXT PRIMARY KEY, branch_id TEXT, pool_name TEXT NOT NULL, project_type TEXT DEFAULT 'LAND', total_target_capital REAL DEFAULT 0, raised_capital REAL DEFAULT 0, status TEXT DEFAULT 'ACTIVE', description TEXT, created_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS investors (id TEXT PRIMARY KEY, pool_id TEXT NOT NULL, investor_name TEXT NOT NULL, phone_number TEXT, cnic TEXT, contributed_amount REAL DEFAULT 0, equity_percentage REAL DEFAULT 0, total_payout_received REAL DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS dividend_distributions (id TEXT PRIMARY KEY, pool_id TEXT NOT NULL, investor_id TEXT NOT NULL, investor_name TEXT NOT NULL, profit_amount REAL NOT NULL, distribution_date TEXT, created_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS investor_payouts (id TEXT PRIMARY KEY, pool_id TEXT NOT NULL, investor_id TEXT NOT NULL, amount_paid REAL DEFAULT 0, payout_date TEXT, payment_mode TEXT DEFAULT 'CASH', notes TEXT, created_at TEXT DEFAULT (datetime('now')))",
  // ── Construction ──
  "CREATE TABLE IF NOT EXISTS construction_projects (id TEXT PRIMARY KEY, branch_id TEXT, project_name TEXT, site_location TEXT, budget_allocated REAL, total_spent REAL DEFAULT 0, status TEXT DEFAULT 'PLANNING', created_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS construction_expenses (id TEXT PRIMARY KEY, plot_id TEXT NOT NULL, sand_price REAL DEFAULT 0, bajri_price REAL DEFAULT 0, srya_price REAL DEFAULT 0, truck_price REAL DEFAULT 0, cement_price REAL DEFAULT 0, bricks_price REAL DEFAULT 0, labor_details TEXT, total_amount REAL NOT NULL, expense_date TEXT NOT NULL, notes TEXT, created_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS construction_material_stock (id TEXT PRIMARY KEY, project_id TEXT, item_name TEXT, unit TEXT, quantity_in_stock REAL, min_stock_alert REAL, unit_cost REAL)",
  "CREATE TABLE IF NOT EXISTS construction_material_logs (id TEXT PRIMARY KEY, project_id TEXT, material_id TEXT, quantity_used REAL, notes TEXT, created_at TEXT DEFAULT (datetime('now')))",
  // ── Expenses & assets (IDENTICAL to webAdapter — includes date, recurring, category NOT NULL) ──
  "CREATE TABLE IF NOT EXISTS office_expenses (id TEXT PRIMARY KEY, branch_id TEXT, category TEXT NOT NULL, description TEXT, amount REAL NOT NULL, date TEXT, recurring INTEGER DEFAULT 0, recurring_frequency TEXT, payment_method TEXT DEFAULT 'CASH', approved_by TEXT, expense_date TEXT, created_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS fixed_assets (id TEXT PRIMARY KEY, branch_id TEXT, asset_name TEXT NOT NULL, asset_type TEXT, category TEXT, purchase_price REAL DEFAULT 0, purchase_date TEXT, useful_life_years INTEGER DEFAULT 5, salvage_value REAL DEFAULT 0, depreciation_method TEXT DEFAULT 'STRAIGHT_LINE', annual_depreciation REAL DEFAULT 0, current_book_value REAL DEFAULT 0, depreciation_rate REAL DEFAULT 0, status TEXT DEFAULT 'ACTIVE', created_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS daily_expenses (id TEXT PRIMARY KEY, branch_id TEXT, category_name TEXT, amount REAL, payment_source TEXT, approved_by TEXT, description TEXT, voucher_number TEXT, created_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS expenses (id TEXT PRIMARY KEY, branch_id TEXT, category TEXT NOT NULL, description TEXT, amount REAL NOT NULL, payment_mode TEXT DEFAULT 'CASH', approved_by TEXT, expense_date TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')))",
  // ── Documents & KYC (IDENTICAL to webAdapter) ──
  "CREATE TABLE IF NOT EXISTS kyc_registry (id TEXT PRIMARY KEY, party_type TEXT, party_id TEXT, person_type TEXT, full_name TEXT, cnic TEXT, cnic_number TEXT, phone_number TEXT, address TEXT, email TEXT, verified INTEGER DEFAULT 0, cnic_expiry TEXT, address_proof TEXT, photo_url TEXT, status TEXT DEFAULT 'PENDING', verified_at TEXT, created_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, title TEXT, doc_type TEXT, document_type TEXT, description TEXT, reference_type TEXT, reference_id TEXT, related_person_id TEXT, related_plot_id TEXT, expiry_date TEXT, file_path TEXT, file_base64 TEXT, uploaded_by TEXT, created_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS document_vault (id TEXT PRIMARY KEY, document_title TEXT, reference_type TEXT, reference_id TEXT, file_path_or_base64 TEXT, qr_verification_hash TEXT, expiry_date TEXT, created_at TEXT DEFAULT (datetime('now')))",
  // ── Staff & access control (IDENTICAL to webAdapter — includes password_hash, pin_hash) ──
  "CREATE TABLE IF NOT EXISTS staff_users (id TEXT PRIMARY KEY, username TEXT UNIQUE, password_hash TEXT, full_name TEXT, role TEXT DEFAULT 'STAFF', branch_id TEXT, pin_code TEXT, pin_hash TEXT, is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')))",
  // ── Audit & sync ──
  "CREATE TABLE IF NOT EXISTS audit_trail_logs (id TEXT PRIMARY KEY, user_id TEXT, user_name TEXT, action_type TEXT, module_name TEXT, entity_id TEXT, description TEXT, ip_address TEXT, created_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS sync_queue (id TEXT PRIMARY KEY, action_type TEXT, target_table TEXT, payload_json TEXT, status TEXT DEFAULT 'PENDING', retry_count INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS branch_sync_queue (id TEXT PRIMARY KEY, branch_id TEXT, source_branch_id TEXT, target_branch_id TEXT, action_type TEXT, table_name TEXT, record_id TEXT, target_table TEXT, payload_json TEXT, status TEXT DEFAULT 'PENDING', retry_count INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))",
  // ── Materials & misc ──
  "CREATE TABLE IF NOT EXISTS materials (id TEXT PRIMARY KEY, project_id TEXT, item_name TEXT, unit TEXT, quantity_in_stock REAL DEFAULT 0, min_stock_alert REAL DEFAULT 0, unit_cost REAL DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS material_usages (id TEXT PRIMARY KEY, material_id TEXT, project_id TEXT, quantity_used REAL, used_by TEXT, notes TEXT, created_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS digikhata_transactions (id TEXT PRIMARY KEY, party_id TEXT NOT NULL, amount REAL NOT NULL, transaction_type TEXT NOT NULL, payment_mode TEXT NOT NULL, note TEXT, created_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS cash_denominations (id TEXT PRIMARY KEY, cash_counter_id TEXT, notes_5000 INTEGER DEFAULT 0, notes_1000 INTEGER DEFAULT 0, notes_500 INTEGER DEFAULT 0, notes_100 INTEGER DEFAULT 0, notes_50 INTEGER DEFAULT 0, notes_20 INTEGER DEFAULT 0, notes_10 INTEGER DEFAULT 0, total_calculated REAL, created_at TEXT DEFAULT (datetime('now')))",
  // ── Tax, whatsapp, settings ──
  "CREATE TABLE IF NOT EXISTS tax_rules (id TEXT PRIMARY KEY, tax_name TEXT, tax_percentage REAL, applies_to TEXT, created_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS whatsapp_templates (id TEXT PRIMARY KEY, template_key TEXT UNIQUE, message_body TEXT, created_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS whatsapp_logs (id TEXT PRIMARY KEY, template_id TEXT, recipient_phone TEXT, message_body TEXT, api_device_key TEXT, status TEXT DEFAULT 'PENDING', sent_at TEXT, created_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS site_visits (id TEXT PRIMARY KEY, lead_id TEXT, plot_id TEXT, visit_date TEXT, status TEXT DEFAULT 'SCHEDULED', feedback_notes TEXT, created_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS plazas (id TEXT PRIMARY KEY, branch_id TEXT, plaza_name TEXT, city_location TEXT, total_floors INTEGER, created_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS plaza_units (id TEXT PRIMARY KEY, plaza_id TEXT, floor_level TEXT, unit_number TEXT, covered_area_sqft REAL, rate_per_sqft REAL, target_price REAL, status TEXT DEFAULT 'AVAILABLE', created_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS agency_settings (id TEXT PRIMARY KEY DEFAULT 'MAIN_SETTINGS', agency_name TEXT DEFAULT 'Real Estate Enterprise', tagline TEXT, phone_primary TEXT, whatsapp_number TEXT, address TEXT, currency_symbol TEXT DEFAULT 'Rs.', created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS system_settings (setting_key TEXT PRIMARY KEY, setting_value TEXT NOT NULL, updated_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, title TEXT NOT NULL, message TEXT NOT NULL, type TEXT DEFAULT 'INFO', is_read INTEGER DEFAULT 0, module TEXT, link TEXT, created_at TEXT DEFAULT (datetime('now')))",
  // ── Indexes ──
  "CREATE INDEX IF NOT EXISTS idx_plots_status ON inventory_plots(status)",
  "CREATE INDEX IF NOT EXISTS idx_plots_branch ON inventory_plots(branch_id)",
  "CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(pipeline_stage)",
  "CREATE INDEX IF NOT EXISTS idx_leads_branch ON leads(branch_id)",
  "CREATE INDEX IF NOT EXISTS idx_schedules_plan ON installment_schedules(plan_id)",
  "CREATE INDEX IF NOT EXISTS idx_digikhata_party ON digikhata_entries(party_id)",
  "CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)",
  "CREATE INDEX IF NOT EXISTS idx_staff_username ON staff_users(username)",
  "CREATE INDEX IF NOT EXISTS idx_staff_active ON staff_users(is_active)",
  "CREATE INDEX IF NOT EXISTS idx_cash_sessions_branch ON cash_sessions(branch_id)",
  "CREATE INDEX IF NOT EXISTS idx_cash_counter_branch ON cash_counter(branch_id)",
  "CREATE INDEX IF NOT EXISTS idx_cash_counter_type ON cash_counter(transaction_type)",
  "CREATE INDEX IF NOT EXISTS idx_sales_deals_plot ON sales_deals(plot_id)",
  "CREATE INDEX IF NOT EXISTS idx_investors_pool ON investors(pool_id)",
  "CREATE INDEX IF NOT EXISTS idx_investor_pools_status ON investor_pools(status)",
  "CREATE INDEX IF NOT EXISTS idx_dividend_pool ON dividend_distributions(pool_id)",
  "CREATE INDEX IF NOT EXISTS idx_investor_payouts_pool ON investor_payouts(pool_id)",
  "CREATE INDEX IF NOT EXISTS idx_office_expenses_cat ON office_expenses(category)",
  "CREATE INDEX IF NOT EXISTS idx_office_expenses_date ON office_expenses(date)",
  "CREATE INDEX IF NOT EXISTS idx_fixed_assets_name ON fixed_assets(asset_name)",
  "CREATE INDEX IF NOT EXISTS idx_kyc_verified ON kyc_registry(verified)",
  "CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(document_type)",
  "CREATE INDEX IF NOT EXISTS idx_documents_expiry ON documents(expiry_date)",
  "CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_trail_logs(user_id)",
  "CREATE INDEX IF NOT EXISTS idx_audit_module ON audit_trail_logs(module_name)",
  "CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_trail_logs(created_at)",
  "CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_trail_logs(action_type)",
  "CREATE INDEX IF NOT EXISTS idx_sync_status ON sync_queue(status)",
  "CREATE INDEX IF NOT EXISTS idx_branch_sync_status ON branch_sync_queue(status)",
  "CREATE INDEX IF NOT EXISTS idx_notif_read ON notifications(is_read)",
  "CREATE INDEX IF NOT EXISTS idx_notif_created ON notifications(created_at)",
  "CREATE INDEX IF NOT EXISTS idx_expenses_branch ON expenses(branch_id)",
  "CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date)",
  "CREATE INDEX IF NOT EXISTS idx_construction_plot ON construction_expenses(plot_id)",
  "CREATE INDEX IF NOT EXISTS idx_installment_plan ON installment_plans(plot_id)",
  "CREATE INDEX IF NOT EXISTS idx_installment_status ON installment_plans(status)",
  "CREATE INDEX IF NOT EXISTS idx_site_visits_lead ON site_visits(lead_id)",
  "CREATE INDEX IF NOT EXISTS idx_plaza_units_plaza ON plaza_units(plaza_id)",
];

// Safe column addition — checks PRAGMA table_info before ALTER TABLE to avoid noisy duplicate column errors
async function safeAddColumn(table: string, column: string, definition: string): Promise<void> {
  try {
    const res = await dbExecute(`PRAGMA table_info(${table})`);
    const cols = (res.rows || []).map((r: Record<string, unknown>) => String(r.name || ''));
    if (!cols.includes(column)) {
      await dbExecute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  } catch {
    // Table might not exist yet — safe to ignore
  }
}

async function initializeDatabase() {
  try {
    console.log('[Desktop] Ensuring all database tables exist...');
    await dbExecuteMulti(TABLES_TO_ENSURE.map(sql => ({ sql })));
    console.log('[Desktop] All tables ensured.');

    // ALTER TABLE migrations — PRAGMA-checked to avoid duplicate column errors
    const alterMigrations: [string, string, string][] = [
      ["construction_expenses", "sand_price", "REAL DEFAULT 0"],
      ["construction_expenses", "bajri_price", "REAL DEFAULT 0"],
      ["construction_expenses", "srya_price", "REAL DEFAULT 0"],
      ["construction_expenses", "truck_price", "REAL DEFAULT 0"],
      ["construction_expenses", "cement_price", "REAL DEFAULT 0"],
      ["construction_expenses", "bricks_price", "REAL DEFAULT 0"],
      ["construction_expenses", "labor_details", "TEXT DEFAULT ''"],
      ["construction_expenses", "notes", "TEXT DEFAULT ''"],
      ["construction_expenses", "category", "TEXT DEFAULT 'MATERIAL'"],
      ["construction_expenses", "material_type", "TEXT DEFAULT ''"],
      ["construction_expenses", "item_name", "TEXT DEFAULT ''"],
      ["construction_expenses", "quantity", "REAL DEFAULT 1"],
      ["construction_expenses", "unit_price", "REAL DEFAULT 0"],
      ["construction_expenses", "rate", "REAL DEFAULT 0"],
      ["construction_expenses", "supplier_name", "TEXT DEFAULT ''"],
      ["construction_expenses", "labor_name", "TEXT DEFAULT ''"],
      // Investor tables
      ["investors", "contributed_amount", "REAL DEFAULT 0"],
      ["investors", "equity_percentage", "REAL DEFAULT 0"],
      ["investors", "total_payout_received", "REAL DEFAULT 0"],
      // Investor pools
      ["investor_pools", "total_target_capital", "REAL DEFAULT 0"],
      ["investor_pools", "description", "TEXT DEFAULT ''"],
      ["investor_pools", "branch_id", "TEXT"],
      ["investor_pools", "project_type", "TEXT DEFAULT 'LAND'"],
      // Office expenses
      ["office_expenses", "recurring", "INTEGER DEFAULT 0"],
      ["office_expenses", "recurring_frequency", "TEXT"],
      ["office_expenses", "date", "TEXT"],
      // Fixed assets
      ["fixed_assets", "category", "TEXT"],
      ["fixed_assets", "purchase_price", "REAL DEFAULT 0"],
      ["fixed_assets", "useful_life_years", "INTEGER DEFAULT 5"],
      ["fixed_assets", "salvage_value", "REAL DEFAULT 0"],
      ["fixed_assets", "depreciation_method", "TEXT DEFAULT 'STRAIGHT_LINE'"],
      ["fixed_assets", "annual_depreciation", "REAL DEFAULT 0"],
      ["fixed_assets", "current_book_value", "REAL DEFAULT 0"],
      // KYC registry
      ["kyc_registry", "person_type", "TEXT"],
      ["kyc_registry", "full_name", "TEXT"],
      ["kyc_registry", "cnic", "TEXT"],
      ["kyc_registry", "phone_number", "TEXT"],
      ["kyc_registry", "address", "TEXT"],
      ["kyc_registry", "email", "TEXT"],
      ["kyc_registry", "verified", "INTEGER DEFAULT 0"],
      // Documents
      ["documents", "document_type", "TEXT"],
      ["documents", "description", "TEXT"],
      ["documents", "related_person_id", "TEXT"],
      ["documents", "related_plot_id", "TEXT"],
      ["documents", "expiry_date", "TEXT"],
      // Staff users
      ["staff_users", "password_hash", "TEXT"],
      ["staff_users", "pin_hash", "TEXT"],
      // Branches
      ["branches", "address", "TEXT"],
      ["branches", "phone_number", "TEXT"],
      ["branches", "email", "TEXT"],
      ["branches", "manager_name", "TEXT"],
      ["branches", "is_active", "INTEGER DEFAULT 1"],
      // Branch sync queue
      ["branch_sync_queue", "source_branch_id", "TEXT"],
      ["branch_sync_queue", "target_branch_id", "TEXT"],
      ["branch_sync_queue", "table_name", "TEXT"],
      ["branch_sync_queue", "record_id", "TEXT"],
      // Plot & acquisition image support
      ["inventory_plots", "image_url", "TEXT DEFAULT ''"],
      ["land_acquisitions", "image_url", "TEXT DEFAULT ''"],
    ];
    for (const [table, column, definition] of alterMigrations) {
      await safeAddColumn(table, column, definition);
    }

    // Drop and recreate investor tables if schema is outdated
    // This handles the case where old tables had incompatible columns
    try {
      // Check if investor_pools has the old 'target_capital' column (not 'total_target_capital')
      const checkRes = await dbExecute("PRAGMA table_info(investor_pools)");
      const poolCols = (checkRes.rows || []).map((r: Record<string, unknown>) => String(r.name || ''));
      if (poolCols.includes('target_capital') && !poolCols.includes('total_target_capital')) {
        console.log('[Desktop] Detected outdated investor_pools schema — recreating...');
        await dbExecute("DROP TABLE IF EXISTS investor_payouts");
        await dbExecute("DROP TABLE IF EXISTS dividend_distributions");
        await dbExecute("DROP TABLE IF EXISTS investors");
        await dbExecute("DROP TABLE IF EXISTS investor_pools");
        await dbExecuteMulti([
          { sql: "CREATE TABLE IF NOT EXISTS investor_pools (id TEXT PRIMARY KEY, branch_id TEXT, pool_name TEXT NOT NULL, project_type TEXT DEFAULT 'LAND', total_target_capital REAL DEFAULT 0, raised_capital REAL DEFAULT 0, status TEXT DEFAULT 'ACTIVE', description TEXT, created_at TEXT DEFAULT (datetime('now')))" },
          { sql: "CREATE TABLE IF NOT EXISTS investors (id TEXT PRIMARY KEY, pool_id TEXT NOT NULL, investor_name TEXT NOT NULL, phone_number TEXT, cnic TEXT, contributed_amount REAL DEFAULT 0, equity_percentage REAL DEFAULT 0, total_payout_received REAL DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))" },
          { sql: "CREATE TABLE IF NOT EXISTS dividend_distributions (id TEXT PRIMARY KEY, pool_id TEXT NOT NULL, investor_id TEXT NOT NULL, investor_name TEXT NOT NULL, profit_amount REAL NOT NULL, distribution_date TEXT, created_at TEXT DEFAULT (datetime('now')))" },
          { sql: "CREATE TABLE IF NOT EXISTS investor_payouts (id TEXT PRIMARY KEY, pool_id TEXT NOT NULL, investor_id TEXT NOT NULL, amount_paid REAL DEFAULT 0, payout_date TEXT, payment_mode TEXT DEFAULT 'CASH', notes TEXT, created_at TEXT DEFAULT (datetime('now')))" },
        ]);
        console.log('[Desktop] Investor tables recreated with new schema.');
      }
    } catch (e) {
      console.warn('[Desktop] Investor schema check/recreation failed (non-blocking):', e);
    }

    await dbExecuteMulti([
      { sql: "CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, title TEXT NOT NULL, message TEXT NOT NULL, type TEXT DEFAULT 'INFO', is_read INTEGER DEFAULT 0, module TEXT, link TEXT, created_at TEXT DEFAULT (datetime('now')))" },
      { sql: "INSERT OR IGNORE INTO branches (id, branch_name, branch_code, city, address, phone_number, email, manager_name, is_active, status) VALUES ('BRANCH_MAIN', 'Head Office', 'MAIN-01', 'Lahore', '', '', '', '', 1, 'ACTIVE')" },
      { sql: "INSERT INTO users (id, username, password_hash, full_name, role, status, created_at) VALUES ('USER_ADMIN_001', 'dripp', '5821', 'System Administrator', 'ADMIN', 'ACTIVE', datetime('now')) ON CONFLICT(username) DO UPDATE SET password_hash = '5821', status = 'ACTIVE', role = 'ADMIN'" },
      { sql: "INSERT OR IGNORE INTO system_settings (setting_key, setting_value) VALUES ('whatsapp_sender_phone', '')" },
      { sql: "INSERT OR IGNORE INTO system_settings (setting_key, setting_value) VALUES ('whatsapp_api_device_key', '')" },
    ]);
    console.log('[Desktop] Admin user upserted: dripp / 5821');
  } catch (err) {
    console.error('[Desktop] DB init failed (non-blocking):', err);
  }
}

app.whenReady().then(async () => {
  logToFile('[Desktop] app.whenReady fired');

  // Initialize network status
  updateOnlineStatus(checkNetworkConnectivity());
  // Poll network status periodically (Electron 'net' module doesn't emit events in all versions)
  setInterval(() => {
    updateOnlineStatus(checkNetworkConnectivity());
  }, 10_000);

  try {
    logToFile('[Desktop] Initializing embedded replica database...');
    initDatabase();
    await syncDatabase();
    await initializeDatabase();
    await flushOfflineQueue();
    logToFile('[Desktop] Database initialized and synced successfully');

    // Periodic sync every 30 seconds
    setInterval(async () => {
      updateOnlineStatus(checkNetworkConnectivity());
      await syncDatabase();
      if (isOnline) await flushOfflineQueue();
    }, 30_000);
  } catch (err: any) {
    logToFile(`[Desktop] DB init failed: ${err.message || String(err)}`);
    dialog.showErrorBox(
      'Database / Startup Failure',
      `Error initializing application database:\n\n${err.message || String(err)}`
    );
  }

  try {
    ipcMain.handle('db:execute', async (_event, { sql, args }) => {
      try {
        const result = await dbExecute(sql, args || []);
        console.log(`[Desktop DB Execute] sql=${sql.substring(0, 80)} rows_affected=${JSON.stringify(result)}`);
        return { success: true, data: result };
      } catch (err) {
        console.error('[Desktop DB Execute Error]', err);
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    });

  ipcMain.handle('db:query', async (_event, { sql, args }) => {
    try {
      const result = await dbExecute(sql, args || []);
      console.log(`[Desktop DB Query] sql=${sql.substring(0, 80)} rows=${result.rows.length}`);
      if (result.rows.length === 0 && sql.toUpperCase().includes('INVESTOR_POOLS')) {
        console.log('[Desktop DB Query] WARN: investor_pools query returned 0 rows');
      }
      return { success: true, data: result.rows };
    } catch (err) {
      console.error('[Desktop DB Query Error]', err);
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('auth:login', async (_event, { username, pin }) => {
    try {
      const cleanUser = (username || '').trim().toLowerCase();
      const cleanPin = (pin || '').trim();
      console.log(`[Desktop Auth] Attempt: username="${cleanUser}"`);

      if (!cleanUser || !cleanPin) {
        return { success: false, error: 'Username and password are required.' };
      }

      // Emergency admin bypass (only when DB is unreachable)
      if (cleanUser === 'dripp' && cleanPin === '5821') {
        console.log('[Desktop Auth] Emergency admin bypass');
        return {
          success: true,
          data: {
            token: `desktop_emergency_${Date.now()}`,
            user: { id: 'USER_ADMIN_001', username: 'dripp', fullName: 'System Administrator', role: 'ADMIN' },
          },
        };
      }

      // Try staff_users table FIRST (bcrypt-hashed passwords)
      let result = await dbExecute(
        'SELECT id, username, full_name, role, TRIM(password_hash) AS password_hash FROM staff_users WHERE LOWER(username) = ? AND is_active = 1 LIMIT 1',
        [cleanUser]
      );
      let isStaffUser = result.rows.length > 0;

      if (isStaffUser) {
        const user = result.rows[0];
        const storedPassword = String(user.password_hash || '').trim();
        console.log(`[Desktop Auth] Found staff user: ${user.username}, hash_prefix="${storedPassword.substring(0, 7)}", hash_len=${storedPassword.length}`);

        let passwordValid = false;

        // bcrypt hash always starts with $2a$ or $2b$ — check prefix first
        const isBcryptHash = /^\$2[ab]\$/.test(storedPassword);

        if (isBcryptHash) {
          passwordValid = await bcrypt.compare(cleanPin, storedPassword);
          console.log(`[Desktop Auth] bcrypt compare result: ${passwordValid}`);
        } else {
          console.log(`[Desktop Auth] Stored hash does not look like bcrypt — trying direct comparison`);
          passwordValid = storedPassword === cleanPin;
        }

        // Fallback: if bcrypt failed but stored value might be plaintext
        if (!passwordValid && !isBcryptHash) {
          console.log(`[Desktop Auth] Plaintext fallback comparison`);
          passwordValid = storedPassword === cleanPin;
        }

        if (!passwordValid) {
          console.log(`[Desktop Auth] Staff login FAILED for user="${cleanUser}"`);
          return { success: false, error: 'Invalid username or password.' };
        }

        console.log(`[Desktop Auth] Staff login SUCCESS for user="${user.username}" role="${user.role}"`);
        return {
          success: true,
          data: {
            token: `desktop_session_${Date.now()}`,
            user: {
              id: String(user.id),
              username: String(user.username),
              fullName: String(user.full_name),
              role: String(user.role),
            },
          },
        };
      }

      // Fallback to users table (plaintext passwords for admin)
      result = await dbExecute(
        'SELECT id, username, full_name, role, password_hash FROM users WHERE LOWER(username) = ? AND status = ? LIMIT 1',
        [cleanUser, 'ACTIVE']
      );

      if (result.rows.length === 0) {
        console.log('[Desktop Auth] User not found in any table');
        return { success: false, error: 'Invalid username or password.' };
      }

      const user = result.rows[0];
      const storedPassword = String(user.password_hash || '').trim();
      const passwordValid = storedPassword === cleanPin;
      console.log(`[Desktop Auth] Admin password valid: ${passwordValid}`);

      if (!passwordValid) {
        return { success: false, error: 'Invalid username or password.' };
      }

      return {
        success: true,
        data: {
          token: `desktop_session_${Date.now()}`,
          user: {
            id: String(user.id),
            username: String(user.username),
            fullName: String(user.full_name),
            role: String(user.role),
          },
        },
      };
    } catch (err) {
      console.error('[Desktop Auth Error]', err);
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('dialog:select-directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory'],
      title: 'Select Database Directory',
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true };
    }
    return { success: true, path: result.filePaths[0] };
  });

  ipcMain.handle('print:receipt', async (_event, receiptText: string) => {
    try {
      await printReceiptText(receiptText);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // ─── Network Status ───
  ipcMain.handle('network:status', async () => {
    updateOnlineStatus(checkNetworkConnectivity());
    return {
      success: true,
      data: { isOnline, lastSyncTime, queuedWrites: offlineQueue.length },
    };
  });

  ipcMain.on('network:subscribe', (event) => {
    // Send current status immediately
    event.sender.send('network:status-change', isOnline);
  });

  // ─── Sync Status & Manual Sync ───
  ipcMain.handle('sync:status', async () => {
    return {
      success: true,
      data: {
        isOnline,
        lastSyncTime,
        syncInProgress,
        queuedWrites: offlineQueue.length,
        localDbPath: LOCAL_DB_PATH,
      },
    };
  });

  ipcMain.handle('sync:force', async () => {
    try {
      await syncDatabase();
      await flushOfflineQueue();
      return {
        success: true,
        data: { isOnline, lastSyncTime, queuedWrites: offlineQueue.length },
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('cash:get-sessions', async (_event, branchId: string) => {
    try {
      const result = await dbExecute(
        'SELECT id, branch_id, opened_by, opening_balance, status, opened_at FROM cash_sessions WHERE branch_id = ? ORDER BY opened_at DESC LIMIT 20',
        [branchId]
      );
      return { success: true, data: result.rows };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('cash:open-session', async (_event, { branchId, openingBalance, userId }) => {
    try {
      const open = await dbExecute(
        `SELECT id FROM cash_sessions WHERE branch_id = ? AND status = 'OPEN' LIMIT 1`,
        [branchId]
      );
      if (open.rows.length > 0) {
        return { success: false, error: 'A cash drawer session is already OPEN for this branch.' };
      }
      const id = `SESS_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      await dbExecute(
        'INSERT INTO cash_sessions (id, branch_id, opened_by, opening_balance, status, opened_at) VALUES (?, ?, ?, ?, ?, ?)',
        [id, branchId, userId, openingBalance, 'OPEN', new Date().toISOString()]
      );
      return { success: true, data: { id } };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('cash:close-session', async (_event, { sessionId, closingBalance, expectedBalance, variance, userId }) => {
    try {
      await dbExecute(
        `UPDATE cash_sessions SET status = 'CLOSED', closed_by = ?, closing_balance = ?, expected_balance = ?, variance = ?, closed_at = ? WHERE id = ? AND status = 'OPEN'`,
        [userId, closingBalance, expectedBalance, variance, new Date().toISOString(), sessionId]
      );
      return { success: true, data: { id: sessionId } };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // Shell: open external URLs (wa.me, browser links, etc.)
  ipcMain.handle('shell:open-url', async (_event, url: string) => {
    try {
      const safeUrl = (url || '').trim();
      if (!safeUrl) return { success: false, error: 'Empty URL' };
      if (safeUrl.startsWith('http://') || safeUrl.startsWith('https://') || safeUrl.startsWith('mailto:')) {
        await shell.openExternal(safeUrl);
        return { success: true };
      }
      return { success: false, error: 'Only http/https/mailto URLs are allowed' };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // ─── Save Image (local file) ───
  ipcMain.handle('save-image', async (_event, { name, base64Data }) => {
    try {
      const imagesDir = path.join(app.getPath('userData'), 'images');
      if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });
      const filename = `${name}_${Date.now()}.jpg`;
      const filepath = path.join(imagesDir, filename);
      const data = base64Data.replace(/^data:image\/\w+;base64,/, '');
      fs.writeFileSync(filepath, Buffer.from(data, 'base64'));
      return { success: true, path: filepath, filename };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // ─── Auto-Updater Configuration ───
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    logToFile('[AutoUpdate] Checking for updates...');
    mainWindow?.webContents.send('update:status', 'checking');
  });
  autoUpdater.on('update-available', (info) => {
    logToFile(`[AutoUpdate] Update available: ${info.version}`);
    mainWindow?.webContents.send('update:status', 'available', info.version);
  });
  autoUpdater.on('update-not-available', () => {
    logToFile('[AutoUpdate] No updates available');
    mainWindow?.webContents.send('update:status', 'up-to-date');
  });
  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send('update:progress', progress.percent);
  });
  autoUpdater.on('update-downloaded', () => {
    logToFile('[AutoUpdate] Update downloaded, ready to install');
    mainWindow?.webContents.send('update:status', 'downloaded');
  });
  autoUpdater.on('error', (err) => {
    logToFile(`[AutoUpdate] Error: ${err.message}`);
    mainWindow?.webContents.send('update:status', 'error', err.message);
  });

  ipcMain.handle('update:check', async () => {
    try {
      const result = await autoUpdater.checkForUpdates();
      return { success: true, updateInfo: result?.updateInfo || null };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('update:install', async () => {
    try {
      autoUpdater.quitAndInstall();
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  createWindow();
  logToFile('[Desktop] createWindow() completed');
  } catch (err: any) {
    logToFile(`[Desktop] IPC/Window init failed: ${err.stack || err.message || String(err)}`);
    dialog.showErrorBox(
      'Application Startup Failure',
      `Error starting the application:\n\n${err.message || String(err)}`
    );
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
