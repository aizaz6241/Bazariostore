import { Link } from 'react-router-dom';
import { Breadcrumb, TrustStrip } from '../components/Bits.jsx';
import useSeo from '../seo/useSeo.js';
import { INFO_PAGES, FAQS, KEY_FACTS, webPageLd, breadcrumbLd, faqLd, organizationLd, graph } from '../seo/site.js';
import '../styles/seo.css';

// Public, indexable info pages: /about, /dropshipping, /sell-on-bazario, /faq
// Content lives in seo/site.js so the pre-rendered HTML and this page always match.

const PAGE_TYPE = { about: 'AboutPage', faq: 'FAQPage' };

export const INFO_LINKS = [
  { to: '/about', label: 'About Bazario' },
  { to: '/dropshipping', label: 'Worldwide Dropshipping' },
  { to: '/sell-on-bazario', label: 'Sell on Bazario' },
  { to: '/faq', label: 'FAQ' },
];

export function FaqList({ items }) {
  return (
    <div className="seo-faq">
      {items.map((f) => (
        <details key={f.q} className="seo-faq-item">
          <summary>{f.q}</summary>
          <p>{f.a}</p>
        </details>
      ))}
    </div>
  );
}

export default function InfoPage({ pageKey }) {
  const page = INFO_PAGES[pageKey];

  const nodes = [
    webPageLd({ path: page.path, title: page.title, description: page.description, type: page.faq ? 'WebPage' : PAGE_TYPE[pageKey] || 'WebPage' }),
    breadcrumbLd([{ name: page.h1, path: page.path }]),
  ];
  if (page.faq) nodes.push(faqLd(FAQS));
  if (pageKey === 'about') nodes.push(organizationLd());

  useSeo({ title: page.title, description: page.description, path: page.path, ld: graph(...nodes) });

  return (
    <>
      <div className="page-head">
        <div className="container">
          <Breadcrumb trail={[{ label: page.h1 }]} />
          <h1 className="page-title">{page.h1}</h1>
        </div>
      </div>

      <div className="container section seo-page">
        <p className="seo-lead">{page.intro}</p>

        {pageKey === 'about' && (
          <ul className="seo-facts">
            {KEY_FACTS.map((f) => <li key={f}>{f}</li>)}
          </ul>
        )}

        {(page.sections || []).map((s) => (
          <section key={s.h2} className="seo-block">
            <h2>{s.h2}</h2>
            {(s.paras || []).map((p, i) => <p key={i}>{p}</p>)}
            {s.list && <ul>{s.list.map((li) => <li key={li}>{li}</li>)}</ul>}
            {s.steps && <ol className="seo-steps">{s.steps.map((li) => <li key={li}>{li}</li>)}</ol>}
          </section>
        ))}

        {page.faq && <FaqList items={FAQS} />}

        <div className="seo-cta-row">
          {page.cta ? (
            <Link to={page.cta.to} className="btn-primary">{page.cta.label}</Link>
          ) : (
            <Link to="/shop" className="btn-primary">Shop the marketplace</Link>
          )}
          <Link to="/track-order" className="btn-outline">Track an order</Link>
        </div>

        <nav className="seo-related" aria-label="More about Bazario">
          {INFO_LINKS.filter((l) => l.to !== page.path).map((l) => (
            <Link key={l.to} to={l.to}>{l.label} →</Link>
          ))}
        </nav>
      </div>
      <TrustStrip />
    </>
  );
}
