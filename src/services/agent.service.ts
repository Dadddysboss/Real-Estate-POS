import { DatabaseResponse } from '../../electron/preload';
import { Agent, AgentCommission } from '../types/electron';
import { logAudit } from './audit.service';
import { queueMutation } from './sync.service';

export interface AgentPayload {
  agency_name: string | null;
  agent_name: string;
  phone_number: string;
  cnic: string | null;
  commission_type: 'PERCENTAGE' | 'FIXED';
  commission_rate: number;
}

export interface CommissionPayload {
  agent_id: string;
  transaction_id: string;
  commission_earned: number;
  status: 'UNPAID' | 'PARTIAL' | 'PAID';
}

// ------------------------------------------------------------------
// AGENT OPERATIONS
// ------------------------------------------------------------------

export async function fetchAgents(): Promise<Agent[]> {
  const sql = `SELECT * FROM agents ORDER BY created_at DESC`;
  const res: DatabaseResponse<Agent[]> = await window.api.dbQuery(sql, []);
  if (!res.success || !res.data) throw new Error(res.error || 'Failed to fetch agents');
  return res.data;
}

export async function createAgent(
  userId: string,
  userName: string,
  payload: AgentPayload
): Promise<string> {
  const id = `AGENT_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const sql = `
    INSERT INTO agents (id, agency_name, agent_name, phone_number, cnic, commission_type, commission_rate, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `;
  const res = await window.api.dbExecute(sql, [
    id, payload.agency_name, payload.agent_name, payload.phone_number,
    payload.cnic, payload.commission_type, Math.round(payload.commission_rate)
  ]);
  if (!res.success) throw new Error(res.error || 'Failed to create agent');

  await queueMutation('INSERT', 'agents', { id, ...payload });
  await logAudit({
    userId, userName, actionType: 'CREATE', moduleName: 'AGENTS',
    entityId: id,
    description: `Agent created: ${payload.agent_name} (${payload.commission_type} ${payload.commission_rate}%)`,
  });
  return id;
}

export async function updateAgent(
  id: string,
  userId: string,
  userName: string,
  payload: AgentPayload,
  previous: Agent
): Promise<void> {
  const sql = `
    UPDATE agents SET
      agency_name = ?, agent_name = ?, phone_number = ?, cnic = ?,
      commission_type = ?, commission_rate = ?
    WHERE id = ?
  `;
  const res = await window.api.dbExecute(sql, [
    payload.agency_name, payload.agent_name, payload.phone_number,
    payload.cnic, payload.commission_type, Math.round(payload.commission_rate), id
  ]);
  if (!res.success) throw new Error(res.error || 'Failed to update agent');

  await queueMutation('UPDATE', 'agents', { id, ...payload });
  await logAudit({
    userId, userName, actionType: 'UPDATE', moduleName: 'AGENTS',
    entityId: id,
    description: `Agent updated: ${previous.agent_name} -> ${payload.agent_name}`,
  });
}

export async function deleteAgent(id: string, userId: string, userName: string, ref: string): Promise<void> {
  const res = await window.api.dbExecute(`DELETE FROM agents WHERE id = ?`, [id]);
  if (!res.success) throw new Error(res.error || 'Failed to delete agent');
  await queueMutation('DELETE', 'agents', { id });
  await logAudit({
    userId, userName, actionType: 'DELETE', moduleName: 'AGENTS',
    entityId: id, description: `Agent deleted: ${ref}`
  });
}

// ------------------------------------------------------------------
// COMMISSION OPERATIONS
// ------------------------------------------------------------------

export async function fetchAgentCommissions(agentId?: string): Promise<AgentCommission[]> {
  let sql = `SELECT * FROM agent_commissions ORDER BY created_at DESC`;
  const args: string[] = [];
  if (agentId) {
    sql += ` WHERE agent_id = ?`;
    args.push(agentId);
  }
  const res: DatabaseResponse<AgentCommission[]> = await window.api.dbQuery(sql, args);
  if (!res.success || !res.data) throw new Error(res.error || 'Failed to fetch commissions');
  return res.data;
}

export async function recordCommission(
  userId: string,
  userName: string,
  payload: CommissionPayload
): Promise<string> {
  const id = `COMM_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const balanceDue = payload.commission_earned;
  const sql = `
    INSERT INTO agent_commissions (id, agent_id, transaction_id, commission_earned, commission_paid, balance_due, status, created_at)
    VALUES (?, ?, ?, ?, 0, ?, ?, CURRENT_TIMESTAMP)
  `;
  const res = await window.api.dbExecute(sql, [
    id, payload.agent_id, payload.transaction_id,
    Math.round(payload.commission_earned), Math.round(balanceDue), payload.status
  ]);
  if (!res.success) throw new Error(res.error || 'Failed to record commission');

  await queueMutation('INSERT', 'agent_commissions', { id, ...payload });
  await logAudit({
    userId, userName, actionType: 'CREATE', moduleName: 'COMMISSIONS',
    entityId: id,
    description: `Commission earned: Rs. ${payload.commission_earned.toLocaleString()} for transaction ${payload.transaction_id}`,
  });
  return id;
}

export async function payCommission(
  commissionId: string,
  amount: number,
  userId: string,
  userName: string
): Promise<void> {
  const commRes: DatabaseResponse<AgentCommission[]> = await window.api.dbQuery(
    `SELECT * FROM agent_commissions WHERE id = ? LIMIT 1`, [commissionId]
  );
  if (!commRes.success || !commRes.data || commRes.data.length === 0) {
    throw new Error('Commission not found');
  }
  const comm = commRes.data[0];
  const newPaid = comm.commission_paid + amount;
  const newBalance = comm.commission_earned - newPaid;
  const newStatus = newBalance <= 0 ? 'PAID' : newPaid > 0 ? 'PARTIAL' : 'UNPAID';

  const sql = `
    UPDATE agent_commissions SET commission_paid = ?, balance_due = ?, status = ? WHERE id = ?
  `;
  const res = await window.api.dbExecute(sql, [
    Math.round(newPaid), Math.round(newBalance), newStatus, commissionId
  ]);
  if (!res.success) throw new Error(res.error || 'Failed to update commission');

  await queueMutation('UPDATE', 'agent_commissions', {
    id: commissionId, commission_paid: newPaid, balance_due: newBalance, status: newStatus
  });
  await logAudit({
    userId, userName, actionType: 'UPDATE', moduleName: 'COMMISSIONS',
    entityId: commissionId,
    description: `Commission payout: Rs. ${amount.toLocaleString()} paid. Remaining: Rs. ${newBalance.toLocaleString()}`,
  });
}

// ------------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------------

export function calculateAgentStats(_agent: Agent, commissions: AgentCommission[]) {
  const totalEarned = commissions.reduce((s, c) => s + c.commission_earned, 0);
  const totalPaid = commissions.reduce((s, c) => s + c.commission_paid, 0);
  const totalDue = commissions.reduce((s, c) => s + c.balance_due, 0);
  return { totalEarned, totalPaid, totalDue };
}