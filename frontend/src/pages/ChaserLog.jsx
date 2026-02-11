import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { logApi } from '../api';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import isToday from 'dayjs/plugin/isToday';
import isYesterday from 'dayjs/plugin/isYesterday';
dayjs.extend(relativeTime);
dayjs.extend(isToday);
dayjs.extend(isYesterday);

const TRIGGER_CONFIG = {
  deadline_proximity: { label: 'Deadline Alert', color: 'var(--accent-blue)', icon: '⏰' },
  overdue_escalation: { label: 'Overdue Chase',  color: 'var(--accent-red)', icon: '🔴' },
  manual:             { label: 'Manual Chase',   color: 'var(--accent-orange)', icon: '👆' },
  auto_ack:           { label: 'Acknowledged',   color: 'var(--accent-green)', icon: '✅' },
};

const STATUS_CONFIG = {
  sent:         { label: 'Sent',         color: 'var(--accent-blue)' },
  delivered:    { label: 'Delivered',    color: 'var(--accent-cyan)' },
  acknowledged: { label: 'Acknowledged', color: 'var(--accent-green)' },
  failed:       { label: 'Failed',       color: 'var(--accent-red)' },
};

const CHANNEL_ICONS = { email: '📧', slack: '💬', webhook: '🪝' };
const scalar = (value) => (Array.isArray(value) ? value[0] : value);

const normalizeLog = (log = {}) => ({
  ...log,
  task_id: scalar(log.task_id),
  rule_id: scalar(log.rule_id),
  type: scalar(log.type),
  status: scalar(log.status),
  channel: scalar(log.channel),
  task_title: scalar(log.task_title),
  assignee_name: scalar(log.assignee_name),
  recipient_email: scalar(log.recipient_email),
  sent_at: scalar(log.sent_at),
  acknowledged_at: scalar(log.acknowledged_at),
  triggered_by: scalar(log.triggered_by),
});

export default function ChaserLog() {
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['chaser-logs', filterType, filterStatus],
    queryFn: () => logApi.list({
      limit: 100,
      ...(filterType ? { type: filterType } : {}),
      ...(filterStatus ? { status: filterStatus } : {}),
    }),
    refetchInterval: 30000,
  });

  let logs = (data?.data || []).map(normalizeLog);
  if (filterType) logs = logs.filter(l => l.type === filterType);
  if (filterStatus) logs = logs.filter(l => l.status === filterStatus);

  // Group logs by date
  const grouped = {};
  logs.forEach(log => {
    const date = dayjs(log.sent_at).format('YYYY-MM-DD');
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(log);
  });

  // Stats from logs
  const total = logs.length;
  const acknowledged = logs.filter(l => l.status === 'acknowledged').length;
  const failed = logs.filter(l => l.status === 'failed').length;
  const manual = logs.filter(l => l.type === 'manual').length;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Activity Log</div>
          <div className="page-subtitle">Complete timeline of all chaser events</div>
        </div>
      </div>

      <div className="page-body">
        {/* Mini Stats */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
          {[
            { label: 'Total Events',   value: total,         color: 'var(--accent-blue)' },
            { label: 'Acknowledged',   value: acknowledged,  color: 'var(--accent-green)' },
            { label: 'Manual Triggers', value: manual,       color: 'var(--accent-orange)' },
            { label: 'Failed',         value: failed,        color: 'var(--accent-red)' },
          ].map(s => (
            <div key={s.label} style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', padding: '12px 20px',
              display: 'flex', alignItems: 'center', gap: '12px'
            }}>
              <span style={{ fontSize: '22px', fontWeight: 800, color: s.color }}>{s.value}</span>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'IBM Plex Mono, monospace' }}>
                {s.label}
              </span>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="card" style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'IBM Plex Mono, monospace' }}>
              FILTER BY:
            </span>
            <select value={filterType} onChange={e => setFilterType(e.target.value)}
              style={{ width: 'auto', padding: '7px 12px', fontSize: '13px' }}>
              <option value="">All Trigger Types</option>
              {Object.entries(TRIGGER_CONFIG).map(([k, v]) => (
                <option key={k} value={k}>{v.icon} {v.label}</option>
              ))}
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              style={{ width: 'auto', padding: '7px 12px', fontSize: '13px' }}>
              <option value="">All Statuses</option>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            {(filterType || filterStatus) && (
              <button className="btn btn-ghost btn-sm" onClick={() => { setFilterType(''); setFilterStatus(''); }}>
                ✕ Clear
              </button>
            )}
            <span style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'IBM Plex Mono, monospace' }}>
              {logs.length} event{logs.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Timeline */}
        {isLoading ? (
          <div className="loading">Loading activity log...</div>
        ) : logs.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>📭</div>
            <div>No chaser events yet. Run the chaser or trigger manually from the Task Board.</div>
          </div>
        ) : (
          Object.entries(grouped)
            .sort(([a], [b]) => b.localeCompare(a))
            .map(([date, dateLogs]) => (
              <div key={date} style={{ marginBottom: '24px' }}>
                <div style={{
                  fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'IBM Plex Mono, monospace',
                  textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px',
                  display: 'flex', alignItems: 'center', gap: '8px'
                }}>
                  {dayjs(date).isToday() ? '— Today' : dayjs(date).isYesterday() ? '— Yesterday' : `— ${dayjs(date).format('MMM D, YYYY')}`}
                  <span style={{ color: 'var(--border-light)' }}>({dateLogs.length})</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {dateLogs.map((log, i) => (
                    <LogRow key={log.id} log={log} isLast={i === dateLogs.length - 1} />
                  ))}
                </div>
              </div>
            ))
        )}
      </div>
    </div>
  );
}

function LogRow({ log, isLast }) {
  const trigger = TRIGGER_CONFIG[log.type] || { label: log.type, color: 'var(--text-muted)', icon: '📡' };
  const status  = STATUS_CONFIG[log.status]        || { label: log.status,       color: 'var(--text-muted)' };

  // Derive display name from assignee_name, triggered_by, or email prefix
  const recipientName = log.assignee_name
    || (log.recipient_email ? log.recipient_email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Unknown');

  return (
    <div className="card" style={{
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      transition: 'all 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
      marginBottom: isLast ? 0 : '0px'
    }}>
      {/* ── Header: Recipient Name & Email ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 16px 6px',
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          {/* Avatar circle */}
          <div style={{
            width: 30, height: 30, borderRadius: '8px', flexShrink: 0,
            background: `linear-gradient(135deg, ${trigger.color}28, ${trigger.color}14)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '12px', fontWeight: 700, color: trigger.color,
            border: `1px solid ${trigger.color}30`,
          }}>
            {recipientName.charAt(0).toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>
              {recipientName}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'IBM Plex Mono, monospace', lineHeight: 1.3 }}>
              {log.recipient_email}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          {/* Status */}
          <span style={{ fontSize: '11px', fontWeight: 600, color: status.color, fontFamily: 'IBM Plex Mono, monospace' }}>
            {status.label}
          </span>
          {/* Time */}
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'IBM Plex Mono, monospace' }}>
            {dayjs(log.sent_at).format('h:mm A')}
          </span>
        </div>
      </div>

      {/* ── Body: Task + Trigger ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '14px',
        padding: '10px 16px',
      }}>
        {/* Trigger type dot */}
        <div style={{
          width: 8, height: 8, borderRadius: '50%', background: trigger.color, flexShrink: 0
        }} />

        {/* Icon */}
        <span style={{ fontSize: '16px', flexShrink: 0 }}>
          {CHANNEL_ICONS[log.channel] || '📡'}
        </span>

        {/* Main content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
              {log.task_title}
            </span>
            <span style={{
              fontSize: '10px', background: `${trigger.color}18`, color: trigger.color,
              border: `1px solid ${trigger.color}40`, borderRadius: '99px', padding: '2px 7px',
              fontFamily: 'IBM Plex Mono, monospace', fontWeight: 600
            }}>
              {trigger.icon} {trigger.label}
            </span>
          </div>
          {log.triggered_by && log.triggered_by !== 'system' && (
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'IBM Plex Mono, monospace', marginTop: '3px' }}>
              Triggered by {log.triggered_by}
            </div>
          )}
        </div>
      </div>

      {/* Expanded message preview */}
      {log.message_sent && (
        <div style={{
          padding: '0 16px 10px 44px',
          fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6,
          background: 'rgba(255,255,255,0.02)',
          borderTop: '1px solid var(--border)', paddingTop: '8px'
        }}>
          <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>
            MESSAGE SENT:
          </div>
          {log.message_sent}
          {log.acknowledged_at && (
            <div style={{ marginTop: '8px', color: 'var(--accent-green)', fontSize: '11px', fontFamily: 'IBM Plex Mono, monospace' }}>
              ✅ Acknowledged at {dayjs(log.acknowledged_at).format('MMM D, h:mm A')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
