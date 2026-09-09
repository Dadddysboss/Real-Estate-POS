# 1. Product Requirements Document (PRD)
**Project Name:** Real Estate POS & DigiKhata ERP (Master Security & Enterprise Edition)
**System Class:** Offline-First PWA + Hardened Security Architecture
**Deployment Target:** Strictly Vercel Serverless/Edge + Turso Cloud (`@libsql/client`)
**UI Paradigm:** Apple Liquid Glass Aesthetics (Frosted Glass, Dynamic Translucency, Ambient Physics)

---

## 1. Executive Summary, Deployment Constraints & Strict Governance

This document establishes the exhaustive specification for an enterprise-grade Real Estate POS & DigiKhata ERP. It is engineered for real estate developers, agencies, plot file dealers, shopping plaza management, and high-volume financial ledgers.

### 1.1 Deployment & Infrastructure Rules
- **Deployment Platform:** Strictly **Vercel** (Serverless/Edge Functions) and **Turso DB** (`@libsql/client`).
- **Zero GitHub Dependency:** System build, preview, and deployment pipelines are tailored for direct Vercel CLI / Vercel integration without requiring public repository exposures.

### 1.2 Strict AI Governance Laws
1. **NO SUBAGENTS ALLOWED:** The executing AI must perform all coding, refactoring, security sanitization, and routing directly. Task delegation to external subagents is strictly forbidden.
2. **ZERO DESTRUCTIVE CODE REMOVAL:** Under no circumstances should existing UI elements, input fields, backend routes, type definitions, or security validators be deleted or truncated. Solutions must be additive.
3. **100% FEATURE & SECURITY DENSITY:** Every feature, field, metric card, modal, security filter, and calculation formula specified here MUST be fully implemented. No mocks or placeholders.

---

## 2. Hardened Security Architecture & Threat Protection Suite

### 2.1 Authentication Gate & Autocomplete Suppression
- **Root Protection (`/`):** The application root URL MUST instantly load a high-security Authentication Gate modal before granting access to any page or state.
- **Initial Credentials:**
  - **Username:** `dripp`
  - **Password:** `5821`
- **Autocomplete & Browser Suggestion Suppression:**
  - `autocomplete="off"` and `autocomplete="new-password"` attributes MUST be enforced on all auth fields.
  - `aria-autocomplete="none"`, `spellcheck="false"`, `autocorrect="off"`, and `autocapitalize="none"` to block browser memory, password managers, and OS clipboard auto-fill prompts.

### 2.2 Enterprise Threat Prevention Matrix
1. **SQL / NoSQL Injection Defense:**
   - 100% parameterized queries using `@libsql/client` prepared statements. Direct string interpolation or concatenated SQL strings are strictly prohibited.
2. **SSTI (Server-Side Template Injection) Mitigation:**
   - Zero dynamic evaluation functions (`eval()`, `new Function()`, or un-sanitized template literal rendering). All invoice and receipt renders must use safe JSX/React server-rendered templates.
3. **ReDoS (Regular Expression Denial of Service) Protection:**
   - All regex patterns (phone numbers, CNIC, emails, price inputs) must be evaluated with strict character length bounds and non-backtracking atomic regex execution.
4. **LPDOS (Local Process Denial of Service) & Rate Limiting:**
   - Client-side and Vercel Edge request throttling (maximum 100 requests per minute per IP for API routes). Heavy operations (PDF generation, data sync) offloaded to web workers to prevent UI thread blocking.
5. **Secret Key Exposure Protection:**
   - Zero hardcoded credentials or API tokens in client-side code. All sensitive keys (Turso DB Token, WhatsApp API Keys) MUST be stored exclusively in Vercel Environment Variables (`process.env`) and accessed via Server Actions / Edge API routes.
6. **Clipboard Attack Defense:**
   - Sanitization of all copied and pasted input strings using DOMPurify before parsing. Prevention of unauthorized clipboard hijacking or background copy monitoring.
7. **Replay Attack & Session Hijacking Safeguards:**
   - Every API request payload must include a short-lived timestamp (`X-Timestamp`) and cryptographic Nonce (`X-Nonce`) verified server-side. Requests older than 30 seconds are rejected automatically.

---

## 3. Global Infrastructure & Core Capabilities

### 3.1 Apple Liquid Glass UI Design System
- **Visual Texture:** Multi-layered translucent panels (`backdrop-blur-2xl`), subtle glass highlights (`border-white/20`), ambient glowing mesh gradients, and depth-based z-index layers.
- **Physics Engine:** Framer Motion spring physics for card hovers, modal reveals, tab switches, slide-over sheets, and interactive state changes.

### 3.2 Triple-Layer Persistence Engine (Zero Data Loss)
- **Layer 1 (Browser IndexedDB):** Instant client-side read/write caching (0ms latency).
- **Layer 2 (Local PC Hard Drive Backup):** Native HTML5 File System Access API (`showDirectoryPicker()`) that appends encrypted JSON/CSV audit logs directly to a designated folder on the user's computer.
- **Layer 3 (Cloud Sync - Turso DB):** Continuous background synchronization via `@libsql/client`.
- **Hard Refresh Immunity (`Ctrl + Shift + R`):** The app must instantly re-hydrate state from IndexedDB without losing active forms, search filters, or un-synced entries.

### 3.3 Universal Interactive Tooltip Engine
- EVERY single interactive button, metric card, input field header, table column, status tag, and navigation tab MUST be wrapped in an animated hover tooltip explaining its exact functional purpose.

---

## 4. Exhaustive System Module Breakdown (20 Core Modules)

### Module 1: Authentication Gate & Security Command Center
- Mandatory lock screen on app boot requiring `dripp` / `5821`.
- Anti-autocomplete inputs, session timeout controls, active session monitoring, and emergency lock button.

### Module 2: Business Intelligence Command Center
- Live financial metrics: Total Inventory Valuation, Sales vs Profit, Active Installments Recovery Gauge, Cash Counter Balance, DigiKhata Balance (Lena/Dena), and Agent Commission Debt.
- Interactive Recharts/Chart.js graphs for monthly revenue trends, inventory velocity, and lead conversion rates.

### Module 3: Cash Counter & Multi-Denomination Reconciliation
- Physical drawer tracking with real-time "Cash in Drawer" balance.
- Physical Denomination Counter inputs (Rs. 5000, 1000, 500, 100 note counts) for 100% physical drawer tallying before day closing.
- Thermal receipt generation (80mm) for all cash deposits and withdrawals.

### Module 4: Plot & Property Inventory Catalog (with Interactive Visual Selector)
- Comprehensive land/plot database with dual view options (Grid Glass Cards & High-Density Table).
- Interactive Visual Plot Layout Grid (SVG/Canvas based map selector with color-coded plot availability).
- Fields: Plot Number, Society, Block/Phase, Dimensions/Size, Category, Feature Tags (Corner, Park Facing, Main Boulevard), Cost Basis, Target Asking Price, Floor Price, GPS Coordinates, Status.

### Module 5: Commercial Plazas, Malls & Multi-Unit Floor Hierarchy
- Multi-story building management: Select Building -> Select Floor (Basement to Executive Suites) -> Select Shop/Office Unit.
- Track square footage, rate per sq ft, target rental income, lease expiry dates, and tenant security deposits.

### Module 6: CRM, WhatsApp Automation & Site Visit Tracker
- Lead acquisition pipeline with Kanban board (New Lead -> Contacted -> Site Visit -> Negotiating -> Deal Closed).
- One-click automated WhatsApp message trigger for follow-ups, meeting reminders, and brochure sharing.

### Module 7: Primary Land Acquisition & Seller Debt Ledgers
- Document master land purchases from original landowners.
- Tracks agreed total price, advance paid, remaining debt balance, land title/khata numbers, and legal title uploads. Auto-populates available inventory.

### Module 8: Instant Cash Sales, Tax/Duty Estimator & Live Profit Engine
- Execute full cash sales with automated real-time Net Profit calculation:
  `Net Profit = Final Sale Price - (Plot Purchase Cost + Development Expenses + Agent Commission + Taxes)`.
- Generates instant sale invoices, transfers ownership status, and outputs WhatsApp receipt link.

### Module 9: Installment Engine, Dynamic Schedules & Penalty Matrix
- Multi-year payment plan generator with auto-calculated monthly schedules.
- Feature to receive installments, apply late payment penalty fines or discounts, print 80mm thermal receipts, and filter overdue defaulter accounts (>30 days).

### Module 10: DigiKhata Double-Entry Party Ledger (Lena / Dena)
- Account management for Customers, Vendors, Suppliers, Brokers, and Investors.
- Track Credit (Lena / Receivable) vs Debit (Dena / Payable) with color-coded net balance badges and itemized WhatsApp balance statements.

### Module 11: Agent Network, Brokerage Tiers & Commission Split Ledger
- Profile directory for real estate agents and brokers.
- Tracks agreed commission rates (%, fixed), earned commissions per deal, paid payouts, and pending commission debt.

### Module 12: Investor Pools, Joint Ventures & Dividend Yield Matrix
- Capital tracking for third-party investors pooling money into land acquisitions.
- Automated profit-sharing calculator that deposits investor dividends directly into their DigiKhata account upon plot sale.

### Module 13: Site Development, Infrastructure & Construction Material Tracker
- Monitor site infrastructure expenses (roads, sewerage, boundary walls, labor).
- Material stock counter (cement, steel, bricks) and automated allocation of development costs to plot cost basis.

### Module 14: Daily Office Overheads & Fixed Asset Depreciation
- Log daily operational business expenses (utility bills, staff salaries, tea/refreshments, marketing, software).
- Direct deduction from gross revenue to calculate exact Net Company Profit on the Dashboard.

### Module 15: Legal Vault, KYC Registry & Document QR Authenticator
- Centralized storage for buyer/seller CNIC copies, property title deeds, and transfer letters.
- Generates dynamic QR codes on printed invoices and allotment letters to authenticate document legitimacy against DB records.

### Module 16: Staff Access Control, Biometric/PIN Lock & Anti-Tamper Audit Logs
- Multi-user role management (Administrator, Sales Manager, Accountant/Cashier).
- Immutable, tamper-evident audit log tracking every user interaction, price edit, and deletion attempt.

### Module 17: Multi-Branch & Franchise Management
- Manage multiple office branches or site offices under a single centralized Turso DB backend with branch-filtered reporting.

### Module 18: Digital WhatsApp Self-Service Gateway
- Automated client link generator allowing buyers to check their own installment ledger balance and next due dates via a secure WhatsApp web view link.

### Module 19: Automated Tax, Stamp Duty & Legal Fee Calculator
- Integrated local tax engine calculating gain taxes, stamp duty, transfer fees, and withholding tax estimates for buyers and sellers.

### Module 20: System Branding, Local Hard Drive Sync & Vercel/Turso Pipeline
- Configuration suite for business identity, custom logo uploads, currency symbols (PKR / USD), local backup folder picker (`showDirectoryPicker()`), and Turso connection parameters.