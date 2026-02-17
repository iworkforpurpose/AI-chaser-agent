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

    let deliveryStatus = 'pending';
    let deliveryError = null;

    // 1. Trigger Boltic Workflow (skip if source is boltic to avoid loop)
    if (source === 'boltic') {
      console.log('[ChaserEngine] Skipping Boltic trigger to avoid loop');
      deliveryStatus = 'failed';
      deliveryError = 'Workflow trigger skipped to avoid loop (source=boltic)';
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

        if (workflowResult?.success === true) {
          deliveryStatus = 'sent';
        } else {
          deliveryStatus = 'failed';
          deliveryError =
            workflowResult?.error ||
            (workflowResult?.skipped
              ? `Workflow trigger skipped${workflowResult.reason ? `: ${workflowResult.reason}` : ''}`
              : 'workflow trigger failed');
        }
      } catch (err) {
        deliveryStatus = 'failed';
        deliveryError = err.message || 'workflow trigger failed';
      }
    }

    if (deliveryStatus !== 'sent') {
      if (!deliveryError) {
        deliveryError = 'workflow trigger failed';
      }

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
    const dueDateHuman = this.formatDueDate(task.due_date);
    const priority = scalar(task.priority) || '';
    const status = scalar(task.status) || '';
    const template = rule.message_template || 
      `Hi {{assignee_name}}, a reminder about your task "{{task_title}}" due on {{due_date}}.`;

    return template
      .replace(/{{assignee_name}}/g, task.assignee_name || 'Team')
      .replace(/{{task_title}}/g, task.title)
      .replace(/{{due_date}}/g, dueDateHuman)
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
  async getStats(emailFilter = null) {
    const now = dayjs();
    let tasks = [];

    if (emailFilter) {
      // Fetch tasks assigned TO the user
      const assigned = await db.find('tasks', {
        filters: [{ field: 'assignee_email', operator: 'eq', value: emailFilter }],
        limit: 2000
      });
      // Fetch tasks created BY the user
      const created = await db.find('tasks', {
        filters: [{ field: 'created_by', operator: 'eq', value: emailFilter }],
        limit: 2000
      });
      
      const taskMap = new Map();
      assigned.forEach(t => taskMap.set(t.id, t));
      created.forEach(t => taskMap.set(t.id, t));
      tasks = Array.from(taskMap.values());
    } else {
      tasks = await db.find('tasks', { limit: 2000 });
    }

    const totalChaserLogs = emailFilter ? 0 : await db.count('chaser_logs');

    const isClosedStatus = (status) => ['done', 'cancelled'].includes(status);
    const normalizedTasks = tasks.map((task) => ({
      ...task,
      status: scalar(task.status),
      due_date: scalar(task.due_date),
      chaser_enabled: scalar(task.chaser_enabled) === true,
      assignee_email: scalar(task.assignee_email),
    }));

    const chaserEnabledTasks = normalizedTasks.filter((task) => task.chaser_enabled);
    const totalTasks = chaserEnabledTasks.length;
    const doneTasks = chaserEnabledTasks.filter((task) => task.status === 'done').length;
    const overdueTasks = chaserEnabledTasks.filter((task) =>
      !isClosedStatus(task.status) &&
      task.due_date &&
      dayjs(task.due_date).isBefore(now)
    ).length;
    const dueTodayCount = chaserEnabledTasks.filter((task) =>
      !isClosedStatus(task.status) &&
      task.due_date &&
      dayjs(task.due_date).isSame(now, 'day')
    ).length;

    // Count log-based metrics in code because dropdown fields can be returned as arrays.
    // DB-side filtering for status can overcount in that case.
    let totalAcknowledgedLogs = 0;
    let chasersSentToday = 0;

    // Only scan logs if not filtered by email, or we'd need to cross-reference tasks
    if (!emailFilter) {
      const pageSize = 200;
      let offset = 0;

      while (true) {
        const logsBatch = await db.find('chaser_logs', {
          sort: '-sent_at',
          limit: pageSize,
          offset,
        });
        if (!logsBatch.length) break;

        for (const log of logsBatch) {
          if (scalar(log.status) === 'acknowledged') {
            totalAcknowledgedLogs += 1;
          }
          const sentAt = scalar(log.sent_at);
          if (sentAt && dayjs(sentAt).isAfter(now.startOf('day'))) {
            chasersSentToday += 1;
          }
        }

        if (logsBatch.length < pageSize) break;
        offset += pageSize;
      }
    }

    const acknowledgmentRate = !emailFilter && totalChaserLogs > 0
      ? Math.round((totalAcknowledgedLogs / totalChaserLogs) * 1000) / 10
      : 0;

    return {
      totalTasks,
      doneTasks,
      overdueTasks,
      dueTodayCount,
      chasersSentToday: emailFilter ? 0 : chasersSentToday, // simplified for isolation
      totalChasersSent: emailFilter ? 0 : totalChaserLogs,
      acknowledgmentRate,
      completionRate: totalTasks > 0 
        ? Math.round((doneTasks / totalTasks) * 100) 
        : 0,
    };
  }

  /**
   * Get data for the weekly digest
   */
  async getWeeklyDigestData(userEmail = null) {
    let tasks = [];
    if (userEmail) {
      const assigned = await db.find('tasks', {
        filters: [{ field: 'assignee_email', operator: 'eq', value: userEmail }],
        limit: 500
      });
      const created = await db.find('tasks', {
        filters: [{ field: 'created_by', operator: 'eq', value: userEmail }],
        limit: 500
      });
      const taskMap = new Map();
      assigned.forEach(t => taskMap.set(t.id, t));
      created.forEach(t => taskMap.set(t.id, t));
      tasks = Array.from(taskMap.values());
    } else {
      tasks = await db.find('tasks', { limit: 500 });
    }

    const isClosedStatus = (status) => ['done', 'cancelled'].includes(String(status || '').toLowerCase());

    const pendingTasks = tasks
      .map(t => ({
        ...t,
        status: scalar(t.status),
        assignee_email: scalar(t.assignee_email),
        assignee_name: scalar(t.assignee_name),
        due_date: scalar(t.due_date),
      }))
      .filter((task) => !isClosedStatus(task.status));

    // Group by assignee
    const byAssignee = {};
    for (const task of pendingTasks) {
      const key = task.assignee_email;
      if (!key) continue;
      if (!byAssignee[key]) {
        byAssignee[key] = { email: key, name: task.assignee_name, tasks: [] };
      }
      byAssignee[key].tasks.push(task);
    }

    return Object.values(byAssignee);
  }
}

module.exports = new ChaserEngine();
