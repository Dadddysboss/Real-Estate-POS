# 8. Phase 3 Implementation Blueprint – Sales Engine, Installments & DigiKhata Ledgers (Modules 8–12)
**Project Name:** Real Estate POS & DigiKhata ERP (Master Security & Enterprise Edition)
**Scope:** Phase 3 Execution (Modules 8 to 12: Seller/Land Acquisition Ledger, Agent Network, Instant Sales POS, Installment Engine, & DigiKhata Double-Entry Party Ledger)
**Enforcement Level:** Zero SQL Injection, Dual-Sync Local-First Writes, Type-Safe TSX, Strict Financial Precision

---

## 1. Phase 3 Architecture Overview & Module Scope

Phase 3 implements the core revenue-generating and ledger-tracking components of the ERP system, including POS terminal execution, automated amortization/installment schedule logic, tax rules calculation, and double-entry DigiKhata party accounting.

┌─────────────────────────────────────────────────────────────────────────────────┐
│                           PHASE 3 MODULE ARCHITECTURE                           │
├───────────────────┬─────────────────────────────────────────────────────────────┤
│ Module 8          │ Seller & Land Acquisition Ledger (Khasra/Khatuni Tracking)  │
├───────────────────┼─────────────────────────────────────────────────────────────┤
│ Module 9          │ Agent Network & Commission Hierarchy Engine                 │
├───────────────────┼─────────────────────────────────────────────────────────────┤
│ Module 10         │ Instant POS Sales Engine (Auto Tax, Discount & Thermal POS) │
├───────────────────┼─────────────────────────────────────────────────────────────┤
│ Module 11         │ Installment Engine (Auto Schedule Generator & Collector)    │
├───────────────────┼─────────────────────────────────────────────────────────────┤
│ Module 12         │ DigiKhata Double-Entry Party Ledger (Credit / Debit / Balance)│
└───────────────────┴─────────────────────────────────────────────────────────────┘


---

## 2. IPC Service Layer & Financial Database Operations (`src/services/sales.service.ts`)

```typescript
import { DatabaseResponse } from '../../electron/preload';

export interface InstantSalePayload {
  branch_id: string;
  property_id: string;
  property_type: 'PLOT' | 'PLAZA_UNIT';
  customer_name: string;
  customer_cnic: string;
  customer_phone: string;
  is_filer: boolean;
  cost_price: number;
  sale_price: number;
  discount_amount: number;
  tax_amount: number;
  government_duties: number;
  net_amount: number;
  payment_mode: 'CASH' | 'BANK_TRANSFER' | 'CHEQUE';
  agent_id?: string;
  agent_commission_rate?: number;
}

export interface InstallmentPlanPayload {
  sale_id: string;
  branch_id: string;
  total_amount: number;
  down_payment: number;
  number_of_installments: number;
  installment_frequency: 'MONTHLY' | 'QUARTERLY';
  start_date: string;
}

export interface InstallmentScheduleItem {
  id: string;
  plan_id: string;
  installment_number: number;
  due_date: string;
  due_amount: number;
  paid_amount: number;
  status: 'PENDING' | 'PAID' | 'OVERDUE' | 'PARTIAL';
  paid_date?: string;
}

export interface DigiKhataEntry {
  id: string;
  party_id: string;
  branch_id: string;
  entry_type: 'CREDIT' | 'DEBIT'; // CREDIT = Jama (Gave Money), DEBIT = Udhaar (Took Money/Services)
  amount: number;
  description: string;
  reference_bill_id?: string;
  created_at?: string;
}

// ------------------------------------------------------------------
// INSTANT SALE POS TRANSACTIONS
// ------------------------------------------------------------------

export async function processInstantSale(payload: InstantSalePayload): Promise<string> {
  const saleId = `SALE_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const agentCommissionAmount = payload.agent_id && payload.agent_commission_rate 
    ? (payload.sale_price * payload.agent_commission_rate) / 100 
    : 0;

  // 1. Record Primary Sale Transaction
  const saleSql = `
    INSERT INTO sales_transactions (
      id, branch_id, property_id, property_type, customer_name, customer_cnic, customer_phone,
      is_filer, sale_price, discount_amount, tax_amount, government_duties, net_amount,
      payment_mode, agent_id, agent_commission_amount, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED', CURRENT_TIMESTAMP)
  `;

  const saleArgs = [
    saleId,
    payload.branch_id,
    payload.property_id,
    payload.property_type,
    payload.customer_name,
    payload.customer_cnic,
    payload.customer_phone,
    payload.is_filer ? 1 : 0,
    payload.sale_price,
    payload.discount_amount,
    payload.tax_amount,
    payload.government_duties,
    payload.net_amount,
    payload.payment_mode,
    payload.agent_id || null,
    agentCommissionAmount
  ];

  const saleRes = await window.api.dbExecute(saleSql, saleArgs);
  if (!saleRes.success) throw new Error(saleRes.error || 'Failed to process sale record.');

  // 2. Mark Property Inventory Status as SOLD
  const inventoryTable = payload.property_type === 'PLOT' ? 'plots' : 'plaza_units';
  const updatePropSql = `UPDATE ${inventoryTable} SET status = 'SOLD' WHERE id = ?`;
  await window.api.dbExecute(updatePropSql, [payload.property_id]);

  // 3. Queue Mutation into Sync Engine
  const syncQueueSql = `
    INSERT INTO sync_queue (id, action_type, target_table, payload_json, status, created_at)
    VALUES (?, 'INSERT', 'sales_transactions', ?, 'PENDING', CURRENT_TIMESTAMP)
  `;
  await window.api.dbExecute(syncQueueSql, [`SYNC_${saleId}`, JSON.stringify(payload)]);

  return saleId;
}

// ------------------------------------------------------------------
// AUTOMATED INSTALLMENT PLAN GENERATION
// ------------------------------------------------------------------

export async function createInstallmentPlan(payload: InstallmentPlanPayload): Promise<void> {
  const planId = `PLAN_${Date.now()}`;
  const remainingAmount = payload.total_amount - payload.down_payment;
  const installmentAmount = Math.round(remainingAmount / payload.number_of_installments);

  // Insert Master Installment Plan
  const masterSql = `
    INSERT INTO installment_plans (
      id, sale_id, branch_id, total_amount, down_payment, remaining_balance,
      total_installments, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', CURRENT_TIMESTAMP)
  `;
  await window.api.dbExecute(masterSql, [
    planId, payload.sale_id, payload.branch_id, payload.total_amount,
    payload.down_payment, remainingAmount, payload.number_of_installments
  ]);

  // Generate Schedule Breakdown
  let currentDate = new Date(payload.start_date);
  for (let i = 1; i <= payload.number_of_installments; i++) {
    const itemQuery = `
      INSERT INTO installment_schedules (id, plan_id, installment_number, due_date, due_amount, paid_amount, status)
      VALUES (?, ?, ?, ?, ?, 0, 'PENDING')
    `;
    
    // Add Months or Quarters
    if (payload.installment_frequency === 'MONTHLY') {
      currentDate.setMonth(currentDate.getMonth() + 1);
    } else {
      currentDate.setMonth(currentDate.getMonth() + 3);
    }

    const dueDateStr = currentDate.toISOString().split('T')[0];
    const itemId = `SCH_${planId}_${i}`;
    await window.api.dbExecute(itemQuery, [itemId, planId, i, dueDateStr, installmentAmount]);
  }
}

// ------------------------------------------------------------------
// DIGIKHATA DOUBLE-ENTRY LEDGER TRANSACTIONS
// ------------------------------------------------------------------

export async function addPartyLedgerEntry(entry: Omit<DigiKhataEntry, 'id'>): Promise<void> {
  const id = `KHATA_${Date.now()}`;
  const sql = `
    INSERT INTO digikhata_entries (id, party_id, branch_id, entry_type, amount, description, reference_bill_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `;
  const args = [
    id, entry.party_id, entry.branch_id, entry.entry_type,
    entry.amount, entry.description, entry.reference_bill_id || null
  ];

  const res = await window.api.dbExecute(sql, args);
  if (!res.success) throw new Error(res.error || 'Failed to add DigiKhata entry.');

  // Update Party Cached Balance (CREDIT increases balance owed to party, DEBIT increases receivable)
  const balanceAdjustment = entry.entry_type === 'CREDIT' ? entry.amount : -entry.amount;
  const updatePartySql = `UPDATE digikhata_parties SET current_balance = current_balance + ? WHERE id = ?`;
  await window.api.dbExecute(updatePartySql, [balanceAdjustment, entry.party_id]);
}
3. Core UI Component Implementations
A. Module 10: Instant POS Sales Engine (src/components/sales/InstantSalesEngine.tsx)
TypeScript
import React, { useState, useMemo } from 'react';
import { ShoppingBag, Calculator, UserCheck, ShieldAlert, Receipt, CheckCircle2 } from 'lucide-react';
import { processInstantSale, InstantSalePayload } from '../../services/sales.service';

interface InstantSalesEngineProps {
  branchId: string;
}

export const InstantSalesEngine: React.FC<InstantSalesEngineProps> = ({ branchId }) => {
  const [propertyId, setPropertyId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerCnic, setCustomerCnic] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [isFiler, setIsFiler] = useState(true);
  const [salePrice, setSalePrice] = useState<number>(0);
  const [discount, setDiscount] = useState<number>(0);
  const [paymentMode, setPaymentMode] = useState<'CASH' | 'BANK_TRANSFER' | 'CHEQUE'>('CASH');
  const [loading, setLoading] = useState(false);
  const [completedSaleId, setCompletedSaleId] = useState<string | null>(null);

  // Auto Tax Calculations based on FBR Filer/Non-Filer Status Rules
  const calculatedTax = useMemo(() => {
    const taxRate = isFiler ? 0.03 : 0.07; // 3% for Filers, 7% for Non-Filers
    return Math.round(salePrice * taxRate);
  }, [salePrice, isFiler]);

  const governmentDuties = useMemo(() => {
    return Math.round(salePrice * 0.02); // 2% Stamp Duty & Local Transfer Taxes
  }, [salePrice]);

  const netPayable = useMemo(() => {
    return salePrice - discount + calculatedTax + governmentDuties;
  }, [salePrice, discount, calculatedTax, governmentDuties]);

  const handleCompleteTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!propertyId || salePrice <= 0) {
      alert('Please enter valid property details and sale price.');
      return;
    }

    setLoading(true);
    try {
      const payload: InstantSalePayload = {
        branch_id: branchId,
        property_id: propertyId,
        property_type: 'PLOT',
        customer_name: customerName,
        customer_cnic: customerCnic,
        customer_phone: customerPhone,
        is_filer: isFiler,
        cost_price: Math.round(salePrice * 0.8), // Internal cost evaluation
        sale_price: salePrice,
        discount_amount: discount,
        tax_amount: calculatedTax,
        government_duties: governmentDuties,
        net_amount: netPayable,
        payment_mode: paymentMode,
      };

      const saleId = await processInstantSale(payload);
      setCompletedSaleId(saleId);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 select-none">
      {/* Form Left Side */}
      <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
        <div className="flex items-center space-x-3 pb-4 border-b border-slate-800">
          <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl">
            <ShoppingBag size="{22}"/>
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Instant Property Sales Terminal</h2>
            <p className="text-xs text-slate-400">Direct Purchase & Instant Receipt Processing</p>
          </div>
        </div>

        {completedSaleId ? (
          <div className="p-8 text-center space-y-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl">
            <CheckCircle2 className="text-emerald-400 mx-auto" size="{48}"/>
            <h3 className="text-xl font-bold text-white">Transaction Completed!</h3>
            <p className="text-xs text-slate-300 font-mono">Invoice Reference ID: {completedSaleId}</p>
            <button
              onClick={() => {
                setCompletedSaleId(null);
                setSalePrice(0);
                setCustomerName('');
              }}
              className="mt-4 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-xs"
            >
              Start New Transaction
            </button>
          </div>
        ) : (
          <form onSubmit={handleCompleteTransaction} className="space-y-4">
            <div>
              <label className="text-xs text-slate-300 font-semibold uppercase tracking-wider block mb-1">
                Property ID / Plot Number
              </label>
              <input
                type="text"
                required
                value={propertyId}
                onChange={(e) => setPropertyId(e.target.value)}
                placeholder="e.g. PLOT-BLOCK-B-102"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-slate-300 block mb-1">Customer Full Name</label>
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-sm text-white"
                />
              </div>
              <div>
                <label className="text-xs text-slate-300 block mb-1">CNIC (National ID)</label>
                <input
                  type="text"
                  required
                  value={customerCnic}
                  onChange={(e) => setCustomerCnic(e.target.value)}
                  placeholder="35202-0000000-0"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-sm text-white font-mono"
                />
              </div>
              <div>
                <label className="text-xs text-slate-300 block mb-1">Mobile Phone</label>
                <input
                  type="text"
                  required
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="0300-0000000"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-sm text-white font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <div>
                <label className="text-xs text-slate-300 block mb-1">Agreed Sale Price (PKR)</label>
                <input
                  type="number"
                  required
                  value={salePrice || ''}
                  onChange={(e) => setSalePrice(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-sm text-white font-mono"
                />
              </div>
              <div>
                <label className="text-xs text-slate-300 block mb-1">Discount Amount (PKR)</label>
                <input
                  type="number"
                  value={discount || ''}
                  onChange={(e) => setDiscount(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-sm text-white font-mono"
                />
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded-xl">
              <div className="flex items-center space-x-2">
                <UserCheck className="text-emerald-400" size="{18}"/>
                <span className="text-xs text-slate-300 font-medium">FBR Tax Status</span>
              </div>
              <div className="flex items-center space-x-4">
                <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="radio"
                    checked={isFiler}
                    onChange={() => setIsFiler(true)}
                    className="accent-emerald-500"
                  />
                  <span>Active Filer (3% Tax)</span>
                </label>
                <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="radio"
                    checked={!isFiler}
                    onChange={() => setIsFiler(false)}
                    className="accent-emerald-500"
                  />
                  <span>Non-Filer (7% Tax)</span>
                </label>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-sm transition-all shadow-lg shadow-emerald-950/50 flex items-center justify-center space-x-2"
              >
                <Receipt size="{18}"/>
                <span>{loading ? 'Processing Sale...' : 'Complete POS Transaction & Print Receipt'}</span>
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Summary Calculations Panel Right Side */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
        <div>
          <h3 className="text-sm font-bold text-white uppercase tracking-wider pb-3 border-b border-slate-800 mb-4">
            Financial Summary Breakdown
          </h3>

          <div className="space-y-3 text-xs">
            <div className="flex justify-between text-slate-400">
              <span>Gross Sale Price</span>
              <span className="font-mono text-white font-semibold">Rs. {salePrice.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Special Discount</span>
              <span className="font-mono text-red-400">- Rs. {discount.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>FBR Tax ({isFiler ? '3%' : '7%'})</span>
              <span className="font-mono text-amber-400">+ Rs. {calculatedTax.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Govt Duty & Stamp Fee (2%)</span>
              <span className="font-mono text-amber-400">+ Rs. {governmentDuties.toLocaleString()}</span>
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-800 mt-6">
          <span className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Net Total Amount</span>
          <p className="text-2xl font-bold text-emerald-400 font-mono mt-1">
            Rs. {netPayable.toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
};
B. Module 12: DigiKhata Double-Entry Party Ledger (src/components/digikhata/PartyLedger.tsx)
TypeScript
import React, { useState, useEffect } from 'react';
import { BookOpen, ArrowUpRight, ArrowDownLeft, Plus, Search } from 'lucide-react';
import { addPartyLedgerEntry, DigiKhataEntry } from '../../services/sales.service';

interface PartyLedgerProps {
  branchId: string;
}

interface PartyAccount {
  id: string;
  name: string;
  phone: string;
  current_balance: number;
}

export const PartyLedger: React.FC<PartyLedgerProps> = ({ branchId }) => {
  const [parties, setParties] = useState<PartyAccount[]>([]);
  const [selectedParty, setSelectedParty] = useState<PartyAccount null |>(null);
  const [entries, setEntries] = useState<DigiKhataEntry[]>([]);
  
  // Entry Form Modal
  const [amount, setAmount] = useState<number>(0);
  const [description, setDescription] = useState('');
  const [entryType, setEntryType] = useState<'CREDIT' | 'DEBIT'>('CREDIT');
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    loadParties();
  }, [branchId]);

  const loadParties = async () => {
    try {
      const res = await window.api.dbQuery<PartyAccount>('SELECT * FROM digikhata_parties WHERE branch_id = ?', [branchId]);
      if (res.success && res.data) {
        setParties(res.data);
        if (res.data.length > 0) setSelectedParty(res.data[0]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedParty || amount <= 0) return;

    try {
      await addPartyLedgerEntry({
        party_id: selectedParty.id,
        branch_id: branchId,
        entry_type: entryType,
        amount,
        description,
      });

      setIsModalOpen(false);
      setAmount(0);
      setDescription('');
      loadParties();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 select-none">
      {/* Parties List Left Side */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 px-2">Party Contact Ledger</h3>
        <div className="space-y-2">
          {parties.map((party) => (
            <button
              key={party.id}
              onClick={() => setSelectedParty(party)}
              className={`w-full text-left p-3 rounded-xl transition-all border ${
                selectedParty?.id === party.id
                  ? 'bg-emerald-500/10 border-emerald-500/40 text-white'
                  : 'bg-slate-950 border-slate-800/80 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <div className="flex justify-between items-center">
                <span className="font-bold text-sm">{party.name}</span>
                <span className={`text-xs font-mono font-bold ${party.current_balance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  Rs. {Math.abs(party.current_balance).toLocaleString()}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">{party.phone}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Main Ledger Detail View Right Side */}
      <div className="md:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
        {selectedParty ? (
          <>
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div>
                <h2 className="text-lg font-bold text-white">{selectedParty.name}</h2>
                <p className="text-xs text-slate-400">Account Balance Ledger & History</p>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => { setEntryType('CREDIT'); setIsModalOpen(true); }}
                  className="px-3.5 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-semibold flex items-center space-x-1"
                >
                  <ArrowDownLeft size="{14}"/>
                  <span>Got Money (Jama)</span>
                </button>
                <button
                  onClick={() => { setEntryType('DEBIT'); setIsModalOpen(true); }}
                  className="px-3.5 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 rounded-xl text-xs font-semibold flex items-center space-x-1"
                >
                  <ArrowUpRight size="{14}"/>
                  <span>Gave Money (Udhaar)</span>
                </button>
              </div>
            </div>

            {/* Entry Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 uppercase font-semibold">
                    <th className="pb-3">Description</th>
                    <th className="pb-3">Type</th>
                    <th className="pb-3 text-right">Amount (PKR)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {entries.map((entry) => (
                    <tr key={entry.id}>
                      <td className="py-3 text-slate-200">{entry.description}</td>
                      <td className="py-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          entry.entry_type === 'CREDIT' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                        }`}>
                          {entry.entry_type === 'CREDIT' ? 'JAMA' : 'UDHAAR'}
                        </span>
                      </td>
                      <td className="py-3 text-right font-mono font-bold text-white">
                        Rs. {entry.amount.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="text-center py-12 text-slate-500 text-xs">
            Select a party from the left panel to view their account ledger.
          </div>
        )}
      </div>

      {/* Add Entry Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white mb-4">
              Add {entryType === 'CREDIT' ? 'Jama (Received)' : 'Udhaar (Paid)'} Entry
            </h3>
            <form onSubmit={handleAddTransaction} className="space-y-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Amount (PKR)</label>
                <input
                  type="number"
                  required
                  value={amount || ''}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-sm text-white font-mono"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Description / Note</label>
                <input
                  type="text"
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Received token money for Plot #42"
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
                  className="px-5 py-2 bg-emerald-600 text-white font-semibold rounded-xl text-xs"
                >
                  Save Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
4. Pre-Flight Verification Checklist for Phase 3
Before completing Phase 3 code review, verify the following standards:

[ ] Type Check: npx tsc --noEmit passes with 0 errors across sales.service.ts, InstantSalesEngine.tsx, and PartyLedger.tsx.

[ ] SQL Safety: All queries use array binding parameterization ?.

[ ] Sync Queue Audit: Every sale mutation inserts a pending payload into sync_queue.

[ ] Dual Tax Integrity: FBR Filer (3%) / Non-Filer (7%) rates apply dynamically according to active customer state.

[ ] Ledger Precision: Double-entry DigiKhata party balances adjust atomically without race conditions.