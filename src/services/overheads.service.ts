import { logAudit } from './audit.service';
import { queueMutation } from './sync.service';

export interface ExpensePayload {
  category: string;
  amount: number;
  description: string;
  date: string;
  recurring: boolean;
  recurring_frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY' | null;
  payment_method: 'CASH' | 'BANK_TRANSFER' | 'CHEQUE';
}

export interface AssetPayload {
  asset_name: string;
  category: string;
  purchase_price: number;
  purchase_date: string;
  useful_life_years: number;
  salvage_value: number;
  depreciation_method: 'STRAIGHT_LINE' | 'DECLINING_BALANCE';
}

export interface ExpenseRecord {
  id: string;
  category: string;
  amount: number;
  description: string;
  date: string;
  recurring: boolean;
  recurring_frequency: string | null;
  payment_method: string;
  created_at: string;
}

export interface AssetRecord {
  id: string;
  asset_name: string;
  category: string;
  purchase_price: number;
  purchase_date: string;
  useful_life_years: number;
  salvage_value: number;
  depreciation_method: string;
  annual_depreciation: number;
  current_book_value: number;
  created_at: string;
}

// ------------------------------------------------------------------
// EXPENSE OPERATIONS
// ------------------------------------------------------------------

export async function fetchExpenses(category?: string, limit = 100): Promise<ExpenseRecord[]> {
  let sql = `SELECT * FROM office_expenses`;
  const args: string[] = [];
  if (category) {
    sql += ` WHERE category = ?`;
    args.push(category);
  }
  sql += ` ORDER BY date DESC LIMIT ?`;
  args.push(String(limit));
  const res = await window.api.dbQuery(sql, args);
  if (!res.success || !res.data) throw new Error(res.error || 'Failed to fetch expenses');
  return (res.data as Record<string, unknown>[]).map(row => ({
    id: String(row.id || ''),
    category: String(row.category || ''),
    amount: Number(row.amount) || 0,
    description: String(row.description || ''),
    date: String(row.date || ''),
    recurring: !!row.recurring,
    recurring_frequency: row.recurring_frequency != null ? String(row.recurring_frequency) : null,
    payment_method: String(row.payment_method || 'CASH'),
    created_at: String(row.created_at || ''),
  }));
}

export async function recordExpense(
  userId: string,
  userName: string,
  payload: ExpensePayload
): Promise<string> {
  const id = `EXP_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const sql = `
    INSERT INTO office_expenses (id, category, amount, description, date, recurring, recurring_frequency, payment_method, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `;
  const res = await window.api.dbExecute(sql, [
    id, payload.category, Math.round(payload.amount), payload.description,
    payload.date, payload.recurring, payload.recurring_frequency, payload.payment_method
  ]);
  if (!res.success) throw new Error(res.error || 'Failed to record expense');

  await queueMutation('INSERT', 'office_expenses', { id, ...payload });
  await logAudit({
    userId, userName, actionType: 'CREATE', moduleName: 'EXPENSES',
    entityId: id,
    description: `Expense recorded: ${payload.category} — Rs. ${payload.amount.toLocaleString()}`,
  });
  return id;
}

export async function deleteExpense(expenseId: string, userId: string, userName: string, ref: string): Promise<void> {
  const res = await window.api.dbExecute(`DELETE FROM office_expenses WHERE id = ?`, [expenseId]);
  if (!res.success) throw new Error(res.error || 'Failed to delete expense');
  await queueMutation('DELETE', 'office_expenses', { id: expenseId });
  await logAudit({
    userId, userName, actionType: 'DELETE', moduleName: 'EXPENSES',
    entityId: expenseId, description: `Expense deleted: ${ref}`
  });
}

// ------------------------------------------------------------------
// ASSET & DEPRECIATION OPERATIONS
// ------------------------------------------------------------------

export async function fetchAssets(): Promise<AssetRecord[]> {
  const sql = `SELECT * FROM fixed_assets ORDER BY purchase_date DESC`;
  const res = await window.api.dbQuery(sql, []);
  if (!res.success || !res.data) throw new Error(res.error || 'Failed to fetch assets');
  return (res.data as Record<string, unknown>[]).map(row => ({
    id: String(row.id || ''),
    asset_name: String(row.asset_name || ''),
    category: String(row.category || ''),
    purchase_price: Number(row.purchase_price) || 0,
    purchase_date: String(row.purchase_date || ''),
    useful_life_years: Number(row.useful_life_years) || 1,
    salvage_value: Number(row.salvage_value) || 0,
    depreciation_method: String(row.depreciation_method || 'STRAIGHT_LINE'),
    annual_depreciation: Number(row.annual_depreciation) || 0,
    current_book_value: Number(row.current_book_value) || 0,
    created_at: String(row.created_at || ''),
  }));
}

export async function addAsset(
  userId: string,
  userName: string,
  payload: AssetPayload
): Promise<string> {
  const id = `ASSET_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  
  // Calculate annual depreciation
  let annualDepreciation = 0;
  if (payload.depreciation_method === 'STRAIGHT_LINE') {
    annualDepreciation = (payload.purchase_price - payload.salvage_value) / payload.useful_life_years;
  } else {
    // Declining balance: double the straight-line rate
    const rate = 2 / payload.useful_life_years;
    annualDepreciation = payload.purchase_price * rate;
  }
  const currentBookValue = payload.purchase_price;

  const sql = `
    INSERT INTO fixed_assets (id, branch_id, asset_name, category, purchase_price, purchase_date, useful_life_years, salvage_value, depreciation_method, annual_depreciation, current_book_value, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `;
  const res = await window.api.dbExecute(sql, [
    id, 'BRANCH_MAIN', payload.asset_name, payload.category, Math.round(payload.purchase_price),
    payload.purchase_date, payload.useful_life_years, Math.round(payload.salvage_value),
    payload.depreciation_method, Math.round(annualDepreciation), Math.round(currentBookValue)
  ]);
  if (!res.success) throw new Error(res.error || 'Failed to add asset');

  await queueMutation('INSERT', 'fixed_assets', { id, ...payload });
  await logAudit({
    userId, userName, actionType: 'CREATE', moduleName: 'EXPENSES',
    entityId: id, description: `Fixed asset added: ${payload.asset_name} — Rs. ${payload.purchase_price.toLocaleString()}`,
  });
  return id;
}

export async function calculateDepreciation(assetId: string): Promise<number> {
  const res = await window.api.dbQuery(
    `SELECT * FROM fixed_assets WHERE id = ? LIMIT 1`, [assetId]
  );
  if (!res.success || !res.data || (res.data as unknown[]).length === 0) {
    throw new Error(res.error || `Asset ${assetId} not found`);
  }
  
  const asset = res.data[0] as Record<string, unknown>;
  const purchasePrice = Number(asset.purchase_price) || 0;
  const salvageValue = Number(asset.salvage_value) || 0;
  const usefulLife = Number(asset.useful_life_years) || 1;
  const purchaseDate = new Date(String(asset.purchase_date || ''));
  const today = new Date();
  const yearsElapsed = (today.getTime() - purchaseDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  
  if (asset.depreciation_method === 'STRAIGHT_LINE') {
    const totalDepreciable = purchasePrice - salvageValue;
    const accumulated = totalDepreciable * (yearsElapsed / usefulLife);
    return Math.min(accumulated, totalDepreciable);
  } else {
    const rate = 2 / usefulLife;
    let bookValue = purchasePrice;
    const fullYears = Math.floor(yearsElapsed);
    for (let i = 0; i < fullYears; i++) {
      const dep = bookValue * rate;
      bookValue -= dep;
      if (bookValue < salvageValue) {
        bookValue = salvageValue;
        break;
      }
    }
    return purchasePrice - bookValue;
  }
}

export async function updateAssetBookValue(assetId: string): Promise<void> {
  const depreciation = await calculateDepreciation(assetId);
  const res = await window.api.dbQuery(
    `SELECT * FROM fixed_assets WHERE id = ? LIMIT 1`, [assetId]
  );
  if (!res.success || !res.data || (res.data as unknown[]).length === 0) {
    throw new Error(res.error || `Asset ${assetId} not found`);
  }
  
  const asset = res.data[0] as Record<string, unknown>;
  const purchasePrice = Number(asset.purchase_price) || 0;
  const salvageValue = Number(asset.salvage_value) || 0;
  const newValue = purchasePrice - depreciation;
  
  const updateRes = await window.api.dbExecute(
    `UPDATE fixed_assets SET current_book_value = ? WHERE id = ?`,
    [Math.round(Math.max(newValue, salvageValue)), assetId]
  );
  if (!updateRes.success) throw new Error(updateRes.error || 'Failed to update asset book value');
}

// ------------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------------

export function calculateExpenseSummary(expenses: ExpenseRecord[]) {
  const total = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const recurringTotal = expenses.filter(e => e.recurring).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const oneTimeTotal = expenses.filter(e => !e.recurring).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  
  const byCategory: Record<string, number> = {};
  expenses.forEach((e) => {
    byCategory[e.category] = (byCategory[e.category] || 0) + (Number(e.amount) || 0);
  });
  
  return { total: Number(total) || 0, recurringTotal: Number(recurringTotal) || 0, oneTimeTotal: Number(oneTimeTotal) || 0, byCategory, count: expenses.length };
}
