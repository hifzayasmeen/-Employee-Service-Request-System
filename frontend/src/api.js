let token = sessionStorage.getItem('token');
export const setToken = t => { token = t; t ? sessionStorage.setItem('token', t) : sessionStorage.removeItem('token'); };
export const hasToken = () => !!token;

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch('/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token) { setToken(null); location.reload(); }
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}
