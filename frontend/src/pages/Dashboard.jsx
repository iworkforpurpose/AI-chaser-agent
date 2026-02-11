import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { taskApi, chaserApi, userApi } from '../api';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
dayjs.extend(relativeTime);

const scalar = (value) => (Array.isArray(value) ? value[0] : value);
const PRESET_WINDOWS = {
  today: 'Today',
  seven_days: 'Last 7 Days',
  thirty_days: 'Last 30 Days',
};

const getPresetRange = (preset) => {
  const now = dayjs();
  if (preset === 'today') {
    return { from: now.startOf('day'), to: now.endOf('day') };
  }
  if (preset === 'seven_days') {
    return { from: now.subtract(6, 'day').startOf('day'), to: now.endOf('day') };
  }
  return { from: now.subtract(29, 'day').startOf('day'), to: now.endOf('day') };
};

function getNextScanLabel(cronSchedule) {
  if (!cronSchedule) return 'Unknown';

  const now = dayjs();
  if (cronSchedule.trim() === '0 * * * *') {
    return now.add(1, 'hour').startOf('hour').fromNow();
  }

  const everyMinutesMatch = cronSchedule.trim().match(/^\*\/(\d+)\s+\*\s+\*\s+\*\s+\*$/);
  if (everyMinutesMatch) {
    const interval = Number(everyMinutesMatch[1]);
    if (!Number.isFinite(interval) || interval <= 0) return 'Unknown';
    const minute = now.minute();
    const delta = interval - (minute % interval) || interval;
    return now.add(delta, 'minute').startOf('minute').fromNow();
  }

  return 'Unknown';
}

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
  const [presetWindow, setPresetWindow] = useState('thirty_days');
  const [memberFilter, setMemberFilter] = useState('');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['stats'],
    queryFn: () => taskApi.stats(),
    refetchInterval: 60000,
  });

  const { data: overdueData } = useQuery({
    queryKey: ['overdue-tasks'],
    queryFn: () => taskApi.overdue(),
  });

  const { data: dueSoonData } = useQuery({
    queryKey: ['due-soon-dashboard'],
    queryFn: () => taskApi.dueSoon(24),
    refetchInterval: 60000,
  });

  const { data: healthData, isLoading: healthLoading } = useQuery({
    queryKey: ['health'],
    queryFn: () => chaserApi.health(),
    refetchInterval: 60000,
  });

  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: () => userApi.list(),
  });

  const completedParams = useMemo(() => {
    const params = { limit: 50 };
    if (memberFilter) params.assignee_email = memberFilter;

    if (customFrom) params.date_from = customFrom;
    if (customTo) params.date_to = customTo;

    if (!customFrom && !customTo) {
      const range = getPresetRange(presetWindow);
      params.date_from = range.from.format('YYYY-MM-DD');
      params.date_to = range.to.format('YYYY-MM-DD');
    }

    return params;
  }, [memberFilter, customFrom, customTo, presetWindow]);

  const { data: completedData, isLoading: completedLoading } = useQuery({
    queryKey: ['completed-tasks', completedParams],
    queryFn: () => taskApi.completed(completedParams),
    refetchInterval: 60000,
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
  const overdueTasks = overdueData?.data || [];
  const dueSoonTasks = dueSoonData?.data || [];
  const completedTasks = completedData?.data || [];
  const upcomingChases = dueSoonData?.count ?? dueSoonTasks.length;
  const users = (usersData?.data || []).map((user) => ({
    id: String(scalar(user.id) || ''),
    email: String(scalar(user.email) || '').trim().toLowerCase(),
    name: scalar(user.name) || '',
  })).filter((user) => user.email);
  const memberOptions = Array.from(new Map(users.map((user) => [user.email, user])).values());
  const earliestDueTask = dueSoonTasks.reduce((earliest, task) => {
    if (!task?.due_date) return earliest;
    if (!earliest) return task;
    return dayjs(task.due_date).isBefore(dayjs(earliest.due_date)) ? task : earliest;
  }, null);
  const nextActionEta = earliestDueTask?.due_date ? dayjs(earliestDueTask.due_date).fromNow() : 'Unknown';
  const engineStatus = healthLoading ? 'Checking' : (healthData?.db?.ok ? 'Active' : 'Degraded');
  const nextScan = getNextScanLabel(healthData?.chaser?.cron_schedule);
  const engineStatusPill = engineStatus.toLowerCase();
  const activePresetRange = getPresetRange(presetWindow);

  const resetDoneFilters = () => {
    setPresetWindow('thirty_days');
    setMemberFilter('');
    setCustomFrom('');
    setCustomTo('');
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-hero">
          <div>
            <div className="eyebrow">Automatic operations · Mission control</div>
            <div className="page-title">Chaser Command</div>
            <div className="page-subtitle">
              {dayjs().format('dddd, MMMM D YYYY')} · Automatic Chaser Agent monitoring handoffs and nudges in real time
            </div>
            <div className="hero-meta">
              <span className="pill pill-live"><span className="live-dot" />Automatic status · {engineStatusPill}</span>
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
              <div className="ops-pill">Auto watch</div>
            </div>
            <div className="ops-value">{stats.totalTasks || 0}</div>
            <div className="ops-sub">Currently under automatic watch</div>
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
            <div className="ops-sub">
              {nextActionEta === 'Unknown' ? 'No due-soon tasks in the current window' : `Earliest due ${nextActionEta}`}
            </div>
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
              <div className={`overdue-list ${overdueTasks.length > 5 ? 'scroll-list' : ''}`}>
                {overdueTasks.map(task => (
                  <OverdueItem key={task.id} task={task} qc={qc} />
                ))}
              </div>
            )}
          </div>

          <div className="card panel-inset">
            <div className="section-title">Completed Tasks</div>
            <div className="done-filter-row">
              <div className="done-chip-group">
                {Object.entries(PRESET_WINDOWS).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    className={`done-chip ${presetWindow === key && !customFrom && !customTo ? 'active' : ''}`}
                    onClick={() => {
                      setPresetWindow(key);
                      setCustomFrom('');
                      setCustomTo('');
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="done-range-group" role="group" aria-label="Completion date range">
                <div className="done-range-label">Completed between</div>
                <div className="done-range-inputs">
                  <label className="done-range-field">
                    <span>From</span>
                    <input
                      type="date"
                      value={customFrom}
                      onChange={(e) => setCustomFrom(e.target.value)}
                      className="done-date-input"
                      aria-label="Completed from date"
                    />
                  </label>
                  <span className="done-range-arrow" aria-hidden>→</span>
                  <label className="done-range-field">
                    <span>To</span>
                    <input
                      type="date"
                      value={customTo}
                      onChange={(e) => setCustomTo(e.target.value)}
                      className="done-date-input"
                      aria-label="Completed to date"
                    />
                  </label>
                </div>
              </div>
              <select
                value={memberFilter}
                onChange={(e) => setMemberFilter(e.target.value)}
                className="done-member-select"
                aria-label="Filter by member"
              >
                <option value="">All Members</option>
                {memberOptions.map((member) => (
                  <option key={member.email} value={member.email}>
                    {member.name || member.email}
                  </option>
                ))}
              </select>
              <button type="button" className="btn btn-ghost btn-sm done-clear-btn" onClick={resetDoneFilters}>
                Clear
              </button>
            </div>
            <div className="done-filter-meta">
              {customFrom || customTo
                ? 'Custom date range'
                : `${PRESET_WINDOWS[presetWindow]} · ${activePresetRange.from.format('MMM D')} to ${activePresetRange.to.format('MMM D')}`}
              <span>{completedTasks.length} done</span>
            </div>
            {completedLoading ? (
              <div className="loading">Loading completed tasks...</div>
            ) : completedTasks.length === 0 ? (
              <div className="empty-state">
                No completed tasks found for this filter.
              </div>
            ) : (
              <div className={`done-list ${completedTasks.length > 5 ? 'scroll-list' : ''}`}>
                {completedTasks.map((task) => (
                  <DoneTaskItem key={task.id} task={task} />
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="made-in-footer">made with ❤️ in Mumbai</div>
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

function DoneTaskItem({ task }) {
  const completedAt = scalar(task.completed_at);
  const assigneeName = scalar(task.assignee_name) || 'Unknown Assignee';
  const assigneeEmail = scalar(task.assignee_email) || 'unknown@unknown.com';
  const priority = String(scalar(task.priority) || 'medium').toLowerCase();
  const completedLabel = completedAt && dayjs(completedAt).isValid()
    ? `${dayjs(completedAt).format('MMM D, YYYY h:mm A')} · ${dayjs(completedAt).fromNow()}`
    : 'Completion time unavailable';

  return (
    <div className="done-item">
      <div className="done-item-top">
        <div className="done-item-title">{task.title}</div>
        <span className={`done-priority done-priority-${priority}`}>{priority}</span>
      </div>
      <div className="done-item-meta">
        <span>{assigneeName}</span>
        <span>{assigneeEmail}</span>
      </div>
      <div className="done-item-completed">
        <span>Completed</span>
        <span>{completedLabel}</span>
      </div>
    </div>
  );
}
