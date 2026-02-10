import React from 'react';
import { useNavigate } from 'react-router-dom';
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
  const navigate = useNavigate();

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
  const upcomingChases = stats.upcomingChases || Math.max(1, (overdueTasks?.length || 0));
  const nextActionEta = stats.nextActionEta || '3h';
  const engineStatus = stats.engineStatus || 'Active';
  const nextScan = stats.nextScan || 'in 15m';

  return (
    <div>
      <div className="page-header">
        <div className="page-hero">
          <div>
            <div className="eyebrow">AI operations · Mission control</div>
            <div className="page-title">Chaser Command</div>
            <div className="page-subtitle">
              {dayjs().format('dddd, MMMM D YYYY')} · AI agent monitoring handoffs and nudges in real time
            </div>
            <div className="hero-meta">
              <span className="pill pill-live"><span className="live-dot" />AI status · active</span>
              <span className="pill pill-muted">{stats.totalTasks || 0} tasks under watch</span>
            </div>
          </div>
          <div className="hero-actions">
            <div className="hero-action-group">
              <button className="action-chip" type="button">
                <span className="ai-dot pulse" />
                <span className="action-chip-text">
                  <span className="action-chip-title">Chaser engine</span>
                  <span className="action-chip-sub">Autonomously triaging and escalating</span>
                </span>
              </button>
              <div className="hero-buttons">
                <button
                  className="btn btn-primary action-btn"
                  onClick={() => runChaser.mutate()}
                  disabled={runChaser.isPending}
                >
                  {runChaser.isPending ? 'Scanning...' : 'Run chaser now'}
                </button>
                <button className="btn btn-ghost action-btn" onClick={() => navigate('/tasks')}>
                  View task board
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="page-body">
        {statsLoading ? (
          <div className="loading">Loading stats...</div>
        ) : (
          <div className="stats-grid">
            <StatCard
              value={stats.overdueTasks || 0}
              label="Overdue Tasks"
              accent="var(--accent-red)"
              delta={stats.overdueTasks > 0 ? 'Needs attention' : 'All on track'}
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
          </div>
        )}

        <div className="ops-grid">
          <div className="ops-card ops-active">
            <div className="ops-row">
              <div className="ops-label">Active Tasks</div>
              <div className="ops-pill">AI watch</div>
            </div>
            <div className="ops-value">{stats.totalTasks || 0}</div>
            <div className="ops-sub">Currently under AI watch</div>
          </div>

          <div className="ops-card ops-engine">
            <div className="ops-row">
              <div className="ops-label">Chaser Engine</div>
              <div className={`status-dot ${engineStatus === 'Active' ? 'on' : 'paused'}`} />
            </div>
            <div className="ops-value sm">{engineStatus}</div>
            <div className="ops-sub">Next scan {nextScan}</div>
          </div>

          <div className="ops-card ops-next">
            <div className="ops-label">Next Action</div>
            <div className="ops-value sm">{upcomingChases} tasks</div>
            <div className="ops-sub">will be chased in {nextActionEta}</div>
          </div>
        </div>

        <div className="panel-grid">
          <div className="card panel-inset">
            <div className="section-title">Overdue Tasks</div>
            {overdueTasks.length === 0 ? (
              <div className="empty-state" style={{ color: 'var(--accent-green)' }}>
                No overdue tasks right now.
              </div>
            ) : (
              <div className="overdue-list">
                {overdueTasks.slice(0, 6).map(task => (
                  <OverdueItem key={task.id} task={task} qc={qc} />
                ))}
                {overdueTasks.length > 6 && (
                  <div className="empty-state" style={{ textAlign: 'center' }}>
                    +{overdueTasks.length - 6} more overdue tasks
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="card panel-inset">
            <div className="section-title">Activity Feed</div>
            {logsLoading ? (
              <div className="loading">Loading...</div>
            ) : logs.length === 0 ? (
              <div className="empty-state">
                No activity yet. Run the chaser to get started.
              </div>
            ) : (
              <div className="log-list">
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
  const priorityColors = { critical: '#f97316', high: '#fbbf24', medium: '#fcd34d', low: 'var(--text-muted)' };

  return (
    <div className="overdue-item">
      <div className="overdue-bar" style={{ background: priorityColors[task.priority] || 'var(--accent-orange)' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="overdue-title">{task.title}</div>
        <div className="overdue-meta">{task.assignee_name} · {daysOverdue} days past due</div>
      </div>
      <button
        className="btn btn-ghost btn-sm"
        style={{ color: 'var(--accent-blue)', borderColor: 'var(--outline)' }}
        onClick={() => chase.mutate()}
        disabled={chase.isPending}
      >
        {chase.isPending ? 'Sending…' : 'Send chase'}
      </button>
    </div>
  );
}

function LogItem({ log, isLast }) {
  const statusColors = {
    sent: '#2563eb',
    delivered: '#0ea5e9',
    acknowledged: '#15803d',
    failed: '#b91c1c',
  };

  const statusTone = statusColors[log.status] || '#94a3b8';

  return (
    <div className="log-row">
      <div className="log-track" style={{ bottom: isLast ? '16px' : '0' }} />
      <div
        className="log-dot"
        style={{ background: statusTone, boxShadow: `0 0 0 6px ${statusTone}22` }}
      />
      <div className="log-body" style={{ paddingBottom: isLast ? 0 : 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
          <div className="log-title">{TRIGGER_LABELS[log.trigger_type] || log.trigger_type}</div>
          <div className="log-meta">{dayjs(log.sent_at).fromNow()}</div>
        </div>
        <div className="log-sub">{log.task_title}</div>
        <div className="log-meta" style={{ color: statusTone }}>
          {log.status} · {log.recipient_email}
        </div>
      </div>
    </div>
  );
}
