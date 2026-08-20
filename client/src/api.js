const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/api\/?$/, '');

async function request(path, opts = {}, token) {
  const url = (API_BASE ? `${API_BASE}/api` : '/api') + path;
  const res = await fetch(url, {
    method: opts.method || 'GET',
    headers: {
      ...(opts.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: opts.body instanceof FormData ? opts.body : opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || 'Something went wrong');
    err.status = res.status;
    throw err;
  }
  return data;
}

// admin-token requests (also used for public storefront reads)
export const api = (path, opts = {}) => request(path, opts, localStorage.getItem('ng_admin_token'));

// seller-token requests
export const sapi = (path, opts = {}) => request(path, opts, localStorage.getItem('ng_seller_token'));

// customer-token requests
export const uapi = (path, opts = {}) => request(path, opts, localStorage.getItem('ng_user_token'));

// authenticated file download (reports export)
export async function downloadFile(path, filename) {
  const url = (API_BASE ? `${API_BASE}/api` : '/api') + path;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${localStorage.getItem('ng_admin_token')}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || 'Download failed');
  }
  const blob = await res.blob();
  const urlBlob = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = urlBlob;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(urlBlob), 5000);
}

export const money = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtDate = (d) =>
  new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

export const fmtDay = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

// UploadThing url -> key (urls look like https://<app>.ufs.sh/f/<key> or utfs.io/f/<key>)
export const utKeyFromUrl = (url) => (url && url.includes('/f/') ? url.split('/f/')[1].split('?')[0] : null);
