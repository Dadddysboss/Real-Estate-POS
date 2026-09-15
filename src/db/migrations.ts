import { Client } from '@libsql/client';

const MIGRATIONS = `
-- ============================================================================
-- MODULE 1: AUTHENTICATION GATE, RBAC & SESSIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('ADMIN', 'MANAGER', 'CASHIER')),
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    nonce TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================================================
-- MODULE 2: SYSTEM BRANDING & SETTINGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS agency_settings (
    id TEXT PRIMARY KEY DEFAULT 'MAIN_SETTINGS',
    agency_name TEXT NOT NULL DEFAULT 'Real Estate Enterprise',
    tagline TEXT,
    phone_primary TEXT,
    whatsapp_number TEXT,
    address TEXT,
    currency_symbol TEXT DEFAULT 'Rs.',
    logo_url_or_base64 TEXT,
    local_backup_folder_path TEXT,
    turso_db_url TEXT,
    turso_sync_status TEXT DEFAULT 'DISCONNECTED',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- ============================================================================
-- MODULE 3: MULTI-BRANCH MANAGEMENT
-- ============================================================================

CREATE TABLE IF NOT EXISTS branches (
    id TEXT PRIMARY KEY,
    branch_name TEXT NOT NULL,
    branch_code TEXT,
    city TEXT,
    address TEXT,
    phone_number TEXT,
    email TEXT,
    manager_name TEXT,
    is_active INTEGER DEFAULT 1,
    status TEXT DEFAULT 'ACTIVE',
    created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================================
-- MODULE 4: CASH COUNTER & PHYSICAL DENOMINATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS cash_counter (
    id TEXT PRIMARY KEY,
    branch_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('CASH_IN', 'CASH_OUT')),
    category TEXT NOT NULL,
    amount REAL NOT NULL,
    notes TEXT,
    handed_over_by TEXT,
    received_by TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS cash_denominations (
    id TEXT PRIMARY KEY,
    cash_counter_id TEXT UNIQUE NOT NULL,
    notes_5000 INTEGER DEFAULT 0,
    notes_1000 INTEGER DEFAULT 0,
    notes_500 INTEGER DEFAULT 0,
    notes_100 INTEGER DEFAULT 0,
    notes_50 INTEGER DEFAULT 0,
    notes_20 INTEGER DEFAULT 0,
    notes_10 INTEGER DEFAULT 0,
    total_calculated REAL NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (cash_counter_id) REFERENCES cash_counter(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS cash_sessions (
    id TEXT PRIMARY KEY,
    branch_id TEXT NOT NULL,
    opened_by TEXT NOT NULL,
    closed_by TEXT,
    opening_balance REAL NOT NULL,
    closing_balance REAL,
    expected_balance REAL,
    variance REAL,
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
    opened_at TEXT NOT NULL,
    closed_at TEXT,
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
    FOREIGN KEY (opened_by) REFERENCES users(id) ON DELETE RESTRICT,
    FOREIGN KEY (closed_by) REFERENCES users(id) ON DELETE SET NULL
);

-- ============================================================================
-- MODULE 5: INVENTORY MASTER CATALOG (PLOTS & PROPERTIES)
-- ============================================================================

CREATE TABLE IF NOT EXISTS inventory_plots (
    id TEXT PRIMARY KEY,
    branch_id TEXT NOT NULL,
    plot_number TEXT NOT NULL,
    society_name TEXT NOT NULL,
    block_phase TEXT NOT NULL,
    size_dimension TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('RESIDENTIAL', 'COMMERCIAL', 'INDUSTRIAL', 'AGRICULTURAL')),
    feature_tags TEXT,
    purchase_date TEXT NOT NULL,
    purchase_price REAL NOT NULL,
    target_asking_price REAL NOT NULL,
    floor_price REAL NOT NULL,
    gps_coordinates TEXT,
    status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'SOLD', 'ON_HOLD', 'UNDER_DEVELOPMENT', 'BOOKED')),
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
);

-- ============================================================================
-- MODULE 6: COMMERCIAL PLAZAS & MULTI-UNIT FLOOR HIERARCHY
-- ============================================================================

CREATE TABLE IF NOT EXISTS plazas (
    id TEXT PRIMARY KEY,
    branch_id TEXT NOT NULL,
    plaza_name TEXT NOT NULL,
    city_location TEXT NOT NULL,
    total_floors INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS plaza_units (
    id TEXT PRIMARY KEY,
    plaza_id TEXT NOT NULL,
    floor_level TEXT NOT NULL,
    unit_number TEXT NOT NULL,
    covered_area_sqft REAL NOT NULL,
    rate_per_sqft REAL NOT NULL,
    target_price REAL NOT NULL,
    target_monthly_rent REAL DEFAULT 0,
    maintenance_fee REAL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'SOLD', 'RENTED', 'ON_HOLD')),
    tenant_name TEXT,
    tenant_phone TEXT,
    lease_expiry_date TEXT,
    security_deposit REAL DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (plaza_id) REFERENCES plazas(id) ON DELETE CASCADE
);

-- ============================================================================
-- MODULE 7: CRM, LEADS & SITE VISITS
-- ============================================================================

CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY,
    branch_id TEXT NOT NULL,
    prospect_name TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    interested_category TEXT,
    budget_range REAL,
    lead_source TEXT,
    assigned_agent_id TEXT,
    pipeline_stage TEXT NOT NULL DEFAULT 'NEW_LEAD' CHECK (pipeline_stage IN ('NEW_LEAD', 'CONTACTED', 'SITE_VISIT', 'NEGOTIATION', 'CLOSED_WON', 'CLOSED_LOST')),
    priority TEXT DEFAULT 'WARM' CHECK (priority IN ('HOT', 'WARM', 'COLD')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_agent_id) REFERENCES agents(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS site_visits (
    id TEXT PRIMARY KEY,
    lead_id TEXT NOT NULL,
    plot_id TEXT,
    visit_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED', 'COMPLETED', 'CANCELLED')),
    feedback_notes TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
    FOREIGN KEY (plot_id) REFERENCES inventory_plots(id) ON DELETE SET NULL
);

-- ============================================================================
-- MODULE 8: LAND ACQUISITIONS & SELLER LEDGERS
-- ============================================================================

CREATE TABLE IF NOT EXISTS land_acquisitions (
    id TEXT PRIMARY KEY,
    seller_name TEXT NOT NULL,
    seller_phone TEXT NOT NULL,
    seller_cnic TEXT NOT NULL,
    land_title_khata TEXT NOT NULL,
    total_agreed_price REAL NOT NULL,
    advance_paid REAL NOT NULL,
    debt_remaining REAL NOT NULL,
    acquisition_date TEXT NOT NULL,
    registry_doc_url TEXT,
    created_at TEXT NOT NULL
);

-- ============================================================================
-- MODULE 9: AGENT NETWORK & BROKERAGE COMMISSIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    agency_name TEXT,
    agent_name TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    cnic TEXT,
    commission_type TEXT NOT NULL CHECK (commission_type IN ('PERCENTAGE', 'FIXED')),
    commission_rate REAL NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_commissions (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    transaction_id TEXT NOT NULL,
    commission_earned REAL NOT NULL,
    commission_paid REAL DEFAULT 0,
    balance_due REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'UNPAID' CHECK (status IN ('UNPAID', 'PARTIAL', 'PAID')),
    created_at TEXT NOT NULL,
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE RESTRICT
);

-- ============================================================================
-- MODULE 10: INSTANT SALES ENGINE
-- ============================================================================

CREATE TABLE IF NOT EXISTS sales_transactions (
    id TEXT PRIMARY KEY,
    plot_id TEXT UNIQUE NOT NULL,
    buyer_name TEXT NOT NULL,
    buyer_phone TEXT NOT NULL,
    buyer_cnic TEXT NOT NULL,
    final_sale_price REAL NOT NULL,
    cost_basis REAL NOT NULL,
    development_costs REAL DEFAULT 0,
    agent_commission REAL DEFAULT 0,
    government_taxes REAL DEFAULT 0,
    net_profit_calculated REAL NOT NULL,
    payment_method TEXT NOT NULL CHECK (payment_method IN ('CASH', 'BANK_TRANSFER', 'PAY_ORDER')),
    agent_id TEXT,
    sale_date TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (plot_id) REFERENCES inventory_plots(id) ON DELETE RESTRICT,
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL
);

-- ============================================================================
-- MODULE 10b: SALES DEALS (INSTANT PLOT SALE RECORDS)
-- ============================================================================

CREATE TABLE IF NOT EXISTS sales_deals (
  id TEXT PRIMARY KEY,
  plot_id TEXT NOT NULL,
  cash_counter_id TEXT,
  buyer_name TEXT NOT NULL,
  buyer_phone TEXT NOT NULL,
  buyer_cnic TEXT,
  total_deal_price REAL NOT NULL,
  down_payment REAL DEFAULT 0,
  balance_amount REAL DEFAULT 0,
  sales_agent TEXT,
  payment_mode TEXT DEFAULT 'CASH',
  sale_date TEXT NOT NULL,
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (plot_id) REFERENCES inventory_plots(id)
);

-- ============================================================================
-- MODULE 10c: CASH COUNTER TRANSACTION LOG
-- ============================================================================

CREATE TABLE IF NOT EXISTS cash_counter (
    id TEXT PRIMARY KEY,
    branch_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('INFLOW', 'OUTFLOW')),
    category TEXT NOT NULL,
    amount REAL NOT NULL,
    notes TEXT,
    handed_over_by TEXT,
    received_by TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
);

-- ============================================================================
-- MODULE 11: INSTALLMENT ENGINE & PAYMENT SCHEDULES
-- ============================================================================

CREATE TABLE IF NOT EXISTS installment_plans (
    id TEXT PRIMARY KEY,
    plot_id TEXT UNIQUE NOT NULL,
    buyer_name TEXT NOT NULL,
    buyer_phone TEXT NOT NULL,
    buyer_cnic TEXT NOT NULL,
    total_sale_price REAL NOT NULL,
    down_payment REAL NOT NULL,
    plan_duration_months INTEGER NOT NULL,
    monthly_installment_amount REAL NOT NULL,
    start_date TEXT NOT NULL,
    due_day_of_month INTEGER NOT NULL CHECK (due_day_of_month BETWEEN 1 AND 31),
    grace_period_days INTEGER DEFAULT 5,
    late_penalty_fee REAL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'COMPLETED', 'DEFAULTED')),
    created_at TEXT NOT NULL,
    FOREIGN KEY (plot_id) REFERENCES inventory_plots(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS installment_schedules (
    id TEXT PRIMARY KEY,
    plan_id TEXT NOT NULL,
    installment_number INTEGER NOT NULL,
    due_date TEXT NOT NULL,
    amount_due REAL NOT NULL,
    amount_paid REAL DEFAULT 0,
    late_fine_charged REAL DEFAULT 0,
    discount_applied REAL DEFAULT 0,
    payment_date TEXT,
    payment_method TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PAID', 'OVERDUE')),
    created_at TEXT NOT NULL,
    FOREIGN KEY (plan_id) REFERENCES installment_plans(id) ON DELETE CASCADE
);

-- ============================================================================
-- MODULE 12: DIGIKHATA DOUBLE-ENTRY PARTY LEDGER
-- ============================================================================

CREATE TABLE IF NOT EXISTS digikhata_parties (
    id TEXT PRIMARY KEY,
    party_name TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    party_type TEXT NOT NULL CHECK (party_type IN ('CUSTOMER', 'VENDOR', 'INVESTOR', 'AGENT', 'PARTNER')),
    current_balance REAL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS digikhata_entries (
    id TEXT PRIMARY KEY,
    party_id TEXT NOT NULL,
    entry_type TEXT NOT NULL CHECK (entry_type IN ('CREDIT_LENA', 'DEBIT_DENA')),
    amount REAL NOT NULL,
    description TEXT NOT NULL,
    due_date TEXT,
    attachment_url TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (party_id) REFERENCES digikhata_parties(id) ON DELETE CASCADE
);

-- ============================================================================
-- MODULE 13: INVESTOR POOLS & JOINT VENTURES
-- ============================================================================

CREATE TABLE IF NOT EXISTS investor_pools (
    id TEXT PRIMARY KEY,
    branch_id TEXT,
    pool_name TEXT NOT NULL,
    project_type TEXT DEFAULT 'LAND' CHECK (project_type IN ('LAND', 'PLAZA', 'SOCIETY', 'MIXED')),
    total_target_capital REAL NOT NULL DEFAULT 0,
    raised_capital REAL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('OPEN', 'ACTIVE', 'CLOSED', 'COMPLETED', 'LIQUIDATED')),
    description TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS investors (
    id TEXT PRIMARY KEY,
    pool_id TEXT NOT NULL,
    investor_name TEXT NOT NULL,
    phone_number TEXT,
    cnic TEXT,
    contributed_amount REAL DEFAULT 0,
    equity_percentage REAL DEFAULT 0,
    total_payout_received REAL DEFAULT 0,
    created_at TEXT,
    FOREIGN KEY (pool_id) REFERENCES investor_pools(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS dividend_distributions (
    id TEXT PRIMARY KEY,
    pool_id TEXT NOT NULL,
    investor_id TEXT NOT NULL,
    investor_name TEXT NOT NULL,
    profit_amount REAL NOT NULL,
    distribution_date TEXT,
    created_at TEXT,
    FOREIGN KEY (pool_id) REFERENCES investor_pools(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS investor_payouts (
    id TEXT PRIMARY KEY,
    pool_id TEXT NOT NULL,
    investor_id TEXT NOT NULL,
    amount_paid REAL DEFAULT 0,
    payout_date TEXT,
    payment_mode TEXT DEFAULT 'CASH',
    notes TEXT,
    created_at TEXT,
    FOREIGN KEY (pool_id) REFERENCES investor_pools(id) ON DELETE CASCADE,
    FOREIGN KEY (investor_id) REFERENCES investors(id) ON DELETE CASCADE
);

-- ============================================================================
-- MODULE 14: SITE CONSTRUCTION & MATERIAL STOCK TRACKER
-- ============================================================================

CREATE TABLE IF NOT EXISTS construction_projects (
    id TEXT PRIMARY KEY,
    branch_id TEXT NOT NULL,
    project_name TEXT NOT NULL,
    site_location TEXT NOT NULL,
    budget_allocated REAL NOT NULL,
    total_spent REAL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'PLANNING' CHECK (status IN ('PLANNING', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED')),
    created_at TEXT NOT NULL,
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS construction_material_stock (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    item_name TEXT NOT NULL,
    unit TEXT NOT NULL CHECK (unit IN ('BAGS', 'TONS', 'FEET', 'UNITS', 'KG')),
    quantity_in_stock REAL NOT NULL,
    min_stock_alert REAL NOT NULL,
    unit_cost REAL NOT NULL,
    FOREIGN KEY (project_id) REFERENCES construction_projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS construction_material_logs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    material_id TEXT NOT NULL,
    quantity_used REAL NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES construction_projects(id) ON DELETE CASCADE,
    FOREIGN KEY (material_id) REFERENCES construction_material_stock(id) ON DELETE CASCADE
);

-- ============================================================================
-- MODULE 15: DAILY OPERATIONAL EXPENSES
-- ============================================================================

CREATE TABLE IF NOT EXISTS daily_expenses (
    id TEXT PRIMARY KEY,
    branch_id TEXT NOT NULL,
    category_name TEXT NOT NULL,
    amount REAL NOT NULL,
    payment_source TEXT NOT NULL CHECK (payment_source IN ('CASH_DRAWER', 'BANK_ACCOUNT', 'PETTY_CASH')),
    approved_by TEXT NOT NULL,
    description TEXT NOT NULL,
    voucher_number TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
);

-- ============================================================================
-- MODULE 16: LEGAL VAULT & KYC REGISTRY
-- ============================================================================

CREATE TABLE IF NOT EXISTS document_vault (
    id TEXT PRIMARY KEY,
    document_title TEXT NOT NULL,
    reference_type TEXT NOT NULL,
    reference_id TEXT NOT NULL,
    file_path_or_base64 TEXT NOT NULL,
    qr_verification_hash TEXT UNIQUE NOT NULL,
    expiry_date TEXT,
    created_at TEXT NOT NULL
);

-- ============================================================================
-- MODULE 17: SYSTEM AUDIT LOGS & ANTI-TAMPER STREAM
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_trail_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    user_name TEXT,
    action_type TEXT NOT NULL CHECK (action_type IN ('CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'OVERRIDE', 'EXCEED_CREDIT')),
    module_name TEXT NOT NULL,
    entity_id TEXT,
    description TEXT NOT NULL,
    ip_address TEXT,
    created_at TEXT NOT NULL
);

-- ============================================================================
-- MODULE 18: WHATSAPP TEMPLATES & AUTOMATION LOGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS whatsapp_templates (
    id TEXT PRIMARY KEY,
    template_key TEXT UNIQUE NOT NULL,
    message_body TEXT NOT NULL,
    created_at TEXT NOT NULL
);

-- ============================================================================
-- MODULE 19: TAX & GOVERNMENT DUTY RULES
-- ============================================================================

CREATE TABLE IF NOT EXISTS tax_rules (
    id TEXT PRIMARY KEY,
    tax_name TEXT NOT NULL,
    tax_percentage REAL NOT NULL,
    applies_to TEXT NOT NULL CHECK (applies_to IN ('BUYER', 'SELLER')),
    created_at TEXT NOT NULL
);

-- ============================================================================
-- MODULE 20: OFFLINE SYNC QUEUE
-- ============================================================================

CREATE TABLE IF NOT EXISTS sync_queue (
    id TEXT PRIMARY KEY,
    action_type TEXT NOT NULL CHECK (action_type IN ('INSERT', 'UPDATE', 'DELETE')),
    target_table TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SYNCED', 'FAILED')),
    retry_count INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
);

-- ============================================================================
-- HIGH-PERFORMANCE INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_plots_status ON inventory_plots(status);
CREATE INDEX IF NOT EXISTS idx_plots_society ON inventory_plots(society_name);
CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(pipeline_stage);
CREATE INDEX IF NOT EXISTS idx_schedules_plan ON installment_schedules(plan_id);
CREATE INDEX IF NOT EXISTS idx_schedules_status ON installment_schedules(status);
CREATE INDEX IF NOT EXISTS idx_digikhata_party ON digikhata_entries(party_id);
CREATE INDEX IF NOT EXISTS idx_cash_branch ON cash_counter(branch_id);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_trail_logs(user_id);
`;

export async function runMigrations(client: Client) {
  const statements = MIGRATIONS
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  for (const statement of statements) {
    try {
      await client.execute(statement);
    } catch (error) {
      console.error('[Migration Error]', error);
      throw error;
    }
  }
}