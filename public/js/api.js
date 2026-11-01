// Thin wrapper around the Netlify functions. Adds the sign in token.
let tokenProvider = async () => null;

export function setTokenProvider(fn) { tokenProvider = fn; }

export async function api(path, { method = 'GET', body } = {}) {
  const token = await tokenProvider();
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(`/api/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw Object.assign(new Error('We could not reach CheckMyTrade. Please check your connection and try again.'), { status: 0 });
  }
  let data = {};
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const msg = res.status === 413
      ? 'That screenshot is too large to send. Please try a smaller image.'
      : data.error || 'Something went wrong. Please try again.';
    throw Object.assign(new Error(msg), { status: res.status, code: data.code, data });
  }
  return data;
}
