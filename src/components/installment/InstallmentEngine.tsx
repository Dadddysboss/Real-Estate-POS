import React, { useState } from 'react';
import { InstallmentPlan, InstallmentSchedule } from '../../types/electron';
import {
  fetchInstallmentPlans,
  fetchSchedulesByPlan,
  createInstallmentPlan,
  recordSchedulePayment,
  calculatePlanSummary,
  updateOverdueStatuses,
  printInstallmentReceipt,
  fmt,
} from '../../services/installment.service';
import { calculateSurcharge, validateSurcharge } from '../../utils/surchargeRules';
import { generateReceipt, ReceiptItem, ReceiptOptions } from '../../utils/receiptRules';
import { Search, Calendar, AlertCircle, CheckCircle, Printer, Mail, FileText, DollarSign, Clock, Filter, Plus, Eye, X } from 'lucide-react';

interface InstallmentPlanFormValues {
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
  surcharge_rate: number;
}

interface PaymentFormValues {
  schedule_id: string;
  amount_paid: number;
  payment_date: string;
  payment_method: string;
  discount_applied: number;
  late_fine_charged: number;
}

const InstallmentEngine: React.FC = () => {
  const [plans, setPlans] = useState<InstallmentPlan[]>([]);
  const [schedules, setSchedules] = useState<InstallmentSchedule[]>([]);
  const [currentPlan, setCurrentPlan] = useState<InstallmentPlan | null>(null);
  const [search, setSearch] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'ACTIVE' | 'COMPLETED' | 'DEFAULTED'>('ALL');
  const [showPaymentModal, setShowPaymentModal] = useState<boolean>(false);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string>('');
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [paymentForm, setPaymentForm] = useState<PaymentFormValues>({
    schedule_id: '',
    amount_paid: 0,
    payment_date: new Date().toISOString().split('T')[0],
    payment_method: 'CASH',
    discount_applied: 0,
    late_fine_charged: 0,
  });
  const [createForm, setCreateForm] = useState<InstallmentPlanFormValues>({
    plot_id: '',
    buyer_name: '',
    buyer_phone: '',
    buyer_cnic: '',
    total_sale_price: 0,
    down_payment: 0,
    plan_duration_months: 12,
    monthly_installment_amount: 0,
    start_date: new Date().toISOString().split('T')[0],
    due_day_of_month: 1,
    grace_period_days: 5,
    late_penalty_fee: 0,
    surcharge_rate: 0,
  });
  const [overdueFilterActive, setOverdueFilterActive] = useState<boolean>(false);

  const loadPlans = async () => {
    try {
      const data = await fetchInstallmentPlans();
      setPlans(data);
    } catch (err) {
      console.error('Failed to load installment plans:', err);
    }
  };

  const onPlanSelect = async (planId: string) => {
    try {
      const plan = plans.find(p => p.id === planId);
      if (plan) {
        const scheduleData = await fetchSchedulesByPlan(planId);
        const updatedSchedules = updateOverdueStatuses(scheduleData, plan.grace_period_days, plan.late_penalty_fee);
        setCurrentPlan(plan);
        setSchedules(updatedSchedules);
      }
    } catch (err) {
      console.error('Failed to load schedules:', err);
    }
  };

  const handleCreatePlan = async (values: InstallmentPlanFormValues) => {
    try {
      const monthlyAmount = Math.round((values.total_sale_price - values.down_payment) / values.plan_duration_months);
      const planId = await createInstallmentPlan('', values.buyer_name, {
        plot_id: values.plot_id,
        buyer_name: values.buyer_name,
        buyer_phone: values.buyer_phone,
        buyer_cnic: values.buyer_cnic,
        total_sale_price: values.total_sale_price,
        down_payment: values.down_payment,
        plan_duration_months: values.plan_duration_months,
        monthly_installment_amount: monthlyAmount,
        start_date: values.start_date,
        due_day_of_month: values.due_day_of_month,
        grace_period_days: values.grace_period_days,
        late_penalty_fee: values.late_penalty_fee,
      });
      await loadPlans();
      setShowCreateModal(false);
      onPlanSelect(planId);
    } catch (err) {
      console.error('Failed to create plan:', err);
    }
  };

  const openPaymentModal = (scheduleId: string) => {
    const schedule = schedules.find(s => s.id === scheduleId);
    if (schedule) {
      const totalDue = schedule.amount_due + schedule.late_fine_charged - schedule.amount_paid;
      setPaymentForm({
        schedule_id: scheduleId,
        amount_paid: totalDue,
        payment_date: new Date().toISOString().split('T')[0],
        payment_method: 'CASH',
        discount_applied: 0,
        late_fine_charged: schedule.late_fine_charged,
      });
      setSelectedScheduleId(scheduleId);
      setShowPaymentModal(true);
    }
  };

  const handlePayment = async (values: PaymentFormValues) => {
    try {
      await recordSchedulePayment(
        {
          schedule_id: values.schedule_id,
          amount_paid: values.amount_paid,
          payment_date: values.payment_date,
          payment_method: values.payment_method,
          discount_applied: values.discount_applied,
          late_fine_charged: values.late_fine_charged,
        },
        '',
        ''
      );
      setShowPaymentModal(false);
      setSelectedScheduleId('');
      if (currentPlan) {
        await onPlanSelect(currentPlan.id);
      }
    } catch (err) {
      console.error('Failed to record payment:', err);
    }
  };

  const handlePrintReceipt = (scheduleId: string) => {
    const schedule = schedules.find(s => s.id === scheduleId);
    if (!schedule || !currentPlan) return;

    const totalDue = schedule.amount_due + (schedule.late_fine_charged || 0);
    const remaining = totalDue - schedule.amount_paid;
    const receiptItems: ReceiptItem[] = [
      { name: `Installment #${schedule.installment_number}`, price: schedule.amount_due },
    ];
    if (schedule.late_fine_charged > 0) {
      receiptItems.push({ name: 'Late Fine', price: schedule.late_fine_charged });
    }
    if (schedule.discount_applied > 0) {
      receiptItems.push({ name: 'Discount', price: -schedule.discount_applied });
    }
    const receiptOptions: ReceiptOptions = {
      currency: 'Rs.',
      title: 'INSTALLMENT RECEIPT',
      receiptNumber: `RCP_${schedule.id}`,
      date: schedule.payment_date || new Date().toISOString().split('T')[0],
      buyer: currentPlan.buyer_name,
      reference: `Plan: ${currentPlan.id} | Inst #${schedule.installment_number}`,
    };
    const receiptText = generateReceipt(receiptItems, receiptOptions);
    const fullReceipt = `${receiptText}\n\nTotal Due: ${fmt(totalDue)}\nPaid: ${fmt(schedule.amount_paid)}\nRemaining: ${fmt(remaining)}\nStatus: ${schedule.status}\n\nPrinted: ${new Date().toLocaleString()}`;
    printInstallmentReceipt(fullReceipt);
  };

  const handlePrintWhatsAppReceipt = (scheduleId: string) => {
    const schedule = schedules.find(s => s.id === scheduleId);
    if (!schedule || !currentPlan) return;

    const totalDue = schedule.amount_due + schedule.late_fine_charged - schedule.amount_paid;
    const message = `*Dripp Real Estate - Installment Receipt*\n\n` +
      `Plan ID: ${currentPlan.id}\n` +
      `Buyer: ${currentPlan.buyer_name}\n` +
      `Phone: ${currentPlan.buyer_phone}\n` +
      `Installment #${schedule.installment_number} of ${currentPlan.plan_duration_months}\n` +
      `Due Date: ${schedule.due_date}\n` +
      `Amount Due: ${fmt(schedule.amount_due)}\n` +
      (schedule.late_fine_charged > 0 ? `Late Fine: ${fmt(schedule.late_fine_charged)}\n` : '') +
      (schedule.discount_applied > 0 ? `Discount: ${fmt(schedule.discount_applied)}\n` : '') +
      `Total Paid: ${fmt(schedule.amount_paid)}\n` +
      `Remaining: ${fmt(totalDue)}\n` +
      `Status: ${schedule.status}\n` +
      `\n_Pay via Dripp ERP — Secure & Verified_`;
    const whatsappLink = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(whatsappLink, '_blank');
  };

  const handleWhatsAppReminder = (scheduleId: string) => {
    const schedule = schedules.find(s => s.id === scheduleId);
    if (!schedule || !currentPlan) return;

    const balance = schedule.amount_due - schedule.amount_paid + schedule.late_fine_charged;
    const message = `*Dripp Real Estate — Payment Reminder*\n\n` +
      `Dear ${currentPlan.buyer_name},\n\n` +
      `Your installment #${schedule.installment_number} of ${currentPlan.plan_duration_months} is due on ${schedule.due_date}.\n` +
      `Outstanding Amount: ${fmt(balance)}\n` +
      (schedule.status === 'OVERDUE' ? `⚠️ This payment is OVERDUE. Please pay immediately to avoid further penalties.\n` : '') +
      `\nPay via: Dripp ERP\n` +
      `Contact: ${currentPlan.buyer_phone}`;
    const whatsappLink = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(whatsappLink, '_blank');
  };

  const filteredPlans = plans.filter(plan => {
    const matchesSearch = plan.buyer_name.toLowerCase().includes(search.toLowerCase()) ||
      plan.plot_id.toLowerCase().includes(search.toLowerCase()) ||
      plan.buyer_phone.includes(search) ||
      plan.buyer_cnic.includes(search);
    const matchesFilter = filterStatus === 'ALL' || plan.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  const overdueSchedules = schedules.filter(s => s.status === 'OVERDUE');
  const pendingSchedules = schedules.filter(s => s.status === 'PENDING');
  const paidSchedules = schedules.filter(s => s.status === 'PAID');

  const displaySchedules = overdueFilterActive
    ? overdueSchedules
    : schedules;

  const summary = currentPlan ? calculatePlanSummary(currentPlan, schedules) : null;

  const handleCreateFormChange = (field: keyof InstallmentPlanFormValues, value: string | number) => {
    setCreateForm(prev => {
      const next = { ...prev, [field]: value };
      if (field === 'total_sale_price' || field === 'down_payment' || field === 'plan_duration_months') {
        const financed = (next.total_sale_price - next.down_payment);
        next.monthly_installment_amount = next.plan_duration_months > 0 ? Math.round(financed / next.plan_duration_months) : 0;
      }
      return next;
    });
  };

  const surchargeAmount = createForm.surcharge_rate > 0 && createForm.total_sale_price > 0
    ? calculateSurcharge(createForm.total_sale_price - createForm.down_payment, createForm.surcharge_rate)
    : 0;
  const surchargeValid = createForm.surcharge_rate === 0 || validateSurcharge(
    createForm.total_sale_price - createForm.down_payment,
    surchargeAmount,
    createForm.surcharge_rate
  );

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">Installment Engine</h2>

      {/* Search & Filter Bar */}
      <div className="mb-4 flex gap-2 flex-wrap items-center">
        <div className="flex items-center border p-2 rounded flex-1 min-w-[200px]">
          <Search className="w-4 h-4 mr-2 text-gray-400" />
          <input
            type="text"
            placeholder="Search buyer, plot, phone, or CNIC..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 outline-none"
          />
        </div>
        <div className="flex items-center border p-2 rounded">
          <Filter className="w-4 h-4 mr-2 text-gray-400" />
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value as 'ALL' | 'ACTIVE' | 'COMPLETED' | 'DEFAULTED')}
            className="outline-none"
          >
            <option value="ALL">All Plans</option>
            <option value="ACTIVE">Active</option>
            <option value="COMPLETED">Completed</option>
            <option value="DEFAULTED">Defaulted</option>
          </select>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-green-600 text-white px-4 py-2 rounded flex items-center gap-1"
        >
          <Plus className="w-4 h-4" /> New Plan
        </button>
      </div>

      {/* Plans List Table */}
      <div className="mb-4 overflow-x-auto">
        <table className="w-full border-collapse border">
          <thead>
            <tr className="border-b bg-gray-100">
              <th className="p-2 text-left">Plot ID</th>
              <th className="p-2 text-left">Buyer</th>
              <th className="p-2 text-left">Phone</th>
              <th className="p-2 text-left">CNIC</th>
              <th className="p-2 text-right">Total Price</th>
              <th className="p-2 text-right">Down Payment</th>
              <th className="p-2 text-center">Duration</th>
              <th className="p-2 text-center">Monthly</th>
              <th className="p-2 text-center">Status</th>
              <th className="p-2 text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredPlans.map(plan => (
              <tr key={plan.id} className="hover:bg-gray-50 border-b">
                <td className="p-2">{plan.plot_id}</td>
                <td className="p-2 font-medium">{plan.buyer_name}</td>
                <td className="p-2">{plan.buyer_phone}</td>
                <td className="p-2">{plan.buyer_cnic}</td>
                <td className="p-2 text-right">{fmt(plan.total_sale_price)}</td>
                <td className="p-2 text-right">{fmt(plan.down_payment)}</td>
                <td className="p-2 text-center">{plan.plan_duration_months} mo</td>
                <td className="p-2 text-right">{fmt(plan.monthly_installment_amount)}</td>
                <td className="p-2 text-center">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    plan.status === 'ACTIVE' ? 'bg-green-100 text-green-800' :
                    plan.status === 'COMPLETED' ? 'bg-blue-100 text-blue-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {plan.status}
                  </span>
                </td>
                <td className="p-2 text-center">
                  <button
                    onClick={() => onPlanSelect(plan.id)}
                    className="text-blue-600 underline flex items-center gap-1 mx-auto"
                  >
                    <Eye className="w-3 h-3" /> View
                  </button>
                </td>
              </tr>
            ))}
            {filteredPlans.length === 0 && (
              <tr>
                <td colSpan={10} className="p-4 text-center text-gray-500">
                  No installment plans found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Schedule Detail Section */}
      {currentPlan && (
        <div className="mt-6 overflow-x-auto border rounded">
          <div className="flex items-center justify-between p-4 bg-gray-50 border-b">
            <div>
              <h3 className="font-bold text-lg">Installment Schedule — {currentPlan.buyer_name}</h3>
              <p className="text-sm text-gray-600">
                Plan ID: {currentPlan.id} | Plot: {currentPlan.plot_id} | Duration: {currentPlan.plan_duration_months} months
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setOverdueFilterActive(!overdueFilterActive)}
                className={`px-3 py-1 rounded text-sm flex items-center gap-1 ${
                  overdueFilterActive ? 'bg-red-600 text-white' : 'bg-red-100 text-red-800'
                }`}
              >
                <AlertCircle className="w-3 h-3" />
                Overdue ({overdueSchedules.length})
              </button>
              <button
                onClick={() => { setCurrentPlan(null); setSchedules([]); setOverdueFilterActive(false); }}
                className="px-3 py-1 rounded text-sm bg-gray-200 flex items-center gap-1"
              >
                <X className="w-3 h-3" /> Close
              </button>
            </div>
          </div>

          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b bg-gray-100">
                <th className="p-2 text-center">#</th>
                <th className="p-2 text-left">Due Date</th>
                <th className="p-2 text-right">Amount Due</th>
                <th className="p-2 text-right">Paid</th>
                <th className="p-2 text-right">Late Fine</th>
                <th className="p-2 text-right">Discount</th>
                <th className="p-2 text-right">Balance</th>
                <th className="p-2 text-center">Status</th>
                <th className="p-2 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {displaySchedules.map(schedule => {
                const balance = schedule.amount_due + schedule.late_fine_charged - schedule.amount_paid;
                return (
                  <tr key={schedule.id} className="border-b hover:bg-gray-50">
                    <td className="p-2 text-center font-medium">{schedule.installment_number}</td>
                    <td className="p-2">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-gray-400" />
                        {schedule.due_date}
                      </div>
                    </td>
                    <td className="p-2 text-right">{fmt(schedule.amount_due)}</td>
                    <td className="p-2 text-right">
                      <span className={schedule.amount_paid > 0 ? 'text-green-700 font-medium' : ''}>
                        {fmt(schedule.amount_paid)}
                      </span>
                    </td>
                    <td className="p-2 text-right">
                      {schedule.late_fine_charged > 0 ? (
                        <span className="text-red-600 font-medium">{fmt(schedule.late_fine_charged)}</span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="p-2 text-right">
                      {schedule.discount_applied > 0 ? (
                        <span className="text-green-600 font-medium">-{fmt(schedule.discount_applied)}</span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="p-2 text-right font-medium">
                      <span className={balance <= 0 ? 'text-green-700' : balance > 0 && schedule.status === 'OVERDUE' ? 'text-red-600' : ''}>
                        {fmt(Math.max(0, balance))}
                      </span>
                    </td>
                    <td className="p-2 text-center">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        schedule.status === 'PAID' ? 'bg-green-100 text-green-800' :
                        schedule.status === 'OVERDUE' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {schedule.status}
                      </span>
                    </td>
                    <td className="p-2 text-center">
                      <div className="flex items-center gap-1 justify-center flex-wrap">
                        {schedule.status !== 'PAID' && (
                          <button
                            onClick={() => openPaymentModal(schedule.id)}
                            className="text-xs bg-green-600 text-white px-2 py-1 rounded flex items-center gap-1"
                          >
                            <DollarSign className="w-3 h-3" /> Pay
                          </button>
                        )}
                        <button
                          onClick={() => handlePrintReceipt(schedule.id)}
                          className="text-xs text-purple-600 underline flex items-center gap-1"
                          title="Print 80mm thermal receipt"
                        >
                          <Printer className="w-3 h-3" /> Print
                        </button>
                        <button
                          onClick={() => handlePrintWhatsAppReceipt(schedule.id)}
                          className="text-xs text-blue-600 underline flex items-center gap-1"
                          title="Send receipt via WhatsApp"
                        >
                          <Mail className="w-3 h-3" /> WA Receipt
                        </button>
                        <button
                          onClick={() => handleWhatsAppReminder(schedule.id)}
                          className="text-xs text-green-700 underline flex items-center gap-1"
                          title="Send payment reminder via WhatsApp"
                        >
                          <FileText className="w-3 h-3" /> WA Reminder
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {displaySchedules.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-4 text-center text-gray-500">
                    {overdueFilterActive ? 'No overdue installments.' : 'No schedules found.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Summary Panel */}
          {summary && (
            <div className="p-4 bg-gray-50 border-t grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-gray-500 flex items-center gap-1"><Clock className="w-3 h-3" /> Total Due</p>
                <p className="font-bold text-lg">{fmt(summary.totalDue)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Total Paid</p>
                <p className="font-bold text-lg text-green-700">{fmt(summary.totalPaid)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Total Penalties</p>
                <p className="font-bold text-lg text-red-600">{fmt(summary.totalPenalties)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 flex items-center gap-1"><DollarSign className="w-3 h-3" /> Remaining</p>
                <p className="font-bold text-lg">{fmt(summary.remaining)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Progress</p>
                <div className="flex items-center gap-2">
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div
                      className="bg-green-600 h-2.5 rounded-full"
                      style={{ width: `${Math.min(100, summary.progress)}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium">{Math.round(summary.progress)}%</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">{summary.paidCount} of {currentPlan.plan_duration_months} paid</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Schedule Status Breakdown</p>
                <div className="flex gap-3 mt-1">
                  <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded">Paid: {paidSchedules.length}</span>
                  <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded">Pending: {pendingSchedules.length}</span>
                  <span className="text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded">Overdue: {overdueSchedules.length}</span>
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-500">Surcharge Info</p>
                <p className="text-sm">Grace Period: {currentPlan.grace_period_days} days</p>
                <p className="text-sm">Penalty/Day: {fmt(currentPlan.late_penalty_fee)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Plan Details</p>
                <p className="text-sm">Down Payment: {fmt(currentPlan.down_payment)}</p>
                <p className="text-sm">Monthly: {fmt(currentPlan.monthly_installment_amount)}</p>
                <p className="text-sm">Due Day: {currentPlan.due_day_of_month}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create Plan Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg">Create New Installment Plan</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-gray-500 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleCreatePlan(createForm);
              }}
              className="space-y-4"
            >
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Plot ID *</label>
                  <input
                    type="text"
                    value={createForm.plot_id}
                    onChange={e => handleCreateFormChange('plot_id', e.target.value)}
                    className="border p-2 rounded w-full"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Buyer Name *</label>
                  <input
                    type="text"
                    value={createForm.buyer_name}
                    onChange={e => handleCreateFormChange('buyer_name', e.target.value)}
                    className="border p-2 rounded w-full"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Buyer Phone *</label>
                  <input
                    type="tel"
                    value={createForm.buyer_phone}
                    onChange={e => handleCreateFormChange('buyer_phone', e.target.value)}
                    className="border p-2 rounded w-full"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Buyer CNIC *</label>
                  <input
                    type="text"
                    value={createForm.buyer_cnic}
                    onChange={e => handleCreateFormChange('buyer_cnic', e.target.value)}
                    className="border p-2 rounded w-full"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Total Sale Price *</label>
                  <input
                    type="number"
                    value={createForm.total_sale_price || ''}
                    onChange={e => handleCreateFormChange('total_sale_price', Number(e.target.value))}
                    className="border p-2 rounded w-full"
                    min={0}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Down Payment *</label>
                  <input
                    type="number"
                    value={createForm.down_payment || ''}
                    onChange={e => handleCreateFormChange('down_payment', Number(e.target.value))}
                    className="border p-2 rounded w-full"
                    min={0}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Plan Duration (months) *</label>
                  <input
                    type="number"
                    value={createForm.plan_duration_months}
                    onChange={e => handleCreateFormChange('plan_duration_months', Number(e.target.value))}
                    className="border p-2 rounded w-full"
                    min={1}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Start Date *</label>
                  <input
                    type="date"
                    value={createForm.start_date}
                    onChange={e => handleCreateFormChange('start_date', e.target.value)}
                    className="border p-2 rounded w-full"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Due Day of Month *</label>
                  <input
                    type="number"
                    value={createForm.due_day_of_month}
                    onChange={e => handleCreateFormChange('due_day_of_month', Number(e.target.value))}
                    className="border p-2 rounded w-full"
                    min={1}
                    max={31}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Grace Period (days)</label>
                  <input
                    type="number"
                    value={createForm.grace_period_days}
                    onChange={e => handleCreateFormChange('grace_period_days', Number(e.target.value))}
                    className="border p-2 rounded w-full"
                    min={0}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Late Penalty Fee (per day)</label>
                  <input
                    type="number"
                    value={createForm.late_penalty_fee}
                    onChange={e => handleCreateFormChange('late_penalty_fee', Number(e.target.value))}
                    className="border p-2 rounded w-full"
                    min={0}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Surcharge Rate (%)</label>
                  <input
                    type="number"
                    value={createForm.surcharge_rate}
                    onChange={e => handleCreateFormChange('surcharge_rate', Number(e.target.value))}
                    className="border p-2 rounded w-full"
                    min={0}
                    max={100}
                  />
                </div>
              </div>

              {/* Plan Preview */}
              <div className="bg-gray-50 p-4 rounded border">
                <h4 className="font-semibold mb-2">Plan Preview</h4>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Financed Amount:</span>
                    <p className="font-medium">{fmt(createForm.total_sale_price - createForm.down_payment)}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Monthly Installment:</span>
                    <p className="font-medium">{fmt(createForm.monthly_installment_amount)}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Total Payments:</span>
                    <p className="font-medium">{createForm.plan_duration_months} installments</p>
                  </div>
                  {surchargeAmount > 0 && (
                    <div>
                      <span className="text-gray-500">Surcharge Amount:</span>
                      <p className={`font-medium ${surchargeValid ? 'text-green-600' : 'text-red-600'}`}>
                        {fmt(surchargeAmount)} {surchargeValid ? '✓' : '✗'}
                      </p>
                    </div>
                  )}
                  <div>
                    <span className="text-gray-500">Total Cost:</span>
                    <p className="font-medium">
                      {fmt(createForm.total_sale_price - createForm.down_payment + surchargeAmount)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border rounded text-gray-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-green-600 text-white rounded"
                >
                  Create Plan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payment Recording Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg">Record Payment</h3>
              <button onClick={() => setShowPaymentModal(false)} className="text-gray-500 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            {(() => {
              const schedule = schedules.find(s => s.id === selectedScheduleId);
              if (!schedule) return null;
              const totalDue = schedule.amount_due + schedule.late_fine_charged - schedule.amount_paid;
              return (
                <div>
                  <div className="bg-gray-50 p-3 rounded mb-4 text-sm">
                    <p>Installment #{schedule.installment_number} of {currentPlan?.plan_duration_months}</p>
                    <p>Due Date: {schedule.due_date}</p>
                    <p>Amount Due: {fmt(schedule.amount_due)}</p>
                    {schedule.late_fine_charged > 0 && (
                      <p className="text-red-600">Late Fine: {fmt(schedule.late_fine_charged)}</p>
                    )}
                    <p className="font-medium">Total Payable: {fmt(totalDue)}</p>
                  </div>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handlePayment(paymentForm);
                    }}
                    className="space-y-3"
                  >
                    <div>
                      <label className="block text-sm font-medium mb-1">Payment Amount *</label>
                      <input
                        type="number"
                        value={paymentForm.amount_paid}
                        onChange={e => setPaymentForm(prev => ({ ...prev, amount_paid: Number(e.target.value) }))}
                        className="border p-2 rounded w-full"
                        min={0}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Payment Date *</label>
                      <input
                        type="date"
                        value={paymentForm.payment_date}
                        onChange={e => setPaymentForm(prev => ({ ...prev, payment_date: e.target.value }))}
                        className="border p-2 rounded w-full"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Payment Method *</label>
                      <select
                        value={paymentForm.payment_method}
                        onChange={e => setPaymentForm(prev => ({ ...prev, payment_method: e.target.value }))}
                        className="border p-2 rounded w-full"
                      >
                        <option value="CASH">Cash</option>
                        <option value="BANK_TRANSFER">Bank Transfer</option>
                        <option value="PAY_ORDER">Pay Order</option>
                        <option value="CHEQUE">Cheque</option>
                        <option value="ONLINE">Online</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Discount Applied</label>
                      <input
                        type="number"
                        value={paymentForm.discount_applied}
                        onChange={e => setPaymentForm(prev => ({ ...prev, discount_applied: Number(e.target.value) }))}
                        className="border p-2 rounded w-full"
                        min={0}
                      />
                    </div>
                    <div className="bg-gray-50 p-3 rounded text-sm">
                      <div className="flex justify-between">
                        <span>Amount Due:</span>
                        <span>{fmt(totalDue)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Payment:</span>
                        <span>{fmt(paymentForm.amount_paid)}</span>
                      </div>
                      {paymentForm.discount_applied > 0 && (
                        <div className="flex justify-between text-green-600">
                          <span>Discount:</span>
                          <span>-{fmt(paymentForm.discount_applied)}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-medium border-t pt-1 mt-1">
                        <span>Remaining:</span>
                        <span>{fmt(Math.max(0, totalDue - paymentForm.amount_paid - paymentForm.discount_applied))}</span>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowPaymentModal(false)}
                        className="px-4 py-2 border rounded text-gray-600"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-2 bg-green-600 text-white rounded"
                      >
                        Record Payment
                      </button>
                    </div>
                  </form>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};

export default InstallmentEngine;
