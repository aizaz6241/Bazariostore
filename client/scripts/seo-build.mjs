// Post-build SEO step (runs after `vite build`):
//   1. dist/sitemap.xml — home, shop, categories, seller sign-up and every active product (with images)
//   2. dist/product/<slug>/index.html — each product page pre-rendered with its own title, description,
//      canonical, Open Graph tags, Product structured data and visible text, so Google, Bing and
//      social previews see real content without running JavaScript. The React app still boots on top.
//   3. Optional search-console verification tags (GOOGLE_SITE_VERIFICATION / BING_SITE_VERIFICATION).
//
// It never fails the build: if the API is unreachable the sitemap falls back to the static pages.
//
// Env: SITE_URL (or VITE_SITE_URL) — public store address; SEO_API_URL (or VITE_API_URL) — backend.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_SITE = 'https://bazariomarketplace.vercel.app';
const SITE_URL = (process.env.SITE_URL || process.env.VITE_SITE_URL || DEFAULT_SITE).replace(/\/+$/, '');
const API_URL = (process.env.SEO_API_URL || process.env.VITE_API_URL || 'https://bazariostore.onrender.com')
  .replace(/\/+$/, '')
  .replace(/\/api$/, '');
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const MAX_PAGES = 200; // 100 products per page

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

function trimText(text, max = 158) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 20)).replace(/[,.;:\s-]+$/, '') + '…';
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The backend may be asleep (free hosting): the first call gets a long timeout and a few retries.
async function getJson(pathname, { timeout = 30000, tries = 3 } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(`${API_URL}/api${pathname}`, { signal: ctrl.signal, headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      await sleep(2000 * (i + 1));
    } finally {
      clearTimeout(t);
    }
  }
  throw lastErr;
}

async function fetchCatalog() {
  const categories = await getJson('/categories', { timeout: 90000, tries: 3 });
  const products = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const batch = await getJson(`/products?limit=100&page=${page}`);
    if (!Array.isArray(batch) || !batch.length) break;
    products.push(...batch);
    if (batch.length < 100) break;
  }
  const seen = new Set();
  return {
    categories: Array.isArray(categories) ? categories : [],
    products: products.filter((p) => p?.slug && /^[a-z0-9][a-z0-9._~-]*$/i.test(p.slug) && !seen.has(p.slug) && seen.add(p.slug)),
  };
}

const isoDate = (d) => {
  const t = d ? new Date(d) : null;
  return t && !Number.isNaN(t.getTime()) ? t.toISOString().slice(0, 10) : null;
};

function buildSitemap({ categories, products }) {
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    { loc: '/', changefreq: 'daily', priority: '1.0', lastmod: today },
    { loc: '/shop', changefreq: 'daily', priority: '0.9', lastmod: today },
    { loc: '/seller/login', changefreq: 'monthly', priority: '0.7' },
    { loc: '/track-order', changefreq: 'yearly', priority: '0.3' },
    ...categories
      .filter((c) => c.slug && (c.productCount ?? 1) > 0)
      .map((c) => ({ loc: `/shop?category=${encodeURIComponent(c.slug)}`, changefreq: 'daily', priority: '0.8', lastmod: today })),
    ...products.map((p) => ({
      loc: `/product/${p.slug}`,
      changefreq: 'weekly',
      priority: '0.6',
      lastmod: isoDate(p.updatedAt || p.createdAt),
      images: (p.images?.length ? p.images.map((i) => i.url) : [p.image]).filter((u) => /^https?:\/\//.test(u || '')).slice(0, 5),
      title: p.name,
    })),
  ];

  const body = urls
    .map((u) => {
      const parts = [`    <loc>${esc(SITE_URL + u.loc)}</loc>`];
      if (u.lastmod) parts.push(`    <lastmod>${u.lastmod}</lastmod>`);
      parts.push(`    <changefreq>${u.changefreq}</changefreq>`, `    <priority>${u.priority}</priority>`);
      for (const img of u.images || []) {
        parts.push(`    <image:image><image:loc>${esc(img)}</image:loc></image:image>`);
      }
      return `  <url>\n${parts.join('\n')}\n  </url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${body}
</urlset>
`;
}

// ---- HTML head rewriting -------------------------------------------------------------

function setAttrTag(html, re, tag) {
  return re.test(html) ? html.replace(re, tag) : html.replace('</head>', `    ${tag}\n  </head>`);
}

function withHead(html, { title, description, url, image, type, jsonLd }) {
  let out = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`);
  const metaName = (name, content) =>
    (out = setAttrTag(out, new RegExp(`<meta name="${name}" content="[^"]*"\\s*/?>`), `<meta name="${name}" content="${esc(content)}" />`));
  const metaProp = (prop, content) =>
    (out = setAttrTag(out, new RegExp(`<meta property="${prop}" content="[^"]*"\\s*/?>`), `<meta property="${prop}" content="${esc(content)}" />`));

  metaName('description', description);
  out = setAttrTag(out, /<link rel="canonical" href="[^"]*"\s*\/?>/, `<link rel="canonical" href="${esc(url)}" />`);
  metaProp('og:type', type);
  metaProp('og:title', title);
  metaProp('og:description', description);
  metaProp('og:url', url);
  metaProp('og:image', image);
  metaProp('og:image:alt', title);
  metaName('twitter:title', title);
  metaName('twitter:description', description);
  metaName('twitter:image', image);
  // the site-wide og:image size no longer applies to a product photo
  out = out.replace(/\s*<meta property="og:image:(width|height)" content="[^"]*"\s*\/?>/g, '');

  if (jsonLd) {
    const json = JSON.stringify(jsonLd).replace(/</g, '\\u003c');
    out = out.replace('</head>', `    <script type="application/ld+json" id="ld-page">${json}</script>\n  </head>`);
  }
  return out;
}

const money = (n) => `$${Number(n || 0).toFixed(2)}`;

function productPage(template, p) {
  const url = `${SITE_URL}/product/${p.slug}`;
  const images = (p.images?.length ? p.images.map((i) => i.url) : [p.image]).filter((u) => /^https?:\/\//.test(u || ''));
  const seller = p.seller?.storeName || p.sellerName;
  const brandSuffix = p.brand && !p.name.toLowerCase().includes(p.brand.toLowerCase()) ? ` — ${p.brand}` : '';
  const title = `${p.name}${brandSuffix} | Bazario`;
  const summary = `Buy ${p.name} online on Bazario for ${money(p.price)}${seller ? ` from verified seller ${seller}` : ''}. ${p.category?.name ? `${p.category.name} with express` : 'Express'} delivery, secure checkout and 14-day easy returns.`;
  const description = trimText(summary);

  const product = {
    '@type': 'Product',
    '@id': `${url}#product`,
    name: p.name,
    url,
    image: images.slice(0, 6),
    description: summary,
    sku: p.sku || p._id,
    ...(p.brand ? { brand: { '@type': 'Brand', name: p.brand } } : {}),
    ...(p.category?.name ? { category: p.category.name } : {}),
    offers: {
      '@type': 'Offer',
      url,
      priceCurrency: 'USD',
      price: Number(p.price || 0).toFixed(2),
      availability: p.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
      ...(seller ? { seller: { '@type': 'Organization', name: seller } } : {}),
    },
  };
  if (p.rating > 0 && p.numReviews > 0) {
    product.aggregateRating = { '@type': 'AggregateRating', ratingValue: Number(p.rating).toFixed(1), reviewCount: p.numReviews, bestRating: 5, worstRating: 1 };
  }
  const crumbs = [
    { name: 'Home', item: `${SITE_URL}/` },
    ...(p.category?.slug ? [{ name: p.category.name, item: `${SITE_URL}/shop?category=${encodeURIComponent(p.category.slug)}` }] : []),
    { name: p.name, item: url },
  ];
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      product,
      { '@type': 'BreadcrumbList', itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, ...c })) },
    ],
  };

  let html = withHead(template, { title, description, url, image: images[0] || `${SITE_URL}/og-image.png`, type: 'product', jsonLd });

  // Visible content in #root: what the page is about, readable without JavaScript.
  // React replaces it as soon as the app starts.
  const body = `<main class="container section" style="padding:24px 16px;max-width:1100px;margin:0 auto">
        <nav aria-label="Breadcrumb"><a href="/">Home</a>${p.category?.slug ? ` › <a href="/shop?category=${esc(encodeURIComponent(p.category.slug))}">${esc(p.category.name)}</a>` : ''}</nav>
        <h1>${esc(p.name)}</h1>
        ${images[0] ? `<img src="${esc(images[0])}" alt="${esc(p.name)}" width="400" height="400" style="max-width:100%;height:auto" />` : ''}
        <p><strong>${money(p.price)}</strong>${p.oldPrice > p.price ? ` <s>${money(p.oldPrice)}</s>` : ''} · ${p.stock > 0 ? 'In stock' : 'Out of stock'}${p.brand ? ` · Brand: ${esc(p.brand)}` : ''}${seller ? ` · Sold by ${esc(seller)}` : ''}</p>
        <p>${esc(summary)}</p>
        <p><a href="/shop">Shop all products on Bazario</a></p>
      </main>`;
  html = html.replace('<!--seo-body-->', body);
  // the site-wide <noscript> intro carries its own <h1>; the product page has one already
  html = html.replace(/\s*<noscript>[\s\S]*?<\/noscript>/, '');
  return html;
}

function withVerification(html) {
  const tags = [];
  if (process.env.GOOGLE_SITE_VERIFICATION) tags.push(`<meta name="google-site-verification" content="${esc(process.env.GOOGLE_SITE_VERIFICATION)}" />`);
  if (process.env.BING_SITE_VERIFICATION) tags.push(`<meta name="msvalidate.01" content="${esc(process.env.BING_SITE_VERIFICATION)}" />`);
  return tags.length ? html.replace('</head>', `    ${tags.join('\n    ')}\n  </head>`) : html;
}

async function main() {
  const indexPath = path.join(DIST, 'index.html');
  let template = await readFile(indexPath, 'utf8');

  // index.html is written for the production address; point it at SITE_URL when that differs
  if (SITE_URL !== DEFAULT_SITE) template = template.split(DEFAULT_SITE).join(SITE_URL);
  template = withVerification(template);
  await writeFile(indexPath, template);

  const robotsPath = path.join(DIST, 'robots.txt');
  try {
    const robots = await readFile(robotsPath, 'utf8');
    if (SITE_URL !== DEFAULT_SITE) await writeFile(robotsPath, robots.split(DEFAULT_SITE).join(SITE_URL));
  } catch {}

  let catalog = { categories: [], products: [] };
  try {
    catalog = await fetchCatalog();
    console.log(`[seo] catalog: ${catalog.categories.length} categories, ${catalog.products.length} products from ${API_URL}`);
  } catch (e) {
    console.warn(`[seo] could not load the catalog from ${API_URL} (${e.message}) — sitemap will list static pages only`);
  }

  await writeFile(path.join(DIST, 'sitemap.xml'), buildSitemap(catalog));

  let written = 0;
  for (const p of catalog.products) {
    try {
      const dir = path.join(DIST, 'product', p.slug);
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, 'index.html'), productPage(template, p));
      written++;
    } catch (e) {
      console.warn(`[seo] skipped product ${p.slug}: ${e.message}`);
    }
  }
  console.log(`[seo] sitemap.xml written; ${written} product pages pre-rendered (site: ${SITE_URL})`);
}

main().catch((e) => {
  console.warn('[seo] step failed, the build continues without it:', e.message);
});
