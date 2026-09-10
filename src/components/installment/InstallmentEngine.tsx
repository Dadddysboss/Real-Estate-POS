import React, { useState, useEffect } from 'react';
import {
  MessageSquare, Eye, Plus, CreditCard, Calendar, Check, Clock,
  Search, X, AlertCircle, CheckCircle, Send, Phone, Hash,
} from 'lucide-react';

interface PlanRow {
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
  status: string;
  created_at: string;
  plot_number?: string;
  society_name?: string;
  block_phase?: string;
  size_dimension?: string;
}

interface ScheduleRow {
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
  status: string;
  created_at: string;
}

interface SummaryStats {
  totalPlans: number;
  active: number;
  completed: number;
  overdue: number;
  totalRevenue: number;
  collected: number;
  pending: number;
}

const fmt = (n: number): string => `Rs. ${Math.round(n).toLocaleString('en-PK')}`;

const InstallmentEngine: React.FC = () => {
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stats, setStats] = useState<SummaryStats>({
    totalPlans: 0,
    active: 0,
    completed: 0,
    overdue: 0,
    totalRevenue: 0,
    collected: 0,
    pending: 0,
  });

  const [detailPlan, setDetailPlan] = useState<PlanRow | null>(null);
  const [detailSchedules, setDetailSchedules] = useState<ScheduleRow[]>([]);
  const [showDetailModal, setShowDetailModal] = useState(false);

  const [whatsAppPlan, setWhatsAppPlan] = useState<PlanRow | null>(null);
  const [whatsAppMessage, setWhatsAppMessage] = useState('');
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);

  const [paymentPlan, setPaymentPlan] = useState<PlanRow | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('CASH');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentReceiptNo, setPaymentReceiptNo] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadPlans = async () => {
    setLoading(true);
    try {
      const sql = `
        SELECT
          ip.id, ip.plot_id, ip.buyer_name, ip.buyer_phone, ip.buyer_cnic,
          ip.total_sale_price, ip.down_payment, ip.plan_duration_months,
          ip.monthly_installment_amount, ip.start_date, ip.due_day_of_month,
          ip.grace_period_days, ip.late_penalty_fee, ip.status, ip.created_at,
          ip.plot_id AS plot_number_key,
          inv.plot_number, inv.society_name, inv.block_phase, inv.size_dimension
        FROM installment_plans ip
        LEFT JOIN inventory_plots inv ON ip.plot_id = inv.id
        WHERE ip.status = 'ACTIVE'
        ORDER BY ip.created_at DESC
      `;
      const res = await window.api.dbQuery<PlanRow>(sql, []);
      const planData = res.success ? (res.data || []) : [];
      setPlans(planData);

      const statsSql = `
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN ip.status = 'ACTIVE' THEN 1 ELSE 0 END) AS active_count,
          SUM(CASE WHEN ip.status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed_count,
          COALESCE(SUM(ip.total_sale_price), 0) AS total_revenue,
          COALESCE(SUM(COALESCE(paid.total_collected, 0)), 0) AS collected
        FROM installment_plans ip
        LEFT JOIN (
          SELECT plan_id, SUM(amount_paid) AS total_collected
          FROM installment_schedules
          GROUP BY plan_id
        ) paid ON ip.id = paid.plan_id
      `;
      const statsRes = await window.api.dbQuery<{
        total: number;
        active_count: number;
        completed_count: number;
        total_revenue: number;
        collected: number;
      }>(statsSql, []);
      if (statsRes.success && statsRes.data && statsRes.data.length > 0) {
        const row = statsRes.data[0];
        setStats({
          totalPlans: Number(row.total) || 0,
          active: Number(row.active_count) || 0,
          completed: Number(row.completed_count) || 0,
          overdue: 0,
          totalRevenue: Number(row.total_revenue) || 0,
          collected: Number(row.collected) || 0,
          pending: (Number(row.total_revenue) || 0) - (Number(row.collected) || 0),
        });
      }

      const overdueSql = `
        SELECT COUNT(DISTINCT ip.id) AS overdue_count
        FROM installment_plans ip
        INNER JOIN installment_schedules iss ON ip.id = iss.plan_id
        WHERE ip.status = 'ACTIVE' AND iss.status = 'OVERDUE'
      `;
      const overdueRes = await window.api.dbQuery<{ overdue_count: number }>(overdueSql, []);
      if (overdueRes.success && overdueRes.data && overdueRes.data.length > 0) {
        setStats(prev => ({
          ...prev,
          overdue: Number(overdueRes.data![0].overdue_count) || 0,
        }));
      }
    } catch (err) {
      console.error('Failed to load installment plans:', err);
    }
    setLoading(false);
  };

  useEffect(() => {
    void loadPlans();
  }, []);

  const openDetails = async (plan: PlanRow) => {
    try {
      const res = await window.api.dbQuery<ScheduleRow>(
        `SELECT * FROM installment_schedules WHERE plan_id = ? ORDER BY installment_number ASC`,
        [plan.id]
      );
      setDetailSchedules(res.success ? (res.data || []) : []);
      setDetailPlan(plan);
      setShowDetailModal(true);
    } catch (err) {
      console.error('Failed to load schedules:', err);
    }
  };

  const openWhatsApp = (plan: PlanRow) => {
    const msg =
      `*Dripp Real Estate — Payment Reminder*\n\n` +
      `Dear ${plan.buyer_name},\n\n` +
      `This is a friendly reminder regarding your installment plan for Plot ${plan.plot_number || plan.plot_id} in ${plan.society_name || 'N/A'}.\n\n` +
      `Plan ID: ${plan.id}\n` +
      `Monthly Installment: ${fmt(plan.monthly_installment_amount)}\n` +
      `Total Sale Price: ${fmt(plan.total_sale_price)}\n` +
      `Down Payment Paid: ${fmt(plan.down_payment)}\n\n` +
      `Please ensure timely payments to avoid late penalties.\n\n` +
      `Contact us for any queries.\n` +
      `_Pay via Dripp ERP — Secure & Verified_`;
    setWhatsAppPlan(plan);
    setWhatsAppMessage(msg);
    setShowWhatsAppModal(true);
  };

  const sendWhatsApp = () => {
    if (!whatsAppPlan) return;
    const phone = whatsAppPlan.buyer_phone.replace(/[^0-9]/g, '');
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(whatsAppMessage)}`;
    window.open(url, '_blank');
    setShowWhatsAppModal(false);
    setWhatsAppPlan(null);
  };

  const openAddInstallment = (plan: PlanRow) => {
    setPaymentPlan(plan);
    setPaymentAmount(String(plan.monthly_installment_amount));
    setPaymentMode('CASH');
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setPaymentReceiptNo('');
    setShowPaymentModal(true);
  };

  const recordInstallment = async () => {
    if (!paymentPlan || !paymentAmount || Number(paymentAmount) <= 0) return;
    setSubmitting(true);
    try {
      const amount = Number(paymentAmount);

      const schedRes = await window.api.dbQuery<ScheduleRow>(
        `SELECT * FROM installment_schedules WHERE plan_id = ? AND status != 'PAID' ORDER BY installment_number ASC LIMIT 1`,
        [paymentPlan.id]
      );
      if (!schedRes.success || !schedRes.data || schedRes.data.length === 0) {
        alert('No pending installments found for this plan.');
        setSubmitting(false);
        return;
      }
      const sched = schedRes.data[0];
      const totalDue = sched.amount_due + sched.late_fine_charged;
      const newPaid = sched.amount_paid + amount;
      const isFullyPaid = newPaid >= totalDue;
      const newStatus: string = isFullyPaid ? 'PAID' : 'PENDING';

      const receiptId = paymentReceiptNo || `RCP_${Date.now()}`;

      await window.api.dbExecute(
        `INSERT INTO installment_payments (
          id, schedule_id, plan_id, amount, payment_mode, payment_date, receipt_no, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          `IPAY_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          sched.id,
          paymentPlan.id,
          amount,
          paymentMode,
          paymentDate,
          receiptId,
        ]
      );

      await window.api.dbExecute(
        `UPDATE installment_schedules
         SET amount_paid = ?, payment_date = ?, payment_method = ?, status = ?
         WHERE id = ?`,
        [newPaid, paymentDate, paymentMode, newStatus, sched.id]
      );

      if (isFullyPaid) {
        const allSchedRes = await window.api.dbQuery<ScheduleRow>(
          `SELECT status FROM installment_schedules WHERE plan_id = ?`,
          [paymentPlan.id]
        );
        const allPaid = (allSchedRes.data || []).every(s => s.status === 'PAID');
        if (allPaid) {
          await window.api.dbExecute(
            `UPDATE installment_plans SET status = 'COMPLETED' WHERE id = ?`,
            [paymentPlan.id]
          );
        }
      }

      setShowPaymentModal(false);
      setPaymentPlan(null);
      await loadPlans();
    } catch (err) {
      console.error('Failed to record installment:', err);
      alert('Failed to record installment. Please try again.');
    }
    setSubmitting(false);
  };

  const filteredPlans = plans.filter(plan => {
    const q = (search ?? '').toLowerCase();
    return (
      (plan.buyer_name ?? '').toLowerCase().includes(q) ||
      (plan.buyer_phone ?? '').includes(q) ||
      (plan.buyer_cnic ?? '').includes(q) ||
      (plan.plot_number ?? '').toLowerCase().includes(q) ||
      (plan.society_name ?? '').toLowerCase().includes(q) ||
      (plan.id ?? '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="page-container">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <CreditCard className="w-6 h-6 text-emerald-400" />
          Installment Engine
        </h1>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          {[
            { label: 'Total Plans', value: stats.totalPlans, icon: Hash, color: 'text-white' },
            { label: 'Active', value: stats.active, icon: Clock, color: 'text-emerald-400' },
            { label: 'Completed', value: stats.completed, icon: CheckCircle, color: 'text-sky-400' },
            { label: 'Overdue', value: stats.overdue, icon: AlertCircle, color: 'text-red-400' },
            { label: 'Total Revenue', value: fmt(stats.totalRevenue), icon: CreditCard, color: 'text-amber-400' },
            { label: 'Collected', value: fmt(stats.collected), icon: Check, color: 'text-emerald-400' },
          ].map((item) => (
            <div key={item.label} className="bg-slate-900 border border-slate-800 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <item.icon className="w-4 h-4 text-slate-400" />
                <span className="text-xs text-slate-400">{item.label}</span>
              </div>
              <p className={`text-xl font-bold ${item.color}`}>{item.value}</p>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 mb-6">
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg px-4 py-2 flex-1">
            <Search className="w-4 h-4 text-slate-400 mr-2" />
            <input
              type="text"
              placeholder="Search buyer, phone, CNIC, plot, society, plan ID..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-transparent outline-none text-white w-full placeholder-slate-500"
            />
          </div>
          <div className="text-sm text-slate-400">
            {filteredPlans.length} plan{filteredPlans.length !== 1 ? 's' : ''}
          </div>
        </div>

        {loading ? (
          <div className="text-center py-16 text-slate-400">
            <Clock className="w-8 h-8 animate-spin mx-auto mb-3" />
            Loading installment plans...
          </div>
        ) : filteredPlans.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <CreditCard className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-lg">No active installment plans found.</p>
            <p className="text-sm mt-1">Plans with status ACTIVE will appear here.</p>
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/50">
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Plot</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Buyer</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Phone</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">Sale Price</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">Monthly</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-slate-400 uppercase tracking-wider">Duration</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-slate-400 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {filteredPlans.map((plan) => (
                    <tr key={plan.id} className="hover:bg-slate-800/50 transition-colors">
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-white">{plan.plot_number || plan.plot_id}</p>
                          <p className="text-xs text-slate-400">{plan.society_name || ''} {plan.block_phase ? `— ${plan.block_phase}` : ''}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-white">{plan.buyer_name}</p>
                        <p className="text-xs text-slate-400">{plan.buyer_cnic}</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-300">{plan.buyer_phone}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-medium text-white">{fmt(plan.total_sale_price)}</span>
                        <p className="text-xs text-slate-400">Down: {fmt(plan.down_payment)}</p>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-medium text-emerald-400">{fmt(plan.monthly_installment_amount)}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-sm text-slate-300">{plan.plan_duration_months} mo</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => openWhatsApp(plan)}
                            className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg transition-colors"
                            title="Send WhatsApp Reminder"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            WhatsApp
                          </button>
                          <button
                            onClick={() => openDetails(plan)}
                            className="flex items-center gap-1 px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium rounded-lg transition-colors"
                            title="View Payment Schedule"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Details
                          </button>
                          <button
                            onClick={() => openAddInstallment(plan)}
                            className="flex items-center gap-1 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium rounded-lg transition-colors"
                            title="Record Installment Payment"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Add
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {showDetailModal && detailPlan && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-4xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-sky-400" />
                  Payment Schedule
                </h2>
                <p className="text-sm text-slate-400 mt-1">
                  {detailPlan.buyer_name} — Plot {detailPlan.plot_number || detailPlan.plot_id} ({detailPlan.society_name || 'N/A'})
                </p>
              </div>
              <button
                onClick={() => { setShowDetailModal(false); setDetailPlan(null); }}
                className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="px-6 py-3 border-b border-slate-800 grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-slate-400">Total Price</p>
                <p className="font-bold text-white">{fmt(detailPlan.total_sale_price)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Down Payment</p>
                <p className="font-bold text-emerald-400">{fmt(detailPlan.down_payment)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Monthly</p>
                <p className="font-bold text-sky-400">{fmt(detailPlan.monthly_installment_amount)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Duration</p>
                <p className="font-bold text-white">{detailPlan.plan_duration_months} months</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {detailSchedules.length === 0 ? (
                <div className="p-8 text-center text-slate-400">
                  No schedule records found.
                </div>
              ) : (
                <table className="w-full">
                  <thead className="sticky top-0 bg-slate-900">
                    <tr className="border-b border-slate-800">
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">#</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Due Date</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">Due</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">Paid</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">Penalty</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">Balance</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-slate-400 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {detailSchedules.map((sched) => {
                      const balance = sched.amount_due + sched.late_fine_charged - sched.amount_paid;
                      return (
                        <tr
                          key={sched.id}
                          className={`${
                            sched.status === 'PAID'
                              ? 'bg-emerald-950/20'
                              : sched.status === 'OVERDUE'
                              ? 'bg-red-950/20'
                              : ''
                          }`}
                        >
                          <td className="px-4 py-3 text-sm font-medium text-white">
                            {sched.installment_number}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-300">
                            <div className="flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5 text-slate-500" />
                              {sched.due_date}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-right text-white">
                            {fmt(sched.amount_due)}
                          </td>
                          <td className="px-4 py-3 text-sm text-right">
                            <span className={sched.amount_paid > 0 ? 'text-emerald-400 font-medium' : 'text-slate-500'}>
                              {fmt(sched.amount_paid)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-right">
                            {sched.late_fine_charged > 0 ? (
                              <span className="text-red-400 font-medium">{fmt(sched.late_fine_charged)}</span>
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-right font-medium">
                            <span className={balance <= 0 ? 'text-emerald-400' : sched.status === 'OVERDUE' ? 'text-red-400' : 'text-white'}>
                              {fmt(Math.max(0, balance))}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
                                sched.status === 'PAID'
                                  ? 'bg-emerald-900/50 text-emerald-300'
                                  : sched.status === 'OVERDUE'
                                  ? 'bg-red-900/50 text-red-300'
                                  : 'bg-sky-900/50 text-sky-300'
                              }`}
                            >
                              {sched.status === 'PAID' && <Check className="w-3 h-3" />}
                              {sched.status === 'OVERDUE' && <AlertCircle className="w-3 h-3" />}
                              {sched.status === 'PENDING' && <Clock className="w-3 h-3" />}
                              {sched.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {detailSchedules.length > 0 && (
              <div className="px-6 py-4 border-t border-slate-800 grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-slate-400">Total Paid</p>
                  <p className="font-bold text-emerald-400">
                    {fmt(detailSchedules.reduce((s, sc) => s + sc.amount_paid, 0))}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Total Penalty</p>
                  <p className="font-bold text-red-400">
                    {fmt(detailSchedules.reduce((s, sc) => s + sc.late_fine_charged, 0))}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Remaining</p>
                  <p className="font-bold text-white">
                    {fmt(detailSchedules.reduce((s, sc) => s + sc.amount_due + sc.late_fine_charged - sc.amount_paid, 0))}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showWhatsAppModal && whatsAppPlan && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-emerald-400" />
                WhatsApp Reminder
              </h2>
              <button
                onClick={() => { setShowWhatsAppModal(false); setWhatsAppPlan(null); }}
                className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="p-6">
              <div className="mb-4">
                <label className="block text-xs text-slate-400 mb-1">To</label>
                <div className="flex items-center gap-2 bg-slate-800 px-3 py-2 rounded-lg">
                  <Phone className="w-4 h-4 text-slate-400" />
                  <span className="text-white font-medium">{whatsAppPlan.buyer_name}</span>
                  <span className="text-slate-400 text-sm">({whatsAppPlan.buyer_phone})</span>
                </div>
              </div>

              <div className="mb-6">
                <label className="block text-xs text-slate-400 mb-1">Message</label>
                <textarea
                  value={whatsAppMessage}
                  onChange={(e) => setWhatsAppMessage(e.target.value)}
                  rows={12}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-sm text-white placeholder-slate-500 outline-none focus:border-emerald-500 resize-none"
                />
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => { setShowWhatsAppModal(false); setWhatsAppPlan(null); }}
                  className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={sendWhatsApp}
                  className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <Send className="w-4 h-4" />
                  Send via WhatsApp
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showPaymentModal && paymentPlan && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-amber-400" />
                Record Installment
              </h2>
              <button
                onClick={() => { setShowPaymentModal(false); setPaymentPlan(null); }}
                className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="p-6">
              <div className="bg-slate-800 rounded-lg p-3 mb-5">
                <p className="text-sm text-slate-300">
                  <span className="text-slate-400">Buyer:</span> {paymentPlan.buyer_name}
                </p>
                <p className="text-sm text-slate-300">
                  <span className="text-slate-400">Plot:</span> {paymentPlan.plot_number || paymentPlan.plot_id}
                </p>
                <p className="text-sm text-slate-300">
                  <span className="text-slate-400">Monthly:</span>{' '}
                  <span className="text-emerald-400 font-medium">{fmt(paymentPlan.monthly_installment_amount)}</span>
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Amount (Rs.) *</label>
                  <input
                    type="number"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    min={1}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white text-sm outline-none focus:border-amber-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Payment Mode *</label>
                    <select
                      value={paymentMode}
                      onChange={(e) => setPaymentMode(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white text-sm outline-none focus:border-amber-500"
                    >
                      <option value="CASH">Cash</option>
                      <option value="BANK_TRANSFER">Bank Transfer</option>
                      <option value="PAY_ORDER">Pay Order</option>
                      <option value="CHEQUE">Cheque</option>
                      <option value="ONLINE">Online</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Date *</label>
                    <input
                      type="date"
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white text-sm outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Receipt No</label>
                  <input
                    type="text"
                    value={paymentReceiptNo}
                    onChange={(e) => setPaymentReceiptNo(e.target.value)}
                    placeholder="Optional — auto-generated if empty"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white text-sm placeholder-slate-500 outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => { setShowPaymentModal(false); setPaymentPlan(null); }}
                  className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={recordInstallment}
                  disabled={submitting || !paymentAmount || Number(paymentAmount) <= 0}
                  className="flex items-center gap-2 px-5 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {submitting ? (
                    <Clock className="w-4 h-4 animate-spin" />
                  ) : (
                    <CreditCard className="w-4 h-4" />
                  )}
                  Record Payment
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InstallmentEngine;
