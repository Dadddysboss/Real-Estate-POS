import { SalesTransaction } from '../types/electron';
import { logAudit } from './audit.service';
import { queueMutation } from './sync.service';

export interface SalePayload {
  plot_id: string;
  buyer_name: string;
  buyer_phone: string;
  buyer_cnic: string | null;
  plot_area_sqft: number;
  plot_rate_per_sqft: number;
  stamp_duty_rate: number;
  reg_fees: number;
  vat_rate: number;
  agent_id: string | null;
  agent_commission_amount: number;
  cash_paid: number;
  installment_amount: number;
  installment_months: number | null;
  installment_start_date: string | null;
  installment_interest_rate: number;
  payment_mode: 'CASH' | 'BANK_TRANSFER' | 'CHEQUE';
  receipt_number: string | null;
}

// ------------------------------------------------------------------
// SALE OPERATIONS
// ------------------------------------------------------------------

export async function fetchSales(): Promise<SalesTransaction[]> {
  const sql = `SELECT * FROM sales_transactions ORDER BY sale_date DESC`;
  const res = await window.api.dbQuery(sql, []);
  if (!res.success || !res.data) throw new Error(res.error || 'Failed to fetch sales');
  return res.data as SalesTransaction[];
}

export async function fetchSalesByBranch(_branchId: string): Promise<SalesTransaction[]> {
  const sql = `SELECT * FROM sales_transactions ORDER BY sale_date DESC`;
  const res = await window.api.dbQuery(sql, []);
  if (!res.success || !res.data) throw new Error(res.error || 'Failed to fetch sales');
  return res.data as SalesTransaction[];
}

export async function createSale(
  userId: string,
  userName: string,
  _branchId: string,
  payload: SalePayload
): Promise<string> {
  const saleId = `SALE_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const totalPlotValue = Math.round(payload.plot_area_sqft * payload.plot_rate_per_sqft);
  const stampDuty = Math.round(totalPlotValue * payload.stamp_duty_rate / 100);
  const vat = Math.round(totalPlotValue * payload.vat_rate / 100);
  const totalFees = stampDuty + payload.reg_fees + vat;
  const totalSalePrice = totalPlotValue + totalFees;
  const agentCommission = payload.agent_id ? payload.agent_commission_amount : 0;
  const netRevenue = totalSalePrice - agentCommission;

  const sql = `
    INSERT INTO sales_transactions (
      id, plot_id, buyer_name, buyer_phone, buyer_cnic,
      final_sale_price, cost_basis, development_costs,
      agent_commission, government_taxes, net_profit_calculated,
      payment_method, agent_id, sale_date, created_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
  `;
  const res = await window.api.dbExecute(sql, [
    saleId, payload.plot_id, payload.buyer_name, payload.buyer_phone, payload.buyer_cnic || '',
    totalSalePrice, agentCommission, Math.round(netRevenue),
    payload.payment_mode, payload.agent_id || ''
  ]);
  if (!res.success) throw new Error(res.error || 'Failed to create sale');

  await queueMutation('INSERT', 'sales_transactions', { id: saleId, ...payload });
  await logAudit({
    userId, userName, actionType: 'CREATE', moduleName: 'SALES',
    entityId: saleId,
    description: `Sale recorded: ${payload.buyer_name} — Rs. ${totalSalePrice.toLocaleString()}`,
  });

  await window.api.dbExecute(`UPDATE inventory_plots SET status = 'SOLD' WHERE id = ?`, [payload.plot_id]);

  return saleId;
}

export async function deleteSale(
  saleId: string,
  userId: string,
  userName: string,
  ref: string
): Promise<void> {
  const res = await window.api.dbExecute(`DELETE FROM sales_transactions WHERE id = ?`, [saleId]);
  if (!res.success) throw new Error(res.error || 'Failed to delete sale');
  await queueMutation('DELETE', 'sales_transactions', { id: saleId });
  await logAudit({
    userId, userName, actionType: 'DELETE', moduleName: 'SALES',
    entityId: saleId, description: `Sale deleted: ${ref}`
  });
}

export async function cancelSale(
  saleId: string,
  userId: string,
  userName: string,
  reason: string
): Promise<void> {
  await window.api.dbExecute(`DELETE FROM sales_transactions WHERE id = ?`, [saleId]);
  await queueMutation('DELETE', 'sales_transactions', { id: saleId });
  await logAudit({
    userId, userName, actionType: 'DELETE', moduleName: 'SALES',
    entityId: saleId, description: `Sale cancelled: ${reason}`
  });
}

// ------------------------------------------------------------------
// RECEIPT / PRINT
// ------------------------------------------------------------------

export function generateSaleReceiptText(sale: SalesTransaction): string {
  const lines: string[] = [];
  lines.push('═══════════════════════════════════════════════════════════════════════');
  lines.push('                              REAL ESTATE POS');
  lines.push('                    ════════════════════════════════════════════════════');
  lines.push('');
  lines.push(`  Sale ID    : ${sale.id}`);
  lines.push(`  Date       : ${sale.sale_date}`);
  lines.push(`  Buyer      : ${sale.buyer_name}`);
  if (sale.buyer_phone) lines.push(`  Phone      : ${sale.buyer_phone}`);
  if (sale.buyer_cnic) lines.push(`  CNIC       : ${sale.buyer_cnic}`);
  lines.push('');
  lines.push('───────────────────────────────────────────────────────────────────────');
  lines.push(`  Plot ID    : ${sale.plot_id}`);
  lines.push(`  Sale Price : Rs. ${sale.final_sale_price.toLocaleString()}`);
  lines.push(`  Agent Comm : Rs. ${sale.agent_commission.toLocaleString()}`);
  lines.push(`  Govt Taxes : Rs. ${sale.government_taxes.toLocaleString()}`);
  lines.push(`  Net Profit : Rs. ${sale.net_profit_calculated.toLocaleString()}`);
  lines.push('───────────────────────────────────────────────────────────────────────');
  lines.push(`  Payment    : ${sale.payment_method}`);
  lines.push('');
  lines.push('═══════════════════════════════════════════════════════════════════════');
  lines.push('              Thank you for your purchase!');
  lines.push('═══════════════════════════════════════════════════════════════════════');
  return lines.join('\n');
}

export async function printSaleReceipt(sale: SalesTransaction) {
  const text = generateSaleReceiptText(sale);
  const res = await window.api.printReceipt(text);
  if (!res.success) throw new Error(res.error || 'Failed to print receipt');
}