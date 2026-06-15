const tokenKey = 'shiz_access_token';

export function getToken() {
  return localStorage.getItem(tokenKey);
}

export function setToken(token) {
  localStorage.setItem(tokenKey, token);
}

export function clearToken() {
  localStorage.removeItem(tokenKey);
}

async function request(path, options = {}) {
  const headers = {
    Accept: 'application/json',
    ...(options.headers || {}),
  };

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (options.auth !== false) {
    const token = getToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  const response = await fetch(path, {
    method: options.method || 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.detail || 'Запрос не выполнен.');
  }
  return data;
}

export const api = {
  feed: () => request('/api/feed'),
  event: (eventId) => request(`/api/events/${eventId}`),
  comments: (eventId) => request(`/api/events/${eventId}/comments`, { auth: false }),
  me: () => request('/api/auth/me'),
  updateMe: (payload) => request('/api/auth/me', { method: 'PATCH', body: payload }),
  myActivity: () => request('/api/auth/me/activity'),
  login: (payload) => request('/api/auth/login', { method: 'POST', body: payload, auth: false }),
  register: (payload) => request('/api/auth/register', { method: 'POST', body: payload, auth: false }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  createEvent: (payload) => request('/api/events', { method: 'POST', body: payload }),
  vote: (eventId) => request(`/api/events/${eventId}/vote`, { method: 'POST' }),
  unvote: (eventId) => request(`/api/events/${eventId}/unvote`, { method: 'POST' }),
  createComment: (eventId, payload) =>
    request(`/api/events/${eventId}/comments`, { method: 'POST', body: payload }),
  createAdminPost: (payload) => request('/api/admin/posts', { method: 'POST', body: payload }),
  deleteAdminPost: (postId) => request(`/api/admin/posts/${postId}`, { method: 'DELETE' }),
  adminOverview: () => request('/api/admin/users/overview'),
  auditLog: () => request('/api/admin/audit-log'),
  clearAuditLog: () => request('/api/admin/audit-log', { method: 'DELETE' }),
  makeAdmin: (userId) => request(`/api/admin/users/${userId}/make-admin`, { method: 'POST' }),
  removeAdmin: (userId) => request(`/api/superadmin/users/${userId}/remove-admin`, { method: 'POST' }),
  updateEventStatus: (eventId, payload) =>
    request(`/api/events/${eventId}/status`, { method: 'PATCH', body: payload }),
  deleteEvent: (eventId) => request(`/api/events/${eventId}`, { method: 'DELETE' }),
  hideComment: (eventId, commentId) =>
    request(`/api/admin/events/${eventId}/comments/${commentId}/hide`, { method: 'POST' }),
  errorLog: () => request('/api/superadmin/error-log'),
  updateErrorLogStatus: (errorId, payload) =>
    request(`/api/superadmin/error-log/${errorId}`, { method: 'PATCH', body: payload }),
  deleteErrorLog: (errorId) => request(`/api/superadmin/error-log/${errorId}`, { method: 'DELETE' }),
};
