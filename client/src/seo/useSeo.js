import { useEffect } from 'react';
import { SITE, abs } from './site.js';

// Keeps <title>, meta description, canonical, Open Graph / Twitter tags,
// robots and the page's JSON-LD (script#bz-ld) in sync with the current page.
// Google renders JavaScript, so every route gets its own correct tags.

function setMeta(attr, key, value) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (value == null || value === '') {
    if (el) el.remove();
    return;
  }
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', value);
}

function setCanonical(href) {
  let el = document.head.querySelector('link[rel="canonical"]');
  if (!href) {
    if (el) el.remove();
    return;
  }
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

function setJsonLd(data) {
  let el = document.getElementById('bz-ld');
  if (!data) {
    if (el) el.textContent = '';
    return;
  }
  if (!el) {
    el = document.createElement('script');
    el.type = 'application/ld+json';
    el.id = 'bz-ld';
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(data);
}

export function applySeo({ title, description, path, image, type = 'website', robots = 'index,follow', ld = null, noCanonical = false } = {}) {
  if (typeof document === 'undefined') return;
  const t = title || SITE.defaultTitle;
  const d = description || SITE.defaultDescription;
  const url = path != null ? abs(path) : null;
  const img = abs(image || SITE.ogImage);

  document.title = t;
  setMeta('name', 'description', d);
  setMeta('name', 'robots', robots);
  setCanonical(noCanonical ? null : url);

  setMeta('property', 'og:type', type);
  setMeta('property', 'og:site_name', SITE.name);
  setMeta('property', 'og:title', t);
  setMeta('property', 'og:description', d);
  setMeta('property', 'og:url', url);
  setMeta('property', 'og:image', img);
  setMeta('name', 'twitter:card', 'summary_large_image');
  setMeta('name', 'twitter:title', t);
  setMeta('name', 'twitter:description', d);
  setMeta('name', 'twitter:image', img);

  setJsonLd(ld);
}

export default function useSeo(opts) {
  const key = opts ? JSON.stringify(opts) : '';
  useEffect(() => {
    if (opts) applySeo(opts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
