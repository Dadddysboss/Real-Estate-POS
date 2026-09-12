import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron';
import path from 'path';
import fs from 'fs';

function logToFile(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try {
    const logPath = path.join(app.getPath('userData'), 'crash.log');
    fs.appendFileSync(logPath, line, 'utf-8');
  } catch { /* best effort */ }
  console.log(msg);
}

const TURSO_DB_URL = process.env.TURSO_DATABASE_URL || 'libsql://real-estate-pos-huzaifabutt09.aws-ap-south-1.turso.io';
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN || 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODg4NjEwMjgsImlkIjoiMDFhMDdiZTItMDYwMS03NjIxLWIyMDktNzNkZTNkMTYwZDdmIiwia2lkIjoicVVqVFhOWG5fZkhzVEkybDFnOXZ2V25hYzNzT1RrX1ZpRjVpaDQyM3VlayIsInJpZCI6IjM5MmJlNTExLTBjYjMtNDU5MS05MzU1LTFkOTc5OGM4OGFhOSJ9.ndKoI3XG5L4300owBOVqRdFRaX_ZbvFCuOfAmrRpu8rxPXc0ekYT1JklRrdq9G-JdN0wRk3GdqvvxKsXoNZHCg';

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
    console.log('[Turso] Empty result for:', sql.substring(0, 60), JSON.stringify(data).substring(0, 200));
    return { rows: [] };
  }
  if (result.response.type === 'error') {
    throw new Error(result.response.message || 'Turso execution error');
  }
  if (sql.toUpperCase().includes('INVESTOR_POOLS')) {
    console.log('[Turso] investor_pools response type:', result.response.type, 'result keys:', Object.keys(result.response.result || {}));
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
  "CREATE TABLE IF NOT EXISTS branches (id TEXT PRIMARY KEY, branch_name TEXT NOT NULL, branch_code TEXT, city TEXT, status TEXT DEFAULT 'ACTIVE', created_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS cash_sessions (id TEXT PRIMARY KEY, branch_id TEXT, opened_by TEXT, opening_balance REAL DEFAULT 0, status TEXT DEFAULT 'OPEN', opened_at TEXT, closed_by TEXT, closing_balance REAL, expected_balance REAL, variance REAL, closed_at TEXT)",
  "CREATE TABLE IF NOT EXISTS cash_counter (id TEXT PRIMARY KEY, branch_id TEXT, user_id TEXT, transaction_type TEXT, category TEXT, amount REAL, notes TEXT, handed_over_by TEXT, received_by TEXT, created_at TEXT DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS inventory_plots (id TEXT PRIMARY KEY, branch_id TEXT, plot_number TEXT, society_name TEXT, block_phase TEXT, size_dimension TEXT, size_value REAL DEFAULT 0, size_unit TEXT DEFAULT 'Marla', category TEXT, feature_tags TEXT, purchase_date TEXT, purchase_price REAL, target_asking_price REAL, floor_price REAL, gps_coordinates TEXT, status TEXT DEFAULT 'AVAILABLE', construction_status TEXT DEFAULT 'NONE', notes TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))",
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
  "CREATE TABLE IF NOT EXISTS land_acquisitions (id TEXT PRIMARY KEY, seller_name TEXT, seller_phone TEXT, seller_cnic TEXT, land_title_khata TEXT, total_agreed_price REAL, advance_paid REAL, debt_remaining REAL, acquisition_date TEXT, registry_doc_url TEXT, created_at TEXT DEFAULT (datetime('now')))",
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
  "CREATE TABLE IF NOT EXISTS branch_sync_queue (id TEXT PRIMARY KEY, branch_id TEXT, action_type TEXT, target_table TEXT, payload_json TEXT, status TEXT DEFAULT 'PENDING', retry_count INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))",
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
  "CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(pipeline_stage)",
  "CREATE INDEX IF NOT EXISTS idx_schedules_plan ON installment_schedules(plan_id)",
  "CREATE INDEX IF NOT EXISTS idx_digikhata_party ON digikhata_entries(party_id)",
  "CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)",
];

async function initializeDatabase() {
  try {
    console.log('[Desktop] Ensuring all database tables exist...');
    await tursoExecuteMulti(TABLES_TO_ENSURE.map(sql => ({ sql })));
    console.log('[Desktop] All tables ensured.');

    // ALTER TABLE migrations for existing databases — IDENTICAL to webAdapter.ts
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
      // Investor pools — align old DBs with new schema
      "ALTER TABLE investor_pools ADD COLUMN total_target_capital REAL DEFAULT 0",
      "ALTER TABLE investor_pools ADD COLUMN description TEXT DEFAULT ''",
      "ALTER TABLE investor_pools ADD COLUMN branch_id TEXT",
      "ALTER TABLE investor_pools ADD COLUMN project_type TEXT DEFAULT 'LAND'",
      // Office expenses — align with service schema
      "ALTER TABLE office_expenses ADD COLUMN recurring INTEGER DEFAULT 0",
      "ALTER TABLE office_expenses ADD COLUMN recurring_frequency TEXT",
      "ALTER TABLE office_expenses ADD COLUMN date TEXT",
      // Fixed assets — align with service schema
      "ALTER TABLE fixed_assets ADD COLUMN category TEXT",
      "ALTER TABLE fixed_assets ADD COLUMN purchase_price REAL DEFAULT 0",
      "ALTER TABLE fixed_assets ADD COLUMN useful_life_years INTEGER DEFAULT 5",
      "ALTER TABLE fixed_assets ADD COLUMN salvage_value REAL DEFAULT 0",
      "ALTER TABLE fixed_assets ADD COLUMN depreciation_method TEXT DEFAULT 'STRAIGHT_LINE'",
      "ALTER TABLE fixed_assets ADD COLUMN annual_depreciation REAL DEFAULT 0",
      "ALTER TABLE fixed_assets ADD COLUMN current_book_value REAL DEFAULT 0",
      // KYC registry — align with service schema
      "ALTER TABLE kyc_registry ADD COLUMN person_type TEXT",
      "ALTER TABLE kyc_registry ADD COLUMN full_name TEXT",
      "ALTER TABLE kyc_registry ADD COLUMN cnic TEXT",
      "ALTER TABLE kyc_registry ADD COLUMN phone_number TEXT",
      "ALTER TABLE kyc_registry ADD COLUMN address TEXT",
      "ALTER TABLE kyc_registry ADD COLUMN email TEXT",
      "ALTER TABLE kyc_registry ADD COLUMN verified INTEGER DEFAULT 0",
      // Documents — align with service schema
      "ALTER TABLE documents ADD COLUMN document_type TEXT",
      "ALTER TABLE documents ADD COLUMN description TEXT",
      "ALTER TABLE documents ADD COLUMN related_person_id TEXT",
      "ALTER TABLE documents ADD COLUMN related_plot_id TEXT",
      "ALTER TABLE documents ADD COLUMN expiry_date TEXT",
      // Staff users — align with service schema
      "ALTER TABLE staff_users ADD COLUMN password_hash TEXT",
      "ALTER TABLE staff_users ADD COLUMN pin_hash TEXT",
    ];
    for (const migration of alterMigrations) {
      try { await tursoExecute(migration); } catch { /* column already exists */ }
    }

    // Drop and recreate investor tables if schema is outdated
    // This handles the case where old tables had incompatible columns
    try {
      // Check if investor_pools has the old 'target_capital' column (not 'total_target_capital')
      const checkRes = await tursoExecute("PRAGMA table_info(investor_pools)");
      const poolCols = (checkRes.rows || []).map((r: Record<string, unknown>) => String(r.name || ''));
      if (poolCols.includes('target_capital') && !poolCols.includes('total_target_capital')) {
        console.log('[Desktop] Detected outdated investor_pools schema — recreating...');
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
        console.log('[Desktop] Investor tables recreated with new schema.');
      }
    } catch (e) {
      console.warn('[Desktop] Investor schema check/recreation failed (non-blocking):', e);
    }

    await tursoExecuteMulti([
      { sql: "CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, title TEXT NOT NULL, message TEXT NOT NULL, type TEXT DEFAULT 'INFO', is_read INTEGER DEFAULT 0, module TEXT, link TEXT, created_at TEXT DEFAULT (datetime('now')))" },
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
  logToFile('[Desktop] app.whenReady fired');

  try {
    logToFile('[Desktop] Initializing database...');
    await initializeDatabase();
    logToFile('[Desktop] Database initialized successfully');
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
        const result = await tursoExecute(sql, args || []);
        console.log(`[Desktop DB Execute] sql=${sql.substring(0, 80)} rows_affected=${JSON.stringify(result)}`);
        return { success: true, data: result };
      } catch (err) {
        console.error('[Desktop DB Execute Error]', err);
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    });

  ipcMain.handle('db:query', async (_event, { sql, args }) => {
    try {
      const result = await tursoExecute(sql, args || []);
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
