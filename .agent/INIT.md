# INIT.md - Self-Initialization Procedure

## Project Environment Initialization

### 1. Prerequisites Verification
```bash
# Verify Node.js version (18+ required)
node --version

# Verify npm/pnpm
npm --version

# Verify Git
git --version
```

### 2. Project Setup Commands
```bash
# Navigate to project root
cd C:\Users\butte\Downloads\Real-Estate-POS

# Install dependencies
npm install

# Verify TypeScript configuration
npx tsc --noEmit

# Verify Vite + Electron build
npm run build

# Verify dev server starts
npm run dev
```

### 3. Database Initialization Sequence
```bash
# 1. Ensure .env exists with Turso credentials (or use local file:dripp_erp_local.db)
cp .env.example .env

# 2. Run database migrations (auto-executed on Electron app start via initializeLocalDatabase())
# Tables created per docs/4_Backend_Database_Schema.md:
# - users, auth_sessions, agency_settings, branches
# - cash_counter, cash_denominations
# - inventory_plots, plazas, plaza_units
# - leads, site_visits
# - land_acquisitions
# - agents, agent_commissions
# - sales_transactions
# - installment_plans, installment_schedules
# - digikhata_parties, digikhata_entries
# - investor_deals
# - construction_projects, construction_expenses, material_stock
# - office_expenses
# - document_vault
# - audit_logs
# - whatsapp_templates
# - tax_rules
# - sync_queue

# 3. Seed data verification (executed in initializeLocalDatabase):
# - Branch: 'BRANCH_MAIN' (Head Office, MAIN-01, Lahore)
# - User: 'USER_ADMIN_01' (dripp / bcrypt hash of 5821 / ADMIN)
# - Settings: 'MAIN_SETTINGS' (Dripp Real Estate & DigiKhata ERP, Rs.)
```

### 4. Electron + React + Tailwind + SQLite Stack Verification
```bash
# Verify Electron main process entry
# electron/main.ts → creates BrowserWindow, loads preload, registers IPC handlers

# Verify Preload bridge
# electron/preload.ts → contextBridge.exposeInMainWorld('api', { dbExecute, dbQuery, authenticate, onSyncStatusUpdate })

# Verify React entry
# src/main.tsx → React 18 createRoot, renders <App />

# Verify Tailwind config
# tailwind.config.js → content paths, brand/dark color extensions

# Verify SQLite client
# src/db/client.ts → @libsql/client with file:dripp_erp_local.db fallback
```

### 5. Documentation Integrity Check
```bash
# Verify all 10 spec files exist in docs/
ls docs/
# Expected:
# 1_Product_Requirements.md
# 2_Technical_Requirements.md
# 3_UI_UX_Design_System.md
# 4_Backend_Database_Schema.md
# 5_AI_Execution_Protocol.md
# 6_Phase1_Scaffolding.md
# 7_Phase2_Inventory_CRM.md
# 8_Phase3_Sales_DigiKhata.md
# 9_Phase4_Investor_Construction_Expenses.md
# 10_Phase5_Analytics_Audit_Sync.md
```

### 6. Agent Workflow Activation
```bash
# Verify .agent/ operational files exist
ls .agent/
# Expected:
# SYSTEM_RULES.md
# PROJECT_STATUS.md
# INIT.md
# REVIEW_CHECKLIST.md
```

### 7. Ready State Confirmation
When all above steps pass:
- TypeScript compiles with 0 errors
- Electron window opens with Auth Gate modal
- Database tables created and seeded
- IPC handlers registered
- Dev server running on VITE_DEV_SERVER_URL

**Status: READY TO EXECUTE PHASE 1 (Modules 1-3)**