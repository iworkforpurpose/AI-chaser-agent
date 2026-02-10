import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { taskApi, projectApi, userApi } from '../api';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
dayjs.extend(relativeTime);

const COLUMNS = [
  { key: 'todo',        label: 'To Do',      color: 'var(--status-todo)' },
  { key: 'in_progress', label: 'In Progress', color: 'var(--status-in_progress)' },
  { key: 'blocked',     label: 'Blocked',     color: 'var(--status-blocked)' },
  { key: 'in_review',   label: 'In Review',   color: 'var(--status-in_review)' },
  { key: 'done',        label: 'Done',        color: 'var(--status-done)' },
];

const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

export default function TaskBoard() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [filterAssignee, setFilterAssignee] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [bulkSelected, setBulkSelected] = useState([]);

  const { data: tasksData, isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => taskApi.list(),
    refetchInterval: 30000,
  });

  const { data: usersData  } = useQuery({ queryKey: ['users'],    queryFn: () => userApi.list() });
  const { data: projectsData } = useQuery({ queryKey: ['projects'], queryFn: () => projectApi.list() });

  const bulkChase = useMutation({
    mutationFn: () => taskApi.bulkChase(bulkSelected, 'bulk_trigger'),
    onSuccess: (d) => { toast.success(d.message); setBulkSelected([]); qc.invalidateQueries(['tasks']); },
    onError: (e) => toast.error(e),
  });

  let tasks = tasksData?.data || [];
  if (filterAssignee) tasks = tasks.filter(t => t.assignee_email === filterAssignee);
  if (filterPriority) tasks = tasks.filter(t => t.priority === filterPriority);

  const byStatus = {};
  COLUMNS.forEach(c => { byStatus[c.key] = []; });
  tasks.forEach(t => {
    if (byStatus[t.status]) {
      byStatus[t.status].push(t);
    }
  });
  Object.values(byStatus).forEach(arr =>
    arr.sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 4) - (PRIORITY_ORDER[b.priority] ?? 4))
  );

  const users = usersData?.data || [];
  const projects = projectsData?.data || [];

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Task Board</div>
          <div className="page-subtitle">{tasks.length} tasks · Click ⚡ to manually chase any task</div>
        </div>
        <div className="flex gap-8 items-center" style={{ flexWrap: 'wrap' }}>
          {bulkSelected.length > 0 && (
            <button className="btn btn-chase" onClick={() => bulkChase.mutate()} disabled={bulkChase.isPending}>
              ⚡ Chase {bulkSelected.length} Selected
            </button>
          )}
          <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)}
            style={{ width: 'auto', padding: '7px 12px', fontSize: '13px' }}>
            <option value="">All Members</option>
            {users.map(u => <option key={u.id} value={u.email}>{u.name}</option>)}
          </select>
          <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)}
            style={{ width: 'auto', padding: '7px 12px', fontSize: '13px' }}>
            <option value="">All Priorities</option>
            {['critical','high','medium','low'].map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ New Task</button>
        </div>
      </div>

      <div className="page-body" style={{ overflowX: 'auto' }}>
        {isLoading ? (
          <div className="loading">Loading tasks...</div>
        ) : (
          <div style={{ display: 'flex', gap: '14px', minWidth: 'max-content' }}>
            {COLUMNS.map(col => (
              <Column
                key={col.key}
                column={col}
                tasks={byStatus[col.key] || []}
                onChaseAll={() => {
                  const ids = (byStatus[col.key] || [])
                    .filter(t => t.status !== 'done' && t.chaser_enabled)
                    .map(t => t.id);
                  if (ids.length) taskApi.bulkChase(ids, 'column_chase').then(() => {
                    toast.success(`Chased ${ids.length} tasks`); qc.invalidateQueries(['tasks']);
                  });
                }}
                onSelectTask={setSelectedTask}
                bulkSelected={bulkSelected}
                onToggleBulk={id =>
                  setBulkSelected(prev =>
                    prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
                  )
                }
              />
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateTaskModal
          users={users}
          projects={projects}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); qc.invalidateQueries(['tasks']); }}
        />
      )}

      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdated={() => { setSelectedTask(null); qc.invalidateQueries(['tasks']); }}
        />
      )}
    </div>
  );
}

function Column({ column, tasks, onChaseAll, onSelectTask, bulkSelected, onToggleBulk }) {
  return (
    <div style={{ width: 280, flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: column.color }} />
        <span style={{ fontWeight: 700, fontSize: '13px' }}>{column.label}</span>
        <span style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: '99px', fontSize: '11px', padding: '1px 7px',
          color: 'var(--text-muted)', fontFamily: 'IBM Plex Mono, monospace'
        }}>{tasks.length}</span>
        <div style={{ marginLeft: 'auto' }}>
          {column.key !== 'done' && tasks.length > 0 && (
            <button className="btn btn-chase btn-sm" onClick={onChaseAll} title="Chase all in column">
              ⚡ All
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', minHeight: 120 }}>
        {tasks.map(task => (
          <TaskCard
            key={task.id}
            task={task}
            onClick={() => onSelectTask(task)}
            isSelected={bulkSelected.includes(task.id)}
            onToggleBulk={() => onToggleBulk(task.id)}
          />
        ))}
        {tasks.length === 0 && (
          <div style={{
            border: '1px dashed var(--border)', borderRadius: 'var(--radius)',
            height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-muted)', fontSize: '12px'
          }}>Empty</div>
        )}
      </div>
    </div>
  );
}

function TaskCard({ task, onClick, isSelected, onToggleBulk }) {
  const qc = useQueryClient();
  const isOverdue = dayjs(task.due_date).isBefore(dayjs()) && task.status !== 'done';

  const chase = useMutation({
    mutationFn: (e) => { e.stopPropagation(); return taskApi.chase(task.id, 'board_user'); },
    onSuccess: () => { toast.success(`Chase sent to ${task.assignee_name}`); qc.invalidateQueries(['tasks']); },
    onError: (e) => toast.error(String(e)),
  });

  const snooze = useMutation({
    mutationFn: (e) => { e.stopPropagation(); return taskApi.snooze(task.id, 4); },
    onSuccess: () => toast.success('Snoozed for 4 hours'),
    onError: (e) => toast.error(String(e)),
  });

  const avatarLetters = (task.assignee_name || 'U').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const accentBorder = isOverdue
    ? 'rgba(251,191,36,0.6)'
    : isSelected
      ? 'rgba(59,130,246,0.6)'
      : 'var(--border)';

  return (
    <div
      onClick={onClick}
      className="card card-hover"
      style={{
        padding: '16px', cursor: 'pointer', position: 'relative',
        borderColor: accentBorder,
        boxShadow: '0 10px 28px rgba(17,24,39,0.05)',
        background: '#fff',
      }}
    >
      {isOverdue && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 2,
          background: 'linear-gradient(90deg, rgba(251,191,36,0.9), transparent)', borderRadius: '10px 10px 0 0'
        }} />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
        <input
          type="checkbox"
          checked={isSelected}
          onClick={(e) => { e.stopPropagation(); onToggleBulk(); }}
          style={{ width: 14, height: 14, cursor: 'pointer', flexShrink: 0 }}
        />
        <span className={`badge badge-${task.priority}`}>{task.priority}</span>
      </div>

      <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '8px', lineHeight: 1.4, color: 'var(--text-primary)' }}>
        {task.title}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
        <div style={{
          width: 22, height: 22, borderRadius: '6px',
          background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-purple))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '9px', fontWeight: 700, color: '#fff', flexShrink: 0
        }}>{avatarLetters}</div>
        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{task.assignee_name}</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{
          fontSize: '12px', fontFamily: 'IBM Plex Mono, monospace',
          color: isOverdue ? '#b45309' : 'var(--text-muted)'
        }}>
          {isOverdue ? 'Past due · ' : 'Due · '}
          {dayjs(task.due_date).format('MMM D')}
        </span>
        {task.chaser_count > 0 && (
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'IBM Plex Mono, monospace' }}>
            {task.chaser_count} chases
          </span>
        )}
      </div>

      {task.status !== 'done' && (
        <div style={{ display: 'flex', gap: '8px', marginTop: '12px', borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
          <button
            className="btn btn-ghost btn-sm"
            style={{
              flex: 1,
              justifyContent: 'center',
              color: 'var(--accent-blue)',
              borderColor: 'var(--border)',
              background: 'rgba(59,130,246,0.07)'
            }}
            onClick={(e) => { e.stopPropagation(); chase.mutate(e); }}
            disabled={chase.isPending}
          >
            {chase.isPending ? 'Sending…' : 'Send chase'}
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={(e) => { e.stopPropagation(); snooze.mutate(e); }}
            disabled={snooze.isPending}
            title="Snooze chasing for 4 hours"
          >
            Snooze 4h
          </button>
        </div>
      )}
    </div>
  );
}

function CreateTaskModal({ users, projects, onClose, onCreated }) {
  const [form, setForm] = useState({
    title: '', description: '', assignee_email: '',
    due_date: '', priority: 'medium', status: 'todo',
    project_id: '', chaser_enabled: true,
  });

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));
  const user = users.find(u => u.email === form.assignee_email);

  const create = useMutation({
    mutationFn: () => taskApi.create({
      ...form,
      assignee_name: user?.name || '',
      reporter_email: 'arjun@acme.com',
    }),
    onSuccess: () => { toast.success('Task created!'); onCreated(); },
    onError: (e) => toast.error(String(e)),
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">📋 Create New Task</div>

        <div className="form-group" style={{ marginBottom: 12 }}>
          <label>Task Title *</label>
          <input placeholder="What needs to get done?" value={form.title} onChange={e => set('title', e.target.value)} />
        </div>

        <div className="form-group" style={{ marginBottom: 12 }}>
          <label>Description</label>
          <textarea placeholder="Add details..." value={form.description} onChange={e => set('description', e.target.value)} />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Assignee *</label>
            <select value={form.assignee_email} onChange={e => set('assignee_email', e.target.value)}>
              <option value="">Select person</option>
              {users.map(u => <option key={u.id} value={u.email}>{u.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Project</label>
            <select value={form.project_id} onChange={e => set('project_id', e.target.value)}>
              <option value="">No project</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Due Date *</label>
            <input type="datetime-local" value={form.due_date} onChange={e => set('due_date', e.target.value)} />
          </div>
          <div className="form-group">
            <label>Priority</label>
            <select value={form.priority} onChange={e => set('priority', e.target.value)}>
              {['critical','high','medium','low'].map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <input type="checkbox" id="chaser_enabled" checked={form.chaser_enabled}
            onChange={e => set('chaser_enabled', e.target.checked)} style={{ width: 16, height: 16 }} />
          <label htmlFor="chaser_enabled" style={{ fontSize: 13, cursor: 'pointer', color: 'var(--text-secondary)' }}>
            Enable automated chaser for this task
          </label>
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => create.mutate()} disabled={create.isPending || !form.title || !form.due_date}>
            {create.isPending ? 'Creating...' : 'Create Task'}
          </button>
        </div>
      </div>
    </div>
  );
}

function TaskDetailModal({ task, onClose, onUpdated }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState(task.status);

  const updateStatus = useMutation({
    mutationFn: (s) => taskApi.update(task.id, { status: s, updated_by: 'current_user' }),
    onSuccess: () => { toast.success('Status updated'); qc.invalidateQueries(['tasks']); onUpdated(); },
    onError: (e) => toast.error(String(e)),
  });

  const chase = useMutation({
    mutationFn: () => taskApi.chase(task.id, 'task_detail'),
    onSuccess: () => { toast.success('Chase sent!'); qc.invalidateQueries(['tasks']); },
    onError: (e) => toast.error(String(e)),
  });

  const isOverdue = dayjs(task.due_date).isBefore(dayjs()) && task.status !== 'done';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <span className={`badge badge-${task.priority}`} style={{ marginBottom: 8, display: 'inline-flex' }}>{task.priority}</span>
            <div className="modal-title" style={{ marginBottom: 0 }}>{task.title}</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        {task.description && (
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
            {task.description}
          </p>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div style={{ background: 'var(--bg-secondary)', padding: '12px', borderRadius: 8 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, fontFamily: 'IBM Plex Mono, monospace' }}>ASSIGNEE</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{task.assignee_name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{task.assignee_email}</div>
          </div>
          <div style={{ background: 'var(--bg-secondary)', padding: '12px', borderRadius: 8 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, fontFamily: 'IBM Plex Mono, monospace' }}>DUE DATE</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: isOverdue ? 'var(--accent-red)' : 'var(--text-primary)' }}>
              {isOverdue ? '⚠ ' : ''}{dayjs(task.due_date).format('MMM D, YYYY h:mm A')}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{dayjs(task.due_date).fromNow()}</div>
          </div>
        </div>

        <div className="form-group" style={{ marginBottom: 16 }}>
          <label>Update Status</label>
          <select value={status} onChange={e => { setStatus(e.target.value); updateStatus.mutate(e.target.value); }}>
            <option value="todo">To Do</option>
            <option value="in_progress">In Progress</option>
            <option value="blocked">Blocked</option>
            <option value="in_review">In Review</option>
            <option value="done">Done ✓</option>
          </select>
        </div>

        {task.chaser_count > 0 && (
          <div style={{ fontSize: 12, color: 'var(--accent-orange)', marginBottom: 12, fontFamily: 'IBM Plex Mono, monospace' }}>
            ⚡ Chased {task.chaser_count} time{task.chaser_count > 1 ? 's' : ''}
            {task.last_chased_at && ` · Last: ${dayjs(task.last_chased_at).fromNow()}`}
          </div>
        )}

        <div className="modal-footer" style={{ marginTop: 8 }}>
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
          {task.status !== 'done' && (
            <button className="btn btn-chase" onClick={() => chase.mutate()} disabled={chase.isPending}>
              {chase.isPending ? 'Sending...' : '⚡ Send Chase'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
