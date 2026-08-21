export function getApiBase() {
  const customUrl = (import.meta.env.VITE_API_URL || '').replace(/\/api\/?$/, '');
  if (customUrl) return customUrl;
  // Default to relative '/api' on the same domain (works seamlessly on Vercel, localhost, etc.)
  return '';
}

async function request(path, opts = {}, token) {
  const base = getApiBase();
  const url = (base ? `${base}/api` : '/api') + path;
  try {
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
      const isSuspended = res.status === 503 || (typeof data === 'string' && data.includes('suspended'));
      const err = new Error(
        data.message || (isSuspended ? 'Backend server is suspended on Render. Please resume it from dashboard.render.com' : 'Something went wrong')
      );
      err.status = res.status;
      throw err;
    }
    return data;
  } catch (err) {
    if (err.message && err.message.includes('suspended')) {
      throw err;
    }
    if (err.name === 'TypeError' || err.message === 'Failed to fetch') {
      throw new Error('Backend server is sleeping or suspended on Render. Please check dashboard.render.com and resume the service.');
    }
    throw err;
  }
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

export const CURRENCY_SYMBOLS = {
  USD: '$',
  INR: '₹',
  EUR: '€',
  GBP: '£',
  AED: 'AED ',
  CAD: 'CA$',
  AUD: 'A$',
};

export const DEFAULT_CURRENCY_RATES = {
  USD: 1.0,
  INR: 83.50,
  EUR: 0.92,
  GBP: 0.79,
  AED: 3.67,
  CAD: 1.36,
  AUD: 1.52,
};

export function getActiveCurrency() {
  try {
    return localStorage.getItem('bazario_currency') || 'USD';
  } catch {
    return 'USD';
  }
}

export function getCurrencyRate(code = getActiveCurrency()) {
  try {
    const cached = localStorage.getItem('bazario_currency_rates');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && parsed[code]) return parsed[code];
    }
  } catch {}
  return DEFAULT_CURRENCY_RATES[code] || 1.0;
}

export const money = (n, customCode) => {
  const code = customCode || getActiveCurrency();
  const symbol = CURRENCY_SYMBOLS[code] || '$';
  const rate = getCurrencyRate(code);
  const converted = Number(n || 0) * rate;
  return symbol + Number(converted).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const fmtDate = (d) =>
  new Date(d).toLocaleString('en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

export const fmtDay = (d) => new Date(d).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });

// UploadThing url -> key (urls look like https://<app>.ufs.sh/f/<key> or utfs.io/f/<key>)
export const utKeyFromUrl = (url) => (url && url.includes('/f/') ? url.split('/f/')[1].split('?')[0] : null);

/**
 * Resolves relative /uploads/ media paths to full backend server URLs
 */
export function resolveMediaUrl(url) {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:') || url.startsWith('blob:')) {
    return url;
  }
  const base = getApiBase();
  const cleanPath = url.startsWith('/') ? url : `/${url}`;
  if (!base) return cleanPath;
  return `${base}${cleanPath}`;
}

/**
 * Direct file/attachment download trigger
 */
export async function downloadAttachment(url, filename) {
  if (!url) return;
  const fullUrl = resolveMediaUrl(url);
  try {
    const res = await fetch(fullUrl, { mode: 'cors' });
    if (!res.ok) throw new Error('Fetch failed');
    const blob = await res.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename || fullUrl.split('/').pop().split('?')[0] || 'attachment';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => window.URL.revokeObjectURL(blobUrl), 2000);
  } catch (e) {
    // Fallback if CORS or direct URL
    const a = document.createElement('a');
    a.href = fullUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.download = filename || 'attachment';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}

/**
 * Compresses mobile camera photos & large images to lightweight web JPEGs (< 600KB)
 * before uploading, preventing proxy payload limit errors and speeding up mobile uploads
 */
export async function compressImage(file, { maxWidth = 1600, maxHeight = 1600, quality = 0.85 } = {}) {
  if (!file || !file.type || !file.type.startsWith('image/')) {
    return file;
  }
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxWidth || height > maxHeight) {
          if (width > height) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob) return resolve(file);
            const safeName = (file.name || 'camera_photo.jpg').replace(/\.[^/.]+$/, '.jpg');
            const compressedFile = new File([blob], safeName, {
              type: 'image/jpeg',
              lastModified: Date.now(),
            });
            resolve(compressedFile);
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = () => resolve(file);
      img.src = e.target.result;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}
