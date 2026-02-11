import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ruleApi } from '../api';
import toast from 'react-hot-toast';

const PRIORITY_FILTERS = [
  { value: 'all',      label: 'All Priorities' },
  { value: 'critical', label: 'Critical Only' },
  { value: 'high',     label: 'High & Critical' },
  { value: 'medium',   label: 'Medium & Above' },
];

const CHANNELS = [
  { value: 'email',   label: '📧 Email' },
  { value: 'slack',   label: '💬 Slack' },
  { value: 'webhook', label: '🪝 Webhook' },
];

const DEFAULT_TEMPLATE = 'Hi {{assignee_name}}, your task "{{task_title}}" is due on {{due_date}}. Please share an update.';

const VARIABLES_HELP = [
  '{{assignee_name}}', '{{task_title}}', '{{due_date}}', '{{priority}}',
  '{{days_overdue}}', '{{hours_until_due}}', '{{chaser_count}}', '{{escalation_name}}',
];

const EMPTY_RULE = {
  name: '',
  description: '',
  is_active: true,
  applies_to_priority: 'all',
  chase_before_hours: 24,
  escalate_after_days: 3,
  max_chases: 3,
  escalation_channel: 'email',
  manual_button_enabled: true,
  message_template: DEFAULT_TEMPLATE,
};

export default function ChaserRules() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['chaser-rules'],
    queryFn: () => ruleApi.list(),
  });

  const rules = data?.data || [];

  const handleEdit = (rule) => {
    setEditingRule(rule);
    setShowForm(true);
  };

  const handleNew = () => {
    setEditingRule(null);
    setShowForm(true);
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Chaser Rules</div>
          <div className="page-subtitle">
            Configure when and how the automated chaser fires
          </div>
        </div>
        <button className="btn btn-primary" onClick={handleNew}>+ New Rule</button>
      </div>

      <div className="page-body">
        {/* How it works */}
        <div className="card" style={{ marginBottom: '20px', borderColor: 'rgba(61,126,255,0.3)' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--accent-blue)', marginBottom: '10px' }}>
            ⚡ How Chaser Rules Work
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
            {[
              { icon: '⏰', label: 'Boltic Cron', desc: 'Runs hourly, checks all active tasks against rules' },
              { icon: '🔍', label: 'Rule Match',  desc: 'Each task is evaluated against enabled rules' },
              { icon: '📬', label: 'Notification', desc: 'Context-aware message sent via configured channel' },
              { icon: '📋', label: 'Logged',       desc: 'Every event recorded in Activity Log' },
            ].map(s => (
              <div key={s.label} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '18px' }}>{s.icon}</span>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 600 }}>{s.label}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="loading">Loading rules...</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {rules.length === 0 && (
              <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: '32px', marginBottom: '12px' }}>⚙️</div>
                <div>No rules yet. Create your first chaser rule to get started.</div>
              </div>
            )}
            {rules.map(rule => (
              <RuleCard key={rule.id} rule={rule} onEdit={() => handleEdit(rule)} />
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <RuleFormModal
          rule={editingRule}
          onClose={() => { setShowForm(false); setEditingRule(null); }}
          onSaved={() => { setShowForm(false); setEditingRule(null); qc.invalidateQueries(['chaser-rules']); }}
        />
      )}
    </div>
  );
}

function RuleCard({ rule, onEdit }) {
  const qc = useQueryClient();

  const toggle = useMutation({
    mutationFn: () => ruleApi.update(rule.id, { is_active: !rule.is_active }),
    onSuccess: () => { toast.success(rule.is_active ? 'Rule disabled' : 'Rule enabled'); qc.invalidateQueries(['chaser-rules']); },
    onError: (e) => toast.error(String(e)),
  });

  const remove = useMutation({
    mutationFn: () => ruleApi.delete(rule.id),
    onSuccess: () => { toast.success('Rule deleted'); qc.invalidateQueries(['chaser-rules']); },
    onError: (e) => toast.error(String(e)),
  });

  const channelConf = CHANNELS.find(c => c.value === rule.escalation_channel);

  return (
    <div className="card" style={{
      opacity: rule.is_active ? 1 : 0.55,
      borderColor: rule.is_active ? 'var(--border)' : 'var(--border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span style={{ fontSize: '15px', fontWeight: 700 }}>{rule.name}</span>
            <span style={{
              fontSize: '10px', padding: '2px 7px', borderRadius: '99px',
              fontFamily: 'IBM Plex Mono, monospace', fontWeight: 600,
              background: rule.is_active ? 'rgba(0,229,160,0.12)' : 'rgba(124,133,160,0.12)',
              color: rule.is_active ? 'var(--accent-green)' : 'var(--text-muted)',
            }}>{rule.is_active ? 'ACTIVE' : 'INACTIVE'}</span>
          </div>

          {rule.description && (
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
              {rule.description}
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <RulePill label={channelConf?.label || rule.escalation_channel} color="var(--accent-cyan)" />
            <RulePill label={`${rule.chase_before_hours}h before due`} color="var(--accent-orange)" />
            <RulePill label={`Escalate @${rule.escalate_after_days}d`} color="var(--accent-red)" />
            <RulePill label={`Max ${rule.max_chases} chases`} color="var(--accent-purple)" />
            {rule.applies_to_priority !== 'all' && (
              <RulePill label={`Priority: ${rule.applies_to_priority}`} color="var(--accent-yellow)" />
            )}
          </div>

          {rule.message_template && (
            <div style={{
              marginTop: '10px', fontSize: '11px', color: 'var(--text-muted)',
              background: 'var(--bg-secondary)', padding: '8px 10px', borderRadius: '6px',
              fontFamily: 'IBM Plex Mono, monospace', lineHeight: 1.6,
              borderLeft: '2px solid var(--border-light)'
            }}>
              {rule.message_template.substring(0, 100)}{rule.message_template.length > 100 ? '...' : ''}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '8px', flexShrink: 0, alignItems: 'flex-start' }}>
          <button className="btn btn-ghost btn-sm" onClick={onEdit}>✏️ Edit</button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => toggle.mutate()}
            disabled={toggle.isPending}
          >
            {rule.is_active ? '⏸ Disable' : '▶ Enable'}
          </button>
          <button
            className="btn btn-danger btn-sm"
            onClick={() => { if (window.confirm('Delete this rule?')) remove.mutate(); }}
            disabled={remove.isPending}
          >
            🗑
          </button>
        </div>
      </div>
    </div>
  );
}

function RulePill({ label, color }) {
  return (
    <span style={{
      fontSize: '11px', padding: '2px 8px', borderRadius: '99px',
      background: `${color}15`, color, border: `1px solid ${color}30`,
      fontFamily: 'IBM Plex Mono, monospace', fontWeight: 600,
    }}>{label}</span>
  );
}

function RuleFormModal({ rule, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({ ...EMPTY_RULE, ...(rule || {}) }));
  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const save = useMutation({
    mutationFn: () => rule ? ruleApi.update(rule.id, form) : ruleApi.create(form),
    onSuccess: () => { toast.success(rule ? 'Rule updated' : 'Rule created'); onSaved(); },
    onError: (e) => toast.error(String(e)),
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: '620px', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div className="modal-title">
          {rule ? '✏️ Edit Rule' : '⚙️ Create Chaser Rule'}
        </div>

        <div className="form-group" style={{ marginBottom: 12 }}>
          <label>Rule Name *</label>
          <input placeholder="e.g. 24-Hour Deadline Alert" value={form.name} onChange={e => set('name', e.target.value)} />
        </div>

        <div className="form-group" style={{ marginBottom: 12 }}>
          <label>Description</label>
          <input placeholder="Brief description..." value={form.description} onChange={e => set('description', e.target.value)} />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Chase Before Due (hours)</label>
            <input
              type="number"
              value={form.chase_before_hours}
              min={1}
              max={168}
              onChange={e => set('chase_before_hours', Number(e.target.value))}
            />
          </div>
          <div className="form-group">
            <label>Escalate After (days)</label>
            <input
              type="number"
              value={form.escalate_after_days}
              min={1}
              onChange={e => set('escalate_after_days', Number(e.target.value))}
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Max Chases</label>
            <input
              type="number"
              value={form.max_chases}
              min={1}
              max={10}
              onChange={e => set('max_chases', Number(e.target.value))}
            />
          </div>
          <div className="form-group">
            <label>Escalation Channel</label>
            <select value={form.escalation_channel} onChange={e => set('escalation_channel', e.target.value)}>
              {CHANNELS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
        </div>

        <div className="form-group" style={{ marginBottom: 12 }}>
          <label>Applies To Priority</label>
          <select value={form.applies_to_priority} onChange={e => set('applies_to_priority', e.target.value)}>
            {PRIORITY_FILTERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>

        <div className="form-group" style={{ marginBottom: 8 }}>
          <label>Message Template</label>
          <textarea
            value={form.message_template}
            onChange={e => set('message_template', e.target.value)}
            placeholder={DEFAULT_TEMPLATE}
            style={{ minHeight: '100px', fontFamily: 'IBM Plex Mono, monospace', fontSize: '12px' }}
          />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' }}>
            {VARIABLES_HELP.map(v => (
              <span key={v}
                style={{ fontSize: '10px', color: 'var(--accent-cyan)', background: 'rgba(0,212,224,0.08)',
                  border: '1px solid rgba(0,212,224,0.2)', borderRadius: '4px', padding: '2px 5px',
                  cursor: 'pointer', fontFamily: 'IBM Plex Mono, monospace'
                }}
                onClick={() => set('message_template', (form.message_template || '') + v)}
              >{v}</span>
            ))}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Click a variable to insert it into the template
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <input type="checkbox" id="manual_button_enabled" checked={form.manual_button_enabled}
            onChange={e => set('manual_button_enabled', e.target.checked)} style={{ width: 16, height: 16 }} />
          <label htmlFor="manual_button_enabled" style={{ fontSize: 13, cursor: 'pointer', color: 'var(--text-secondary)' }}>
            Allow manual chase button
          </label>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" id="is_active" checked={form.is_active}
            onChange={e => set('is_active', e.target.checked)} style={{ width: 16, height: 16 }} />
          <label htmlFor="is_active" style={{ fontSize: 13, cursor: 'pointer', color: 'var(--text-secondary)' }}>
            Rule is active
          </label>
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => save.mutate()} disabled={save.isPending || !form.name}>
            {save.isPending ? 'Saving...' : rule ? 'Update Rule' : 'Create Rule'}
          </button>
        </div>
      </div>
    </div>
  );
}
