# REVIEW_CHECKLIST.md - Automated/Manual Review Gates

## Pre-Commit Review Checklist (Run After Every Module)

### Type Safety & IPC Parameterization
- [ ] `npx tsc --noEmit` — **Zero errors** across entire codebase
- [ ] All `window.api` calls typed in `src/types/electron.d.ts`
- [ ] All component props have explicit interfaces (no implicit `any`)
- [ ] All service functions have typed parameters and return types
- [ ] Zod schemas defined for all API route request bodies

### SQL Parameterization Audit
- [ ] **Zero** raw string interpolation in database queries
- [ ] All queries use `?` positional bindings with array args
- [ ] Example compliant: `await db.execute({ sql: 'SELECT * FROM plots WHERE branch_id = ?', args: [branchId] })`
- [ ] Example forbidden: `await db.execute(\`SELECT * FROM plots WHERE branch_id = '\${branchId}'\`)`

### Cash Counter Transaction Safety
- [ ] Denomination totals recalculate reactively on input change
- [ ] Physical cash audit saves denomination breakdown as JSON
- [ ] Cash In/Out transactions linked to `cash_counter` table with category
- [ ] Cash drawer balance = SUM(CASH_IN) - SUM(CASH_OUT) per branch
- [ ] Expense payments from CASH_DRAWER source decrement physical counter

### Immutable Audit Logging
- [ ] Every DELETE operation inserts `audit_logs` entry
- [ ] Every UPDATE on financial records inserts `audit_logs` entry
- [ ] Every manual cash adjustment inserts `audit_logs` entry
- [ ] Every user status change inserts `audit_logs` entry
- [ ] `audit_logs` table has **NO** UPDATE or DELETE IPC handlers exposed
- [ ] Audit entries include: user_id, user_name, action_type, module_name, entity_id, description, ip_address, created_at

### Offline SQLite Vault Backup Readiness
- [ ] `sync_queue` table captures all mutations with `action_type`, `target_table`, `payload_json`
- [ ] Background sync worker processes `PENDING` queue items
- [ ] `VACUUM INTO` creates local `.sqlite` backup file via File System Access API
- [ ] Backup filename format: `digikhata_vault_backup_YYYY-MM-DDTHH-MM-SS.sqlite`
- [ ] IndexedDB cache hydrates app state on hard refresh (`Ctrl+Shift+R`) in <50ms

### Financial Calculation Verification
- [ ] Net Profit = Sale Price - (Cost Basis + Development + Commission + Tax + Duty)
- [ ] FBR Tax: Filer 3% / Non-Filer 7% on sale price
- [ ] Government Duties: 2% (Stamp Duty + Transfer Tax)
- [ ] Installment: `monthly = Math.round((total - down) / months)`
- [ ] DigiKhata: CREDIT increases party balance, DEBIT decreases
- [ ] Investor Payout: `Math.round(totalProfit * equityPercentage / 100)`

### UI/UX Compliance (Apple Liquid Glass)
- [ ] Base glass card: `bg-white/10 dark:bg-slate-900/40 backdrop-blur-2xl border border-white/20 dark:border-slate-800/60`
- [ ] Interactive hover: `hover:bg-white/20 dark:hover:bg-slate-800/60 hover:border-white/40 hover:shadow-[0_12px_40px_0_rgba(0,0,0,0.22)]`
- [ ] All interactive elements wrapped in TooltipProvider (180ms delay)
- [ ] Currency values use `font-mono tabular-nums`
- [ ] Framer Motion spring physics: `stiffness: 350, damping: 25, mass: 0.8` for modals

### Security Gate Compliance
- [ ] Auth Gate loads at root `/` before any page content
- [ ] Username input: `autocomplete="off" autocomplete="new-password" aria-autocomplete="none" spellcheck="false" autocorrect="off" autocapitalize="none" data-lpignore="true"`
- [ ] Password input: Same anti-autocomplete attributes + `type="password" maxLength={10}`
- [ ] BCrypt verification with salt rounds = 12
- [ ] Constant-time comparison for credential validation
- [ ] Session token format: `SESSION_{timestamp}_{random}`

## Phase Completion Gates

### Phase 1 Gate (Modules 1-3)
- [ ] Auth Gate authenticates `dripp` / `5821`
- [ ] Dashboard renders 8 metric cards + 3 charts
- [ ] Branch switcher loads branches from DB
- [ ] Settings page: logo upload, folder picker, Turso test
- [ ] Database seeded with default branch, admin user, settings

### Phase 2 Gate (Modules 4-7)
- [ ] Cash Counter: 7 denomination inputs, live total, audit save
- [ ] Plot Inventory: Grid/Table/Map views, CRUD modal, search
- [ ] Plaza Hierarchy: Building to Floor to Unit navigation
- [ ] CRM Kanban: 6 columns, drag-drop, WhatsApp buttons
- [ ] Land Acquisition: Seller ledger with debt tracking

### Phase 3 Gate (Modules 8-12)
- [ ] Agent Network: Commission tracking, payout buttons
- [ ] Instant Sales: Live profit panel, tax toggle, thermal receipt
- [ ] Installment Engine: Schedule generator, collector modal, penalties
- [ ] DigiKhata: Dual-column ledger, party selector, WhatsApp statement

### Phase 4 Gate (Modules 13-15)
- [ ] Investor Pools: Equity %, profit distribution modal
- [ ] Construction: Material stock (bags/tons/units), usage logging
- [ ] Daily Expenses: Category chips, voucher gen, cash drawer integration

### Phase 5 Gate (Modules 16-20)
- [ ] Legal Vault: Document grid, QR code generation/verification
- [ ] Audit Trail: Filterable table, SQLite vault backup button
- [ ] Multi-Branch: Switcher, comparative reporting
- [ ] WhatsApp Gateway: Template editor, dynamic tag pills
- [ ] Tax Calculator: Gain tax, stamp duty, transfer fee breakdown

### Phase 6 Gate (Production Ready)
- [ ] Thermal receipt templates (80mm/58mm) print correctly
- [ ] Electron Builder produces Windows .exe installer
- [ ] End-to-end security audit passes
- [ ] Vercel deployment pipeline configured
- [ ] Turso sync verified in production

## Automated Verification Scripts

### check_types (Run: npm run typecheck)
```bash
npx tsc --noEmit
```

### verify_schema (Run manually)
```bash
# Check all SQL files for parameterization
grep -r "db\.execute.*\`" src/ --include="*.ts" --include="*.tsx"
# Should return ZERO results (no template literals)

# Check for raw concatenation
grep -r "+\s*.*\+" src/services/ --include="*.ts"
# Should return ZERO results
```

### status_report (Run manually)
```bash
cat .agent/PROJECT_STATUS.md
```

### run_audit_check (Run manually)
```bash
# Verify audit_logs has no UPDATE/DELETE handlers
grep -r "audit_logs" electron/ipc/ --include="*.ts"
# Should only show INSERT/SELECT handlers

# Verify sync_queue structure
sqlite3 dripp_erp_local.db ".schema sync_queue"
```

## Manual QA Test Scenarios

### Scenario 1: Auth Gate
1. Open app → Auth Gate modal appears
2. Enter wrong credentials → Error message
3. Enter dripp / 5821 → Dashboard loads
4. Refresh (Ctrl+Shift+R) → Auth Gate reappears (session not persisted in this test)

### Scenario 2: Cash Counter
1. Open Cash Counter module
2. Enter: 5000x2, 1000x5, 500x10, 100x20
3. Verify total = Rs. 25,000
4. Click Save Cash Audit → Success toast
5. Check cash_denominations table for JSON breakdown

### Scenario 3: Plot Sale Flow
1. Add plot in Inventory (Cost: 50L, Sell: 75L)
2. Open Instant Sales, select plot
3. Enter buyer details, price 75L, Filer status
4. Verify live profit: 75L - (50L + 0 + 0 + 2.25L + 1.5L) = 21.25L
5. Complete sale → Plot status = SOLD, receipt generated

### Scenario 4: Offline Resilience
1. Disconnect network
2. Create plot, log cash, add DigiKhata entry
3. Verify all operations work locally
4. Reconnect network
5. Verify sync_queue processed, Turso updated

### Scenario 5: Hard Refresh
1. Fill half a form in Instant Sales
2. Press Ctrl+Shift+R
3. Verify form data restored from sessionStorage
4. Verify dashboard metrics loaded from IndexedDB