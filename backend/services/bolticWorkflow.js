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

  /**
   * Trigger a Boltic workflow by its webhook URL
   * @param {string} webhookUrl - The webhook URL from Boltic workflow settings
   * @param {object} payload - Data to pass to the workflow
   */
  async triggerWorkflow(webhookUrl, payload) {
    if (!webhookUrl) {
      console.warn('[BolticWorkflow] No webhook URL configured — skipping workflow trigger');
      return { skipped: true, reason: 'no_webhook_url' };
    }

    try {
      const res = await axios.post(webhookUrl, {
        ...payload,
        triggered_at: new Date().toISOString(),
        source: 'chaser-agent-backend',
      });
      console.log(`[BolticWorkflow] ✅ Workflow triggered successfully`);
      return { success: true, data: res.data };
    } catch (err) {
      console.error(`[BolticWorkflow] ❌ Workflow trigger failed:`, err.response?.data || err.message);
      // Don't throw — workflow failure shouldn't break the main flow
      return { success: false, error: err.message };
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
    
    return this.triggerWorkflow(webhookUrl, {
      event: 'manual_chaser',
      task_id: data.taskId,
      task_title: data.taskTitle,
      assignee_email: data.assigneeEmail,
      assignee_name: data.assigneeName,
      due_date: data.dueDate,
      priority: data.priority,
      status: data.status,
      message: data.message,
      channel: data.channel || 'email',
      chaser_count: data.chaserCount,
      is_escalation: data.isEscalation || false,
      escalation_email: data.escalationEmail,
      trigger_type: data.triggerType,
      snooze_link: `${process.env.APP_BASE_URL}/api/tasks/${data.taskId}/snooze?hours=4`,
      ack_link: `${process.env.APP_BASE_URL}/api/tasks/${data.taskId}/acknowledge?token=${data.ackToken || ''}`,
      task_link: `${process.env.FRONTEND_URL}/tasks/${data.taskId}`,
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
