import { sanitizeParamsForTurso, sanitizeRowsFromDB, safeStr } from './dbSanitizer';
import bcrypt from 'bcryptjs';

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

interface OfflineQueueItem {
  id: string;
  sql: string;
  args: unknown[];
  timestamp: number;
}

interface WebApi {
  dbExecute: (sql: string, args?: unknown[]) => Promise<DatabaseResponse>;
  dbQuery: <T = unknown>(sql: string, args?: unknown[]) => Promise<DatabaseResponse<T[]>>;
  authenticate: (username: string, pin: string) => Promise<AuthResponse>;
  onSyncStatusUpdate: (callback: (status: string) => void) => void;
  getNetworkStatus: () => Promise<{ success: boolean; data?: { isOnline: boolean; lastSyncTime: string | null; queuedWrites: number }; error?: string }>;
  onNetworkStatusChange: (callback: (isOnline: boolean) => void) => void;
  subscribeToSyncUpdates: () => void;
  printReceipt: (receiptText: string) => Promise<DatabaseResponse>;
  getCashSessions: (branchId: string) => Promise<DatabaseResponse>;
  openCashSession: (branchId: string, openingBalance: number, userId: string, userName: string) => Promise<DatabaseResponse>;
  closeCashSession: (sessionId: string, closingBalance: number, expectedBalance: number, variance: number, userId: string, userName: string) => Promise<DatabaseResponse>;
  openExternalUrl: (url: string) => Promise<{ success: boolean; error?: string }>;
  selectDirectory: () => Promise<{ success: boolean; path?: string; canceled?: boolean }>;
  saveImage: (name: string, base64Data: string) => Promise<{ success: boolean; path?: string; filename?: string; error?: string }>;
  getSyncStatus: () => Promise<{ success: boolean; data?: { isOnline: boolean; lastSyncTime: string | null; syncInProgress: boolean; queuedWrites: number; localDbPath: string }; error?: string }>;
  forceSync: () => Promise<{ success: boolean; data?: { isOnline: boolean; lastSyncTime: string | null; queuedWrites: number }; error?: string }>;
}

const TURSO_DB_URL = import.meta.env.VITE_TURSO_DATABASE_URL || '';
const TURSO_AUTH_TOKEN = import.meta.env.VITE_TURSO_AUTH_TOKEN || '';

if (!TURSO_DB_URL || !TURSO_AUTH_TOKEN) {
  console.error('[Web] CRITICAL: VITE_TURSO_DATABASE_URL or VITE_TURSO_AUTH_TOKEN not set. Configure .env file.');
}

// ── IndexedDB Offline Queue (survives page reloads) ──
const DB_NAME = 'dripp_offline_queue';
const STORE_NAME = 'pending_writes';
const QUEUE_DB_VERSION = 1;

function openQueueDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, QUEUE_DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function queueWriteToIndexedDB(item: OfflineQueueItem): Promise<void> {
  const db = await openQueueDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(item);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function getAllQueuedWrites(): Promise<OfflineQueueItem[]> {
  const db = await openQueueDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => { db.close(); resolve(request.result || []); };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}

async function removeQueuedWrite(id: string): Promise<void> {
  const db = await openQueueDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

// ── Required Field Defaults (auto-inject for stale queued writes) ──
const REQUIRED_FIELD_DEFAULTS: Record<string, Record<string, string>> = {
  investor_pools: { branch_id: 'BRANCH_MAIN' },
  agency_settings: { created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  office_expenses: { branch_id: 'BRANCH_MAIN' },
  fixed_assets: { branch_id: 'BRANCH_MAIN' },
  inventory_plots: { branch_id: 'BRANCH_MAIN' },
  leads: { branch_id: 'BRANCH_MAIN' },
  cash_sessions: { branch_id: 'BRANCH_MAIN' },
  cash_counter: { branch_id: 'BRANCH_MAIN' },
  daily_expenses: { branch_id: 'BRANCH_MAIN' },
  construction_projects: { branch_id: 'BRANCH_MAIN' },
  expenses: { branch_id: 'BRANCH_MAIN' },
  kyc_registry: { party_type: 'INVESTOR', person_type: 'BUYER' },
};

/**
 * Known valid columns per table. Used to defensively strip stale/unknown columns
 * from queued offline writes so a schema mismatch never becomes a fatal flush error.
 * If a table is not listed here, its columns are left untouched.
 */
const KNOWN_TABLE_COLUMNS: Record<string, string[]> = {
  installment_payments: [
    'id', 'plan_id', 'plot_id', 'schedule_id', 'amount_paid', 'amount',
    'payment_date', 'payment_mode', 'receipt_no', 'created_at',
  ],
};

/**
 * Parse a queued SQL statement and inject missing required fields.
 * Handles INSERT INTO table (...) VALUES (...) and UPDATE table SET ... patterns.
 * Returns the possibly-modified { sql, args } — original if no changes needed.
 */
function sanitizeQueuedSQL(item: OfflineQueueItem): { sql: string; args: unknown[] } {
  let sql = item.sql;
  const args = [...item.args];

  // Match INSERT INTO table_name (col1, col2, ...) VALUES (?, ?, ...)
  const insertMatch = sql.match(/INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
  if (insertMatch) {
    const tableName = insertMatch[1].toLowerCase();
    const columnsStr = insertMatch[2];
    const columns = columnsStr.split(',').map(c => c.trim().toLowerCase().replace(/["`]/g, ''));

    // Defensive: strip any columns not present in the known schema for this table.
    // This prevents "table X has no column named Y" fatal errors on stale queued writes.
    const known = KNOWN_TABLE_COLUMNS[tableName];
    if (known) {
      const validIndices: number[] = [];
      const keptColumns: string[] = [];
      columns.forEach((col, idx) => {
        if (known.includes(col)) {
          validIndices.push(idx);
          keptColumns.push(col);
        } else {
          console.warn(`[Web Queue Sanitize] Dropping unknown column "${col}" from queued ${tableName} write`);
        }
      });
      if (keptColumns.length !== columns.length) {
        const keptArgs = validIndices.map(i => args[i]);
        columns.length = 0;
        columns.push(...keptColumns);
        args.length = 0;
        args.push(...keptArgs);
      }
    }

    // Defensive: validate args match columns BEFORE any defaults injection
    // If original queued item had column/value mismatch, record it but try to fix
    if (args.length < columns.length) {
      console.warn(`[Web Queue Sanitize] INSERT ${tableName}: expected ${columns.length} values but only ${args.length} provided — padding with nulls`);
      while (args.length < columns.length) {
        args.push(null);
      }
    }

    const defaults = REQUIRED_FIELD_DEFAULTS[tableName];
    if (!defaults) {
      // Even without field defaults, if we stripped unknown columns we must rebuild
      // the SQL so it matches the filtered columns/args, else execution would fail.
      const placeholderCount = (sql.match(/\?/g) || []).length;
      const needsRebuild = placeholderCount !== columns.length;
      if (needsRebuild) {
        const placeholders = columns.map(() => '?').join(', ');
        sql = `INSERT OR IGNORE INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
      }
      return { sql, args };
    }

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
      // Final validation: ensure columns and args still match after defaults injection
      if (args.length < columns.length) {
        while (args.length < columns.length) {
          args.push(null);
        }
      } else if (args.length > columns.length) {
        args.length = columns.length;
      }
      const placeholders = columns.map(() => '?').join(', ');
      sql = `INSERT OR IGNORE INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
      return { sql, args };
    }
  }

  // Match UPDATE table_name SET col1 = ?, col2 = ? WHERE id = ?
  const updateMatch = sql.match(/UPDATE\s+(\w+)\s+SET\s+(.+?)\s+WHERE\s+(.+)/i);
  if (updateMatch) {
    const tableName = updateMatch[1].toLowerCase();
    const setClause = updateMatch[2];
    const whereClause = updateMatch[3];
    const defaults = REQUIRED_FIELD_DEFAULTS[tableName];
    if (!defaults) return { sql, args };

    // Extract SET columns
    const setParts = setClause.split(',').map(s => s.trim());
    const setColumns = setParts.map(part => {
      const eqMatch = part.match(/(\w+)\s*=/);
      return eqMatch ? eqMatch[1].toLowerCase() : '';
    });

    let modified = false;
    let argIdx = 0;
    for (const part of setParts) {
      const eqMatch = part.match(/(\w+)\s*=/);
      if (eqMatch) {
        const col = eqMatch[1].toLowerCase();
        const defaultsForTable = REQUIRED_FIELD_DEFAULTS[tableName];
        if (defaultsForTable && defaultsForTable[col] && (args[argIdx] === null || args[argIdx] === undefined || args[argIdx] === '')) {
          args[argIdx] = col === 'updated_at' ? new Date().toISOString() : defaultsForTable[col];
          modified = true;
        }
      }
      argIdx++;
    }

    // Also ensure updated_at is present in SET clause for tables that require it
    if (defaults && defaults['updated_at'] && !setColumns.includes('updated_at')) {
      setParts.push('updated_at = ?');
      args.splice(argIdx, 0, new Date().toISOString());
      modified = true;
    }

    if (modified) {
      sql = `UPDATE ${tableName} SET ${setParts.join(', ')} WHERE ${whereClause}`;
      return { sql, args };
    }
  }

  // ── Arg-count validation: count ? placeholders vs bound args ──
  const placeholderCount = (sql.match(/\?/g) || []).length;
  if (placeholderCount !== args.length) {
    if (placeholderCount > args.length) {
      // More placeholders than args — pad with nulls
      while (args.length < placeholderCount) {
        args.push(null);
      }
    } else {
      // More args than placeholders — truncate extra args
      args.length = placeholderCount;
    }
  }

  return { sql, args };
}

// ── Network Status (Web) ──
let webIsOnline = navigator.onLine;
let lastWebSyncTime: string | null = null;
const networkStatusCallbacks: ((isOnline: boolean) => void)[] = [];

function updateWebOnlineStatus(status: boolean) {
  if (webIsOnline !== status) {
    webIsOnline = status;
    console.log(`[Web] Network status: ${status ? 'ONLINE' : 'OFFLINE'}`);
    networkStatusCallbacks.forEach(cb => {
      try { cb(status); } catch { /* best effort */ }
    });
    if (status) {
      flushWebOfflineQueue().catch(() => {});
    }
  }
}

window.addEventListener('online', () => updateWebOnlineStatus(true));
window.addEventListener('offline', () => updateWebOnlineStatus(false));

// ── Flush Offline Queue on Connectivity ──

/** Errors that indicate a permanent structural mismatch — drop immediately, don't retry */
const DROP_ERROR_PATTERNS = [
  'NOT NULL constraint',
  'UNIQUE constraint',
  'FOREIGN KEY constraint',
  'CHECK constraint',
  'no such column',
  'no such table',
  'has no column',
  'table .* has no column',
  'UNIQUE constraint failed',
  'NOT NULL constraint failed',
  'column .* is not unique',
  'Number of arguments mismatch',
  'Input error',
  'argument mismatch',
];

function isFatalQueueError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return DROP_ERROR_PATTERNS.some(p => msg.toLowerCase().includes(p.toLowerCase()));
}

async function flushWebOfflineQueue(): Promise<void> {
  if (!webIsOnline) return;
  const queued = await getAllQueuedWrites();
  if (queued.length === 0) return;
  console.log(`[Web] Flushing ${queued.length} queued offline writes...`);

  const remaining: OfflineQueueItem[] = [];
  let droppedCount = 0;
  for (const item of queued) {
    try {
      // Auto-sanitize: inject missing required fields before execution
      const sanitized = sanitizeQueuedSQL(item);
      await tursoExecute(sanitized.sql, sanitized.args);
      await removeQueuedWrite(item.id);
    } catch (err) {
      const isFatal = isFatalQueueError(err);
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[Web] Queued write ${isFatal ? 'DROPPED (fatal error)' : 'FAILED (will retry)'}:`, item.sql.substring(0, 80), errorMsg);

      if (isFatal) {
        // Permanent error — drop immediately, never retry
        await removeQueuedWrite(item.id);
        droppedCount++;
      } else if (Date.now() - item.timestamp < 24 * 60 * 60 * 1000) {
        // Transient error + less than 24h old — keep for retry
        remaining.push(item);
      } else {
        // Old + failing — drop it
        await removeQueuedWrite(item.id);
        droppedCount++;
      }
    }
  }
  if (remaining.length === 0) {
    console.log(`[Web] Queue flush complete. ${droppedCount > 0 ? `${droppedCount} stale items dropped.` : 'All writes flushed.'}`);
    lastWebSyncTime = new Date().toISOString();
  } else {
    console.warn(`[Web] ${remaining.length} writes still queued (${droppedCount} dropped)`);
  }
}

async function tursoExecuteMulti(requests: { sql: string; args?: unknown[] }[]): Promise<{ rows: Record<string, unknown>[] }> {
  const httpUrl = `https://${TURSO_DB_URL.replace('libsql://', '')}/v2/pipeline`;
  const response = await fetch(httpUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TURSO_AUTH_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: requests.map(r => ({
        type: 'execute',
        stmt: {
          sql: r.sql,
          args: sanitizeParamsForTurso(r.args || []),
        },
      })),
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Turso HTTP ${response.status}: ${text}`);
  }

  const data = await response.json();
  const results = data.results || [];
  const lastResult = results[results.length - 1];
  if (!lastResult) {
    throw new Error('Empty response from Turso');
  }
  if (lastResult.type === 'error') {
    const errMsg = lastResult.error?.message || 'Turso execution error';
    console.error('[Turso Multi Error]', errMsg, lastResult.error);
    throw new Error(errMsg);
  }
  if (!lastResult.response) {
    throw new Error('Missing response in Turso result');
  }
  return { rows: lastResult.response.result?.rows || [] };
}

async function tursoExecute(sql: string, args: unknown[] = []): Promise<{ rows: Record<string, unknown>[] }> {
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
          args: sanitizeParamsForTurso(args),
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
  if (!result) {
    console.error('[Turso] No results in response for:', sql.substring(0, 80));
    return { rows: [] };
  }
  if (result.type === 'error') {
    const errMsg = result.error?.message || 'Turso execution error';
    console.error('[Turso Error]', errMsg, 'sql:', sql.substring(0, 80));
    throw new Error(errMsg);
  }
  if (!result.response) {
    console.error('[Turso] Missing response in result for:', sql.substring(0, 80));
    return { rows: [] };
  }
  const cols: string[] = (result.response.result?.cols || []).map((c: { name: string }) => c.name);
  const rawRows: unknown[][] = result.response.result?.rows || [];
  const mappedRows: Record<string, unknown>[] = rawRows.map((row: unknown[]) => {
    const obj: Record<string, unknown> = {};
    cols.forEach((col: string, i: number) => {
      let val = row[i];
      // Unwrap Turso value objects
      if (val !== undefined && val !== null && typeof val === 'object' && (val as Record<string, unknown>).value !== undefined) {
        val = (val as Record<string, unknown>).value;
      }
      // Convert BigInt to number
      if (typeof val === 'bigint') {
        obj[col] = Number(val);
      } else if (val === null || val === undefined) {
        obj[col] = '';
      } else if (typeof val === 'object' && !(val instanceof Date)) {
        obj[col] = JSON.stringify(val);
      } else {
        obj[col] = val;
      }
    });
    return obj;
  });
  return { rows: sanitizeRowsFromDB(mappedRows) };
}

async function autoSeedDatabase(): Promise<void> {
  try {
    const tablesToEnsure = [
      "CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, full_name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'STAFF', status TEXT NOT NULL DEFAULT 'ACTIVE', created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))",
      "CREATE TABLE IF NOT EXISTS branches (id TEXT PRIMARY KEY, branch_name TEXT NOT NULL, branch_code TEXT, city TEXT, address TEXT, phone_number TEXT, email TEXT, manager_name TEXT, is_active INTEGER DEFAULT 1, status TEXT DEFAULT 'ACTIVE', created_at TEXT DEFAULT (datetime('now')))",
      "CREATE TABLE IF NOT EXISTS cash_sessions (id TEXT PRIMARY KEY, branch_id TEXT, opened_by TEXT, opening_balance REAL DEFAULT 0, status TEXT DEFAULT 'OPEN', opened_at TEXT, closed_by TEXT, closing_balance REAL, expected_balance REAL, variance REAL, closed_at TEXT)",
      "CREATE TABLE IF NOT EXISTS cash_counter (id TEXT PRIMARY KEY, branch_id TEXT, user_id TEXT, transaction_type TEXT, category TEXT, amount REAL, notes TEXT, handed_over_by TEXT, received_by TEXT, created_at TEXT DEFAULT (datetime('now')))",
      "CREATE TABLE IF NOT EXISTS inventory_plots (id TEXT PRIMARY KEY, branch_id TEXT, plot_number TEXT, society_name TEXT, block_phase TEXT, size_dimension TEXT, size_value REAL DEFAULT 0, size_unit TEXT DEFAULT 'Marla', category TEXT, feature_tags TEXT, purchase_date TEXT, purchase_price REAL, target_asking_price REAL, floor_price REAL, gps_coordinates TEXT, status TEXT DEFAULT 'AVAILABLE', construction_status TEXT DEFAULT 'NONE', notes TEXT, image_url TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))",
      "CREATE TABLE IF NOT EXISTS leads (id TEXT PRIMARY KEY, branch_id TEXT, prospect_name TEXT, phone_number TEXT, interested_category TEXT, budget_range REAL, lead_source TEXT, assigned_agent_id TEXT, pipeline_stage TEXT DEFAULT 'NEW_LEAD', priority TEXT DEFAULT 'WARM', created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))",
"CREATE TABLE IF NOT EXISTS sales_transactions (id TEXT PRIMARY KEY, plot_id TEXT, buyer_name TEXT, buyer_phone TEXT, buyer_cnic TEXT, final_sale_price REAL, cost_basis REAL, development_costs REAL DEFAULT 0, agent_commission REAL DEFAULT 0, government_taxes REAL DEFAULT 0, net_profit_calculated REAL, payment_method TEXT, agent_id TEXT, sale_date TEXT, created_at TEXT DEFAULT (datetime('now')))",
       "CREATE TABLE IF NOT EXISTS sale_payment_breakdowns (id TEXT PRIMARY KEY, sale_id TEXT NOT NULL, payment_method TEXT NOT NULL, transaction_ref TEXT, amount REAL NOT NULL, created_at TEXT DEFAULT (datetime('now')))",
       "CREATE TABLE IF NOT EXISTS sales_deals (id TEXT PRIMARY KEY, plot_id TEXT NOT NULL, cash_counter_id TEXT, buyer_name TEXT NOT NULL, buyer_phone TEXT NOT NULL, buyer_cnic TEXT, total_deal_price REAL NOT NULL, down_payment REAL DEFAULT 0, balance_amount REAL DEFAULT 0, sales_agent TEXT, payment_mode TEXT DEFAULT 'CASH', sale_date TEXT NOT NULL, notes TEXT, created_at TEXT DEFAULT (datetime('now')))",
       "CREATE TABLE IF NOT EXISTS cash_counter (id TEXT PRIMARY KEY, branch_id TEXT, user_id TEXT, transaction_type TEXT, category TEXT, amount REAL, notes TEXT, handed_over_by TEXT, received_by TEXT, created_at TEXT DEFAULT (datetime('now')))",
      "CREATE TABLE IF NOT EXISTS installment_plans (id TEXT PRIMARY KEY, plot_id TEXT, buyer_name TEXT, buyer_phone TEXT, buyer_cnic TEXT, total_sale_price REAL, down_payment REAL, plan_duration_months INTEGER, monthly_installment_amount REAL, start_date TEXT, due_day_of_month INTEGER, grace_period_days INTEGER DEFAULT 5, late_penalty_fee REAL DEFAULT 0, status TEXT DEFAULT 'ACTIVE', created_at TEXT DEFAULT (datetime('now')))",
      "CREATE TABLE IF NOT EXISTS installment_schedules (id TEXT PRIMARY KEY, plan_id TEXT, installment_number INTEGER, due_date TEXT, amount_due REAL, amount_paid REAL DEFAULT 0, late_fine_charged REAL DEFAULT 0, discount_applied REAL DEFAULT 0, payment_date TEXT, payment_method TEXT, status TEXT DEFAULT 'PENDING', created_at TEXT DEFAULT (datetime('now')))",
       "CREATE TABLE IF NOT EXISTS installment_payments (id TEXT PRIMARY KEY, plan_id TEXT NOT NULL, plot_id TEXT, schedule_id TEXT, amount_paid REAL DEFAULT 0, amount REAL DEFAULT 0, payment_date TEXT DEFAULT (datetime('now')), payment_mode TEXT DEFAULT 'CASH', receipt_no TEXT, created_at TEXT DEFAULT (datetime('now')))",
      "CREATE TABLE IF NOT EXISTS digikhata_parties (id TEXT PRIMARY KEY, party_name TEXT, phone_number TEXT, party_type TEXT, current_balance REAL DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))",
      "CREATE TABLE IF NOT EXISTS digikhata_entries (id TEXT PRIMARY KEY, party_id TEXT, entry_type TEXT, amount REAL, description TEXT, due_date TEXT, attachment_url TEXT, created_at TEXT DEFAULT (datetime('now')))",
      "CREATE TABLE IF NOT EXISTS agents (id TEXT PRIMARY KEY, agency_name TEXT, agent_name TEXT, phone_number TEXT, cnic TEXT, commission_type TEXT, commission_rate REAL, created_at TEXT DEFAULT (datetime('now')))",
      "CREATE TABLE IF NOT EXISTS agent_commissions (id TEXT PRIMARY KEY, agent_id TEXT, transaction_id TEXT, commission_earned REAL, commission_paid REAL DEFAULT 0, balance_due REAL, status TEXT DEFAULT 'UNPAID', created_at TEXT DEFAULT (datetime('now')))",
      "CREATE TABLE IF NOT EXISTS land_acquisitions (id TEXT PRIMARY KEY, seller_name TEXT, seller_phone TEXT, seller_cnic TEXT, land_title_khata TEXT, total_agreed_price REAL, advance_paid REAL, debt_remaining REAL, acquisition_date TEXT, registry_doc_url TEXT, image_url TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')))",
      "CREATE TABLE IF NOT EXISTS investor_pools (id TEXT PRIMARY KEY, branch_id TEXT, pool_name TEXT NOT NULL, project_type TEXT DEFAULT 'LAND', total_target_capital REAL DEFAULT 0, raised_capital REAL DEFAULT 0, status TEXT DEFAULT 'ACTIVE', description TEXT, created_at TEXT DEFAULT (datetime('now')))",
      "CREATE TABLE IF NOT EXISTS investors (id TEXT PRIMARY KEY, pool_id TEXT NOT NULL, investor_name TEXT NOT NULL, phone_number TEXT, cnic TEXT, contributed_amount REAL DEFAULT 0, equity_percentage REAL DEFAULT 0, total_payout_received REAL DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))",
      "CREATE TABLE IF NOT EXISTS dividend_distributions (id TEXT PRIMARY KEY, pool_id TEXT NOT NULL, investor_id TEXT NOT NULL, investor_name TEXT NOT NULL, profit_amount REAL NOT NULL, distribution_date TEXT, created_at TEXT DEFAULT (datetime('now')))",
      "CREATE TABLE IF NOT EXISTS investor_payouts (id TEXT PRIMARY KEY, pool_id TEXT NOT NULL, investor_id TEXT NOT NULL, amount_paid REAL DEFAULT 0, payout_date TEXT, payment_mode TEXT DEFAULT 'CASH', notes TEXT, created_at TEXT DEFAULT (datetime('now')))",
      "CREATE TABLE IF NOT EXISTS construction_projects (id TEXT PRIMARY KEY, branch_id TEXT, project_name TEXT, site_location TEXT, budget_allocated REAL, total_spent REAL DEFAULT 0, status TEXT DEFAULT 'PLANNING', created_at TEXT DEFAULT (datetime('now')))",
      "CREATE TABLE IF NOT EXISTS construction_expenses (id TEXT PRIMARY KEY, plot_id TEXT NOT NULL, sand_price REAL DEFAULT 0, bajri_price REAL DEFAULT 0, srya_price REAL DEFAULT 0, truck_price REAL DEFAULT 0, cement_price REAL DEFAULT 0, bricks_price REAL DEFAULT 0, labor_details TEXT, total_amount REAL NOT NULL, expense_date TEXT NOT NULL, notes TEXT, created_at TEXT DEFAULT (datetime('now')))",
      "CREATE TABLE IF NOT EXISTS daily_expenses (id TEXT PRIMARY KEY, branch_id TEXT, category_name TEXT, amount REAL, payment_source TEXT, approved_by TEXT, description TEXT, voucher_number TEXT, created_at TEXT DEFAULT (datetime('now')))",
      "CREATE TABLE IF NOT EXISTS document_vault (id TEXT PRIMARY KEY, document_title TEXT, reference_type TEXT, reference_id TEXT, file_path_or_base64 TEXT, qr_verification_hash TEXT, expiry_date TEXT, created_at TEXT DEFAULT (datetime('now')))",
      "CREATE TABLE IF NOT EXISTS audit_trail_logs (id TEXT PRIMARY KEY, user_id TEXT, user_name TEXT, action_type TEXT, module_name TEXT, entity_id TEXT, description TEXT, ip_address TEXT, created_at TEXT DEFAULT (datetime('now')))",
      "CREATE TABLE IF NOT EXISTS whatsapp_templates (id TEXT PRIMARY KEY, template_key TEXT UNIQUE, message_body TEXT, created_at TEXT DEFAULT (datetime('now')))",
      "CREATE TABLE IF NOT EXISTS tax_rules (id TEXT PRIMARY KEY, tax_name TEXT, tax_percentage REAL, applies_to TEXT, created_at TEXT DEFAULT (datetime('now')))",
      "CREATE TABLE IF NOT EXISTS sync_queue (id TEXT PRIMARY KEY, action_type TEXT, target_table TEXT, payload_json TEXT, status TEXT DEFAULT 'PENDING', retry_count INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))",
      "CREATE TABLE IF NOT EXISTS agency_settings (id TEXT PRIMARY KEY DEFAULT 'MAIN_SETTINGS', agency_name TEXT DEFAULT 'Real Estate Enterprise', tagline TEXT, phone_primary TEXT, whatsapp_number TEXT, address TEXT, currency_symbol TEXT DEFAULT 'Rs.', logo_url_or_base64 TEXT, local_backup_folder_path TEXT, turso_db_url TEXT, turso_sync_status TEXT DEFAULT 'DISCONNECTED', created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))",
      "CREATE TABLE IF NOT EXISTS plazas (id TEXT PRIMARY KEY, branch_id TEXT, plaza_name TEXT, city_location TEXT, total_floors INTEGER, created_at TEXT DEFAULT (datetime('now')))",
      "CREATE TABLE IF NOT EXISTS plaza_units (id TEXT PRIMARY KEY, plaza_id TEXT, floor_level TEXT, unit_number TEXT, covered_area_sqft REAL, rate_per_sqft REAL, target_price REAL, status TEXT DEFAULT 'AVAILABLE', created_at TEXT DEFAULT (datetime('now')))",
      "CREATE TABLE IF NOT EXISTS site_visits (id TEXT PRIMARY KEY, lead_id TEXT, plot_id TEXT, visit_date TEXT, status TEXT DEFAULT 'SCHEDULED', feedback_notes TEXT, created_at TEXT DEFAULT (datetime('now')))",
      "CREATE TABLE IF NOT EXISTS staff_users (id TEXT PRIMARY KEY, username TEXT UNIQUE, password_hash TEXT, full_name TEXT, role TEXT DEFAULT 'STAFF', branch_id TEXT, pin_code TEXT, pin_hash TEXT, is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')))",
      "CREATE TABLE IF NOT EXISTS materials (id TEXT PRIMARY KEY, project_id TEXT, item_name TEXT, unit TEXT, quantity_in_stock REAL DEFAULT 0, min_stock_alert REAL DEFAULT 0, unit_cost REAL DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))",
      "CREATE TABLE IF NOT EXISTS material_usages (id TEXT PRIMARY KEY, material_id TEXT, project_id TEXT, quantity_used REAL, used_by TEXT, notes TEXT, created_at TEXT DEFAULT (datetime('now')))",
      "CREATE TABLE IF NOT EXISTS office_expenses (id TEXT PRIMARY KEY, branch_id TEXT, category TEXT NOT NULL, description TEXT, amount REAL NOT NULL, date TEXT, recurring INTEGER DEFAULT 0, recurring_frequency TEXT, payment_method TEXT DEFAULT 'CASH', approved_by TEXT, expense_date TEXT, created_at TEXT DEFAULT (datetime('now')))",
      "CREATE TABLE IF NOT EXISTS fixed_assets (id TEXT PRIMARY KEY, branch_id TEXT, asset_name TEXT NOT NULL, asset_type TEXT, category TEXT, purchase_price REAL DEFAULT 0, purchase_date TEXT, useful_life_years INTEGER DEFAULT 5, salvage_value REAL DEFAULT 0, depreciation_method TEXT DEFAULT 'STRAIGHT_LINE', annual_depreciation REAL DEFAULT 0, current_book_value REAL DEFAULT 0, depreciation_rate REAL DEFAULT 0, status TEXT DEFAULT 'ACTIVE', created_at TEXT DEFAULT (datetime('now')))",
      "CREATE TABLE IF NOT EXISTS kyc_registry (id TEXT PRIMARY KEY, party_type TEXT, party_id TEXT, person_type TEXT, full_name TEXT, cnic TEXT, cnic_number TEXT, phone_number TEXT, address TEXT, email TEXT, verified INTEGER DEFAULT 0, cnic_expiry TEXT, address_proof TEXT, photo_url TEXT, status TEXT DEFAULT 'PENDING', verified_at TEXT, created_at TEXT DEFAULT (datetime('now')))",
      "CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, title TEXT, doc_type TEXT, document_type TEXT, description TEXT, reference_type TEXT, reference_id TEXT, related_person_id TEXT, related_plot_id TEXT, expiry_date TEXT, file_path TEXT, file_base64 TEXT, uploaded_by TEXT, created_at TEXT DEFAULT (datetime('now')))",
      "CREATE TABLE IF NOT EXISTS branch_sync_queue (id TEXT PRIMARY KEY, branch_id TEXT, source_branch_id TEXT, target_branch_id TEXT, action_type TEXT, table_name TEXT, record_id TEXT, target_table TEXT, payload_json TEXT, status TEXT DEFAULT 'PENDING', retry_count INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))",
      "CREATE TABLE IF NOT EXISTS cash_denominations (id TEXT PRIMARY KEY, cash_counter_id TEXT, notes_5000 INTEGER DEFAULT 0, notes_1000 INTEGER DEFAULT 0, notes_500 INTEGER DEFAULT 0, notes_100 INTEGER DEFAULT 0, notes_50 INTEGER DEFAULT 0, notes_20 INTEGER DEFAULT 0, notes_10 INTEGER DEFAULT 0, total_calculated REAL, created_at TEXT DEFAULT (datetime('now')))",
      "CREATE TABLE IF NOT EXISTS construction_material_stock (id TEXT PRIMARY KEY, project_id TEXT, item_name TEXT, unit TEXT, quantity_in_stock REAL, min_stock_alert REAL, unit_cost REAL)",
      "CREATE TABLE IF NOT EXISTS construction_material_logs (id TEXT PRIMARY KEY, project_id TEXT, material_id TEXT, quantity_used REAL, notes TEXT, created_at TEXT DEFAULT (datetime('now')))",
      "CREATE TABLE IF NOT EXISTS digikhata_transactions (id TEXT PRIMARY KEY, party_id TEXT NOT NULL, amount REAL NOT NULL, transaction_type TEXT NOT NULL, payment_mode TEXT NOT NULL, note TEXT, created_at TEXT DEFAULT (datetime('now')))",
      "CREATE TABLE IF NOT EXISTS system_settings (setting_key TEXT PRIMARY KEY, setting_value TEXT NOT NULL, updated_at TEXT DEFAULT (datetime('now')))",
      "CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, title TEXT NOT NULL, message TEXT NOT NULL, type TEXT DEFAULT 'INFO', is_read INTEGER DEFAULT 0, module TEXT, link TEXT, created_at TEXT DEFAULT (datetime('now')))",
      "CREATE TABLE IF NOT EXISTS expenses (id TEXT PRIMARY KEY, branch_id TEXT, category TEXT NOT NULL, description TEXT, amount REAL NOT NULL, payment_mode TEXT DEFAULT 'CASH', approved_by TEXT, expense_date TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')))",
      "CREATE TABLE IF NOT EXISTS whatsapp_logs (id TEXT PRIMARY KEY, template_id TEXT, recipient_phone TEXT, message_body TEXT, api_device_key TEXT, status TEXT DEFAULT 'PENDING', sent_at TEXT, created_at TEXT DEFAULT (datetime('now')))",
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
      "CREATE INDEX IF NOT EXISTS idx_kyc_verified ON kyc_registry(verified)",
    ];

    console.log('[Web] Ensuring all database tables exist...');
    await tursoExecuteMulti(tablesToEnsure.map(sql => ({ sql })));
    console.log('[Web] All tables ensured.');

    // ALTER TABLE migrations — PRAGMA-checked to avoid duplicate column errors
    async function safeAddColumn(table: string, column: string, definition: string): Promise<void> {
      try {
        const res = await tursoExecute(`PRAGMA table_info(${table})`);
        const cols = (res.rows || []).map((r: Record<string, unknown>) => String(r.name || ''));
        if (!cols.includes(column)) {
          await tursoExecute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
        }
      } catch {
        // Table might not exist yet — safe to ignore
      }
    }

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
      // Agency settings (new columns from migrations.ts alignment)
      ["agency_settings", "logo_url_or_base64", "TEXT DEFAULT ''"],
      ["agency_settings", "local_backup_folder_path", "TEXT DEFAULT ''"],
      ["agency_settings", "turso_db_url", "TEXT DEFAULT ''"],
      ["agency_settings", "turso_sync_status", "TEXT DEFAULT 'DISCONNECTED'"],
      // Installment payments — ensure schedule_id + amount exist (stale queued offline
      // writes reference these columns; a missing column throws "has no column named schedule_id")
      ["installment_payments", "schedule_id", "TEXT"],
      ["installment_payments", "amount", "REAL DEFAULT 0"],
      ["installment_payments", "amount_paid", "REAL DEFAULT 0"],
      ["installment_payments", "plot_id", "TEXT"],
    ];
    for (const [table, column, definition] of alterMigrations) {
      await safeAddColumn(table, column, definition);
    }

    // Drop and recreate investor tables if schema is outdated
    // This handles legacy 'target_capital' column and partial migration states
    try {
      const checkRes = await tursoExecute("PRAGMA table_info(investor_pools)");
      const poolCols = (checkRes.rows || []).map((r: Record<string, unknown>) => String(r.name || ''));
      const hasTargetCapital = poolCols.includes('target_capital');
      const hasTotalTargetCapital = poolCols.includes('total_target_capital');

      // Case 1: Old schema with only 'target_capital' (no 'total_target_capital') — full recreate
      if (hasTargetCapital && !hasTotalTargetCapital) {
        console.log('[Web] Detected outdated investor_pools schema (target_capital only) — recreating...');
        await tursoExecute("DROP TABLE IF EXISTS investor_payouts");
        await tursoExecute("DROP TABLE IF EXISTS dividend_distributions");
        await tursoExecute("DROP TABLE IF EXISTS investors");
        await tursoExecute("DROP TABLE IF EXISTS investor_pools");
        await tursoExecuteMulti([
          { sql: "CREATE TABLE IF NOT EXISTS investor_pools (id TEXT PRIMARY KEY, branch_id TEXT, pool_name TEXT NOT NULL, project_type TEXT DEFAULT 'LAND', total_target_capital REAL DEFAULT 0, raised_capital REAL DEFAULT 0, status TEXT DEFAULT 'ACTIVE', description TEXT, created_at TEXT DEFAULT (datetime('now')))" },
          { sql: "CREATE TABLE IF NOT EXISTS investors (id TEXT PRIMARY KEY, pool_id TEXT NOT NULL, investor_name TEXT NOT NULL, phone_number TEXT, cnic TEXT, contributed_amount REAL DEFAULT 0, equity_percentage REAL DEFAULT 0, total_payout_received REAL DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))" },
          { sql: "CREATE TABLE IF NOT EXISTS dividend_distributions (id TEXT PRIMARY KEY, pool_id TEXT NOT NULL, investor_id TEXT NOT NULL, investor_name TEXT NOT NULL, profit_amount REAL NOT NULL, distribution_date TEXT, created_at TEXT DEFAULT (datetime('now')))" },
          { sql: "CREATE TABLE IF NOT EXISTS investor_payouts (id TEXT PRIMARY KEY, pool_id TEXT NOT NULL, investor_id TEXT NOT NULL, amount_paid REAL DEFAULT 0, payout_date TEXT, payment_mode TEXT DEFAULT 'CASH', notes TEXT, created_at TEXT DEFAULT (datetime('now')))" },
        ]);
        console.log('[Web] Investor tables recreated with new schema.');
      }
      // Case 2: Both columns exist (corrupted/partial migration state) — recreate to clean up old column
      else if (hasTargetCapital && hasTotalTargetCapital) {
        console.log('[Web] Detected investor_pools with both target_capital and total_target_capital columns — cleaning up...');
        await tursoExecute("DROP TABLE IF EXISTS investor_payouts");
        await tursoExecute("DROP TABLE IF EXISTS dividend_distributions");
        await tursoExecute("DROP TABLE IF EXISTS investors");
        await tursoExecute("DROP TABLE IF EXISTS investor_pools");
        await tursoExecuteMulti([
          { sql: "CREATE TABLE IF NOT EXISTS investor_pools (id TEXT PRIMARY KEY, branch_id TEXT, pool_name TEXT NOT NULL, project_type TEXT DEFAULT 'LAND', total_target_capital REAL DEFAULT 0, raised_capital REAL DEFAULT 0, status TEXT DEFAULT 'ACTIVE', description TEXT, created_at TEXT DEFAULT (datetime('now')))" },
          { sql: "CREATE TABLE IF NOT EXISTS investors (id TEXT PRIMARY KEY, pool_id TEXT NOT NULL, investor_name TEXT NOT NULL, phone_number TEXT, cnic TEXT, contributed_amount REAL DEFAULT 0, equity_percentage REAL DEFAULT 0, total_payout_received REAL DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))" },
          { sql: "CREATE TABLE IF NOT EXISTS dividend_distributions (id TEXT PRIMARY KEY, pool_id TEXT NOT NULL, investor_id TEXT NOT NULL, investor_name TEXT NOT NULL, profit_amount REAL NOT NULL, distribution_date TEXT, created_at TEXT DEFAULT (datetime('now')))" },
          { sql: "CREATE TABLE IF NOT EXISTS investor_payouts (id TEXT PRIMARY KEY, pool_id TEXT NOT NULL, investor_id TEXT NOT NULL, amount_paid REAL DEFAULT 0, payout_date TEXT, payment_mode TEXT DEFAULT 'CASH', notes TEXT, created_at TEXT DEFAULT (datetime('now')))" },
        ]);
        console.log('[Web] Investor tables cleaned up (removed legacy target_capital column).');
      }
    } catch (e) {
      console.warn('[Web] Investor schema check/recreation failed (non-blocking):', e);
    }

    await tursoExecuteMulti([
      { sql: "INSERT OR IGNORE INTO branches (id, branch_name, branch_code, city, address, phone_number, email, manager_name, is_active, status) VALUES ('BRANCH_MAIN', 'Head Office', 'MAIN-01', 'Lahore', '', '', '', '', 1, 'ACTIVE')" },
      { sql: "INSERT INTO users (id, username, password_hash, full_name, role, status, created_at) VALUES ('USER_ADMIN_001', 'dripp', '5821', 'System Administrator', 'ADMIN', 'ACTIVE', datetime('now')) ON CONFLICT(username) DO UPDATE SET password_hash = '5821', status = 'ACTIVE', role = 'ADMIN'" },
      { sql: "INSERT OR IGNORE INTO system_settings (setting_key, setting_value) VALUES ('whatsapp_sender_phone', '')" },
      { sql: "INSERT OR IGNORE INTO system_settings (setting_key, setting_value) VALUES ('whatsapp_api_device_key', '')" },
    ]);
    console.log('[Web] Admin user upserted: dripp / 5821');
  } catch (err) {
    console.error('[Web] Auto-seed failed (non-blocking):', err);
  }
}

function initWebApi(): WebApi {
  return {
    dbExecute: async (sql: string, args: unknown[] = []): Promise<DatabaseResponse> => {
      try {
        const result = await tursoExecute(sql, args);
        return { success: true, data: result };
      } catch (err) {
        console.error('[Web DB Execute Error]', err);
        // Queue ALL failed writes for offline replay
        const isWrite = /^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP)\b/i.test(sql);
        if (isWrite) {
          const item: OfflineQueueItem = {
            id: `OFF_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`,
            sql,
            args,
            timestamp: Date.now(),
          };
          await queueWriteToIndexedDB(item);
          console.log(`[Web] Write queued offline: ${sql.substring(0, 60)}`);
          return { success: true, data: { rows: [] } };
        }
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    },

    dbQuery: async <T = unknown>(sql: string, args: unknown[] = []): Promise<DatabaseResponse<T[]>> => {
      try {
        const result = await tursoExecute(sql, args);
        return { success: true, data: result.rows as unknown as T[] };
      } catch (err) {
        console.error('[Web DB Query Error]', err);
        // Queries return empty results when offline (never crash)
        return { success: true, data: [] as unknown as T[] };
      }
    },

    authenticate: async (username: string, pin: string): Promise<AuthResponse> => {
      try {
        const cleanUser = (username || '').trim().toLowerCase();
        const cleanPin = (pin || '').trim();
        if (!cleanUser || !cleanPin) {
          return { success: false, error: 'Username and password are required.' };
        }
        console.log(`[Web Auth] Attempt: username="${cleanUser}"`);

        // Emergency admin bypass
        if (cleanUser === 'dripp' && cleanPin === '5821') {
          console.log('[Web Auth] Emergency admin bypass');
          return {
            success: true,
            data: {
              token: `web_emergency_${Date.now()}`,
              user: { id: 'USER_ADMIN_001', username: 'dripp', fullName: 'System Administrator', role: 'ADMIN' },
            },
          };
        }

        // Try staff_users FIRST (bcrypt-hashed passwords)
        let result = await tursoExecute(
          'SELECT id, username, full_name, role, password_hash FROM staff_users WHERE LOWER(username) = ? AND is_active = 1 LIMIT 1',
          [cleanUser]
        );
        let isStaffUser = result.rows.length > 0;

        if (isStaffUser) {
          console.log(`[Web Auth] Found staff user: ${result.rows[0].username}`);
          const user = result.rows[0];
          const storedPassword = String(user.password_hash || '').trim();
          const passwordValid = await bcrypt.compare(cleanPin, storedPassword);
          console.log(`[Web Auth] Staff password valid: ${passwordValid}`);

          if (!passwordValid) {
            return { success: false, error: 'Invalid username or password.' };
          }

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

        // Fallback to users table (plaintext passwords for admin)
        result = await tursoExecute(
          'SELECT id, username, full_name, role, password_hash FROM users WHERE LOWER(username) = ? AND status = ? LIMIT 1',
          [cleanUser, 'ACTIVE']
        );

        if (result.rows.length === 0) {
          console.log('[Web Auth] User not found in any table');
          return { success: false, error: 'Invalid username or password.' };
        }

        const user = result.rows[0];
        const storedPassword = String(user.password_hash || '').trim();
        const passwordValid = storedPassword === cleanPin;
        console.log(`[Web Auth] Admin password valid: ${passwordValid}`);

        if (!passwordValid) {
          return { success: false, error: 'Invalid username or password.' };
        }

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
      } catch (err) {
        console.error('[Web Auth Error]', err);
        return { success: false, error: 'Authentication failed. Please try again.' };
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
            `<html><head><title>Receipt</title><style>body{font-family:monospace;padding:20px;}pre{white-space:pre-wrap;}</style></head><body><pre>${safeStr(receiptText).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre></body></html>`
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

    getNetworkStatus: async (): Promise<{ success: boolean; data?: { isOnline: boolean; lastSyncTime: string | null; queuedWrites: number }; error?: string }> => {
      const queued = await getAllQueuedWrites();
      return {
        success: true,
        data: { isOnline: webIsOnline, lastSyncTime: lastWebSyncTime, queuedWrites: queued.length },
      };
    },

    onNetworkStatusChange: (callback: (isOnline: boolean) => void) => {
      networkStatusCallbacks.push(callback);
      // Fire immediately with current status
      try { callback(webIsOnline); } catch { /* best effort */ }
    },

    subscribeToSyncUpdates: () => {
      // Trigger initial flush check
      if (webIsOnline) {
        flushWebOfflineQueue().catch(() => {});
      }
    },

    openExternalUrl: async (url: string): Promise<{ success: boolean; error?: string }> => {
      try {
        const safeUrl = (url || '').trim();
        if (!safeUrl) return { success: false, error: 'Empty URL' };
        if (safeUrl.startsWith('http://') || safeUrl.startsWith('https://') || safeUrl.startsWith('mailto:')) {
          window.open(safeUrl, '_blank');
          return { success: true };
        }
        return { success: false, error: 'Only http/https/mailto URLs are allowed' };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    },

    selectDirectory: async (): Promise<{ success: boolean; path?: string; canceled?: boolean }> => {
      // Web mode: use File System Access API if available
      try {
        if ('showDirectoryPicker' in window) {
          const dirHandle = await (window as any).showDirectoryPicker();
          return { success: true, path: dirHandle.name };
        }
        // Fallback: let user type path manually
        const path = prompt('Enter local database directory path:');
        if (path) {
          return { success: true, path };
        }
        return { success: false, canceled: true };
      } catch {
        return { success: false, canceled: true };
      }
    },

    // Image storage: uses IndexedDB for web mode (no filesystem access)
    saveImage: async (name: string, base64Data: string): Promise<{ success: boolean; path?: string; filename?: string; error?: string }> => {
      try {
        if (!base64Data || !name) {
          return { success: false, error: 'Missing name or image data' };
        }
        const IMAGE_DB_NAME = 'dripp_images';
        const IMAGE_STORE = 'images';
        const imgDb = await new Promise<IDBDatabase>((resolve, reject) => {
          const req = indexedDB.open(IMAGE_DB_NAME, 1);
          req.onupgradeneeded = (e) => {
            const db = (e.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(IMAGE_STORE)) {
              db.createObjectStore(IMAGE_STORE, { keyPath: 'id' });
            }
          };
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        const filename = `${name}_${Date.now()}.jpg`;
        await new Promise<void>((resolve, reject) => {
          const tx = imgDb.transaction(IMAGE_STORE, 'readwrite');
          tx.objectStore(IMAGE_STORE).put({ id: filename, data: base64Data, name });
          tx.oncomplete = () => { imgDb.close(); resolve(); };
          tx.onerror = () => { imgDb.close(); reject(tx.error); };
        });
        // Return the base64 data URL as the "path" so <img src={path}> works in web mode
        return { success: true, path: base64Data, filename };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    },

    getSyncStatus: async (): Promise<{ success: boolean; data?: { isOnline: boolean; lastSyncTime: string | null; syncInProgress: boolean; queuedWrites: number; localDbPath: string }; error?: string }> => {
      const queued = await getAllQueuedWrites();
      return {
        success: true,
        data: { isOnline: webIsOnline, lastSyncTime: lastWebSyncTime, syncInProgress: false, queuedWrites: queued.length, localDbPath: 'Turso HTTP (Web Mode)' },
      };
    },

    forceSync: async (): Promise<{ success: boolean; data?: { isOnline: boolean; lastSyncTime: string | null; queuedWrites: number }; error?: string }> => {
      if (!webIsOnline) return { success: false, error: 'Offline — cannot sync' };
      await flushWebOfflineQueue();
      const queued = await getAllQueuedWrites();
      lastWebSyncTime = new Date().toISOString();
      return { success: true, data: { isOnline: true, lastSyncTime: lastWebSyncTime, queuedWrites: queued.length } };
    },
  };
}

export function initWebDatabase(): void {
  if (typeof window !== 'undefined' && !(window as unknown as Record<string, unknown>).api) {
    (window as unknown as Record<string, unknown>).api = initWebApi();
    console.log('[Web] Turso HTTP adapter initialized for browser mode');
    autoSeedDatabase();
    // Flush any queued offline writes from previous sessions
    if (navigator.onLine) {
      flushWebOfflineQueue().catch(() => {});
    }
  }
}
