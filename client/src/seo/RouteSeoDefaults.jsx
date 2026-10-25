import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { applySeo } from './useSeo.js';
import { SITE, webPageLd, breadcrumbLd, graph } from './site.js';

// Pages that manage their own SEO with useSeo() — left alone here.
const SELF_MANAGED = [/^\/$/, /^\/shop\/?$/, /^\/product\//, /^\/page\//, /^\/about\/?$/, /^\/faq\/?$/, /^\/dropshipping\/?$/, /^\/sell-on-bazario\/?$/];

// Private / transactional screens: never indexed.
const PRIVATE = [
  /^\/admin/, /^\/seller/, /^\/sellers/, /^\/account/, /^\/cart/, /^\/checkout/, /^\/order-success/,
  /^\/login/, /^\/register/, /^\/forgot-password/, /^\/reset-password/,
];

const TRACK = {
  path: '/track-order',
  title: 'Track Your Order — Real-Time Order Tracking | Bazario',
  description:
    'Track your Bazario order step by step — confirmed, processing, packed, out from warehouse, out for delivery and delivered. Worldwide shipping to the USA, Canada, Australia, UK and Europe.',
};

export default function RouteSeoDefaults() {
  const { pathname } = useLocation();

  useEffect(() => {
    if (SELF_MANAGED.some((r) => r.test(pathname))) return;

    if (pathname.startsWith('/track-order')) {
      applySeo({
        ...TRACK,
        ld: graph(webPageLd(TRACK), breadcrumbLd([{ name: 'Track Order', path: TRACK.path }])),
      });
      return;
    }

    if (PRIVATE.some((r) => r.test(pathname))) {
      const portal = /^\/(admin|seller|sellers)/.test(pathname);
      applySeo({
        title: portal ? SITE.name : `${SITE.name} — Global Dropshipping Marketplace`,
        robots: portal ? 'noindex,nofollow' : 'noindex,follow',
        noCanonical: true,
        ld: null,
      });
    }
  }, [pathname]);

  return null;
}
