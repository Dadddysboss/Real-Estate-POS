import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'path';

const TURSO_DB_URL = process.env.TURSO_DATABASE_URL || 'libsql://real-estate-pos-huzaifabutt09.aws-ap-south-1.turso.io';
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN || 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODg4NjEwMjgsImlkIjoiMDFhMDdiZTItMDYwMS03NjIxLWIyMDktNzNkZTNkMTYwZDdmIiwia2lkIjoicVVqVFhOWG5fZkhzVEkybDFnOXZ2V25hYzNzT1RrX1ZpRjVpaDQyM3VlayIsInJpZCI6IjM5MmJlNTExLTBjYjMtNDU5MS05MzU1LTFkOTc5OGM4OGFhOSJ9.ndKoI3XG5L4300owBOVqRdFRaX_ZbvFCuOfAmrRpu8rxPXc0ekYT1JklRrdq9G-JdN0wRk3GdqvvxKsXoNZHCg';

function sanitizeParam(p: unknown): { type: string; value?: string } {
  if (p === undefined || p === null) return { type: 'null' };
  if (typeof p === 'number') return { type: 'text', value: String(Number.isNaN(p) ? 0 : p) };
  if (typeof p === 'boolean') return { type: 'text', value: p ? '1' : '0' };
  if (typeof p === 'object') return { type: 'text', value: JSON.stringify(p) };
  return { type: 'text', value: String(p) };
}

function sanitizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const key in row) {
    const val = row[key];
    if (val === null || val === undefined) {
      safe[key] = '';
    } else if (typeof val === 'object') {
      safe[key] = JSON.stringify(val);
    } else {
      safe[key] = val;
    }
  }
  return safe;
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
          args: args.map(sanitizeParam),
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
    return { rows: [] };
  }
  if (result.response.type === 'error') {
    throw new Error(result.response.message || 'Turso execution error');
  }
  const cols: string[] = (result.response.result?.cols || []).map((c: { name: string }) => c.name);
  const rawRows: unknown[][] = result.response.result?.rows || [];
  const rows = rawRows.map((row: unknown[]) => {
    const obj: Record<string, unknown> = {};
    cols.forEach((col: string, i: number) => {
      const cell = row[i];
      obj[col] = cell !== undefined && cell !== null && typeof cell === 'object' && (cell as Record<string, unknown>).value !== undefined
        ? (cell as Record<string, unknown>).value
        : cell ?? '';
    });
    return sanitizeRow(obj);
  });
  return { rows };
}

async function tursoExecuteMulti(requests: { sql: string; args?: unknown[] }[]): Promise<void> {
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
          args: (r.args || []).map(sanitizeParam),
        },
      })),
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Turso HTTP ${response.status}: ${text}`);
  }
}

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
  "CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, full_name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'STAFF', status TEXT NOT NULL DEFAULT 'ACTIVE', created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS branches (id TEXT PRIMARY KEY, branch_name TEXT NOT NULL, branch_code TEXT, city TEXT, status TEXT DEFAULT 'ACTIVE', created_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS cash_sessions (id TEXT PRIMARY KEY, branch_id TEXT, opened_by TEXT, opening_balance REAL DEFAULT 0, status TEXT DEFAULT 'OPEN', opened_at TEXT, closed_by TEXT, closing_balance REAL, expected_balance REAL, variance REAL, closed_at TEXT)",
  "CREATE TABLE IF NOT EXISTS inventory_plots (id TEXT PRIMARY KEY, branch_id TEXT, plot_number TEXT, society_name TEXT, block_phase TEXT, size_dimension TEXT, size_value REAL DEFAULT 0, size_unit TEXT DEFAULT 'Marla', category TEXT, feature_tags TEXT, purchase_date TEXT, purchase_price REAL, target_asking_price REAL, floor_price REAL, gps_coordinates TEXT, status TEXT DEFAULT 'AVAILABLE', construction_status TEXT DEFAULT 'NONE', notes TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS sales_transactions (id TEXT PRIMARY KEY, plot_id TEXT, buyer_name TEXT, buyer_phone TEXT, buyer_cnic TEXT, final_sale_price REAL, cost_basis REAL, development_costs REAL DEFAULT 0, agent_commission REAL DEFAULT 0, government_taxes REAL DEFAULT 0, net_profit_calculated REAL, payment_method TEXT, agent_id TEXT, sale_date TEXT, created_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS sale_payment_breakdowns (id TEXT PRIMARY KEY, sale_id TEXT NOT NULL, payment_method TEXT NOT NULL, transaction_ref TEXT, amount REAL NOT NULL, created_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS installment_plans (id TEXT PRIMARY KEY, plot_id TEXT, buyer_name TEXT, buyer_phone TEXT, buyer_cnic TEXT, total_sale_price REAL, down_payment REAL, plan_duration_months INTEGER, monthly_installment_amount REAL, start_date TEXT, due_day_of_month INTEGER, grace_period_days INTEGER DEFAULT 5, late_penalty_fee REAL DEFAULT 0, status TEXT DEFAULT 'ACTIVE', created_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS installment_schedules (id TEXT PRIMARY KEY, plan_id TEXT, installment_number INTEGER, due_date TEXT, amount_due REAL, amount_paid REAL DEFAULT 0, late_fine_charged REAL DEFAULT 0, discount_applied REAL DEFAULT 0, payment_date TEXT, payment_method TEXT, status TEXT DEFAULT 'PENDING', created_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS installment_payments (id TEXT PRIMARY KEY, plan_id TEXT NOT NULL, plot_id TEXT, amount_paid REAL NOT NULL, payment_date TEXT DEFAULT (datetime('now')), payment_mode TEXT DEFAULT 'CASH', receipt_no TEXT, created_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS digikhata_parties (id TEXT PRIMARY KEY, party_name TEXT, phone_number TEXT, party_type TEXT, current_balance REAL DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS digikhata_entries (id TEXT PRIMARY KEY, party_id TEXT, entry_type TEXT, amount REAL, description TEXT, due_date TEXT, attachment_url TEXT, created_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS agents (id TEXT PRIMARY KEY, agency_name TEXT, agent_name TEXT, phone_number TEXT, cnic TEXT, commission_type TEXT, commission_rate REAL, created_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS agent_commissions (id TEXT PRIMARY KEY, agent_id TEXT, transaction_id TEXT, commission_earned REAL, commission_paid REAL DEFAULT 0, balance_due REAL, status TEXT DEFAULT 'UNPAID', created_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS leads (id TEXT PRIMARY KEY, branch_id TEXT, prospect_name TEXT, phone_number TEXT, interested_category TEXT, budget_range REAL, lead_source TEXT, assigned_agent_id TEXT, pipeline_stage TEXT DEFAULT 'NEW_LEAD', priority TEXT DEFAULT 'WARM', created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS construction_expenses (id TEXT PRIMARY KEY, plot_id TEXT NOT NULL, sand_price REAL DEFAULT 0, bajri_price REAL DEFAULT 0, srya_price REAL DEFAULT 0, truck_price REAL DEFAULT 0, cement_price REAL DEFAULT 0, bricks_price REAL DEFAULT 0, labor_details TEXT, total_amount REAL NOT NULL, expense_date TEXT NOT NULL, notes TEXT, created_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS sync_queue (id TEXT PRIMARY KEY, action_type TEXT, target_table TEXT, payload_json TEXT, status TEXT DEFAULT 'PENDING', retry_count INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS office_expenses (id TEXT PRIMARY KEY, branch_id TEXT, category TEXT, description TEXT, amount REAL, payment_method TEXT DEFAULT 'CASH', approved_by TEXT, expense_date TEXT DEFAULT (datetime('now')), created_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS whatsapp_templates (id TEXT PRIMARY KEY, template_key TEXT UNIQUE, message_body TEXT, created_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS audit_trail_logs (id TEXT PRIMARY KEY, user_id TEXT, user_name TEXT, action_type TEXT, module_name TEXT, entity_id TEXT, description TEXT, ip_address TEXT, created_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS plazas (id TEXT PRIMARY KEY, branch_id TEXT, plaza_name TEXT, city_location TEXT, total_floors INTEGER, created_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS plaza_units (id TEXT PRIMARY KEY, plaza_id TEXT, floor_level TEXT, unit_number TEXT, covered_area_sqft REAL, rate_per_sqft REAL, target_price REAL, status TEXT DEFAULT 'AVAILABLE', created_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS investor_pools (id TEXT PRIMARY KEY, branch_id TEXT, pool_name TEXT, target_capital REAL, raised_capital REAL DEFAULT 0, status TEXT DEFAULT 'OPEN', created_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS investor_members (id TEXT PRIMARY KEY, pool_id TEXT, investor_name TEXT, phone TEXT, invested_amount REAL, equity_percentage REAL, total_payout_received REAL DEFAULT 0)",
  "CREATE TABLE IF NOT EXISTS land_acquisitions (id TEXT PRIMARY KEY, seller_name TEXT, seller_phone TEXT, seller_cnic TEXT, land_title_khata TEXT, total_agreed_price REAL, advance_paid REAL, debt_remaining REAL, acquisition_date TEXT, registry_doc_url TEXT, created_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS document_vault (id TEXT PRIMARY KEY, document_title TEXT, reference_type TEXT, reference_id TEXT, file_path_or_base64 TEXT, qr_verification_hash TEXT, expiry_date TEXT, created_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS agency_settings (id TEXT PRIMARY KEY DEFAULT 'MAIN_SETTINGS', agency_name TEXT DEFAULT 'Real Estate Enterprise', tagline TEXT, phone_primary TEXT, whatsapp_number TEXT, address TEXT, currency_symbol TEXT DEFAULT 'Rs.', created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS system_settings (setting_key TEXT PRIMARY KEY, setting_value TEXT NOT NULL, updated_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS expenses (id TEXT PRIMARY KEY, branch_id TEXT, category TEXT NOT NULL, description TEXT, amount REAL NOT NULL, payment_mode TEXT DEFAULT 'CASH', approved_by TEXT, expense_date TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS whatsapp_logs (id TEXT PRIMARY KEY, template_id TEXT, recipient_phone TEXT, message_body TEXT, api_device_key TEXT, status TEXT DEFAULT 'PENDING', sent_at TEXT, created_at TEXT DEFAULT (datetime('now')))",
  "CREATE INDEX IF NOT EXISTS idx_plots_status ON inventory_plots(status)",
  "CREATE INDEX IF NOT EXISTS idx_schedules_plan ON installment_schedules(plan_id)",
  "CREATE INDEX IF NOT EXISTS idx_digikhata_party ON digikhata_entries(party_id)",
];

async function initializeDatabase() {
  try {
    console.log('[Desktop] Ensuring all database tables exist...');
    await tursoExecuteMulti(TABLES_TO_ENSURE.map(sql => ({ sql })));
    console.log('[Desktop] All tables ensured.');

    // ALTER TABLE migrations for existing databases
    const alterMigrations = [
      "ALTER TABLE construction_expenses ADD COLUMN sand_price REAL DEFAULT 0",
      "ALTER TABLE construction_expenses ADD COLUMN bajri_price REAL DEFAULT 0",
      "ALTER TABLE construction_expenses ADD COLUMN srya_price REAL DEFAULT 0",
      "ALTER TABLE construction_expenses ADD COLUMN truck_price REAL DEFAULT 0",
      "ALTER TABLE construction_expenses ADD COLUMN cement_price REAL DEFAULT 0",
      "ALTER TABLE construction_expenses ADD COLUMN bricks_price REAL DEFAULT 0",
      "ALTER TABLE construction_expenses ADD COLUMN labor_details TEXT DEFAULT ''",
      "ALTER TABLE construction_expenses ADD COLUMN notes TEXT DEFAULT ''",
      "ALTER TABLE construction_expenses ADD COLUMN category TEXT DEFAULT 'MATERIAL'",
      "ALTER TABLE construction_expenses ADD COLUMN material_type TEXT DEFAULT ''",
      "ALTER TABLE construction_expenses ADD COLUMN item_name TEXT DEFAULT ''",
      "ALTER TABLE construction_expenses ADD COLUMN quantity REAL DEFAULT 1",
      "ALTER TABLE construction_expenses ADD COLUMN unit_price REAL DEFAULT 0",
      "ALTER TABLE construction_expenses ADD COLUMN rate REAL DEFAULT 0",
      "ALTER TABLE construction_expenses ADD COLUMN supplier_name TEXT DEFAULT ''",
      "ALTER TABLE construction_expenses ADD COLUMN labor_name TEXT DEFAULT ''",
    ];
    for (const migration of alterMigrations) {
      try { await tursoExecute(migration); } catch { /* column already exists */ }
    }

    await tursoExecuteMulti([
      { sql: "INSERT OR IGNORE INTO branches (id, branch_name, branch_code, city, status) VALUES ('BRANCH_MAIN', 'Head Office', 'MAIN-01', 'Lahore', 'ACTIVE')" },
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
  await initializeDatabase();

  ipcMain.handle('db:execute', async (_event, { sql, args }) => {
    try {
      const result = await tursoExecute(sql, args || []);
      return { success: true, data: result };
    } catch (err) {
      console.error('[Desktop DB Execute Error]', err);
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('db:query', async (_event, { sql, args }) => {
    try {
      const result = await tursoExecute(sql, args || []);
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

      const result = await tursoExecute(
        'SELECT id, username, full_name, role, password_hash FROM users WHERE LOWER(username) = ? AND status = ? LIMIT 1',
        [cleanUser, 'ACTIVE']
      );

      if (result.rows.length === 0) {
        console.log('[Desktop Auth] User not found in DB');
        if (cleanUser === 'dripp' && cleanPin === '5821') {
          console.log('[Desktop Auth] Emergency admin fallback granted');
          return {
            success: true,
            data: {
              token: `desktop_emergency_${Date.now()}`,
              user: { id: 'USER_ADMIN_001', username: 'dripp', fullName: 'System Administrator', role: 'ADMIN' },
            },
          };
        }
        return { success: false, error: 'Invalid username or password.' };
      }

      const user = result.rows[0];
      const storedPassword = String(user.password_hash || '').trim();
      console.log(`[Desktop Auth] User found: ${user.username}, password match: ${storedPassword === cleanPin}`);

      if (storedPassword !== cleanPin) {
        if (cleanUser === 'dripp' && cleanPin === '5821') {
          console.log('[Desktop Auth] Emergency admin fallback granted (password mismatch)');
          return {
            success: true,
            data: {
              token: `desktop_emergency_${Date.now()}`,
              user: { id: String(user.id), username: String(user.username), fullName: String(user.full_name), role: String(user.role) },
            },
          };
        }
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
      const cleanUser = (username || '').trim().toLowerCase();
      const cleanPin = (pin || '').trim();
      if (cleanUser === 'dripp' && cleanPin === '5821') {
        console.log('[Desktop Auth] Emergency admin fallback granted (DB error)');
        return {
          success: true,
          data: {
            token: `desktop_emergency_${Date.now()}`,
            user: { id: 'USER_ADMIN_001', username: 'dripp', fullName: 'System Administrator', role: 'ADMIN' },
          },
        };
      }
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('print:receipt', async (_event, receiptText: string) => {
    try {
      await printReceiptText(receiptText);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('cash:get-sessions', async (_event, branchId: string) => {
    try {
      const result = await tursoExecute(
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
      const open = await tursoExecute(
        `SELECT id FROM cash_sessions WHERE branch_id = ? AND status = 'OPEN' LIMIT 1`,
        [branchId]
      );
      if (open.rows.length > 0) {
        return { success: false, error: 'A cash drawer session is already OPEN for this branch.' };
      }
      const id = `SESS_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      await tursoExecute(
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
      await tursoExecute(
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

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
