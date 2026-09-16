import { DatabaseResponse } from '../../electron/preload';
import { calculateCurrentBalance } from './cash.service';

export interface DashboardMetrics {
  totalInventoryValuation: number;
  totalSales: number;
  totalProfit: number;
  installmentRecoveryRate: number;
  cashCounterBalance: number;
  digikhataLena: number;
  digikhataDena: number;
  agentCommissionDebt: number;
  investorCapital: number;
}

export interface MonthlyRevenueData {
  month: string;
  revenue: number;
  profit: number;
  expenses: number;
}

export interface InventoryVelocityData {
  category: string;
  count: number;
  value: number;
}

export interface LeadConversionData {
  stage: string;
  count: number;
}

export async function fetchDashboardMetrics(branchId: string): Promise<DashboardMetrics> {
  try {
    // Total Inventory Valuation
    const invSql = `SELECT COALESCE(SUM(target_asking_price), 0) as total FROM inventory_plots WHERE branch_id = ? AND status = 'AVAILABLE'`;
    const invRes: DatabaseResponse<{ total: number }[]> = await window.api.dbQuery(invSql, [branchId]);
    const totalInventoryValuation = invRes.data?.[0]?.total || 0;

    // Total Sales (completed)
    const salesSql = `SELECT COALESCE(SUM(final_sale_price), 0) as total FROM sales_transactions st JOIN inventory_plots p ON st.plot_id = p.id WHERE p.branch_id = ?`;
    const salesRes: DatabaseResponse<{ total: number }[]> = await window.api.dbQuery(salesSql, [branchId]);
    const totalSales = salesRes.data?.[0]?.total || 0;

    // Total Profit
    const profitSql = `SELECT COALESCE(SUM(net_profit_calculated), 0) as total FROM sales_transactions st JOIN inventory_plots p ON st.plot_id = p.id WHERE p.branch_id = ?`;
    const profitRes: DatabaseResponse<{ total: number }[]> = await window.api.dbQuery(profitSql, [branchId]);
    const totalProfit = profitRes.data?.[0]?.total || 0;

    // Installment Recovery Rate (branch resolved via plot ownership)
    const instSql = `
      SELECT 
        COALESCE(SUM(CASE WHEN s.status = 'PAID' THEN s.amount_due ELSE 0 END), 0) as paid,
        COALESCE(SUM(s.amount_due), 0) as total
      FROM installment_schedules s
      JOIN installment_plans p ON s.plan_id = p.id
      JOIN inventory_plots ip ON p.plot_id = ip.id
      WHERE ip.branch_id = ?
    `;
    const instRes: DatabaseResponse<{ paid: number; total: number }[]> = await window.api.dbQuery(instSql, [branchId]);
    const paid = instRes.data?.[0]?.paid || 0;
    const total = instRes.data?.[0]?.total || 1;
    const installmentRecoveryRate = total > 0 ? Math.round((paid / total) * 100) : 0;

    // Cash Counter Balance (session-scoped: float + ledgered movements, snapshot rows excluded)
    const cashCounterBalance = await calculateCurrentBalance(branchId);

    // DigiKhata Lena (Credit)
    const lenaSql = `
      SELECT COALESCE(SUM(amount), 0) as total
      FROM digikhata_entries
      WHERE entry_type = 'CREDIT_LENA'
    `;
    const lenaRes: DatabaseResponse<{ total: number }[]> = await window.api.dbQuery(lenaSql, []);
    const digikhataLena = lenaRes.data?.[0]?.total || 0;

    // DigiKhata Dena (Debit)
    const denaSql = `
      SELECT COALESCE(SUM(amount), 0) as total
      FROM digikhata_entries
      WHERE entry_type = 'DEBIT_DENA'
    `;
    const denaRes: DatabaseResponse<{ total: number }[]> = await window.api.dbQuery(denaSql, []);
    const digikhataDena = denaRes.data?.[0]?.total || 0;

    // Agent Commission Debt
    const agentSql = `SELECT COALESCE(SUM(balance_due), 0) as total FROM agent_commissions WHERE status IN ('UNPAID', 'PARTIAL')`;
    const agentRes: DatabaseResponse<{ total: number }[]> = await window.api.dbQuery(agentSql, []);
    const agentCommissionDebt = agentRes.data?.[0]?.total || 0;

    // Investor Capital
    const investorSql = `SELECT COALESCE(SUM(contributed_amount), 0) as total FROM investors`;
    const investorRes: DatabaseResponse<{ total: number }[]> = await window.api.dbQuery(investorSql, []);
    const investorCapital = Number(investorRes.data?.[0]?.total) || 0;

    return {
      totalInventoryValuation,
      totalSales,
      totalProfit,
      installmentRecoveryRate,
      cashCounterBalance,
      digikhataLena,
      digikhataDena,
      agentCommissionDebt,
      investorCapital,
    };
  } catch (error) {
    console.error('Dashboard metrics error:', error);
    return {
      totalInventoryValuation: 0,
      totalSales: 0,
      totalProfit: 0,
      installmentRecoveryRate: 0,
      cashCounterBalance: 0,
      digikhataLena: 0,
      digikhataDena: 0,
      agentCommissionDebt: 0,
      investorCapital: 0,
    };
  }
}

export async function fetchMonthlyRevenue(branchId: string): Promise<MonthlyRevenueData[]> {
  try {
    const sql = `
      SELECT 
        strftime('%Y-%m', st.created_at) as month,
        COALESCE(SUM(st.final_sale_price), 0) as revenue,
        COALESCE(SUM(st.net_profit_calculated), 0) as profit,
        0 as expenses
      FROM sales_transactions st
      JOIN inventory_plots p ON st.plot_id = p.id
      WHERE p.branch_id = ?
      GROUP BY strftime('%Y-%m', st.created_at)
      ORDER BY month ASC
      LIMIT 12
    `;
    const res: DatabaseResponse<MonthlyRevenueData[]> = await window.api.dbQuery(sql, [branchId]);
    return res.data || [];
  } catch (error) {
    console.error('Monthly revenue error:', error);
    return [];
  }
}

export async function fetchInventoryVelocity(): Promise<InventoryVelocityData[]> {
  try {
    const sql = `
      SELECT 
        category,
        COUNT(*) as count,
        COALESCE(SUM(target_asking_price), 0) as value
      FROM inventory_plots
      WHERE status = 'AVAILABLE'
      GROUP BY category
    `;
    const res: DatabaseResponse<InventoryVelocityData[]> = await window.api.dbQuery(sql, []);
    return res.data || [];
  } catch (error) {
    console.error('Inventory velocity error:', error);
    return [];
  }
}

export async function fetchLeadConversion(): Promise<LeadConversionData[]> {
  try {
    const sql = `
      SELECT pipeline_stage as stage, COUNT(*) as count
      FROM leads
      GROUP BY pipeline_stage
      ORDER BY 
        CASE pipeline_stage 
          WHEN 'NEW_LEAD' THEN 1
          WHEN 'CONTACTED' THEN 2
          WHEN 'SITE_VISIT' THEN 3
          WHEN 'NEGOTIATION' THEN 4
          WHEN 'CLOSED_WON' THEN 5
          WHEN 'CLOSED_LOST' THEN 6
        END
    `;
    const res: DatabaseResponse<LeadConversionData[]> = await window.api.dbQuery(sql, []);
    return res.data || [];
  } catch (error) {
    console.error('Lead conversion error:', error);
    return [];
  }
}