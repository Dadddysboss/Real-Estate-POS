# 5. AI Execution & Governance Protocol
**Project Name:** Real Estate POS & DigiKhata ERP (Master Security & Enterprise Edition)
**Target Audience:** AI Coding Assistants (Cursor, Windsurf, Claude, Gemini), Senior Engineers, & Code Auditors
**Enforcement Level:** CRITICAL (Zero Deviation Allowed)

---

## 1. Zero-Regression & AI Coding Governance Rules

1. **No Hallucinated Packages or Dependencies:**
   - Only use libraries explicitly specified in `package.json` / Technical Specifications (File 2).
   - Do not install extra npm packages without explicit developer instruction.

2. **Strict SQL Parameterization (Zero SQL Injection Risk):**
   - **BANNED:** String concatenation or template literals inside database queries (e.g., `` db.execute(`SELECT * FROM users WHERE username = '${input}'`) ``).
   - **MANDATORY:** Always use array binding parameterization with `libSQL` / SQLite (e.g., `db.execute({ sql: 'SELECT * FROM users WHERE username = ?', args: [input] })`).

3. **Incremental Modular Development:**
   - Implement **one module or component at a time**. Never generate monolithic 1,000+ line code dumps across multiple unlinked files.
   - Run type checks (`tsc --noEmit`) and build checks after every module implementation.

4. **Preserve Master Architecture:**
   - Do not alter folder structure, module counts (20 Modules), or database schemas (File 4) unless explicitly authorized.
   - Maintain the Auth Gate default credentials (`dripp` / `5821`) in all seed and authentication logic.

5. **Type Safety & Strict TypeScript:**
   - No implicit `any` types. Every component prop, API parameter, and IPC payload must have explicit TypeScript interfaces/types defined in `@/types`.

---

## 2. Technical Stack & Component Architecture Standards

### A. IPC Communication Pattern (Electron Main <-> Renderer)
All communication between Electron Main Process and React Renderer must go through context-isolated IPC wrappers in `src/preload/index.ts`.

```typescript
// IPC API Contract Pattern (src/preload/index.ts)
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  dbQuery: (channel: string, payload: unknown) => ipcRenderer.invoke(channel, payload),
  onSyncStatus: (callback: (status: string) => void) => {
    ipcRenderer.on('sync-status-update', (_event, status) => callback(status));
  }
});
B. Dual-Sync Protocol Implementation Pattern (IndexedDB + Turso libSQL)
Local-First Writes: Write transaction directly to local SQLite (better-sqlite3 or local libSQL) and IndexedDB cache immediately.

Sync Queue Enqueue: Insert mutation payload into sync_queue table with status 'PENDING'.

Background Worker: Background sync service checks network connectivity, pushes pending queue items to remote Turso DB, and marks status as 'SYNCED'.

TypeScript
// Dual-Sync Queue Enqueue Helper
export async function queueMutation(
  actionType: 'INSERT' | 'UPDATE' | 'DELETE',
  targetTable: string,
  payload: Record<string, unknown>
): Promise<void> {
  const syncId = `SYNC_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const query = `
    INSERT INTO sync_queue (id, action_type, target_table, payload_json, status, created_at)
    VALUES (?, ?, ?, ?, 'PENDING', CURRENT_TIMESTAMP)
  `;
  await executeQuery(query, [syncId, actionType, targetTable, JSON.stringify(payload)]);
}
3. Auth Gate & Security Enforcement Protocols
Authentication Gate Credentials:

Default Master Admin: Username = dripp, Password = 5821.

On initial setup/seed, hash 5821 using bcryptjs with salt rounds = 12.

Session Verification Middleware:

Store session token securely in memory / encrypted local storage with nonce validation.

Every protected IPC call must verify session validity before executing database transactions.

Audit Log Enforcement:

Every destructive operation (DELETE, UPDATE, manual cash adjustments, user status changes) must automatically record an immutable entry in the audit_logs table.

4. Phase-by-Phase AI Implementation Roadmap
┌─────────────────────────────────────────────────────────────────────────┐
│                      PHASED IMPLEMENTATION ROADMAP                      │
├─────────────┬───────────────────────────────────────────────────────────┤
│ Phase 1     │ Scaffolding, Core SQLite Setup, Auth Gate (`dripp`/`5821`)│
├─────────────┼───────────────────────────────────────────────────────────┤
│ Phase 2     │ Master Inventory, Plazas & CRM (Modules 1-7)              │
├─────────────┼───────────────────────────────────────────────────────────┤
│ Phase 3     │ Instant Sales Engine, Installment Engine, DigiKhata (8-12)│
├─────────────┼───────────────────────────────────────────────────────────┤
│ Phase 4     │ Investor Pools, Construction & Daily Expenses (13-15)    │
├─────────────┼───────────────────────────────────────────────────────────┤
│ Phase 5     │ Legal Vault, WhatsApp, Tax Rules & Dual Sync Queue (16-20)│
├─────────────┼───────────────────────────────────────────────────────────┤
│ Phase 6     │ UI Polish, Thermal Printing, Audit & Electron Packaging   │
└─────────────┴───────────────────────────────────────────────────────────┘
Phase 1: Project Scaffolding & Security Foundation
Setup Electron + React + Vite + TypeScript + Tailwind CSS folder architecture.

Initialize SQLite / libSQL database client and run initial migration from File 4.

Implement Auth Gate screen enforcing dripp / 5821 authentication.

Create seed script for default user and system settings.

Phase 2: Core Inventory & Lead Pipeline (Modules 1–7)
Build System Settings & Branch Switcher components.

Build Cash Counter drawer & physical denomination tracker.

Build Plots Inventory CRUD (Residential, Commercial, Industrial, Agricultural).

Build Commercial Plazas hierarchy & multi-unit floor management.

Build CRM Lead Kanban pipeline & Site Visit scheduling system.

Phase 3: Sales Engine & Financial Ledgers (Modules 8–12)
Build Land Acquisition tracker & Seller Ledger.

Build Agent Network commission management.

Build Instant Sales Engine with automatic profit calculation & tax evaluation.

Build Installment Engine with automated schedule generator & payment collector.

Build DigiKhata Double-Entry Party Ledger (Credit/Debit entries).

Phase 4: Joint Ventures & Operations (Modules 13–15)
Build Investor Pools & equity profit distribution module.

Build Construction Projects & Material Stock tracker.

Build Daily Office Expenses logger with category breakdown & cash drawer integration.

Phase 5: Vault, Automation & Sync Engine (Modules 16–20)
Build Legal Vault & Document Repository with QR verification hash generation.

Build Audit Log viewer (Filter by user, action, date).

Build WhatsApp Automation & Template Manager.

Build Tax Rules & Government Duty Configuration.

Build Offline-First Dual Sync Engine (SQLite <-> Turso DB sync loop).

Phase 6: Final Polish, Thermal Receipts & Build Packaging
Implement POS Thermal Receipt Printing templates (80mm / 58mm layout).

Perform end-to-end security & parameterization audit.

Configure Electron Builder for Windows .exe / installer generation.

5. Verification & Pre-Flight Quality Checklist
Before completing any implementation phase, AI agents must verify:

[ ] Type Check: npx tsc --noEmit passes with 0 errors.

[ ] Lint Check: Code complies with ESLint and project formatting standards.

[ ] Database Integrity: Foreign key constraints active and tested.

[ ] No Raw Queries: All SQL calls use array binding ? parameters.

[ ] Auth Check: Auth Gate successfully authenticates dripp / 5821 and handles invalid tokens gracefully.

[ ] Offline Readiness: App functions completely when network connection is disconnected.