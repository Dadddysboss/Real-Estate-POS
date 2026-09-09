# 2. Technical Requirements Document (TRD)
**Project Name:** Real Estate POS & DigiKhata ERP (Master Security & Enterprise Edition)
**Deployment Platform:** Strictly Vercel Serverless / Edge Functions + Turso DB (`@libsql/client`)
**Architecture:** Offline-First PWA + Triple-Layer Persistence + Hardened Security Framework

---

## 1. Technology Stack & Library Matrix

### 1.1 Core Engine & Frontend
- **Framework:** Next.js 14+ (App Router with Server Components & Client Components).
- **Language:** TypeScript (Strict mode enabled, `noImplicitAny: true`, `strictNullChecks: true`).
- **Styling:** Tailwind CSS + `tailwindcss-animate` + `@tailwindcss/typography`.
- **UI & Motion:** Framer Motion (Glass physics & micro-interactions), Lucide React (Icons), Radix UI primitives.

### 1.2 Database & Offline Infrastructure
- **Cloud Database Client:** `@libsql/client` (Turso Cloud Integration).
- **Client Cache Database:** `idb` / `dexie` (IndexedDB Wrapper for 0ms client-side read/write).
- **Local PC Backup Hook:** Native HTML5 File System Access API (`showDirectoryPicker()`).
- **PWA Service Worker:** Custom Service Worker with `manifest.json` for offline asset caching.

### 1.3 Printing, Export & External Utilities
- **Receipt & Invoice Generator:** `html2canvas` + `jspdf` + Native Browser Print API for 80mm thermal printers.
- **Sanitization & Security Utilities:** `dompurify` (DOM XSS & Clipboard sanitization), `zod` (Strict schema validation).
- **Charts & Data Analytics:** `recharts` responsive wrappers.

---

## 2. Hardened Security Engineering Specs

### 2.1 Authentication Gate & Anti-Suggestion Engineering
- **Root Protection (`/`):** A client-side + middleware state lock requiring immediate authorization before rendering page routes or loading state.
- **Credential Validation:**
  - `Username`: `dripp`
  - `Password`: `5821`
  - Validation must use constant-time string comparison (`crypto.timingSafeEqual` or equivalent) to block timing side-channel attacks.
- **Browser Suggestion & Autocomplete Eradication:**
  All input fields within the Auth Gate MUST explicitly define the following attributes:
  ```html
  <input 
    autocomplete="off" 
    autocomplete="new-password" 
    aria-autocomplete="none" 
    spellcheck="false" 
    autocorrect="off" 
    autocapitalize="none" 
    data-lpignore="true" 
    data-1p-ignore="true"
  />
  1. SQL & NoSQL Injection Safeguards
ALL database operations using @libsql/client MUST utilize parameterized positional bindings:

TypeScript
// REQUIRED:
await turso.execute({
  sql: "SELECT * FROM inventory WHERE city_society = ? AND status = ?",
  args: [society, status]
});
// FORBIDDEN: Raw string interpolation or concatenation.
2. SSTI (Server-Side Template Injection) Defense
String-based evaluation (eval(), new Function(), setTimeout(string)) is strictly prohibited.

Printable documents (Invoices, Receipts, Statements) MUST be built as static JSX/React components rendered client-side or via controlled React PDF primitives.

3. ReDoS (Regular Expression Denial of Service) Defense
All user input validations MUST pass through zod schemas with strict maximum length constraints before regex execution:

Phone inputs capped at 15 characters.

Price inputs capped at 15 digits.

Regex expressions MUST be atomic or non-backtracking (e.g., ^[0-9]{10,15}$).

4. LPDOS & Rate Limiting Engine
API routes enforce rate-limiting headers via Vercel Edge Middleware (maximum 100 requests per 60 seconds per IP).

Heavy processing (large PDF rendering, CSV backup generation) MUST run inside Web Workers to ensure the main UI thread never locks up.

5. Zero Secret Exposure Protocol
Sensitive keys (TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, WHATSAPP_API_KEY) MUST reside exclusively in Vercel Environment Variables (process.env).

Environment variables prefixed with NEXT_PUBLIC_ MUST NEVER contain private API tokens, database credentials, or secret keys.

6. Clipboard Attack Protection
Any data imported via paste actions MUST pass through DOMPurify.sanitize() before state processing.

The app MUST NEVER automatically inspect or poll the system clipboard without explicit user trigger actions.

7. Replay Attack & Request Verification
Every write mutation API request must contain headers:

X-Timestamp: Current UTC epoch timestamp.

X-Nonce: Randomly generated UUID.

Server-side routes reject any request where Math.abs(Date.now() - X-Timestamp) > 30000 (30 seconds).

3. Deployment & CI/CD Pipeline Constraints
Platform: Vercel Serverless Platform + Turso DB Cloud.

Zero Public Repository Exposure: Code deployments can be executed directly via Vercel CLI (vercel --prod) or private Vercel deployment hooks without requiring GitHub repository syncs.

Build Output: Static Site Generation (SSG) for UI shells + Vercel Edge API routes for database sync handlers.

4. Triple-Layer Persistence & Zero Data Loss Architecture
                                [USER MUTATION]
                                       │
                                       ▼
                     ┌───────────────────────────────────┐
                     │ Layer 1: Client IndexedDB (0ms)   │
                     └─────────────────┬─────────────────┘
                                       │
                    ┌──────────────────┴──────────────────┐
                    ▼                                     ▼
┌──────────────────────────────────────┐┌───────────────────────────────────┐
│ Layer 2: Local Hard Drive JSON Log   ││ Layer 3: Turso Cloud DB Async Sync│
│ (HTML5 File System Access API)       ││ (`@libsql/client` WebSockets/HTTP)│
└──────────────────────────────────────┘└───────────────────────────────────┘
4.1 Hard Refresh Hydration (Ctrl + Shift + R)
App boots -> Auth Gate verifies active session state.

App queries IndexedDB (idb) -> Populates local Zustand/React state in <50ms.

Background Worker checks online status -> Hydrates missing delta changes from Turso DB.

Active form inputs and search filters persist in sessionStorage to prevent input loss during accidental refreshes.

5. API Route Architecture (Mapping the 20 Modules)
All server API routes reside in src/app/api/... and enforce standard Zod request validation, parameterized SQL execution, and structured JSON responses:

src/app/api/
├── auth/
│   └── verify/route.ts            # Auth Gate credentials check (dripp / 5821)
├── dashboard/
│   └── metrics/route.ts           # Business Intelligence aggregations
├── cash-counter/
│   └── route.ts                   # In/Out cash logging & denomination balance
├── inventory/
│   ├── route.ts                   # Plot CRUD & filter queries
│   └── visual-map/route.ts        # SVG plot layout state
├── plazas/
│   └── route.ts                   # Commercial building & floor unit management
├── crm/
│   ├── leads/route.ts             # Lead pipeline state
│   └── site-visits/route.ts       # Visit scheduling
├── acquisitions/
│   └── route.ts                   # Land purchase & seller debt
├── sales/
│   └── instant/route.ts           # Full cash deals & profit calculator
├── installments/
│   ├── plans/route.ts             # Payment plan creation & schedules
│   └── receive/route.ts           # Collection & penalty logging
├── digikhata/
│   ├── accounts/route.ts          # Party directory
│   └── entries/route.ts           # Lena (Credit) / Dena (Debit) entries
├── agents/
│   └── route.ts                   # Broker profiles & commission payouts
├── investors/
│   └── route.ts                   # JV capital pools & profit splits
├── construction/
│   ├── projects/route.ts          # Site project tracker
│   └── expenses/route.ts          # Material & labor logging
├── expenses/
│   └── route.ts                   # Operational overhead costs
├── documents/
│   └── vault/route.ts             # Document metadata & local path refs
├── staff/
│   ├── rbac/route.ts              # Role permissions
│   └── audit-log/route.ts         # Immutable user activity stream
├── branches/
│   └── route.ts                   # Multi-branch filters
├── whatsapp/
│   └── gateway/route.ts           # Deep-link template formatting
├── tax/
│   └── calculate/route.ts         # Government duty & tax estimators
└── settings/
    └── route.ts                   # Agency profile & Turso credentials setup
6. Output Response Guarantee Standard
All API handlers MUST return standard HTTP status codes:

200 OK: Successful execution or empty dataset [].

400 Bad Request: Zod validation errors with clear field messages.

401 Unauthorized: Invalid Auth session or timestamp mismatch.

500 Internal Server Error: Server errors wrapped in structured JSON ({ success: false, error: "Detailed message" }).

Tables that contain zero records MUST return an empty array [] with HTTP 200 (NEVER a 404 or 500 error).