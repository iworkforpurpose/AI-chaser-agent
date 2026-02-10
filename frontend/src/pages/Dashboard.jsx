import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { taskApi, logApi, chaserApi } from '../api';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
dayjs.extend(relativeTime);

const TRIGGER_LABELS = {
  auto_deadline: '⏰ Deadline Alert',
  auto_overdue:  '🔴 Overdue Chase',
  manual:        '👆 Manual Chase',
  acknowledgment:'✅ Acknowledged',
  escalation:    '🚨 Escalated',
};

const CHANNEL_ICONS = { email: '📧', slack: '💬', in_app: '🔔', all: '📡' };

function StatCard({ value, label, accent, delta, deltaColor }) {
  return (
    <div className="stat-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {accent && (
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: accent, display: 'inline-block' }} />
          )}
          <span className="stat-label">{label}</span>
        </div>
        {delta !== undefined && (
          <span className="stat-delta" style={{ color: deltaColor || 'var(--text-muted)' }}>
            {delta}
          </span>
        )}
      </div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

export default function Dashboard() {
  const qc = useQueryClient();

  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['stats'],
    queryFn: () => taskApi.stats(),
    refetchInterval: 60000,
  });

  const { data: logsData, isLoading: logsLoading } = useQuery({
    queryKey: ['chaser-logs'],
    queryFn: () => logApi.list({ limit: 20 }),
    refetchInterval: 30000,
  });

  const { data: overdueData } = useQuery({
    queryKey: ['overdue-tasks'],
    queryFn: () => taskApi.overdue(),
  });

  const runChaser = useMutation({
    mutationFn: () => chaserApi.runNow(),
    onSuccess: (data) => {
      toast.success(`Scan complete — ${data.data?.chased || 0} tasks chased`);
      qc.invalidateQueries();
    },
    onError: (err) => toast.error(`Scan failed: ${err}`),
  });

  const stats = statsData?.data || {};
  const logs  = logsData?.data  || [];
  const overdueTasks = overdueData?.data || [];

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Mission Control</div>
          <div className="page-subtitle">
            {dayjs().format('dddd, MMMM D YYYY')} · Auto-chaser{' '}
            <span style={{ color: 'var(--accent-green)' }}>● active</span>
          </div>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => runChaser.mutate()}
          disabled={runChaser.isPending}
        >
          {runChaser.isPending ? '⟳ Scanning...' : '⚡ Run Chaser Now'}
        </button>
      </div>

      <div className="page-body">
        {/* KPI Stats */}
        {statsLoading ? (
          <div className="loading">Loading stats...</div>
        ) : (
          <div className="stats-grid">
            <StatCard
              value={stats.overdueTasks || 0}
              label="Overdue Tasks"
              accent="var(--accent-red)"
              delta={stats.overdueTasks > 0 ? '⚠ Needs attention' : '✓ All on track'}
              deltaColor={stats.overdueTasks > 0 ? 'var(--accent-red)' : 'var(--accent-green)'}
            />
            <StatCard
              value={stats.dueTodayCount || 0}
              label="Due Today"
              accent="var(--accent-orange)"
              delta="Review and act"
            />
            <StatCard
              value={`${stats.completionRate || 0}%`}
              label="Completion Rate"
              accent="var(--accent-green)"
              delta={`${stats.doneTasks || 0} tasks done`}
              deltaColor="var(--accent-green)"
            />
            <StatCard
              value={stats.chasersSentToday || 0}
              label="Chasers Today"
              accent="var(--accent-blue)"
              delta={`${stats.totalChasersSent || 0} total sent`}
            />
            <StatCard
              value={`${stats.acknowledgmentRate || 0}%`}
              label="Ack Rate"
              accent="var(--accent-cyan)"
              delta="Responses received"
            />
            <StatCard
              value={stats.totalTasks || 0}
              label="Active Tasks"
              accent="var(--accent-purple)"
              delta="With chaser enabled"
            />
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          {/* Overdue Tasks Quick View */}
          <div className="card">
            <div className="section-title">🔴 Overdue Tasks</div>
            {overdueTasks.length === 0 ? (
              <div style={{ color: 'var(--accent-green)', fontSize: '13px', padding: '20px 0' }}>
                ✓ No overdue tasks right now!
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {overdueTasks.slice(0, 6).map(task => (
                  <OverdueItem key={task.id} task={task} qc={qc} />
                ))}
                {overdueTasks.length > 6 && (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', paddingTop: '8px' }}>
                    +{overdueTasks.length - 6} more overdue tasks
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Activity Feed */}
          <div className="card">
            <div className="section-title">⚡ Activity Feed</div>
            {logsLoading ? (
              <div className="loading">Loading...</div>
            ) : logs.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '13px', padding: '20px 0' }}>
                No activity yet. Run the chaser to get started.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                {logs.map((log, i) => (
                  <LogItem key={log.id} log={log} isLast={i === logs.length - 1} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function OverdueItem({ task, qc }) {
  const chase = useMutation({
    mutationFn: () => taskApi.chase(task.id, 'dashboard_user'),
    onSuccess: () => { toast.success(`Chase sent to ${task.assignee_name}`); qc.invalidateQueries(); },
    onError: (e) => toast.error(e),
  });

  const daysOverdue = dayjs().diff(dayjs(task.due_date), 'day');
  const priorityColors = { critical: 'var(--accent-red)', high: 'var(--accent-orange)', medium: 'var(--accent-yellow)', low: 'var(--text-muted)' };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '10px',
      padding: '10px 12px', borderRadius: '8px',
      background: 'rgba(255,61,90,0.06)', border: '1px solid rgba(255,61,90,0.15)',
    }}>
      <div style={{ width: 3, height: 36, borderRadius: 99, background: priorityColors[task.priority] || 'var(--border)', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {task.title}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'IBM Plex Mono, monospace' }}>
          {task.assignee_name} · {daysOverdue}d overdue
        </div>
      </div>
      <button className="btn btn-chase btn-sm" onClick={() => chase.mutate()} disabled={chase.isPending}>
        {chase.isPending ? '...' : '⚡ Chase'}
      </button>
    </div>
  );
}

function LogItem({ log, isLast }) {
  const statusColors = { sent: 'var(--accent-blue)', delivered: 'var(--accent-cyan)', acknowledged: 'var(--accent-green)', failed: 'var(--accent-red)' };

  return (
    <div style={{
      display: 'flex', gap: '12px', paddingBottom: isLast ? 0 : '12px',
      marginBottom: isLast ? 0 : '12px',
      borderBottom: isLast ? 'none' : '1px solid var(--border)',
    }}>
      <div style={{ flexShrink: 0, marginTop: 2, fontSize: '16px' }}>
        {CHANNEL_ICONS[log.channel] || '📡'}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
          {TRIGGER_LABELS[log.trigger_type] || log.trigger_type}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {log.task_title}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'IBM Plex Mono, monospace', marginTop: 2 }}>
          {dayjs(log.sent_at).fromNow()} · {log.recipient_email}
        </div>
      </div>
      <div style={{ flexShrink: 0, fontSize: '11px', fontWeight: 600, color: statusColors[log.status] || 'var(--text-muted)', fontFamily: 'IBM Plex Mono, monospace', paddingTop: 2 }}>
        {log.status}
      </div>
    </div>
  );
}
