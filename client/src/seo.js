import { useEffect } from 'react';

// Per-page <head> tags (title, description, canonical, Open Graph, structured data).
// The static defaults live in index.html; product pages are also pre-rendered at build time
// (scripts/seo-build.mjs) so crawlers that don't run JavaScript still get the right tags.

export const SITE_URL = (import.meta.env.VITE_SITE_URL || 'https://bazariomarketplace.vercel.app').replace(/\/+$/, '');
export const SITE_NAME = 'Bazario';
export const DEFAULT_TITLE = 'Bazario Marketplace — Shop Online & Start Dropshipping Without Inventory';
export const DEFAULT_DESCRIPTION =
  'Bazario is a global multi-vendor marketplace and dropshipping platform. Shop thousands of products from verified sellers with express delivery, secure checkout and 14-day returns — or open your own store and sell without holding inventory.';
export const DEFAULT_IMAGE = `${SITE_URL}/og-image.png`;

function upsert(selector, create, attrs) {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = create();
    document.head.appendChild(el);
  }
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
}

const meta = (attr, key, content) =>
  upsert(`meta[${attr}="${key}"]`, () => {
    const m = document.createElement('meta');
    m.setAttribute(attr, key);
    return m;
  }, { content });

export function absoluteUrl(pathOrUrl) {
  if (!pathOrUrl) return SITE_URL + '/';
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return SITE_URL + (pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`);
}

export function trimText(text, max = 158) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 20)).replace(/[,.;:\s-]+$/, '') + '…';
}

export function applySeo({ title, description, path, image, type = 'website', jsonLd, noindex = false } = {}) {
  const fullTitle = title ? (title.includes('Bazario') ? title : `${title} | Bazario`) : DEFAULT_TITLE;
  const desc = trimText(description || DEFAULT_DESCRIPTION);
  const url = absoluteUrl(path ?? window.location.pathname);
  const img = absoluteUrl(image || DEFAULT_IMAGE);

  document.title = fullTitle;
  meta('name', 'description', desc);
  meta('name', 'robots', noindex ? 'noindex, follow' : 'index, follow, max-image-preview:large, max-snippet:-1');
  upsert('link[rel="canonical"]', () => {
    const l = document.createElement('link');
    l.setAttribute('rel', 'canonical');
    return l;
  }, { href: url });

  meta('property', 'og:type', type);
  meta('property', 'og:title', fullTitle);
  meta('property', 'og:description', desc);
  meta('property', 'og:url', url);
  meta('property', 'og:image', img);
  meta('name', 'twitter:title', fullTitle);
  meta('name', 'twitter:description', desc);
  meta('name', 'twitter:image', img);

  const existing = document.getElementById('ld-page');
  if (existing) existing.remove();
  if (jsonLd) {
    const s = document.createElement('script');
    s.type = 'application/ld+json';
    s.id = 'ld-page';
    const data = Array.isArray(jsonLd)
      ? { '@context': 'https://schema.org', '@graph': jsonLd }
      : { '@context': 'https://schema.org', ...jsonLd };
    s.textContent = JSON.stringify(data).replace(/</g, '\\u003c');
    document.head.appendChild(s);
  }
}

// deps: pass the values the tags are built from so they update when data arrives
export function useSeo(opts, deps = []) {
  useEffect(() => {
    if (opts) applySeo(opts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export function breadcrumbLd(items) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: absoluteUrl(it.path),
    })),
  };
}

export function productLd(p) {
  const images = (p.images?.length ? p.images.map((i) => i.url) : [p.image]).filter(Boolean).slice(0, 6);
  const sellerName = p.seller?.storeName || p.sellerName;
  const url = absoluteUrl(`/product/${p.slug}`);
  const ld = {
    '@type': 'Product',
    '@id': `${url}#product`,
    name: p.name,
    url,
    image: images,
    description: trimText(p.description || p.shortDescription || `${p.name}${p.brand ? ` by ${p.brand}` : ''} — available on Bazario marketplace.`, 500),
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
      ...(sellerName ? { seller: { '@type': 'Organization', name: sellerName } } : {}),
    },
  };
  if (p.rating > 0 && p.numReviews > 0) {
    ld.aggregateRating = { '@type': 'AggregateRating', ratingValue: Number(p.rating).toFixed(1), reviewCount: p.numReviews, bestRating: 5, worstRating: 1 };
  }
  return ld;
}
