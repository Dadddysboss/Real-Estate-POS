# 3. UI/UX Design System & Glass Architecture Blueprint
**Project Name:** Real Estate POS & DigiKhata ERP (Master Security & Enterprise Edition)
**Design Paradigm:** Apple Liquid Glass Aesthetics (Frosted Glass, Dynamic Translucency, Ambient Physics)
**Target Viewports:** Fully Responsive (Mobile <768px, Tablet 768px–1024px, Ultra-Wide Desktop >1024px)

---

## 1. Apple Liquid Glass Tokens & CSS Class Matrix

### 1.1 Core Glass Panel Tokens
- **Base Glass Card Class:**
  `bg-white/10 dark:bg-slate-900/40 backdrop-blur-2xl border border-white/20 dark:border-slate-800/60 shadow-[0_8px_32px_0_rgba(0,0,0,0.12)] rounded-2xl transition-all duration-300`
- **Interactive Glass Hover Class:**
  `hover:bg-white/20 dark:hover:bg-slate-800/60 hover:border-white/40 dark:hover:border-slate-700/80 hover:shadow-[0_12px_40px_0_rgba(0,0,0,0.22)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]`
- **Active / Focused Glass Element:**
  `ring-2 ring-sky-500/50 dark:ring-sky-400/40 border-sky-400/60 bg-white/25 dark:bg-slate-800/80`
- **Modal Overlay Backdrop:**
  `bg-slate-950/70 backdrop-blur-xl animate-in fade-in-0 duration-200`
- **Ambient Canvas Backgrounds:**
  - *Light Mode:* `bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-slate-100 via-sky-50/50 to-slate-200 text-slate-900`
  - *Dark Mode:* `bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-slate-950 via-slate-900 to-slate-950 text-slate-50`

### 1.2 Color Palette & Semantic Status Badges
- **Primary Text:** `text-slate-900 dark:text-slate-50`
- **Muted Text:** `text-slate-500 dark:text-slate-400`
- **Emerald Glass (Income / Available / Active / Positive Balance):**
  `bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.15)]`
- **Rose Glass (Expense / Sold / Payable / Deficit / Defaulter):**
  `bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30 shadow-[0_0_15px_rgba(244,63,94,0.15)]`
- **Amber Glass (Pending / On Hold / Warning / Late Fee):**
  `bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.15)]`
- **Sky Glass (Commercial / Lead / Neutral Action):**
  `bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/30 shadow-[0_0_15px_rgba(14,165,233,0.15)]`
- **Purple Glass (Investors / Joint Ventures / Multi-Branch):**
  `bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30 shadow-[0_0_15px_rgba(168,85,247,0.15)]`

---

## 2. Animation Physics & Micro-Interactions (Framer Motion)

### 2.1 Physics Config Rules
- **Modal Entry & Popovers:**
  `type: "spring", stiffness: 350, damping: 25, mass: 0.8`
- **Tab Switches & Page Transitions:**
  `type: "tween", ease: [0.16, 1, 0.3, 1], duration: 0.25`
- **Hover Micro-Physics:**
  `whileHover={{ scale: 1.02, y: -2 }} whileTap={{ scale: 0.97 }}`

### 2.2 Numerical Value Transition Rule
- All currency balances, profit displays, and plot counts MUST render using tabular figures (`font-mono tabular-nums`) with smooth animated number counters upon value updates.

---

## 3. Universal Tooltip Engine Architecture

- Every interactive button, icon link, table header, metric card, and status tag MUST be wrapped in the `<TooltipProvider>` system.
- **Tooltip Visual Styling:**
  `bg-slate-900/90 dark:bg-slate-100/90 text-slate-100 dark:text-slate-900 text-xs font-medium px-3 py-1.5 rounded-xl shadow-2xl backdrop-blur-md border border-white/10 dark:border-slate-800 animate-in fade-in-0 zoom-in-95 duration-150`
- **Delay Config:** 180ms hover delay.

---

## 4. Hardened Security UI Components

### 4.1 Authentication Gate Screen (`/`)
- **Full-Screen Frosted Canvas:** Blurred background overlay blocking all underlying state.
- **Login Glass Card Centerpiece:**
  - Header with animated security shield icon and business logo.
  - Subtitle: "Enter Access Credentials to Unlock Enterprise ERP".
- **Input Fields (Enforced Anti-Autocomplete & Suggestion Suppression):**
  - Username Input: Pre-configured with initial username `dripp`.
  - Password Input: Pre-configured with initial password `5821`.
  - Mandatory DOM Attributes:
    `autocomplete="off" autocomplete="new-password" aria-autocomplete="none" spellcheck="false" autocorrect="off" autocapitalize="none" data-lpignore="true"`
- **Unlock Button:** Vibrant liquid glass gradient button with hover shine effect and loading spinner state.

### 4.2 Security Status Bar & Anti-Tamper Badges
- **Global Header Badge Bar:**
  - Live Connection Status Indicator (Green dot = Turso Cloud Synced, Amber dot = Offline/Local DB Active).
  - Encrypted Local Backup Badge (Folder path status).
  - Session Security Countdown Timer & Quick-Lock Button (`Ctrl + L`).
  - Active Role Tag (Admin, Manager, Cashier).

---

## 5. Viewport Breakpoint & Layout Systems

### 5.1 Desktop Layout (>1024px)
- **Left Navigation Glass Bar:** Fixed 260px vertical translucent glass sidebar with active module indicators, icon badges, and collapse button.
- **Top Header Bar:** Search bar (global search across plots, leads, parties), active branch switcher, theme selector, quick action "+ New Deal" button, and user profile badge.
- **Main Canvas:** 4-column metric grid on top, dynamic main content area, right side-drawers for quick entry forms.

### 5.2 Tablet Layout (768px–1024px)
- **Navigation:** Collapsible 80px icon-only vertical sidebar with expandable tooltips.
- **Main Canvas:** 2-column metric grid, responsive scrollable data tables.

### 5.3 Mobile Layout (<768px)
- **Top Header:** Mobile brand bar with hamburger menu trigger and quick WhatsApp link button.
- **Navigation:** Slide-over full-screen Liquid Glass navigation sheet (`backdrop-blur-3xl`).
- **Main Canvas:** Single-column stacked metric cards, mobile swipeable tabs, horizontal scrolling data tables (`overflow-x-auto`).

---

## 6. UI Layout Specifications for All 20 Modules

### Module 1: Auth Gate
- Full-screen glass modal, anti-autocomplete inputs (`dripp` / `5821`), lock animation.

### Module 2: Business Intelligence Dashboard
- Top 8 Metric Glass Cards with progress rings, 3 Recharts analytics panels (Area chart, Pie chart, Gauge chart), live activity feed ticker.

### Module 3: Cash Counter & Denomination Grid
- Large dynamic cash balance card (Emerald/Rose), "Cash In" and "Cash Out" action buttons, interactive physical note counter grid (Rs 5000, 1000, 500, 100 multiplier inputs), 80mm thermal receipt preview modal.

### Module 4: Plot Catalog & Interactive Visual Map
- Toggle bar (Grid View / Table View / Visual Layout Map).
- Visual Layout Map: Canvas/SVG interactive plot grid where clicking a plot box displays a glass slide-over sheet with plot specs, pricing, and "Execute Sale" button.

### Module 5: Commercial Plazas & Multi-Unit Tree UI
- Multi-tier selector: Building Dropdown -> Floor Tabs -> Unit Cards Grid. Hovering over a shop unit shows tenant info or sale availability.

### Module 6: CRM & Lead Kanban Pipeline
- Visual Drag-and-Drop Kanban columns (New -> Contacted -> Site Visit -> Negotiation -> Closed Deal). Each lead card features direct one-click WhatsApp action buttons.

### Module 7: Land Acquisitions & Seller Debt
- Accordion list of land acquisitions with progress bars showing debt paid vs. debt remaining to seller.

### Module 8: Instant Cash Sales & Profit Engine
- Split-screen modal: Left side form inputs (Plot picker, Buyer details, Commission, Duty), Right side Live Profit Display Card (`Net Profit = Sale - (Cost + Dev + Comm + Duty)`) updating in real-time.

### Module 9: Installment Engine & Payment Schedule Sheet
- Tabbed schedule view (Month-by-Month row items). Color-coded tags (Paid = Green, Overdue = Red). Quick "Receive Payment" action modal with WhatsApp receipt generator.

### Module 10: DigiKhata Party Ledger (Lena / Dena)
- Dual-column ledger interface: Left column "Lena / Credit" entries (Green), Right column "Dena / Debit" entries (Rose). Massive header badge showing Net Balance (`Lena - Dena`).

### Module 11: Agent Network & Brokerage Tiers
- Agent directory grid with performance ranks, total deals closed badge, pending commission debt counter, and "Payout Commission" button.

### Module 12: Investor Pools & JV Dividend Matrix
- Project investment cards showing capital pool totals, investor equity percentage splits, and projected vs realized profit returns.

### Module 13: Site Infrastructure & Material Stock Tracker
- Construction progress trackers, material inventory progress bars (Cement, Steel, Bricks), and direct cost-to-plot assignment toggles.

### Module 14: Daily Office Expenses
- Category filter chips (Bills, Salaries, Tea/Food, Marketing, Software), expense table, total monthly overhead deduction card.

### Module 15: Document Vault & Legal QR Authenticator
- File grid with document previews, file type icons, linked plot tags, and QR code overlay button for physical print verification.

### Module 16: Staff Access Control & Immutable Audit Log
- User management table with role assignment dropdowns (Admin, Manager, Cashier). Live, filterable audit log stream showing timestamped user actions.

### Module 17: Multi-Branch Management
- Branch selection switcher in top navigation bar, branch performance comparison cards.

### Module 18: Digital WhatsApp Self-Service Gateway
- Template editor preview showing formatted customer WhatsApp messages with dynamic tag pills (`{Client_Name}`, `{Amount_Due}`, `{Due_Date}`).

### Module 19: Tax & Duty Calculator
- Dynamic fee breakdown card showing gain tax, stamp duty, and transfer fee totals based on plot sale value.

### Module 20: System Settings, Local Folder Picker & Branding
- Settings dashboard: Business logo uploader, agency profile form, "Select Local Backup Folder" button (`showDirectoryPicker()`), Turso DB connection test card, and theme mode switchers.