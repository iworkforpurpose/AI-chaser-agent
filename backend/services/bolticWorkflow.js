/**
 * Boltic Workflow Service
 * Triggers Boltic automation workflows via webhook endpoints
 * Each method corresponds to a specific Boltic workflow you configure
 */

const axios = require('axios');

class BolticWorkflowService {
  constructor() {
    this.client = axios.create({
      baseURL: 'https://api.boltic.io/v1',
      headers: {
        'Authorization': `Bearer ${process.env.BOLTIC_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    });
  }

  normalizeBaseUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    return raw.replace(/\/+$/, '');
  }

  joinUrl(base, path) {
    const normalizedBase = this.normalizeBaseUrl(base);
    const normalizedPath = String(path || '').replace(/^\/+/, '');
    if (!normalizedBase) return normalizedPath ? `/${normalizedPath}` : '';
    if (!normalizedPath) return normalizedBase;
    return `${normalizedBase}/${normalizedPath}`;
  }

  buildWebhookLink(path, query = {}) {
    const base = this.normalizeBaseUrl(process.env.APP_BASE_URL);
    if (!base) return '';
    const url = new URL(this.joinUrl(base, path));
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    });
    return url.toString();
  }

  escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  toHumanLabel(value) {
    return String(value || '')
      .replace(/_/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  formatDueDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value || '');
    const timezone = process.env.EMAIL_TIMEZONE || 'Asia/Kolkata';
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: timezone,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short',
    }).format(date);
  }

  stripGreeting(message, assigneeName) {
    const raw = String(message || '').trim();
    const safeName = String(assigneeName || '').trim();
    if (!raw || !safeName) return raw;

    const escapedName = safeName
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\s+/g, '\\s+');

    return raw.replace(new RegExp(`^hi\\s+${escapedName}\\s*[!,.\\-:]*\\s*`, 'i'), '').trim();
  }

  buildManualChaserEmailContent(data) {
    const assigneeName = String(data.assigneeName || '').trim() || 'there';
    const taskTitle = String(data.taskTitle || '').trim() || 'Untitled Task';
    const dueDateHuman = this.formatDueDate(data.dueDate);
    const statusHuman = this.toHumanLabel(data.status) || 'Todo';
    const priorityHuman = this.toHumanLabel(data.priority) || 'Medium';
    const messagePlain = String(data.message || '').trim();
    const messageClean = this.stripGreeting(messagePlain, assigneeName);
    const openTaskUrl = this.joinUrl(process.env.FRONTEND_URL, `/tasks/${data.taskId}`);
    const subjectPrefix = data.isEscalation ? 'Escalation' : 'Action Required';
    const subject = `[${subjectPrefix}] ${taskTitle}`;
    const intro = messageClean || `A reminder about your task "${taskTitle}".`;
    const openTaskLabel = openTaskUrl || 'Not configured';

    const body = [
      `Hi ${assigneeName},`,
      '',
      intro,
      '',
      'Task Details',
      `- Task: ${taskTitle}`,
      `- Status: ${statusHuman}`,
      `- Priority: ${priorityHuman}`,
      `- Due: ${dueDateHuman}`,
      '',
      `Open Task: ${openTaskLabel}`,
    ].join('\n');

    const bodyHtml = [
      `<p>Hi ${this.escapeHtml(assigneeName)},</p>`,
      `<p>${this.escapeHtml(intro)}</p>`,
      '<p><strong>Task Details</strong><br>',
      `- Task: ${this.escapeHtml(taskTitle)}<br>`,
      `- Status: ${this.escapeHtml(statusHuman)}<br>`,
      `- Priority: ${this.escapeHtml(priorityHuman)}<br>`,
      `- Due: ${this.escapeHtml(dueDateHuman)}</p>`,
      `<p><a href="${this.escapeHtml(openTaskUrl)}">Open Task</a></p>`,
    ].join('');

    return {
      subject,
      body,
      bodyHtml,
      messageClean,
      dueDateHuman,
      statusHuman,
      priorityHuman,
      openTaskUrl,
    };
  }

  sanitizeWebhookUrl(webhookUrl) {
    try {
      const parsed = new URL(webhookUrl);
      const last = parsed.pathname.split('/').filter(Boolean).pop() || '';
      const tail = last ? `${last.slice(0, 3)}***${last.slice(-3)}` : '';
      return `${parsed.origin}${parsed.pathname.replace(last, tail)}`;
    } catch (_) {
      return 'invalid-url';
    }
  }

  getAppBaseHost() {
    try {
      return process.env.APP_BASE_URL ? new URL(process.env.APP_BASE_URL).host : null;
    } catch (_) {
      return null;
    }
  }

  /**
   * Trigger a Boltic workflow by its webhook URL
   * @param {string} webhookUrl - The webhook URL from Boltic workflow settings
   * @param {object} payload - Data to pass to the workflow
   */
  async triggerWorkflow(webhookUrl, payload) {
    const normalizedWebhookUrl = String(webhookUrl || '').trim();
    if (!normalizedWebhookUrl) {
      console.warn('[BolticWorkflow] No webhook URL configured — skipping workflow trigger');
      return {
        success: false,
        skipped: true,
        reason: 'no_webhook_url',
        error: 'Workflow webhook URL is not configured',
        code: 'no_webhook_url',
      };
    }

    let webhookHost = null;
    try {
      webhookHost = new URL(normalizedWebhookUrl).host;
    } catch (_) {
      console.error(`[BolticWorkflow] Invalid webhook URL configured: ${normalizedWebhookUrl}`);
      return {
        success: false,
        skipped: true,
        reason: 'invalid_webhook_url',
        error: 'Workflow webhook URL is invalid',
        code: 'invalid_webhook_url',
      };
    }

    const appBaseHost = this.getAppBaseHost();
    if (appBaseHost && webhookHost === appBaseHost) {
      console.error(`[BolticWorkflow] Webhook target points to this backend (${webhookHost}); expected a Boltic webhook URL`);
      return {
        success: false,
        skipped: true,
        reason: 'webhook_points_to_backend',
        error: 'Webhook URL points to backend APP_BASE_URL, not Boltic workflow',
        code: 'webhook_points_to_backend',
      };
    }

    try {
      const redactedUrl = this.sanitizeWebhookUrl(normalizedWebhookUrl);
      console.log(`[BolticWorkflow] Triggering webhook ${redactedUrl}`);

      const res = await axios.post(normalizedWebhookUrl, {
        ...payload,
        triggered_at: new Date().toISOString(),
        source: 'chaser-agent-backend',
      });

      if (typeof res.data === 'string' && /<!doctype|<html/i.test(res.data)) {
        console.error('[BolticWorkflow] Unexpected HTML response from webhook target');
        return {
          success: false,
          error: 'Webhook responded with HTML; URL likely not a Boltic workflow webhook',
          code: 'unexpected_webhook_response',
        };
      }

      console.log(`[BolticWorkflow] ✅ Workflow trigger accepted (${res.status})`);
      return { success: true, data: res.data };
    } catch (err) {
      console.error(`[BolticWorkflow] ❌ Workflow trigger failed:`, err.response?.data || err.message);
      // Don't throw — workflow failure shouldn't break the main flow
      const code = err.response?.data?.error?.code || err.response?.status;
      const message =
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        err.message;
      return { success: false, error: message, code };
    }
  }

  /**
   * WORKFLOW 1: Manual Chaser
   * Triggers when user clicks "Chase" button OR cron fires a reminder
   * 
   * Boltic Workflow Setup:
   *   Trigger: Webhook
   *   Step 1: Parse payload
   *   Step 2: Branch on channel (email | slack | in_app | all)
   *   Step 3a: Send Email (via Gmail/SMTP connector)
   *   Step 3b: Send Slack Message (via Slack connector)
   *   Step 4: HTTP POST back to /api/webhooks/boltic/delivery-confirm
   */
  async triggerManualChaser(data) {
    const webhookUrl = process.env.BOLTIC_WEBHOOK_MANUAL_CHASER;
    const email = this.buildManualChaserEmailContent(data);
    
    return this.triggerWorkflow(webhookUrl, {
      event: 'manual_chaser',
      task_id: data.taskId,
      task_title: data.taskTitle,
      assignee_email: data.assigneeEmail,
      assignee_name: data.assigneeName,
      due_date: data.dueDate,
      due_date_human: email.dueDateHuman,
      priority: data.priority,
      priority_human: email.priorityHuman,
      status: data.status,
      status_human: email.statusHuman,
      message: data.message,
      message_clean: email.messageClean,
      channel: data.channel || 'email',
      chaser_count: data.chaserCount,
      is_escalation: data.isEscalation || false,
      escalation_email: data.escalationEmail,
      trigger_type: data.triggerType,
      email_subject: email.subject,
      email_body: email.body,
      email_body_html: email.bodyHtml,
      // Links in emails are clicked via GET, so they must target webhook GET handlers.
      snooze_link: this.buildWebhookLink('/api/webhooks/snooze', { task_id: data.taskId, hours: 4 }),
      ack_link: this.buildWebhookLink('/api/webhooks/acknowledge', { task_id: data.taskId, token: data.ackToken || '' }),
      task_link: email.openTaskUrl,
      ack_token: data.ackToken,
    });
  }

  /**
   * WORKFLOW 2: Task Completed Acknowledgment
   * Triggers when a task status changes to 'done'
   * 
   * Boltic Workflow Setup:
   *   Trigger: Webhook
   *   Step 1: Send congratulations email to assignee
   *   Step 2: Notify task reporter
   *   Step 3: Post to #completed-tasks Slack channel
   */
  async triggerAcknowledgment(data) {
    const webhookUrl = process.env.BOLTIC_WEBHOOK_ACKNOWLEDGMENT;
    
    return this.triggerWorkflow(webhookUrl, {
      event: 'task_completed',
      task_id: data.taskId,
      task_title: data.taskTitle,
      assignee_email: data.assigneeEmail,
      assignee_name: data.assigneeName,
      acknowledged_by: data.acknowledgedBy,
      completed_at: new Date().toISOString(),
    });
  }

  /**
   * WORKFLOW 3: Escalation Alert
   * Triggers when task is severely overdue and needs manager attention
   * 
   * Boltic Workflow Setup:
   *   Trigger: Webhook
   *   Step 1: Send urgent email to assignee
   *   Step 2: CC manager/escalation email
   *   Step 3: Create high-priority Slack DM to manager
   *   Step 4: Log escalation event
   */
  async triggerEscalation(data) {
    const webhookUrl = process.env.BOLTIC_WEBHOOK_ESCALATION;
    
    return this.triggerWorkflow(webhookUrl, {
      event: 'task_escalated',
      task_id: data.taskId,
      task_title: data.taskTitle,
      assignee_email: data.assigneeEmail,
      assignee_name: data.assigneeName,
      manager_email: data.managerEmail,
      days_overdue: data.daysOverdue,
      priority: data.priority,
      escalation_reason: data.reason || 'Task severely overdue',
    });
  }

  /**
   * WORKFLOW 4: Weekly Digest
   * Sends each user their personalized weekly task summary
   * 
   * Boltic Workflow Setup:
   *   Trigger: Schedule (Every Monday 9 AM)
   *   Step 1: HTTP GET /api/tasks/weekly-digest
   *   Step 2: For each user, send personalized digest email
   */
  async triggerWeeklyDigest(usersWithTasks) {
    const webhookUrl = process.env.BOLTIC_WEBHOOK_WEEKLY_DIGEST;
    
    return this.triggerWorkflow(webhookUrl, {
      event: 'weekly_digest',
      users: usersWithTasks,
      week_start: new Date().toISOString(),
    });
  }

  /**
   * WORKFLOW 5: Bulk Chaser (for "Chase All Overdue" feature)
   */
  async triggerBulkChaser(tasks, triggeredBy) {
    const webhookUrl = process.env.BOLTIC_WEBHOOK_BULK_CHASER;
    
    return this.triggerWorkflow(webhookUrl, {
      event: 'bulk_chaser',
      tasks: tasks.map(t => ({
        id: t.id,
        title: t.title,
        assignee_email: t.assignee_email,
        assignee_name: t.assignee_name,
        due_date: t.due_date,
        priority: t.priority,
      })),
      total_count: tasks.length,
      triggered_by: triggeredBy,
    });
  }
}

module.exports = new BolticWorkflowService();
