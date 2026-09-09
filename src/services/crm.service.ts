import { DatabaseResponse } from '../../electron/preload';
import { Lead, SiteVisit } from '../types/electron';
import { logAudit } from './audit.service';
import { queueMutation } from './sync.service';

export const LEAD_STAGES = ['NEW_LEAD', 'CONTACTED', 'SITE_VISIT', 'NEGOTIATION', 'CLOSED_WON', 'CLOSED_LOST'] as const;
export const LEAD_PRIORITIES = ['HOT', 'WARM', 'COLD'] as const;
export const LEAD_SOURCES = ['FACEBOOK', 'WALK_IN', 'DEALER', 'WEBSITE', 'REFERRAL', 'OTHER'] as const;

export type LeadStage = (typeof LEAD_STAGES)[number];
export type LeadPriority = (typeof LEAD_PRIORITIES)[number];
export type LeadSource = (typeof LEAD_SOURCES)[number];

export interface LeadPayload {
  prospect_name: string;
  phone_number: string;
  interested_category: string;
  budget_range: number;
  lead_source: LeadSource;
  assigned_agent_id: string | null;
  pipeline_stage: LeadStage;
  priority: LeadPriority;
}

export interface SiteVisitPayload {
  lead_id: string;
  plot_id: string | null;
  visit_date: string;
  status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
  feedback_notes: string;
}

// ------------------------------------------------------------------
// LEAD OPERATIONS
// ------------------------------------------------------------------

export async function fetchLeads(branchId: string, stage?: LeadStage | 'ALL'): Promise<Lead[]> {
  let sql = `SELECT * FROM leads WHERE branch_id = ?`;
  const args: (string | number)[] = [branchId];

  if (stage && stage !== 'ALL') {
    sql += ` AND pipeline_stage = ?`;
    args.push(stage);
  }
  sql += ` ORDER BY created_at DESC`;

  const res: DatabaseResponse<Lead[]> = await window.api.dbQuery(sql, args);
  if (!res.success || !res.data) throw new Error(res.error || 'Failed to fetch leads');
  return res.data;
}

export async function createLead(
  branchId: string,
  userId: string,
  userName: string,
  payload: LeadPayload
): Promise<string> {
  const id = `LEAD_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const sql = `
    INSERT INTO leads (
      id, branch_id, prospect_name, phone_number, interested_category, budget_range,
      lead_source, assigned_agent_id, pipeline_stage, priority, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `;
  const res = await window.api.dbExecute(sql, [
    id, branchId, payload.prospect_name, payload.phone_number,
    payload.interested_category, Math.round(payload.budget_range),
    payload.lead_source, payload.assigned_agent_id,
    payload.pipeline_stage, payload.priority
  ]);
  if (!res.success) throw new Error(res.error || 'Failed to create lead');

  await queueMutation('INSERT', 'leads', { id, branch_id: branchId, ...payload });
  await logAudit({
    userId, userName, actionType: 'CREATE', moduleName: 'CRM',
    entityId: id,
    description: `Lead created: ${payload.prospect_name} (${payload.phone_number}) - ${payload.pipeline_stage}`,
  });
  return id;
}

export async function updateLeadStage(
  leadId: string,
  newStage: LeadStage,
  userId: string,
  userName: string,
  previousStage: LeadStage
): Promise<void> {
  const sql = `UPDATE leads SET pipeline_stage = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
  const res = await window.api.dbExecute(sql, [newStage, leadId]);
  if (!res.success) throw new Error(res.error || 'Failed to update lead stage');

  await queueMutation('UPDATE', 'leads', { id: leadId, pipeline_stage: newStage });
  await logAudit({
    userId, userName, actionType: 'UPDATE', moduleName: 'CRM',
    entityId: leadId,
    description: `Lead stage: ${previousStage} -> ${newStage}`,
  });
}

export async function updateLead(
  leadId: string,
  userId: string,
  userName: string,
  payload: LeadPayload
): Promise<void> {
  const sql = `
    UPDATE leads SET
      prospect_name = ?, phone_number = ?, interested_category = ?, budget_range = ?,
      lead_source = ?, assigned_agent_id = ?, pipeline_stage = ?, priority = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `;
  const res = await window.api.dbExecute(sql, [
    payload.prospect_name, payload.phone_number,
    payload.interested_category, Math.round(payload.budget_range),
    payload.lead_source, payload.assigned_agent_id,
    payload.pipeline_stage, payload.priority, leadId
  ]);
  if (!res.success) throw new Error(res.error || 'Failed to update lead');

  await queueMutation('UPDATE', 'leads', { id: leadId, ...payload });
  await logAudit({
    userId, userName, actionType: 'UPDATE', moduleName: 'CRM',
    entityId: leadId,
    description: `Lead updated: ${payload.prospect_name}`,
  });
}

export async function deleteLead(id: string, userId: string, userName: string, name: string): Promise<void> {
  const res = await window.api.dbExecute(`DELETE FROM leads WHERE id = ?`, [id]);
  if (!res.success) throw new Error(res.error || 'Failed to delete lead');

  await queueMutation('DELETE', 'leads', { id });
  await logAudit({
    userId, userName, actionType: 'DELETE', moduleName: 'CRM',
    entityId: id,
    description: `Lead deleted: ${name}`,
  });
}

// ------------------------------------------------------------------
// SITE VISIT OPERATIONS
// ------------------------------------------------------------------

export async function fetchSiteVisits(leadId?: string): Promise<SiteVisit[]> {
  let sql = `SELECT * FROM site_visits`;
  const args: string[] = [];

  if (leadId) {
    sql += ` WHERE lead_id = ?`;
    args.push(leadId);
  }
  sql += ` ORDER BY visit_date DESC`;

  const res: DatabaseResponse<SiteVisit[]> = await window.api.dbQuery(sql, args);
  if (!res.success || !res.data) throw new Error(res.error || 'Failed to fetch site visits');
  return res.data;
}

export async function createSiteVisit(
  userId: string,
  userName: string,
  payload: SiteVisitPayload
): Promise<string> {
  const id = `VISIT_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const sql = `
    INSERT INTO site_visits (id, lead_id, plot_id, visit_date, status, feedback_notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `;
  const res = await window.api.dbExecute(sql, [
    id, payload.lead_id, payload.plot_id,
    payload.visit_date, payload.status, payload.feedback_notes
  ]);
  if (!res.success) throw new Error(res.error || 'Failed to create site visit');

  await queueMutation('INSERT', 'site_visits', { id, ...payload });
  await logAudit({
    userId, userName, actionType: 'CREATE', moduleName: 'CRM',
    entityId: id,
    description: `Site visit scheduled: ${new Date(payload.visit_date).toLocaleDateString()} - ${payload.status}`,
  });
  return id;
}

export async function updateSiteVisit(
  visitId: string,
  userId: string,
  userName: string,
  payload: SiteVisitPayload
): Promise<void> {
  const sql = `
    UPDATE site_visits SET
      lead_id = ?, plot_id = ?, visit_date = ?, status = ?, feedback_notes = ?
    WHERE id = ?
  `;
  const res = await window.api.dbExecute(sql, [
    payload.lead_id, payload.plot_id,
    payload.visit_date, payload.status, payload.feedback_notes, visitId
  ]);
  if (!res.success) throw new Error(res.error || 'Failed to update site visit');

  await queueMutation('UPDATE', 'site_visits', { id: visitId, ...payload });
  await logAudit({
    userId, userName, actionType: 'UPDATE', moduleName: 'CRM',
    entityId: visitId,
    description: `Site visit updated: ${payload.status}`,
  });
}

export async function deleteSiteVisit(id: string, userId: string, userName: string): Promise<void> {
  const res = await window.api.dbExecute(`DELETE FROM site_visits WHERE id = ?`, [id]);
  if (!res.success) throw new Error(res.error || 'Failed to delete site visit');

  await queueMutation('DELETE', 'site_visits', { id });
  await logAudit({
    userId, userName, actionType: 'DELETE', moduleName: 'CRM',
    entityId: id,
    description: `Site visit deleted`,
  });
}

// ------------------------------------------------------------------
// WHATSAPP INTEGRATION
// ------------------------------------------------------------------

export function generateWhatsAppLink(phone: string, message: string): string {
  const cleanPhone = phone.replace(/\D/g, '');
  const encodedMessage = encodeURIComponent(message);
  return `https://wa.me/${cleanPhone}?text=${encodedMessage}`;
}

export function buildFollowUpMessage(leadName: string, stage: LeadStage): string {
  const messages: Record<LeadStage, string> = {
    NEW_LEAD: `Hi ${leadName}, thank you for your interest in our properties. When would you like to schedule a site visit?`,
    CONTACTED: `Hi ${leadName}, following up on our conversation. Are you available for a site visit this week?`,
    SITE_VISIT: `Hi ${leadName}, thank you for visiting the site. Please let us know if you have any questions or would like to proceed.`,
    NEGOTIATION: `Hi ${leadName}, we're ready to discuss the final terms. When can we meet to close the deal?`,
    CLOSED_WON: `Hi ${leadName}, congratulations on your purchase! We'll be in touch with next steps.`,
    CLOSED_LOST: `Hi ${leadName}, thank you for considering our properties. We hope to work with you in the future.`,
  };
  return messages[stage];
}

export function buildReminderMessage(leadName: string, visitDate: string): string {
  return `Hi ${leadName}, this is a reminder about your site visit scheduled for ${new Date(visitDate).toLocaleDateString('en-PK')}. Please confirm your availability.`;
}