// ─────────────────────────────────────────────────────────────
// Bazario — build-time pre-render for SEO / GEO / AEO
// Runs after `vite build`. For every public page it writes a real HTML
// file (dist/<route>/index.html) with the right title, description,
// canonical, Open Graph and JSON-LD, plus crawlable text — so Google,
// Bing, ChatGPT, Claude, Gemini and Perplexity can read the page even
// without running JavaScript. Also writes sitemap.xml and llms.txt.
//
// Reads ONLY public storefront endpoints (/products, /categories, /content).
// It never fails the build: if the API is down it still writes the
// static pages and a sitemap without products.
// ─────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SITE, KEY_FACTS, FAQS, INFO_PAGES, abs,
  organizationLd, websiteLd, webPageLd, breadcrumbLd, faqLd, productLd,
  productTitle, productDescription, productImages, graph,
} from '../src/seo/site.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(__dirname, '../dist');
const MAX_PRODUCTS = Number(process.env.SEO_MAX_PRODUCTS || 3000);
const PAGE_SIZE = 100;
const TODAY = new Date().toISOString().slice(0, 10);

// ─── helpers ───
const esc = (s = '') =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const strip = (s = '') => String(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s);
const safeSlug = (s) => typeof s === 'string' && /^[a-z0-9][a-z0-9._~-]{0,200}$/i.test(s);
const ldScript = (data) =>
  data ? `<script type="application/ld+json" id="bz-ld">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>` : '';

function apiBase() {
  let url = process.env.VITE_API_URL || '';
  if (!url) {
    try {
      const env = readFileSync(resolve(__dirname, '../.env.production'), 'utf8');
      url = (env.match(/^\s*VITE_API_URL\s*=\s*(.+)\s*$/m) || [])[1] || '';
    } catch {}
  }
  url = (url || 'https://bazariostore.onrender.com/api').trim().replace(/["']/g, '').replace(/\/+$/, '');
  return /\/api$/.test(url) ? url : url + '/api';
}
const API = apiBase();

async function getJson(path, timeoutMs = 25000, tries = 2) {
  for (let i = 0; i < tries; i++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), i === 0 ? timeoutMs : timeoutMs * 2);
    try {
      const res = await fetch(API + path, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (e) {
      if (i === tries - 1) throw e;
    } finally {
      clearTimeout(t);
    }
  }
}

// ─── HTML pieces ───
function headHtml({ title, description, path, canonical = true, robots = 'index,follow', type = 'website', image, ld }) {
  const url = abs(path);
  const img = abs(image || SITE.ogImage);
  return [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}" />`,
    `<meta name="robots" content="${robots}" />`,
    canonical ? `<link rel="canonical" href="${esc(url)}" />` : '',
    `<meta property="og:type" content="${type}" />`,
    `<meta property="og:site_name" content="${esc(SITE.name)}" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    canonical ? `<meta property="og:url" content="${esc(url)}" />` : '',
    `<meta property="og:image" content="${esc(img)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(description)}" />`,
    `<meta name="twitter:image" content="${esc(img)}" />`,
    ldScript(ld),
  ]
    .filter(Boolean)
    .join('\n    ');
}

const NAV = `<header><nav aria-label="Main"><a href="/">Bazario</a> · <a href="/shop">Shop</a> · <a href="/dropshipping">Worldwide Dropshipping</a> · <a href="/about">About</a> · <a href="/faq">FAQ</a> · <a href="/sell-on-bazario">Sell on Bazario</a> · <a href="/track-order">Track Order</a></nav></header>`;
const FOOT = `<footer><p>${esc(SITE.name)} — ${esc(SITE.tagline)}. Operating since ${SITE.foundingYear}. <a href="/page/shipping-policy">Shipping</a> · <a href="/page/returns-policy">Returns</a> · <a href="/page/terms">Terms</a> · <a href="/page/privacy">Privacy</a></p></footer>`;

function bodyHtml(inner) {
  return `<div id="bz-static">\n${NAV}\n<main>\n${inner}\n</main>\n${FOOT}\n</div>`;
}

function infoInner(page) {
  let h = `<h1>${esc(page.h1)}</h1>\n<p>${esc(page.intro)}</p>`;
  for (const s of page.sections || []) {
    h += `\n<section><h2>${esc(s.h2)}</h2>`;
    for (const p of s.paras || []) h += `<p>${esc(p)}</p>`;
    if (s.list) h += `<ul>${s.list.map((li) => `<li>${esc(li)}</li>`).join('')}</ul>`;
    if (s.steps) h += `<ol>${s.steps.map((li) => `<li>${esc(li)}</li>`).join('')}</ol>`;
    h += `</section>`;
  }
  if (page.faq) h += faqInner(FAQS);
  return h;
}

function faqInner(list) {
  return `\n<section><h2>Frequently asked questions</h2>${list
    .map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`)
    .join('')}</section>`;
}

const productLink = (p) => `<li><a href="/product/${esc(p.slug)}">${esc(p.name)}</a>${Number(p.price) > 0 ? ` — $${Number(p.price).toFixed(2)}` : ''}</li>`;
const categoryLinks = (cats) =>
  cats.length
    ? `<section><h2>Shop by department</h2><ul>${cats
        .map((c) => `<li><a href="/shop?category=${encodeURIComponent(c.slug)}">${esc(c.name)}</a></li>`)
        .join('')}</ul></section>`
    : '';

// ─── writer ───
let template = '';
const written = [];
function writeRoute(path, head, body) {
  let html = template
    .replace(/<!--bz:seo-start-->[\s\S]*?<!--bz:seo-end-->/, `<!--bz:seo-start-->\n    ${head}\n    <!--bz:seo-end-->`)
    .replace(/<!--bz:static-start-->[\s\S]*?<!--bz:static-end-->/, `<!--bz:static-start-->${body}<!--bz:static-end-->`);
  const file = path === '/' ? join(DIST, 'index.html') : join(DIST, ...path.split('/').filter(Boolean), 'index.html');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
  written.push(path);
}

async function main() {
  const indexFile = join(DIST, 'index.html');
  if (!existsSync(indexFile)) {
    console.log('[seo] dist/index.html not found — skipping pre-render');
    return;
  }
  template = readFileSync(indexFile, 'utf8');
  if (!template.includes('<!--bz:seo-start-->') || !template.includes('<!--bz:static-start-->')) {
    console.log('[seo] SEO markers missing in index.html — skipping pre-render');
    return;
  }

  // ─── public data (all optional) ───
  let categories = [];
  let content = {};
  let products = [];
  try {
    const c = await getJson('/categories', 60000);
    categories = (Array.isArray(c) ? c : []).filter((x) => x?.slug && x?.name);
  } catch (e) {
    console.log('[seo] categories unavailable:', e.message);
  }
  try {
    content = (await getJson('/content')) || {};
  } catch (e) {
    console.log('[seo] content unavailable:', e.message);
  }
  try {
    const seen = new Set();
    for (let page = 1; products.length < MAX_PRODUCTS; page++) {
      const list = await getJson(`/products?limit=${PAGE_SIZE}&page=${page}`);
      const arr = Array.isArray(list) ? list : [];
      let added = 0;
      for (const p of arr) {
        if (!p || !safeSlug(p.slug) || seen.has(p.slug) || !p.name) continue;
        seen.add(p.slug);
        products.push(p);
        added++;
      }
      if (arr.length < PAGE_SIZE || added === 0) break;
    }
  } catch (e) {
    console.log('[seo] products unavailable:', e.message);
  }
  products = products.slice(0, MAX_PRODUCTS);

  const homeLd = graph(
    organizationLd(),
    websiteLd(),
    webPageLd({ path: '/', title: SITE.defaultTitle, description: SITE.defaultDescription })
  );

  // ─── Home (also the SPA fallback → no canonical / og:url in raw HTML) ───
  writeRoute(
    '/',
    headHtml({ title: SITE.defaultTitle, description: SITE.defaultDescription, path: '/', canonical: false, ld: homeLd }),
    bodyHtml(
      `<h1>Bazario — Global Dropshipping Marketplace, Direct from China to the USA, Canada, Australia, UK &amp; Europe</h1>
<p>${esc(SITE.defaultDescription)}</p>
<ul>${KEY_FACTS.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
${categoryLinks(categories)}
${products.length ? `<section><h2>Popular products</h2><ul>${products.slice(0, 24).map(productLink).join('')}</ul><p><a href="/shop">View all products</a></p></section>` : ''}
${faqInner(FAQS.slice(0, 6))}`
    )
  );

  // ─── Shop ───
  const shopTitle = 'Shop All Products — Direct from China, Shipped Worldwide | Bazario';
  const shopDesc =
    'Browse the Bazario marketplace — products sourced direct from China and shipped to the USA, Canada, Australia, UK & Europe. Verified sellers, verified reviews, tracked delivery and 14-day returns.';
  writeRoute(
    '/shop',
    headHtml({
      title: shopTitle,
      description: shopDesc,
      path: '/shop',
      canonical: false, // /shop?category=… share this file; the app sets the exact canonical
      ld: graph(webPageLd({ path: '/shop', title: shopTitle, description: shopDesc, type: 'CollectionPage' }), breadcrumbLd([{ name: 'Shop', path: '/shop' }])),
    }),
    bodyHtml(
      `<h1>Shop all products</h1><p>${esc(shopDesc)}</p>${categoryLinks(categories)}${
        products.length ? `<section><h2>Products</h2><ul>${products.slice(0, 300).map(productLink).join('')}</ul></section>` : ''
      }`
    )
  );

  // ─── Info pages ───
  for (const [key, page] of Object.entries(INFO_PAGES)) {
    const nodes = [
      webPageLd({ path: page.path, title: page.title, description: page.description, type: key === 'about' ? 'AboutPage' : 'WebPage' }),
      breadcrumbLd([{ name: page.h1, path: page.path }]),
    ];
    if (page.faq) nodes.push(faqLd(FAQS));
    if (key === 'about') nodes.push(organizationLd());
    writeRoute(page.path, headHtml({ title: page.title, description: page.description, path: page.path, ld: graph(...nodes) }), bodyHtml(infoInner(page)));
  }

  // ─── Track order ───
  {
    const title = 'Track Your Order — Real-Time Order Tracking | Bazario';
    const desc =
      'Track your Bazario order step by step — confirmed, processing, packed, out from warehouse, out for delivery and delivered. Worldwide shipping to the USA, Canada, Australia, UK and Europe.';
    writeRoute(
      '/track-order',
      headHtml({ title, description: desc, path: '/track-order', ld: graph(webPageLd({ path: '/track-order', title, description: desc }), breadcrumbLd([{ name: 'Track Order', path: '/track-order' }])) }),
      bodyHtml(`<h1>Track your order</h1><p>${esc(desc)}</p><p>Enter your order number on this page to see every step of your delivery. Need help? Use the live chat on any page.</p>`)
    );
  }

  // ─── Policy pages (/page/:key) from the public CMS content ───
  const policyPaths = [];
  for (const [key, page] of Object.entries(content.pages || {})) {
    if (!safeSlug(key) || !page?.title || !page?.body) continue;
    const path = `/page/${key}`;
    const desc = clip(strip(page.body), 155);
    writeRoute(
      path,
      headHtml({ title: `${page.title} | Bazario`, description: desc, path, ld: graph(webPageLd({ path, title: page.title, description: desc }), breadcrumbLd([{ name: page.title, path }])) }),
      bodyHtml(`<h1>${esc(page.title)}</h1>${String(page.body).split(/\n\s*\n/).map((p) => `<p>${esc(p.trim())}</p>`).join('')}`)
    );
    policyPaths.push(path);
  }

  // ─── Products ───
  for (const p of products) {
    const path = `/product/${p.slug}`;
    const imgs = productImages(p);
    const desc = strip(p.description || p.shortDescription || '');
    const seller = p.seller?.storeName || p.sellerName || '';
    const crumbs = [
      { name: 'Shop', path: '/shop' },
      ...(p.category?.slug && p.category?.name ? [{ name: p.category.name, path: `/shop?category=${p.category.slug}` }] : []),
      { name: p.name, path },
    ];
    writeRoute(
      path,
      headHtml({
        title: productTitle(p),
        description: productDescription(p),
        path,
        type: 'product',
        image: imgs[0],
        ld: graph(productLd(p, path), breadcrumbLd(crumbs)),
      }),
      bodyHtml(
        `<p><a href="/shop">Shop</a>${p.category?.slug ? ` › <a href="/shop?category=${encodeURIComponent(p.category.slug)}">${esc(p.category.name)}</a>` : ''}</p>
<h1>${esc(p.name)}</h1>
${imgs[0] ? `<img src="${esc(imgs[0])}" alt="${esc(p.name)}" width="480" />` : ''}
${Number(p.price) > 0 ? `<p><strong>Price: $${Number(p.price).toFixed(2)} USD</strong>${Number(p.oldPrice) > Number(p.price) ? ` (was $${Number(p.oldPrice).toFixed(2)})` : ''} — ${p.stock > 0 ? 'In stock' : 'Out of stock'}</p>` : ''}
${p.brand ? `<p>Brand: ${esc(p.brand)}</p>` : ''}${seller ? `<p>Sold by: ${esc(seller)} (verified Bazario seller)</p>` : ''}
${desc ? `<section><h2>Description</h2><p>${esc(clip(desc, 2000))}</p></section>` : ''}
<section><h2>Shipping &amp; returns</h2><p>Sourced direct from China and shipped worldwide to the USA, Canada, Australia, the UK and Europe. Every order is tracked and covered by ${SITE.returnDays}-day easy returns.</p></section>`
      )
    );
  }

  // ─── sitemap.xml ───
  const urls = [
    { loc: '/', pri: '1.0', freq: 'daily' },
    { loc: '/shop', pri: '0.9', freq: 'daily' },
    { loc: '/dropshipping', pri: '0.9', freq: 'monthly' },
    { loc: '/about', pri: '0.8', freq: 'monthly' },
    { loc: '/faq', pri: '0.8', freq: 'monthly' },
    { loc: '/sell-on-bazario', pri: '0.7', freq: 'monthly' },
    { loc: '/track-order', pri: '0.5', freq: 'monthly' },
    ...categories.map((c) => ({ loc: `/shop?category=${encodeURIComponent(c.slug)}`, pri: '0.8', freq: 'daily' })),
    ...policyPaths.map((loc) => ({ loc, pri: '0.4', freq: 'yearly' })),
    ...products.map((p) => ({
      loc: `/product/${p.slug}`,
      pri: '0.7',
      freq: 'weekly',
      lastmod: (p.updatedAt || p.createdAt || '').slice(0, 10) || TODAY,
      images: productImages(p).slice(0, 5),
      title: p.name,
    })),
  ];
  const xmlEsc = (s) => esc(s).replace(/'/g, '&apos;');
  const sitemap =
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n` +
    urls
      .map(
        (u) =>
          `  <url><loc>${xmlEsc(abs(u.loc))}</loc><lastmod>${u.lastmod || TODAY}</lastmod><changefreq>${u.freq}</changefreq><priority>${u.pri}</priority>${(u.images || [])
            .map((i) => `<image:image><image:loc>${xmlEsc(i)}</image:loc></image:image>`)
            .join('')}</url>`
      )
      .join('\n') +
    `\n</urlset>\n`;
  writeFileSync(join(DIST, 'sitemap.xml'), sitemap);

  // ─── llms.txt (summary for AI assistants) ───
  const llms = `# Bazario

> ${SITE.defaultDescription}

Website: ${SITE.url}
Founded: ${SITE.foundingYear}
Type: Global multi-vendor marketplace and dropshipping platform
Ships from: China (direct from manufacturers and suppliers)
Main markets: United States, Canada, Australia, United Kingdom, Europe (EU)

## Key facts
${KEY_FACTS.map((f) => `- ${f}`).join('\n')}

## Main pages
- [Shop all products](${abs('/shop')}): the full Bazario catalogue
- [Worldwide dropshipping](${abs('/dropshipping')}): how dropshipping from China to the USA, Canada, Australia, UK and Europe works
- [About Bazario](${abs('/about')}): who we are, operating since ${SITE.foundingYear}
- [FAQ](${abs('/faq')}): is Bazario legit, shipping, delivery time, tracking, returns
- [Sell on Bazario](${abs('/sell-on-bazario')}): start a dropshipping store with no inventory
- [Track your order](${abs('/track-order')}): real-time order tracking
${policyPaths.map((p) => `- [${(content.pages?.[p.split('/').pop()]?.title) || p}](${abs(p)})`).join('\n')}
${categories.length ? `\n## Departments\n${categories.map((c) => `- [${c.name}](${abs('/shop?category=' + encodeURIComponent(c.slug))})`).join('\n')}\n` : ''}
## Frequently asked questions
${FAQS.map((f) => `### ${f.q}\n${f.a}`).join('\n\n')}
${products.length ? `\n## Popular products\n${products.slice(0, 50).map((p) => `- [${p.name}](${abs('/product/' + p.slug)})${Number(p.price) > 0 ? ` — $${Number(p.price).toFixed(2)}` : ''}`).join('\n')}\n` : ''}`;
  writeFileSync(join(DIST, 'llms.txt'), llms);

  console.log(
    `[seo] pre-rendered ${written.length} pages (${products.length} products, ${categories.length} categories, ${policyPaths.length} policy pages); sitemap.xml with ${urls.length} URLs; llms.txt written`
  );
}

main().catch((e) => {
  // Never break the deploy because of SEO
  console.log('[seo] pre-render skipped:', e?.message || e);
});
