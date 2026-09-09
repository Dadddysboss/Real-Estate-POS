# 4. Database Schema Blueprint & Data Architecture
**Project Name:** Real Estate POS & DigiKhata ERP (Master Security & Enterprise Edition)
**Database Engine:** Turso DB (libSQL / SQLite Dialect) + Client IndexedDB Cache
**Security Protocol:** 100% Parameterized Prepared Statements + Immutable Audit Logging

---

## 1. Governance & Data Modeling Rules

1. **Foreign Key Integrity:** All relationships must enforce strict `FOREIGN KEY` references with `ON DELETE RESTRICT` or `ON DELETE CASCADE` where applicable to prevent orphan records.
2. **Strict Parameterization:** No dynamic string concatenation is permitted in SQL execution. All queries must pass arguments via array bindings `?`.
3. **Data Types Standard:**
   - Primary Keys: `TEXT` storing UUID v4 or ULID strings.
   - Timestamps: `TEXT` storing ISO 8601 UTC strings (`YYYY-MM-DDTHH:MM:SS.SSSZ`).
   - Currency & Financial Amounts: `REAL` or `INTEGER` (storing minor units / exact numeric precision) to eliminate floating-point rounding errors.
   - Booleans: `INTEGER` (`1` for true, `0` for false).
   - JSON Objects & Arrays: `TEXT` parsed application-side.

---

## 2. Complete SQL DDL Schema Specification (20 Modules)

```sql
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
    branch_code TEXT UNIQUE NOT NULL,
    city TEXT NOT NULL,
    address TEXT,
    manager_id TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at TEXT NOT NULL,
    FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL
);

-- ============================================================================
-- MODULE 4: CASH COUNTER & PHYSICAL DENOMINATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS cash_counter (
    id TEXT PRIMARY KEY,
    branch_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('CASH_IN', 'CASH_OUT')),
    category TEXT NOT NULL, -- e.g., 'SALE_ADVANCE', 'OFFICE_EXPENSE', 'DIGIKHATA_SETTLEMENT'
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

-- ============================================================================
-- MODULE 5: INVENTORY MASTER CATALOG (PLOTS & PROPERTIES)
-- ============================================================================

CREATE TABLE IF NOT EXISTS inventory_plots (
    id TEXT PRIMARY KEY,
    branch_id TEXT NOT NULL,
    plot_number TEXT NOT NULL,
    society_name TEXT NOT NULL,
    block_phase TEXT NOT NULL,
    size_dimension TEXT NOT NULL, -- e.g., '5 Marla', '10 Marla', '1 Kanal'
    category TEXT NOT NULL CHECK (category IN ('RESIDENTIAL', 'COMMERCIAL', 'INDUSTRIAL', 'AGRICULTURAL')),
    feature_tags TEXT, -- JSON array string e.g., '["Corner","Park Facing"]'
    purchase_date TEXT NOT NULL,
    purchase_price REAL NOT NULL, -- Cost basis
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
    floor_level TEXT NOT NULL, -- e.g., 'BASEMENT', 'GROUND', '1ST_FLOOR'
    unit_number TEXT NOT NULL,
    covered_area_sqft REAL NOT NULL,
    rate_per_sqft REAL NOT NULL,
    target_price REAL NOT NULL,
    target_monthly_rent REAL DEFAULT 0,
    maintenance_fee REAL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'SOLD', 'RENTED', 'ON_HOLD')),
    created_at TEXT NOT NULL,
    FOREIGN KEY (plaza_id) REFERENCES plazas(id) ON DELETE CASCADE
);

-- ============================================================================
-- MODULE 7: CRM, LEADS & SITE VISITS
-- ============================================================================

CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY,
    prospect_name TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    interested_category TEXT,
    budget_range REAL,
    lead_source TEXT, -- 'FACEBOOK', 'WALK_IN', 'DEALER'
    assigned_agent_id TEXT,
    pipeline_stage TEXT NOT NULL DEFAULT 'NEW_LEAD' CHECK (pipeline_stage IN ('NEW_LEAD', 'CONTACTED', 'SITE_VISIT', 'NEGOTIATION', 'CLOSED_WON', 'CLOSED_LOST')),
    priority TEXT DEFAULT 'WARM' CHECK (priority IN ('HOT', 'WARM', 'COLD')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
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
    transaction_id TEXT NOT NULL, -- Links to sale
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

CREATE TABLE IF NOT EXISTS investor_deals (
    id TEXT PRIMARY KEY,
    plot_id TEXT NOT NULL,
    investor_party_id TEXT NOT NULL,
    capital_invested REAL NOT NULL,
    equity_share_percentage REAL NOT NULL,
    payout_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (payout_status IN ('PENDING', 'DISBURSED')),
    created_at TEXT NOT NULL,
    FOREIGN KEY (plot_id) REFERENCES inventory_plots(id) ON DELETE RESTRICT,
    FOREIGN KEY (investor_party_id) REFERENCES digikhata_parties(id) ON DELETE RESTRICT
);

-- ============================================================================
-- MODULE 14: SITE CONSTRUCTION & MATERIAL STOCK TRACKER
-- ============================================================================

CREATE TABLE IF NOT EXISTS construction_projects (
    id TEXT PRIMARY KEY,
    project_name TEXT NOT NULL,
    linked_plot_or_society TEXT,
    estimated_budget REAL NOT NULL,
    total_spent REAL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS construction_expenses (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    expense_type TEXT NOT NULL CHECK (expense_type IN ('MATERIAL', 'LABOR', 'MISC')),
    vendor_name TEXT,
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    receipt_photo_url TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES construction_projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS material_stock (
    id TEXT PRIMARY KEY,
    material_name TEXT NOT NULL, -- 'CEMENT', 'STEEL', 'BRICKS'
    quantity_in_stock REAL NOT NULL,
    unit_measure TEXT NOT NULL, -- 'BAGS', 'TONS', 'UNITS'
    last_purchased_rate REAL NOT NULL,
    updated_at TEXT NOT NULL
);

-- ============================================================================
-- MODULE 15: DAILY OPERATIONAL EXPENSES
-- ============================================================================

CREATE TABLE IF NOT EXISTS office_expenses (
    id TEXT PRIMARY KEY,
    branch_id TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('UTILITY_BILLS', 'SALARIES', 'TEA_FOOD', 'MARKETING', 'SOFTWARE', 'MISC')),
    amount REAL NOT NULL,
    description TEXT NOT NULL,
    payment_method TEXT NOT NULL,
    expense_date TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
);

-- ============================================================================
-- MODULE 16: LEGAL VAULT & KYC REGISTRY
-- ============================================================================

CREATE TABLE IF NOT EXISTS document_vault (
    id TEXT PRIMARY KEY,
    document_title TEXT NOT NULL,
    reference_type TEXT NOT NULL, -- 'PLOT', 'BUYER', 'SELLER', 'CONSTRUCTION'
    reference_id TEXT NOT NULL,
    file_path_or_base64 TEXT NOT NULL,
    qr_verification_hash TEXT UNIQUE NOT NULL,
    expiry_date TEXT,
    created_at TEXT NOT NULL
);

-- ============================================================================
-- MODULE 17: SYSTEM AUDIT LOGS & ANTI-TAMPER STREAM
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    action TEXT NOT NULL,
    module TEXT NOT NULL,
    details TEXT NOT NULL,
    ip_address TEXT,
    created_at TEXT NOT NULL
);

-- ============================================================================
-- MODULE 18: WHATSAPP TEMPLATES & AUTOMATION LOGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS whatsapp_templates (
    id TEXT PRIMARY KEY,
    template_key TEXT UNIQUE NOT NULL, -- 'INSTALLMENT_REMINDER', 'SALE_RECEIPT', 'DIGIKHATA_STATEMENT'
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
    applies_to TEXT NOT NULL, -- 'BUYER', 'SELLER'
    created_at TEXT NOT NULL
);

-- ============================================================================
-- MODULE 20: OFFLINE SYNC QUEUE
-- ============================================================================

CREATE TABLE IF NOT EXISTS sync_queue (
    id TEXT PRIMARY KEY,
    action_type TEXT NOT NULL, -- 'INSERT', 'UPDATE', 'DELETE'
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
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
3. Initial Default Seed Data Script
The following SQL statement MUST run during the initial application setup script to seed default credentials, main branch, and default configuration parameters:

SQL
-- Seed Default Branch
INSERT OR IGNORE INTO branches (id, branch_name, branch_code, city, status, created_at)
VALUES ('BRANCH_MAIN', 'Head Office', 'MAIN-01', 'Lahore', 'ACTIVE', CURRENT_TIMESTAMP);

-- Seed Initial Super Admin Credentials (Username: dripp, Password: 5821 - bcrypt hash)
INSERT OR IGNORE INTO users (id, username, password_hash, full_name, role, status, created_at, updated_at)
VALUES (
    'USER_ADMIN_01',
    'dripp',
    '$2a$12$e6O.I/X0XyIe0N7.3Z9m0u2E3sJkXmZ.B5u4L8Y1R0nO9L2X4Q.2a', -- Hashed representation of '5821'
    'System Administrator',
    'ADMIN',
    'ACTIVE',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);

-- Seed Agency Settings
INSERT OR IGNORE INTO agency_settings (id, agency_name, currency_symbol, created_at, updated_at)
VALUES ('MAIN_SETTINGS', 'Dripp Real Estate & DigiKhata ERP', 'Rs.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);