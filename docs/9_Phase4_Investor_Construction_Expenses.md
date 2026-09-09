# 9. Phase 4 Implementation Blueprint – Investor Pools, Construction & Daily Operations (Modules 13–15)
**Project Name:** Real Estate POS & DigiKhata ERP (Master Security & Enterprise Edition)
**Scope:** Phase 4 Execution (Modules 13 to 15: Investor Pools & Profit Sharing Engine, Construction Materials Stock Tracker, & Daily Office Expenses Petty Cash Ledger)
**Enforcement Level:** High Financial Precision, Automated Equity Calculation, Parameterized SQL, Dual-Sync Compliance

---

## 1. Phase 4 Architecture Overview & Module Scope

Phase 4 manages joint-venture investor pools, operational construction material logistics, and daily office expenditure tracking linked with physical cash reserves.

┌─────────────────────────────────────────────────────────────────────────────────┐
│                           PHASE 4 MODULE ARCHITECTURE                           │
├───────────────────┬─────────────────────────────────────────────────────────────┤
│ Module 13         │ Investor Pools & Equity Profit Sharing Engine               │
├───────────────────┼─────────────────────────────────────────────────────────────┤
│ Module 14         │ Construction Projects & Raw Material Stock Tracking Engine  │
├───────────────────┼─────────────────────────────────────────────────────────────┤
│ Module 15         │ Daily Office Expenses & Petty Cash Drawer Ledger Engine     │
└───────────────────┴─────────────────────────────────────────────────────────────┘


---

## 2. IPC Service Layer & Operations Database Queries (`src/services/operations.service.ts`)

```typescript
import { DatabaseResponse } from '../../electron/preload';

export interface InvestorPool {
  id: string;
  branch_id: string;
  pool_name: string;
  target_capital: number;
  raised_capital: number;
  status: 'OPEN' | 'ACTIVE' | 'CLOSED' | 'LIQUIDATED';
  created_at?: string;
}

export interface InvestorMember {
  id: string;
  pool_id: string;
  investor_name: string;
  phone: string;
  invested_amount: number;
  equity_percentage: number;
  total_payout_received: number;
}

export interface ConstructionProject {
  id: string;
  branch_id: string;
  project_name: string;
  site_location: string;
  budget_allocated: number;
  total_spent: number;
  status: 'PLANNING' | 'IN_PROGRESS' | 'ON_HOLD' | 'COMPLETED';
}

export interface MaterialStockItem {
  id: string;
  project_id: string;
  item_name: string;
  unit: 'BAGS' | 'TONS' | 'FEET' | 'UNITS' | 'KG';
  quantity_in_stock: number;
  min_stock_alert: number;
  unit_cost: number;
}

export interface DailyExpenseRecord {
  id: string;
  branch_id: string;
  category_name: string;
  amount: number;
  payment_source: 'CASH_DRAWER' | 'BANK_ACCOUNT' | 'PETTY_CASH';
  approved_by: string;
  description: string;
  voucher_number: string;
  created_at?: string;
}

// ------------------------------------------------------------------
// INVESTOR POOL & PROFIT DISBURSEMENT OPERATIONS
// ------------------------------------------------------------------

export async function fetchInvestorPools(branchId: string): Promise<InvestorPool[]> {
  const sql = `SELECT * FROM investor_pools WHERE branch_id = ? ORDER BY created_at DESC`;
  const res: DatabaseResponse<InvestorPool[]> = await window.api.dbQuery(sql, [branchId]);
  if (!res.success || !res.data) throw new Error(res.error || 'Failed to fetch investor pools.');
  return res.data;
}

export async function fetchPoolMembers(poolId: string): Promise<InvestorMember[]> {
  const sql = `SELECT * FROM investor_members WHERE pool_id = ? ORDER BY invested_amount DESC`;
  const res: DatabaseResponse<InvestorMember[]> = await window.api.dbQuery(sql, [poolId]);
  if (!res.success || !res.data) throw new Error(res.error || 'Failed to fetch pool members.');
  return res.data;
}

export async function distributePoolProfit(
  poolId: string,
  totalProfitAmount: number,
  notes: string
): Promise<void> {
  const members = await fetchPoolMembers(poolId);
  if (members.length === 0) throw new Error('Cannot distribute profit to an empty pool.');

  const payoutBatchId = `PAYOUT_${Date.now()}`;

  for (const member of members) {
    const memberProfitShare = Math.round((totalProfitAmount * member.equity_percentage) / 100);

    // 1. Record Individual Payout
    const payoutSql = `
      INSERT INTO investor_payouts (id, batch_id, pool_id, member_id, amount_paid, equity_percentage, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `;
    const payoutId = `PAY_${payoutBatchId}_${member.id}`;
    await window.api.dbExecute(payoutSql, [
      payoutId, payoutBatchId, poolId, member.id, memberProfitShare, member.equity_percentage, notes
    ]);

    // 2. Update Member Total Payout Received
    const updateMemberSql = `
      UPDATE investor_members 
      SET total_payout_received = total_payout_received + ? 
      WHERE id = ?
    `;
    await window.api.dbExecute(updateMemberSql, [memberProfitShare, member.id]);
  }
}

// ------------------------------------------------------------------
// CONSTRUCTION & MATERIAL LOGISTICS OPERATIONS
// ------------------------------------------------------------------

export async function fetchMaterialStock(projectId: string): Promise<MaterialStockItem[]> {
  const sql = `SELECT * FROM construction_material_stock WHERE project_id = ? ORDER BY item_name ASC`;
  const res: DatabaseResponse<MaterialStockItem[]> = await window.api.dbQuery(sql, [projectId]);
  if (!res.success || !res.data) throw new Error(res.error || 'Failed to fetch construction materials.');
  return res.data;
}

export async function logMaterialUsage(
  projectId: string,
  materialId: string,
  quantityUsed: number,
  notes: string
): Promise<void> {
  // 1. Deduct Material Quantity
  const deductSql = `
    UPDATE construction_material_stock 
    SET quantity_in_stock = quantity_in_stock - ? 
    WHERE id = ? AND quantity_in_stock >= ?
  `;
  const res = await window.api.dbExecute(deductSql, [quantityUsed, materialId, quantityUsed]);
  if (!res.success) throw new Error(res.error || 'Insufficient material stock available.');

  // 2. Log Usage Ledger
  const logSql = `
    INSERT INTO construction_material_logs (id, project_id, material_id, quantity_used, notes, created_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `;
  const logId = `MATLOG_${Date.now()}`;
  await window.api.dbExecute(logSql, [logId, projectId, materialId, quantityUsed, notes]);
}

// ------------------------------------------------------------------
// DAILY OFFICE EXPENSES OPERATIONS
// ------------------------------------------------------------------

export async function recordDailyExpense(expense: Omit<DailyExpenseRecord, 'id' 'voucher_number' |>): Promise<string> {
  const expenseId = `EXP_${Date.now()}`;
  const voucherNum = `VOUCH-${Math.floor(100000 + Math.random() * 900000)}`;

  const sql = `
    INSERT INTO daily_expenses (id, branch_id, category_name, amount, payment_source, approved_by, description, voucher_number, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `;
  const args = [
    expenseId, expense.branch_id, expense.category_name, expense.amount,
    expense.payment_source, expense.approved_by, expense.description, voucherNum
  ];

  const res = await window.api.dbExecute(sql, args);
  if (!res.success) throw new Error(res.error || 'Failed to record daily expense.');

  return voucherNum;
}
3. UI Component Implementations
A. Module 13: Investor Pools & Equity Profit Sharing (src/components/investors/InvestorPools.tsx)
TypeScript
import React, { useState, useEffect } from 'react';
import { Users, TrendingUp, DollarSign, Award, ChevronRight, PieChart } from 'lucide-react';
import { fetchInvestorPools, fetchPoolMembers, distributePoolProfit, InvestorPool, InvestorMember } from '../../services/operations.service';

interface InvestorPoolsProps {
  branchId: string;
}

export const InvestorPools: React.FC<InvestorPoolsProps> = ({ branchId }) => {
  const [pools, setPools] = useState<InvestorPool[]>([]);
  const [selectedPool, setSelectedPool] = useState<InvestorPool null |>(null);
  const [members, setMembers] = useState<InvestorMember[]>([]);
  
  // Profit Distribution Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [totalProfit, setTotalProfit] = useState<number>(0);
  const [disbursementNotes, setDisbursementNotes] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadPools();
  }, [branchId]);

  useEffect(() => {
    if (selectedPool) {
      loadMembers(selectedPool.id);
    }
  }, [selectedPool]);

  const loadPools = async () => {
    try {
      const data = await fetchInvestorPools(branchId);
      setPools(data);
      if (data.length > 0) setSelectedPool(data[0]);
    } catch (err) {
      console.error(err);
    }
  };

  const loadMembers = async (poolId: string) => {
    try {
      const data = await fetchPoolMembers(poolId);
      setMembers(data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDisburseProfit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPool || totalProfit <= 0) return;

    setLoading(true);
    try {
      await distributePoolProfit(selectedPool.id, totalProfit, disbursementNotes);
      alert('Profit share distributed successfully across all pool members!');
      setIsModalOpen(false);
      setTotalProfit(0);
      setDisbursementNotes('');
      loadMembers(selectedPool.id);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 select-none">
      {/* Pool Selector Column */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex items-center space-x-3 pb-3 border-b border-slate-800">
          <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl">
            <PieChart size="{20}"/>
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">Investor Venture Pools</h2>
            <p className="text-[11px] text-slate-400">Equity Partnerships & Capital Pools</p>
          </div>
        </div>

        <div className="space-y-2">
          {pools.map((pool) => (
            <button
              key={pool.id}
              onClick={() => setSelectedPool(pool)}
              className={`w-full text-left p-3.5 rounded-xl transition-all border ${
                selectedPool?.id === pool.id
                  ? 'bg-emerald-500/10 border-emerald-500/40 text-white'
                  : 'bg-slate-950 border-slate-800/80 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <div className="flex justify-between items-center">
                <span className="font-bold text-sm">{pool.pool_name}</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {pool.status}
                </span>
              </div>
              <div className="mt-2 text-xs flex justify-between text-slate-400">
                <span>Raised Capital</span>
                <span className="font-mono text-white font-semibold">Rs. {(pool.raised_capital / 100000).toFixed(1)} Lac</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Selected Pool Details & Members Table */}
      <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
        {selectedPool ? (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
              <div>
                <h2 className="text-lg font-bold text-white">{selectedPool.pool_name}</h2>
                <p className="text-xs text-slate-400">
                  Target Capital: <span className="text-white font-mono font-semibold">Rs. {selectedPool.target_capital.toLocaleString()}</span>
                </p>
              </div>

              <button
                onClick={() => setIsModalOpen(true)}
                className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 rounded-xl font-semibold text-xs transition-all shadow-md shadow-emerald-950/40"
              >
                <TrendingUp size="{16}"/>
                <span>Distribute Profit Payout</span>
              </button>
            </div>

            {/* Member Equity Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 uppercase font-semibold">
                    <th className="pb-3">Investor Name</th>
                    <th className="pb-3 text-right">Investment (PKR)</th>
                    <th className="pb-3 text-center">Equity Share</th>
                    <th className="pb-3 text-right">Total Payouts</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {members.map((member) => (
                    <tr key={member.id}>
                      <td className="py-3.5">
                        <span className="font-bold text-white block">{member.investor_name}</span>
                        <span className="text-[10px] text-slate-500">{member.phone}</span>
                      </td>
                      <td className="py-3.5 text-right font-mono font-semibold text-slate-200">
                        Rs. {member.invested_amount.toLocaleString()}
                      </td>
                      <td className="py-3.5 text-center">
                        <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-400 font-mono font-bold rounded-lg text-xs">
                          {member.equity_percentage}%
                        </span>
                      </td>
                      <td className="py-3.5 text-right font-mono font-bold text-emerald-400">
                        Rs. {member.total_payout_received.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="text-center py-12 text-slate-500 text-xs">
            Select a venture pool from the left panel to inspect equity members.
          </div>
        )}
      </div>

      {/* Distribution Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white mb-1">Execute Profit Share Disbursement</h3>
            <p className="text-xs text-slate-400 mb-4">Calculates payouts automatically based on member equity %.</p>

            <form onSubmit={handleDisburseProfit} className="space-y-4">
              <div>
                <label className="text-xs text-slate-300 block mb-1">Total Pool Profit (PKR)</label>
                <input
                  type="number"
                  required
                  value={totalProfit || ''}
                  onChange={(e) => setTotalProfit(Number(e.target.value))}
                  placeholder="e.g. 500000"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-sm text-white font-mono"
                />
              </div>

              <div>
                <label className="text-xs text-slate-300 block mb-1">Disbursement Remarks / Cycle</label>
                <input
                  type="text"
                  required
                  value={disbursementNotes}
                  onChange={(e) => setDisbursementNotes(e.target.value)}
                  placeholder="e.g. Q3 Profit Share - Block A Development"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-sm text-white"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs"
                >
                  {loading ? 'Executing Batch...' : 'Disburse Profits'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
B. Module 15: Daily Office Expenses & Petty Cash Ledger (src/components/expenses/ExpenseLogger.tsx)
TypeScript
import React, { useState } from 'react';
import { DollarSign, FileText, CheckCircle2, Wallet, Plus } from 'lucide-react';
import { recordDailyExpense, DailyExpenseRecord } from '../../services/operations.service';

interface ExpenseLoggerProps {
  branchId: string;
}

export const ExpenseLogger: React.FC<ExpenseLoggerProps> = ({ branchId }) => {
  const [category, setCategory] = useState('OFFICE_SUPPLIES');
  const [amount, setAmount] = useState<number>(0);
  const [paymentSource, setPaymentSource] = useState<'CASH_DRAWER' | 'BANK_ACCOUNT' | 'PETTY_CASH'>('PETTY_CASH');
  const [approvedBy, setApprovedBy] = useState('');
  const [description, setDescription] = useState('');
  const [voucher, setVoucher] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmitExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (amount <= 0 || !approvedBy || !description) return;

    setLoading(true);
    try {
      const generatedVoucher = await recordDailyExpense({
        branch_id: branchId,
        category_name: category,
        amount,
        payment_source: paymentSource,
        approved_by: approvedBy,
        description,
      });

      setVoucher(generatedVoucher);
      setAmount(0);
      setDescription('');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6 select-none">
      <div className="flex items-center space-x-3 pb-4 border-b border-slate-800">
        <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl">
          <Wallet size="{22}"/>
        </div>
        <div>
          <h2 className="text-lg font-bold text-white">Daily Office Expenses & Petty Cash Logger</h2>
          <p className="text-xs text-slate-400">Voucher Generation & Cash Drawer Integration</p>
        </div>
      </div>

      {voucher ? (
        <div className="p-6 text-center space-y-3 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl">
          <CheckCircle2 className="text-emerald-400 mx-auto" size="{40}"/>
          <h3 className="text-base font-bold text-white">Expense Voucher Recorded</h3>
          <p className="text-xs text-slate-300 font-mono">Voucher Code: {voucher}</p>
          <button
            onClick={() => setVoucher(null)}
            className="mt-2 px-5 py-2 bg-emerald-600 text-white font-semibold rounded-xl text-xs"
          >
            Log Another Expense
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmitExpense} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-300 block mb-1">Expense Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-sm text-white"
              >
                <option value="OFFICE_SUPPLIES">Office Supplies & Stationery</option>
                <option value="UTILITIES">Electricity & Internet Bills</option>
                <option value="TEA_REFRESHMENTS">Tea & Client Refreshments</option>
                <option value="SITE_TRANSPORT">Site Transport & Fuel</option>
                <option value="MARKETING_ADS">Local Marketing & Printing</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-slate-300 block mb-1">Payment Source Reserve</label>
              <select
                value={paymentSource}
                onChange={(e) => setPaymentSource(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-sm text-white"
              >
                <option value="PETTY_CASH">Petty Cash Reserve</option>
                <option value="CASH_DRAWER">Main Cash Counter Drawer</option>
                <option value="BANK_ACCOUNT">Company Bank Account</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-300 block mb-1">Amount Spent (PKR)</label>
              <input
                type="number"
                required
                value={amount || ''}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-sm text-white font-mono"
              />
            </div>
            <div>
              <label className="text-xs text-slate-300 block mb-1">Approving Manager Name</label>
              <input
                type="text"
                required
                value={approvedBy}
                onChange={(e) => setApprovedBy(e.target.value)}
                placeholder="e.g. Branch Manager"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-sm text-white"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-300 block mb-1">Voucher Description / Purpose</label>
            <input
              type="text"
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Purchased 5 boxes of A4 paper and printer ink"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-sm text-white"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-sm transition-all shadow-lg shadow-emerald-950/50 flex items-center justify-center space-x-2"
          >
            <Plus size="{16}"/>
            <span>{loading ? 'Recording Expense...' : 'Record Voucher & Deduct Cash'}</span>
          </button>
        </form>
      )}
    </div>
  );
};
4. Pre-Flight Verification Checklist for Phase 4
Before approving Phase 4 implementation, confirm:

[ ] Type Check: npx tsc --noEmit yields zero errors across operations.service.ts, InvestorPools.tsx, and ExpenseLogger.tsx.

[ ] Equity Integrity: Investor profit shares calculate accurately up to 2 decimal places without remainder leakage.

[ ] Cash Reservation Audit: Expenses deducted from CASH_DRAWER automatically update the physical counter state from Module 2.

[ ] Material Stock Validation: Construction raw material usage queries prevent negative stock balances.