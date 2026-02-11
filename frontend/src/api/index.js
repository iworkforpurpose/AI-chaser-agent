/**
 * API Client — all backend calls from React
 */
import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.response.use(
  (r) => r.data,
  (err) => Promise.reject(err.response?.data?.error || err.message)
);

export const currentUserEmail = import.meta.env.VITE_USER_EMAIL || 'vighurnama@gmail.com';
export const currentUserName = 'Vighnesh Nama';

// ─── Tasks ────────────────────────────────────────────────────────────────────
export const taskApi = {
  list:         (params) => api.get('/tasks', { params }),
  get:          (id)     => api.get(`/tasks/${id}`),
  create:       (data)   => api.post('/tasks', data),
  update:       (id, d)  => api.patch(`/tasks/${id}`, d),
  delete:       (id)     => api.delete(`/tasks/${id}`),
  stats:        ()       => api.get('/tasks/stats'),
  overdue:      ()       => api.get('/tasks/overdue'),
  dueSoon:      (h)      => api.get('/tasks/due-soon', { params: { hours: h || 24 } }),

  chase:        (id, triggeredBy) => api.post(`/tasks/${id}/chase`, { triggered_by: triggeredBy }),
  bulkChase:    (ids, by)         => api.post('/tasks/bulk-chase', { task_ids: ids, triggered_by: by }),
  snooze:       (id, hours)       => api.post(`/tasks/${id}/snooze`, { hours }),
  acknowledge:  (id, email)       => api.post(`/tasks/${id}/acknowledge`, { user_email: email }),
};

// ─── Projects ─────────────────────────────────────────────────────────────────
export const projectApi = {
  list: () => api.get('/projects'),
};

// ─── Users ────────────────────────────────────────────────────────────────────
export const userApi = {
  list: () => api.get('/users'),
};

// ─── Chaser Rules ─────────────────────────────────────────────────────────────
export const ruleApi = {
  list:   ()       => api.get('/chaser-rules'),
  create: (data)   => api.post('/chaser-rules', data),
  update: (id, d)  => api.patch(`/chaser-rules/${id}`, d),
  delete: (id)     => api.delete(`/chaser-rules/${id}`),
};

// ─── Chaser Logs ──────────────────────────────────────────────────────────────
export const logApi = {
  list: (params) => api.get('/chaser-logs', { params }),
};

// ─── Notifications ────────────────────────────────────────────────────────────
export const notifApi = {
  list:    (email) => api.get('/notifications', { params: { user_email: email } }),
  markRead: (id)   => api.patch(`/notifications/${id}/read`),
};

// ─── Chaser Engine ────────────────────────────────────────────────────────────
export const chaserApi = {
  runNow: () => api.post('/run-chaser'),
  health: () => api.get('/health'),
};

export default api;
