const BASE = '/api';

function token() {
  return localStorage.getItem('token');
}

function headers(extra = {}) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}`, ...extra };
}

async function request(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: headers(),
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

export const api = {
  login: (uptime_user_id, password) =>
    request('POST', '/auth/login', { uptime_user_id, password }),

  register: (uptime_user_id, full_name, password) =>
    request('POST', '/auth/register', { uptime_user_id, full_name, password }),

  me: () => request('GET', '/users/me'),
  stats: () => request('GET', '/users/me/stats'),
  updateMe: (body) => request('PATCH', '/users/me', body),

  jumps: (limit = 20, offset = 0) =>
    request('GET', `/jumps?limit=${limit}&offset=${offset}`),

  dropzones: () => request('GET', '/jumps/dropzones'),

  jump: (id) => request('GET', `/jumps/${id}`),
  jumpTrack: (id) => request('GET', `/jumps/${id}/track`),
  updateJump: (id, body) => request('PATCH', `/jumps/${id}`, body),
  deleteJump: (id) => request('DELETE', `/jumps/${id}`),

  uploadJumps: (files) => {
    const form = new FormData();
    files.forEach((f) => form.append('files[]', f));
    return fetch('/api/jumps/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token()}` },
      body: form,
    }).then((r) => r.json());
  },

  uploadLogs: (files, device_id) => {
    const form = new FormData();
    files.forEach((f) => form.append('files[]', f));
    if (device_id) form.append('device_id', device_id);
    return fetch('/api/logs/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token()}` },
      body: form,
    }).then((r) => r.json());
  },

  devices: () => request('GET', '/devices'),
  getDekunuCompat: () => request('GET', '/admin/dekunu-compat'),
  setDekunuCompat: (enabled) => request('POST', '/admin/dekunu-compat', { enabled }),

  uploadAvatar: (file) => {
    const form = new FormData();
    form.append('avatar', file);
    return fetch('/api/users/me/avatar', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token()}` },
      body: form,
    }).then((r) => r.json());
  },

  socialLeaderboard: (period = 'all') =>
    request('GET', `/social/leaderboard?period=${period}`),

  placesNearby: (lat, lon, radiusMeters = 16093) =>
    request('POST', '/places/nearby', { lat, lon, radiusMeters }),
};
