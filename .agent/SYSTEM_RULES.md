# SYSTEM RULES - Real Estate POS & DigiKhata ERP

## Primary Directive
**ALWAYS consult `docs/*.md` before starting ANY sub-task.** Every database schema, IPC channel name, TypeScript interface, financial calculation formula, UI layout, and security guardrail MUST be built EXACTLY as defined in the 10 specification files. No deviation, truncation, or simplification allowed.

## Financial Rules
- **Dual-Ledger Precision:** All PKR amounts stored as INTEGER minor units (paise) or REAL with exact precision. No floating-point rounding errors.
- **Rounding:** `Math.round()` for display, internal calculations preserve full precision.
- **Net Profit Formula:** `Net Profit = Final Sale Price - (Plot Purchase Cost + Development Expenses + Agent Commission + Taxes + Government Duties)`
- **DigiKhata Balance:** `Net Balance = SUM(CREDIT/LENA) - SUM(DEBIT/DENA)` — color coded: Emerald (positive), Rose (negative).

## Code Quality Gates
- **Zero TypeScript Errors:** `npx tsc --noEmit` must pass with 0 errors after every module.
- **Strict IPC Types:** All `window.api` calls typed in `src/types/electron.d.ts`.
- **Parameterized SQL:** 100% array binding (`?` placeholders). **ZERO** string interpolation in queries.
- **Error Handling:** All SQLite queries wrapped in try/catch returning `DatabaseResponse<T>`.

## Security Guardrails
- **Auth Gate:** Root `/` loads authentication modal requiring `dripp` / `5821` with anti-autocomplete attributes.
- **Session Validation:** Every IPC handler verifies session before executing DB transactions.
- **Audit Logging:** Every destructive operation (DELETE, UPDATE, cash adjustment, status change) records immutable entry in `audit_logs`.
- **Replay Protection:** All write mutations require `X-Timestamp` and `X-Nonce` headers validated server-side.

## Architecture Rules
- **Triple-Layer Persistence:** IndexedDB (Layer 1) → Local File System API (Layer 2) → Turso DB (Layer 3).
- **Offline-First:** All mutations write locally first, then enqueue to `sync_queue` for background sync.
- **Hard Refresh Immunity:** `Ctrl+Shift+R` re-hydrates from IndexedDB in <50ms preserving form state.

## Module Count
**20 Core Modules** across 6 Phases (per docs/5_AI_Execution_Protocol.md):
- Phase 1: Scaffolding, Auth, Database (Modules 1-3)
- Phase 2: Inventory, CRM, Cash Counter (Modules 4-7)
- Phase 3: Sales, Installments, DigiKhata (Modules 8-12)
- Phase 4: Investors, Construction, Expenses (Modules 13-15)
- Phase 5: Vault, Audit, WhatsApp, Tax, Sync (Modules 16-20)
- Phase 6: Polish, Thermal Printing, Packaging