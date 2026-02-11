/**
 * Chaser Engine
 * Core service that evaluates tasks and determines what chasing actions to take.
 * Used by both the cron job and manual triggers.
 */

const db = require('../db/bolticClient');
const dayjs = require('dayjs');
const bolticWorkflow = require('./bolticWorkflow');

// Boltic dropdown fields come back as arrays; unwrap to first scalar value
const scalar = (value) => Array.isArray(value) ? value[0] : value;

class ChaserEngine {
  
  /**
   * Main method — scans all tasks and fires appropriate chasers
   * Called by the cron job every hour
   */
  async runAutomatedChaser({ source = 'system' } = {}) {
    console.log(`\n[ChaserEngine] 🔄 Running automated chaser scan at ${new Date().toISOString()}`);
    const results = { processed: 0, chased: 0, skipped: 0, errors: 0 };

    try {
      // Fetch chaser-enabled tasks; status is an array in Boltic, so filter status client-side
      const tasks = await db.find('tasks', {
        filters: [
          { field: 'chaser_enabled', operator: 'eq',  value: true },
        ],
        limit: 500,
      });

      const rules = await db.find('chaser_rules', {
        filters: [{ field: 'is_active', operator: 'eq', value: true }],
      });

      console.log(`[ChaserEngine] Found ${tasks.length} active tasks, ${rules.length} active rules`);

      for (const task of tasks) {
        const status = scalar(task.status);
        if (['done', 'cancelled'].includes(status)) {
          results.skipped++;
          continue;
        }
        results.processed++;
        try {
          const chased = await this.evaluateTask({ ...task, status }, rules, { source });
          if (chased) results.chased++;
          else results.skipped++;
        } catch (err) {
          results.errors++;
          console.error(`[ChaserEngine] Error evaluating task ${task.id}:`, err.message);
        }
      }
    } catch (err) {
      console.error('[ChaserEngine] Fatal error during scan:', err.message);
    }

    console.log(`[ChaserEngine] ✅ Scan complete:`, results);
    return results;
  }

  /**
   * Evaluate a single task against all rules
   */
  async evaluateTask(task, rules, opts = {}) {
    console.log('\n[EVAL] Task:', {
      id: task.id,
      status: task.status,
      priority: task.priority,
      due_date: task.due_date,
      times_chased: task.times_chased,
      last_chased_at: task.last_chased_at,
      snoozed_until: task.snoozed_until
    });

    const status = scalar(task.status);
    if (['done', 'cancelled'].includes(status)) return false;

    const now = dayjs();
    const dueDate = dayjs(task.due_date);
    const hoursUntilDue = dueDate.diff(now, 'hour');
    const daysOverdue = now.diff(dueDate, 'day');
    const isOverdue = dueDate.isBefore(now);

    // Check snooze
    if (task.snoozed_until && dayjs(task.snoozed_until).isAfter(now)) {
      console.log('[EVAL] ❌ Skipped: snoozed');
      console.log(`[ChaserEngine] Task ${task.id} is snoozed until ${task.snoozed_until}`);
      return false;
    }

    // Cooldown: avoid chasing again within 6h
    if (task.last_chased_at) {
      const hoursSinceLastChase = now.diff(dayjs(task.last_chased_at), 'hour');
      console.log('[EVAL] hoursSinceLastChase:', hoursSinceLastChase);
      if (hoursSinceLastChase < 6) {
        console.log('[EVAL] ❌ Skipped: cooldown < 6h');
        return false;
      }
    }


    let triggered = false;

    for (const rule of rules) {
      if (!this.ruleAppliesToTask(rule, task)) continue;

      let shouldTrigger = false;

      const maxChases = rule.max_chases ?? 3;
      const totalChased = task.times_chased || 0;

      if (totalChased >= maxChases) {
        console.log('[EVAL] ❌ Skipped: max chases reached', { taskId: task.id, totalChased, maxChases, rule: rule.name });
        continue;
      }

      console.log('[EVAL] Rule check:', {
        rule: rule.name,
        applies: this.ruleAppliesToTask(rule, task),
        isOverdue,
        hoursUntilDue,
        daysOverdue,
        thresholdHours: rule.chase_before_hours,
        thresholdDays: rule.escalate_after_days,
        timesChased: task.times_chased,
        maxChases: rule.max_chases
      });

      // Deadline proximity: within configured hours before due and under max chases
      if (!isOverdue) {
        const threshold = rule.chase_before_hours ?? 24;
        const withinWindow = hoursUntilDue >= 0 && hoursUntilDue <= threshold;
        const underMaxChases = (task.times_chased || 0) < maxChases;
        shouldTrigger = withinWindow && underMaxChases;
      }

      // Overdue escalation: past due and either over threshold days or max chases reached
      if (!shouldTrigger && isOverdue) {
        const thresholdDays = rule.escalate_after_days ?? 3;
        const meetsThreshold = daysOverdue >= thresholdDays;
        const exhaustedChases = (task.times_chased || 0) >= maxChases;
        shouldTrigger = meetsThreshold || exhaustedChases;
      }

      if (shouldTrigger) {
        await this.fireChaser(task, rule, 'auto', {
          hoursUntilDue,
          daysOverdue,
          isOverdue,
        }, 'system', opts);
        triggered = true;
        break; // Only fire one rule per scan cycle per task
      }
    }

    return triggered;
  }

  /**
   * Check if a rule applies to a given task based on priority filter
   */
  ruleAppliesToTask(rule, task) {
    const priority = scalar(task.priority);
    const rulePriority = scalar(rule.applies_to_priority);

    if (rulePriority === 'all') return true;
    if (rulePriority === 'high') {
      return ['high', 'critical'].includes(priority);
    }
    if (rulePriority === 'critical') {
      return priority === 'critical';
    }
    return rulePriority === priority;
  }

  /**
   * Fire a chaser — build message, send notification, log it
   */
  async fireChaser(task, rule, triggerType = 'auto', context = {}, triggeredBy = 'system', opts = {}) {
    const source = opts.source || 'system';
    const priorityVal = scalar(task.priority);
    const statusVal = scalar(task.status);
    const message = this.buildMessage(task, rule, context);
    const typeLabel = triggerType === 'manual' ? 'manual' : 
                      context.isOverdue ? 'overdue_escalation' : 'deadline_proximity';

    const isEscalation = context.isOverdue && rule.escalate_after_days !== undefined &&
      context.daysOverdue >= rule.escalate_after_days;

    console.log(`[ChaserEngine] 📬 Firing chaser for task "${task.title}" via ${rule.escalation_channel || 'email'}`);

    // Generate ack token if missing for action links
    let ackToken = task.ack_token;
    if (!ackToken) {
      ackToken = Math.random().toString(36).slice(2, 10);
      await db.update('tasks', task.id, { ack_token: ackToken });
    }

    let deliveryStatus = 'sent';
    let deliveryError = null;

    // 1. Trigger Boltic Workflow (skip if source is boltic to avoid loop)
    if (source === 'boltic') {
      console.log('[ChaserEngine] Skipping Boltic trigger to avoid loop');
    } else {
      try {
        const workflowResult = await bolticWorkflow.triggerManualChaser({
          taskId: task.id,
          taskTitle: task.title,
          assigneeEmail: task.assignee_email,
          assigneeName: task.assignee_name,
          dueDate: task.due_date,
          priority: priorityVal,
          status: statusVal,
          message,
          channel: rule.escalation_channel || 'email',
          chaserCount: (task.times_chased || 0) + 1,
          isEscalation,
          escalationEmail: null,
          triggerType: typeLabel,
          ackToken,
        });

        if (workflowResult?.success === false) {
          deliveryStatus = 'failed';
          deliveryError = workflowResult.error || 'workflow trigger failed';
        }
      } catch (err) {
        deliveryStatus = 'failed';
        deliveryError = err.message || 'workflow trigger failed';
      }
    }

    if (deliveryStatus === 'failed') {
      // Persist failed attempt for audit/debugging, but never mask the real delivery error.
      try {
        await db.insert('chaser_logs', {
          task_id: task.id,
          rule_id: rule.id,
          type: typeLabel,
          status: 'failed',
          channel: rule.escalation_channel || 'email',
          message_sent: message,
          sent_at: new Date().toISOString(),
          error: deliveryError,
          attempt: 1,
        });
      } catch (insertErr) {
        // Backward-compat fallback: some existing tables may not have the "error" field.
        try {
          await db.insert('chaser_logs', {
            task_id: task.id,
            rule_id: rule.id,
            type: typeLabel,
            status: 'failed',
            channel: rule.escalation_channel || 'email',
            message_sent: message,
            sent_at: new Date().toISOString(),
            attempt: 1,
          });
        } catch (fallbackErr) {
          console.error('[ChaserEngine] Failed to insert failed-delivery log:', fallbackErr.message || insertErr.message);
        }
      }

      throw new Error(`Chase delivery failed: ${deliveryError}`);
    }

    // 2. Log to Boltic DB
    await db.insert('chaser_logs', {
      task_id: task.id,
      rule_id: rule.id,
      type: typeLabel,
      status: 'sent',
      channel: rule.escalation_channel || 'email',
      message_sent: message,
      sent_at: new Date().toISOString(),
      attempt: 1,
    });

    // 3. Update task chaser stats only when delivery succeeds
    await db.update('tasks', task.id, {
      times_chased: (task.times_chased || 0) + 1,
      times_escalated: isEscalation ? (task.times_escalated || 0) + 1 : (task.times_escalated || 0),
      last_chased_at: new Date().toISOString(),
    });

    return { success: true, message };
  }

  /**
   * Manual chase — triggered by clicking "Chase" button in UI
   */
  async manualChase(taskId, triggeredBy) {
    const task = await db.findById('tasks', taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);
    const status = scalar(task.status);
    if (['done', 'cancelled'].includes(status)) throw new Error('Cannot chase a completed task');

    const chaserCount = task.times_chased || 0;
    
    // Pick tone based on how many times already chased
    const tone = chaserCount === 0 ? 'friendly' : 
                 chaserCount < 3 ? 'firm' : 'urgent';

    const MANUAL_TEMPLATES = {
      friendly: `Hi ${task.assignee_name}! 👋 Just checking in on "${task.title}". Could you share a quick status update? Due ${dayjs(task.due_date).format('MMM D')}.`,
      firm: `Hi ${task.assignee_name}, this is a follow-up on "${task.title}" which is due ${dayjs(task.due_date).format('MMM D')}. This task has been pending — please update the status today.`,
      urgent: `⚠️ ${task.assignee_name}, "${task.title}" is critically overdue. Immediate action required. Please update status or escalate if blocked.`,
    };

    const fakeRule = {
      id: 'manual',
      escalation_channel: 'email',
      applies_to_priority: 'all',
      chase_before_hours: 24,
      max_chases: 5,
    };

    return await this.fireChaser(
      { ...task, status }, 
      fakeRule, 
      'manual', 
      { chaserCount, tone, isOverdue: dayjs(task.due_date).isBefore(dayjs()) },
      triggeredBy,
      { source: 'system' }
    );
  }

  /**
   * Acknowledge a task — stops chasing, marks as acknowledged
   */
  async acknowledgeTask(taskId, userEmail) {
    const task = await db.findById('tasks', taskId);
    if (!task) throw new Error('Task not found');

    // Find the most recent unacknowledged log
    const logs = await db.find('chaser_logs', {
      filters: [
        { field: 'task_id', operator: 'eq', value: taskId },
        { field: 'status',  operator: 'eq', value: 'sent' },
      ],
      sort: '-sent_at',
      limit: 1,
    });

    if (logs.length > 0) {
      await db.update('chaser_logs', logs[0].id, {
        status: 'acknowledged',
        acknowledged_at: new Date().toISOString(),
        type: 'auto_ack',
      });
    }

    // Trigger acknowledgment workflow in Boltic
    await bolticWorkflow.triggerAcknowledgment({
      taskId,
      taskTitle: task.title,
      assigneeEmail: task.assignee_email,
      assigneeName: task.assignee_name,
      acknowledgedBy: userEmail,
    });

    return { success: true };
  }

  /**
   * Snooze chasing for a task
   */
  async snoozeTask(taskId, hours = 4) {
    const snoozeUntil = dayjs().add(hours, 'hour').toISOString();
    await db.update('tasks', taskId, { snoozed_until: snoozeUntil });
    return { snoozed_until: snoozeUntil };
  }

  /**
   * Build personalized message from template
   */
  buildMessage(task, rule, context) {
    const dueDate = dayjs(task.due_date);
    const priority = scalar(task.priority) || '';
    const status = scalar(task.status) || '';
    const template = rule.message_template || 
      `Hi {{assignee_name}}, a reminder about your task "{{task_title}}" due on {{due_date}}.`;

    return template
      .replace(/{{assignee_name}}/g, task.assignee_name || 'Team')
      .replace(/{{task_title}}/g, task.title)
      .replace(/{{due_date}}/g, dueDate.format('MMM D, YYYY'))
      .replace(/{{priority}}/g, priority)
      .replace(/{{status}}/g, status)
      .replace(/{{project_id}}/g, task.project_id || '')
      .replace(/{{reporter_name}}/g, 'your manager')
      .replace(/{{escalation_name}}/g, 'the manager')
      .replace(/{{chaser_count}}/g, String(task.times_chased || 1))
      .replace(/{{days_overdue}}/g, String(context.daysOverdue || 0))
      .replace(/{{hours_until_due}}/g, String(context.hoursUntilDue || 0));
  }

  /**
   * Get chaser analytics/stats
   */
  async getStats() {
    const now = dayjs();

    const [totalTasks, doneTasks, overdueTasks, chaserLogs] = await Promise.all([
      db.count('tasks', [{ field: 'chaser_enabled', operator: 'eq', value: true }]),
      db.count('tasks', [{ field: 'status', operator: 'eq', value: 'done' }]),
      db.count('tasks', [
        { field: 'status', operator: 'neq', value: 'done' },
        { field: 'status', operator: 'neq', value: 'cancelled' },
        { field: 'due_date', operator: 'lt', value: now.toISOString() },
      ]),
      db.find('chaser_logs', { limit: 500 }),
    ]);

    const todayLogs = chaserLogs.filter(l => 
      dayjs(l.sent_at).isAfter(now.startOf('day'))
    );

    const acknowledgedLogs = chaserLogs.filter(l => l.status === 'acknowledged');

    return {
      totalTasks,
      doneTasks,
      overdueTasks,
      dueTodayCount: await db.count('tasks', [
        { field: 'status', operator: 'neq', value: 'done' },
        { field: 'status', operator: 'neq', value: 'cancelled' },
        { field: 'due_date', operator: 'gte', value: now.startOf('day').toISOString() },
        { field: 'due_date', operator: 'lte', value: now.endOf('day').toISOString() },
      ]),
      chasersSentToday: todayLogs.length,
      totalChasersSent: chaserLogs.length,
      acknowledgmentRate: chaserLogs.length > 0 
        ? Math.round((acknowledgedLogs.length / chaserLogs.length) * 100) 
        : 0,
      completionRate: totalTasks > 0 
        ? Math.round((doneTasks / totalTasks) * 100) 
        : 0,
    };
  }
}

module.exports = new ChaserEngine();
