import { DatabaseResponse } from '../../electron/preload';
import { logAudit } from './audit.service';
import { queueMutation } from './sync.service';

export interface WhatsAppTemplatePayload {
  template_name: string;
  whatsapp_message: string;
  placeholder_fields: string[];
}

export async function fetchWhatsappTemplates(): Promise<any[]> {
  const sql = `SELECT * FROM whatsapp_templates ORDER BY created_at DESC`;
  const res: DatabaseResponse<any[]> = await window.api.dbQuery(sql, []);
  if (!res.success || !res.data) throw new Error(res.error || 'Failed to fetch templates');
  return res.data;
}

export async function createTemplate(
  userId: string,
  userName: string,
  payload: WhatsAppTemplatePayload
): Promise<string> {
  const id = `WA_TEMP_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const sql = `
    INSERT INTO whatsapp_templates (id, template_name, whatsapp_message, placeholder_fields, status, created_at)
    VALUES (?, ?, ?, ?, 'DRAFT', CURRENT_TIMESTAMP)
  `;
  const res = await window.api.dbExecute(sql, [id, payload.template_name, JSON.stringify(payload.whatsapp_message), JSON.stringify(payload.placeholder_fields)]);
  if (!res.success) throw new Error(res.error || 'Failed to create template');

  await queueMutation('INSERT', 'whatsapp_templates', { id, ...payload });
  await logAudit({
    userId, userName, actionType: 'CREATE', moduleName: 'WHATSAPP',
    entityId: id, description: `Template created: ${payload.template_name}`,
  });
  return id;
}

// Simulated WhatsApp API call helper
export async function sendWhatsappMessage(phoneNumber: string, message: string, templateId?: string): Promise<{ success: boolean; messageId?: string }> {
  // In production, this would call WhatsApp Business API
  console.log(`[WhatsApp Simulation] Sending to ${phoneNumber}:`, message);
  
  await logAudit({
    userId: 'SYSTEM',
    userName: 'WHATSAPP_SERVICE',
    actionType: 'CREATE',
    moduleName: 'WHATSAPP',
    entityId: templateId || '',
    description: `WhatsApp sent to ${phoneNumber}${templateId ? ` using template ${templateId}` : ''}`,
  });

  // Return simulated success
  return { success: true, messageId: `MSG_${Date.now()}` };
}

// Predefined templates for common use cases
export const DEFAULT_TEMPLATES = [
  {
    name: 'NEW_LEAD_NOTIFICATION',
    message: 'Hello {{customer_name}}, thank you for your interest in {{property_type}}. Our team will contact you within 24 hours.',
    placeholders: ['customer_name', 'property_type'],
  },
  {
    name: 'SALE_CONFIRMATION',
    message: 'Congratulations {{buyer_name}}! Your purchase of plot {{plot_id}} has been confirmed. Please visit our office for documentation.',
    placeholders: ['buyer_name', 'plot_id'],
  },
  {
    name: 'INSTALLMENT_REMINDER',
    message: 'Dear {{customer_name}}, reminder: Your installment of Rs. {{amount}} is due on {{due_date}}. Pay now at {{payment_link}}',
    placeholders: ['customer_name', 'amount', 'due_date', 'payment_link'],
  },
];
