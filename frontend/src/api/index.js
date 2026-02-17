/**
 * API Client — all backend calls from React
 */
import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

api.interceptors.response.use(
  (r) => r.data,
  (err) => {
    const path = window.location.pathname;
    const publicPaths = ['/', '/login', '/register', '/landingpage'];
    const isPublic = publicPaths.includes(path);

    if (err.response?.status === 401 && !isPublic) {
      window.location.href = '/login';
    }
    return Promise.reject(err.response?.data?.error || err.message);
  }
);

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (data) => api.post('/auth/login', data),
  register: (data) => api.post('/auth/register', data),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
};

// ─── Tasks ────────────────────────────────────────────────────────────────────
export const taskApi = {
  list: (params) => api.get('/tasks', { params }),
  get: (id) => api.get(`/tasks/${id}`),
  create: (data) => api.post('/tasks', data),
  update: (id, d) => api.patch(`/tasks/${id}`, d),
  delete: (id) => api.delete(`/tasks/${id}`),
  stats: () => api.get('/tasks/stats'),
  overdue: () => api.get('/tasks/overdue'),
  dueSoon: (h) => api.get('/tasks/due-soon', { params: { hours: h || 24 } }),
  completed: (params) => api.get('/tasks/completed', { params }),

  chase: (id, triggeredBy) => api.post(`/tasks/${id}/chase`, { triggered_by: triggeredBy }),
  bulkChase: (ids, by) => api.post('/tasks/bulk-chase', { task_ids: ids, triggered_by: by }),
  snooze: (id, hours) => api.post(`/tasks/${id}/snooze`, { hours }),
  acknowledge: (id, email) => api.post(`/tasks/${id}/acknowledge`, { user_email: email }),
};

// ─── Users ────────────────────────────────────────────────────────────────────
export const userApi = {
  list: () => api.get('/users'),
};

// ─── Chaser Rules ─────────────────────────────────────────────────────────────
const normalizeRulePayload = (data = {}) => ({
  name: data.name,
  description: data.description || '',
  is_active: data.is_active !== false,
  applies_to_priority: data.applies_to_priority || 'all',
  chase_before_hours: Number(data.chase_before_hours ?? 24),
  escalate_after_days: Number(data.escalate_after_days ?? 3),
  max_chases: Number(data.max_chases ?? 3),
  escalation_channel: data.escalation_channel || 'email',
  manual_button_enabled: data.manual_button_enabled !== false,
  message_template: data.message_template || '',
});

const shouldNormalizeRulePayload = (data = {}) => (
  Object.prototype.hasOwnProperty.call(data, 'name')
  || Object.prototype.hasOwnProperty.call(data, 'chase_before_hours')
  || Object.prototype.hasOwnProperty.call(data, 'escalate_after_days')
  || Object.prototype.hasOwnProperty.call(data, 'escalation_channel')
  || Object.prototype.hasOwnProperty.call(data, 'applies_to_priority')
  || Object.prototype.hasOwnProperty.call(data, 'max_chases')
  || Object.prototype.hasOwnProperty.call(data, 'message_template')
  || Object.prototype.hasOwnProperty.call(data, 'manual_button_enabled')
);

export const ruleApi = {
  list: () => api.get('/chaser-rules'),
  create: (data) => api.post('/chaser-rules', normalizeRulePayload(data)),
  update: (id, d) => api.patch(
    `/chaser-rules/${id}`,
    shouldNormalizeRulePayload(d) ? normalizeRulePayload(d) : d
  ),
  delete: (id) => api.delete(`/chaser-rules/${id}`),
};

// ─── Chaser Logs ──────────────────────────────────────────────────────────────
export const logApi = {
  list: (params) => api.get('/chaser-logs', { params }),
};

// ─── Notifications ────────────────────────────────────────────────────────────
export const notifApi = {
  list: (params) => api.get('/notifications', { params }),
  markRead: (id) => api.patch(`/notifications/${id}/read`),
};

// ─── Chaser Engine ────────────────────────────────────────────────────────────
export const chaserApi = {
  runNow: () => api.post('/run-chaser'),
  health: () => api.get('/health'),
};

export default api;
