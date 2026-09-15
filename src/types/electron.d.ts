import { DatabaseResponse, AuthResponse, CashSessionData } from '../../electron/preload';

declare global {
  interface Window {
    api: {
      dbExecute: (sql: string, args?: unknown[]) => Promise<DatabaseResponse>;
      dbQuery: <T = unknown>(sql: string, args?: unknown[]) => Promise<DatabaseResponse<T[]>>;
      authenticate: (username: string, pin: string) => Promise<AuthResponse>;
      onSyncStatusUpdate: (callback: (status: string) => void) => void;
      printReceipt: (receiptText: string) => Promise<DatabaseResponse>;
      getCashSessions: (branchId: string) => Promise<DatabaseResponse<CashSessionData[]>>;
      openCashSession: (branchId: string, openingBalance: number, userId: string, userName: string) => Promise<DatabaseResponse<{ id: string }>>;
      closeCashSession: (sessionId: string, closingBalance: number, expectedBalance: number, variance: number, userId: string, userName: string) => Promise<DatabaseResponse<{ id: string }>>;
      checkForUpdates: () => Promise<{ success: boolean; updateInfo?: any; error?: string }>;
      installUpdate: () => Promise<{ success: boolean; error?: string }>;
      onUpdateStatus: (callback: (status: string, info?: string) => void) => void;
      onUpdateProgress: (callback: (percent: number) => void) => void;
    };
  }
}

export interface User {
  id: string;
  username: string;
  password_hash: string;
  full_name: string;
  role: 'ADMIN' | 'MANAGER' | 'CASHIER';
  status: 'ACTIVE' | 'SUSPENDED';
  created_at: string;
  updated_at: string;
}

export interface Branch {
  id: string;
  branch_name: string;
  branch_code: string;
  city: string;
  address: string | null;
  phone_number: string | null;
  email: string | null;
  manager_name: string | null;
  is_active: number;
  status: string;
  total_plots?: number;
  total_revenue?: number;
  created_at: string;
}

export interface PlotRecord {
  id: string;
  branch_id: string;
  plot_number: string;
  society_name: string;
  block_phase: string;
  size_dimension: string;
  category: 'RESIDENTIAL' | 'COMMERCIAL' | 'INDUSTRIAL' | 'AGRICULTURAL';
  feature_tags: string | null;
  purchase_date: string;
  purchase_price: number;
  target_asking_price: number;
  floor_price: number;
  gps_coordinates: string | null;
  status: 'AVAILABLE' | 'SOLD' | 'ON_HOLD' | 'UNDER_DEVELOPMENT' | 'BOOKED';
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CashCounterRecord {
  id: string;
  branch_id: string;
  user_id: string;
  transaction_type: 'CASH_IN' | 'CASH_OUT';
  category: string;
  amount: number;
  notes: string | null;
  handed_over_by: string | null;
  received_by: string | null;
  created_at: string;
}

export interface CashDenomination {
  id: string;
  cash_counter_id: string;
  notes_5000: number;
  notes_1000: number;
  notes_500: number;
  notes_100: number;
  notes_50: number;
  notes_20: number;
  notes_10: number;
  total_calculated: number;
  created_at: string;
}

export interface DenominationBreakdown {
  notes_5000: number;
  notes_1000: number;
  notes_500: number;
  notes_100: number;
  notes_50: number;
  notes_20: number;
  notes_10: number;
}

export interface CashSession {
  id: string;
  branch_id: string;
  opened_by: string;
  closed_by: string | null;
  opening_balance: number;
  closing_balance: number | null;
  expected_balance: number | null;
  variance: number | null;
  status: 'OPEN' | 'CLOSED';
  opened_at: string;
  closed_at: string | null;
}

export interface Lead {
  id: string;
  branch_id: string;
  prospect_name: string;
  phone_number: string;
  interested_category: string | null;
  budget_range: number | null;
  lead_source: string | null;
  assigned_agent_id: string | null;
  pipeline_stage: 'NEW_LEAD' | 'CONTACTED' | 'SITE_VISIT' | 'NEGOTIATION' | 'CLOSED_WON' | 'CLOSED_LOST';
  priority: 'HOT' | 'WARM' | 'COLD';
  created_at: string;
  updated_at: string;
}

export interface SiteVisit {
  id: string;
  lead_id: string;
  plot_id: string | null;
  visit_date: string;
  status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
  feedback_notes: string | null;
  created_at: string;
}

export interface Agent {
  id: string;
  agency_name: string | null;
  agent_name: string;
  phone_number: string;
  cnic: string | null;
  commission_type: 'PERCENTAGE' | 'FIXED';
  commission_rate: number;
  created_at: string;
}

export interface AgentCommission {
  id: string;
  agent_id: string;
  transaction_id: string;
  commission_earned: number;
  commission_paid: number;
  balance_due: number;
  status: 'UNPAID' | 'PARTIAL' | 'PAID';
  created_at: string;
}

export interface SalesTransaction {
  id: string;
  plot_id: string;
  buyer_name: string;
  buyer_phone: string;
  buyer_cnic: string;
  final_sale_price: number;
  cost_basis: number;
  development_costs: number;
  agent_commission: number;
  government_taxes: number;
  net_profit_calculated: number;
  payment_method: 'CASH' | 'BANK_TRANSFER' | 'PAY_ORDER';
  agent_id: string | null;
  sale_date: string;
  created_at: string;
}

export interface InstallmentPlan {
  id: string;
  plot_id: string;
  buyer_name: string;
  buyer_phone: string;
  buyer_cnic: string;
  total_sale_price: number;
  down_payment: number;
  plan_duration_months: number;
  monthly_installment_amount: number;
  start_date: string;
  due_day_of_month: number;
  grace_period_days: number;
  late_penalty_fee: number;
  status: 'ACTIVE' | 'COMPLETED' | 'DEFAULTED';
  created_at: string;
}

export interface InstallmentSchedule {
  id: string;
  plan_id: string;
  installment_number: number;
  due_date: string;
  amount_due: number;
  amount_paid: number;
  late_fine_charged: number;
  discount_applied: number;
  payment_date: string | null;
  payment_method: string | null;
  status: 'PENDING' | 'PAID' | 'OVERDUE';
  created_at: string;
}

export interface DigiKhataParty {
  id: string;
  party_name: string;
  phone_number: string;
  party_type: 'CUSTOMER' | 'VENDOR' | 'INVESTOR' | 'AGENT' | 'PARTNER';
  current_balance: number;
  created_at: string;
}

export interface DigiKhataEntry {
  id: string;
  party_id: string;
  entry_type: 'CREDIT_LENA' | 'DEBIT_DENA';
  amount: number;
  description: string;
  due_date: string | null;
  attachment_url: string | null;
  created_at: string;
}

export interface InvestorDeal {
  id: string;
  plot_id: string;
  investor_party_id: string;
  capital_invested: number;
  equity_share_percentage: number;
  payout_status: 'PENDING' | 'DISBURSED';
  created_at: string;
}

export interface ConstructionProject {
  id: string;
  project_name: string;
  linked_plot_or_society: string | null;
  estimated_budget: number;
  total_spent: number;
  status: 'PLANNING' | 'IN_PROGRESS' | 'ON_HOLD' | 'COMPLETED';
  created_at: string;
}

export interface ConstructionExpense {
  id: string;
  project_id: string;
  expense_type: 'MATERIAL' | 'LABOR' | 'MISC';
  vendor_name: string | null;
  description: string;
  amount: number;
  receipt_photo_url: string | null;
  created_at: string;
}

export interface MaterialStock {
  id: string;
  material_name: string;
  quantity_in_stock: number;
  unit_measure: string;
  last_purchased_rate: number;
  updated_at: string;
}

export interface OfficeExpense {
  id: string;
  branch_id: string;
  category: 'UTILITY_BILLS' | 'SALARIES' | 'TEA_FOOD' | 'MARKETING' | 'SOFTWARE' | 'MISC';
  amount: number;
  description: string;
  payment_method: string;
  expense_date: string;
  created_at: string;
}

export interface DocumentVault {
  id: string;
  document_title: string;
  reference_type: 'PLOT' | 'BUYER' | 'SELLER' | 'CONSTRUCTION';
  reference_id: string;
  file_path_or_base64: string;
  qr_verification_hash: string;
  expiry_date: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  module: string;
  details: string;
  ip_address: string | null;
  created_at: string;
}

export interface WhatsAppTemplate {
  id: string;
  template_key: string;
  message_body: string;
  created_at: string;
}

export interface TaxRule {
  id: string;
  tax_name: string;
  tax_percentage: number;
  applies_to: 'BUYER' | 'SELLER';
  created_at: string;
}

export interface SyncQueue {
  id: string;
  action_type: 'INSERT' | 'UPDATE' | 'DELETE';
  target_table: string;
  payload_json: string;
  status: 'PENDING' | 'SYNCED' | 'FAILED';
  retry_count: number;
  created_at: string;
}

export interface AgencySettings {
  id: string;
  agency_name: string;
  tagline: string | null;
  phone_primary: string | null;
  whatsapp_number: string | null;
  address: string | null;
  currency_symbol: string;
  logo_url_or_base64: string | null;
  local_backup_folder_path: string | null;
  turso_db_url: string | null;
  turso_sync_status: string;
  created_at: string;
  updated_at: string;
}

export interface Plaza {
  id: string;
  branch_id: string;
  plaza_name: string;
  city_location: string;
  total_floors: number;
  created_at: string;
}

export interface PlazaUnit {
  id: string;
  plaza_id: string;
  floor_level: string;
  unit_number: string;
  covered_area_sqft: number;
  rate_per_sqft: number;
  target_price: number;
  target_monthly_rent: number;
  maintenance_fee: number;
  status: 'AVAILABLE' | 'SOLD' | 'RENTED' | 'ON_HOLD';
  tenant_name: string | null;
  tenant_phone: string | null;
  lease_expiry_date: string | null;
  security_deposit: number;
  created_at: string;
}

export interface LandAcquisition {
  id: string;
  seller_name: string;
  seller_phone: string;
  seller_cnic: string;
  land_title_khata: string;
  total_agreed_price: number;
  advance_paid: number;
  debt_remaining: number;
  acquisition_date: string;
  registry_doc_url: string | null;
  created_at: string;
}