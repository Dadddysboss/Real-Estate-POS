import { DatabaseResponse } from '../../electron/preload';
import { InstallmentPlan, InstallmentSchedule } from '../types/electron';
import { logAudit } from './audit.service';
import { queueMutation } from './sync.service';

export interface InstallmentPlanPayload {
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
}

export interface SchedulePaymentPayload {
  schedule_id: string;
  amount_paid: number;
  payment_date: string;
  payment_method: string;
  discount_applied: number;
  late_fine_charged?: number;
}

export async function fetchInstallmentPlans(): Promise<InstallmentPlan[]> {
  const sql = `SELECT * FROM installment_plans ORDER BY created_at DESC`;
  const res: DatabaseResponse<InstallmentPlan[]> = await window.api.dbQuery(sql, []);
  if (!res.success || !res.data) throw new Error(res.error || 'Failed to fetch installment plans');
  return res.data;
}

export async function fetchInstallmentPlanById(planId: string): Promise<InstallmentPlan | null> {
  const sql = `SELECT * FROM installment_plans WHERE id = ? LIMIT 1`;
  const res: DatabaseResponse<InstallmentPlan[]> = await window.api.dbQuery(sql, [planId]);
  if (!res.success || !res.data || res.data.length === 0) return null;
  return res.data[0];
}

export async function createInstallmentPlan(
  userId: string,
  userName: string,
  payload: InstallmentPlanPayload
): Promise<string> {
  const id = `PLAN_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const sql = `
    INSERT INTO installment_plans (
      id, plot_id, buyer_name, buyer_phone, buyer_cnic,
      total_sale_price, down_payment, plan_duration_months, monthly_installment_amount,
      start_date, due_day_of_month, grace_period_days, late_penalty_fee, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', CURRENT_TIMESTAMP)
  `;
  const res = await window.api.dbExecute(sql, [
    id, payload.plot_id, payload.buyer_name, payload.buyer_phone, payload.buyer_cnic,
    payload.total_sale_price, payload.down_payment, payload.plan_duration_months,
    payload.monthly_installment_amount, payload.start_date, payload.due_day_of_month,
    payload.grace_period_days, payload.late_penalty_fee
  ]);
  if (!res.success) throw new Error(res.error || 'Failed to create installment plan');

  const plan: InstallmentPlan = {
    id,
    plot_id: payload.plot_id,
    buyer_name: payload.buyer_name,
    buyer_phone: payload.buyer_phone,
    buyer_cnic: payload.buyer_cnic,
    total_sale_price: payload.total_sale_price,
    down_payment: payload.down_payment,
    plan_duration_months: payload.plan_duration_months,
    monthly_installment_amount: payload.monthly_installment_amount,
    start_date: payload.start_date,
    due_day_of_month: payload.due_day_of_month,
    grace_period_days: payload.grace_period_days,
    late_penalty_fee: payload.late_penalty_fee,
    status: 'ACTIVE',
    created_at: new Date().toISOString(),
  };

  await queueMutation('INSERT', 'installment_plans', { id, ...payload });
  await logAudit({
    userId, userName, actionType: 'CREATE', moduleName: 'INSTALLMENTS',
    entityId: id,
    description: `Installment plan created: ${payload.buyer_name} — ${payload.plan_duration_months} months`,
  });
  await generateSchedulesForPlan(plan, userId, userName);
  return id;
}

export async function fetchSchedulesByPlan(planId: string): Promise<InstallmentSchedule[]> {
  const sql = `SELECT * FROM installment_schedules WHERE plan_id = ? ORDER BY installment_number ASC`;
  const res: DatabaseResponse<InstallmentSchedule[]> = await window.api.dbQuery(sql, [planId]);
  if (!res.success || !res.data) throw new Error(res.error || 'Failed to fetch schedules');
  return res.data;
}

export async function generateSchedulesForPlan(
  plan: InstallmentPlan,
  userId: string,
  userName: string
): Promise<void> {
  const baseAmount = Math.round(plan.monthly_installment_amount);
  const financedAmount = Math.round(plan.total_sale_price - plan.down_payment);
  const lastInstallmentAmount = Math.max(0, financedAmount - baseAmount * (plan.plan_duration_months - 1));

  for (let i = 1; i <= plan.plan_duration_months; i++) {
    const id = `SCHED_${plan.id}_${i}`;
    const dueDate = new Date(`${plan.start_date}T00:00:00`);
    dueDate.setMonth(dueDate.getMonth() + i);
    dueDate.setDate(plan.due_day_of_month);
    const amountDue = i === plan.plan_duration_months ? lastInstallmentAmount : baseAmount;
    const sql = `
      INSERT OR IGNORE INTO installment_schedules (
        id, plan_id, installment_number, due_date, amount_due, amount_paid,
        late_fine_charged, discount_applied, payment_date, payment_method, status, created_at
      ) VALUES (?, ?, ?, ?, ?, 0, 0, 0, NULL, NULL, 'PENDING', CURRENT_TIMESTAMP)
    `;
    await window.api.dbExecute(sql, [
      id, plan.id, i, dueDate.toISOString().split('T')[0], amountDue
    ]);
  }
  await logAudit({
    userId, userName, actionType: 'CREATE', moduleName: 'INSTALLMENTS',
    entityId: plan.id,
    description: `Generated ${plan.plan_duration_months} schedules for plan ${plan.id}`,
  });
}

export async function recordSchedulePayment(
  payload: SchedulePaymentPayload,
  userId: string,
  userName: string
): Promise<void> {
  const schedRes: DatabaseResponse<InstallmentSchedule[]> = await window.api.dbQuery(
    `SELECT * FROM installment_schedules WHERE id = ? LIMIT 1`, [payload.schedule_id]
  );
  if (!schedRes.success || !schedRes.data || schedRes.data.length === 0) {
    throw new Error('Schedule not found');
  }
  const sched = schedRes.data[0];
  const lateFine = Math.max(0, payload.late_fine_charged ?? 0);
  const newPaid = Math.max(0, sched.amount_paid + payload.amount_paid - payload.discount_applied);
  const totalDue = sched.amount_due + lateFine;
  const isPaid = newPaid >= totalDue;
  const nextStatus: InstallmentSchedule['status'] = isPaid ? 'PAID' : sched.status === 'OVERDUE' ? 'OVERDUE' : 'PENDING';

  const sql = `
    UPDATE installment_schedules SET
      amount_paid = ?, discount_applied = ?, payment_date = ?, payment_method = ?,
      late_fine_charged = ?, status = ?
    WHERE id = ?
  `;
  const res = await window.api.dbExecute(sql, [
    newPaid, payload.discount_applied, payload.payment_date, payload.payment_method,
    lateFine, nextStatus, payload.schedule_id
  ]);
  if (!res.success) throw new Error(res.error || 'Failed to record payment');

  await queueMutation('UPDATE', 'installment_schedules', {
    id: payload.schedule_id,
    amount_paid: newPaid,
    discount_applied: payload.discount_applied,
    payment_date: payload.payment_date,
    payment_method: payload.payment_method,
    late_fine_charged: lateFine,
    status: nextStatus,
  });
  await logAudit({
    userId, userName, actionType: 'UPDATE', moduleName: 'INSTALLMENTS',
    entityId: payload.schedule_id,
    description: `Payment recorded: Rs. ${Math.round(payload.amount_paid).toLocaleString('en-PK')} for installment ${sched.installment_number}`,
  });
}

export async function updatePlanStatus(planId: string, status: InstallmentPlan['status']): Promise<void> {
  const res = await window.api.dbExecute(
    `UPDATE installment_plans SET status = ? WHERE id = ?`,
    [status, planId]
  );
  if (!res.success) throw new Error(res.error || 'Failed to update installment plan status');
}

export async function printInstallmentReceipt(receiptText: string): Promise<void> {
  const res = await window.api.printReceipt(receiptText);
  if (!res.success) throw new Error(res.error || 'Failed to print receipt');
}

const fmt = (n: number) => `Rs. ${Math.round(n).toLocaleString('en-PK')}`;

export function calculatePlanSummary(plan: InstallmentPlan, schedules: InstallmentSchedule[]) {
  const totalDue = plan.total_sale_price - plan.down_payment;
  const totalPaid = schedules.reduce((s, sch) => s + sch.amount_paid, 0);
  const totalPenalties = schedules.reduce((s, sch) => s + sch.late_fine_charged, 0);
  const totalDiscounts = schedules.reduce((s, sch) => s + sch.discount_applied, 0);
  const paidCount = schedules.filter(s => s.status === 'PAID').length;
  const overdueCount = schedules.filter(s => s.status === 'OVERDUE').length;
  const progress = plan.plan_duration_months > 0 ? (paidCount / plan.plan_duration_months) * 100 : 0;
  const remaining = Math.max(0, totalDue + totalPenalties - totalDiscounts - totalPaid);

  return { totalDue, totalPaid, totalPenalties, totalDiscounts, paidCount, overdueCount, progress, remaining };
}

export function updateOverdueStatuses(schedules: InstallmentSchedule[], graceDays: number, penaltyPerDay: number): InstallmentSchedule[] {
  const today = new Date();
  return schedules.map(sch => {
    if (sch.status === 'PAID') return sch;
    const dueDate = new Date(`${sch.due_date}T00:00:00`);
    const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysOverdue > graceDays) {
      const penalty = (daysOverdue - graceDays) * penaltyPerDay;
      return { ...sch, status: 'OVERDUE' as const, late_fine_charged: penalty };
    }
    return sch;
  });
}

export { fmt };
