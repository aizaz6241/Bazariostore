import { useParams, Link } from 'react-router-dom';
import { useContent } from '../content.jsx';
import { Breadcrumb, TrustStrip } from '../components/Bits.jsx';
import useSeo from '../seo/useSeo.js';
import { webPageLd, breadcrumbLd, graph } from '../seo/site.js';

export default function PolicyPage() {
  const { key } = useParams();
  const { content, loading } = useContent();
  const page = content.pages?.[key];
  const seoPath = `/page/${key}`;
  const seoDesc = page?.body
    ? page.body.replace(/\s+/g, ' ').trim().slice(0, 155)
    : 'Bazario marketplace policies — shipping, returns, terms and privacy.';
  useSeo(
    loading
      ? null
      : {
          title: page ? `${page.title} | Bazario` : 'Page not found | Bazario',
          description: seoDesc,
          path: seoPath,
          robots: page ? 'index,follow' : 'noindex,follow',
          ld: page ? graph(webPageLd({ path: seoPath, title: page.title, description: seoDesc }), breadcrumbLd([{ name: page.title, path: seoPath }])) : null,
        }
  );

  if (loading) return <div className="container section center muted">Loading…</div>;
  if (!page)
    return (
      <div className="container section empty-box">
        <p>Page not found.</p>
        <Link to="/" className="btn-primary">GO HOME</Link>
      </div>
    );

  return (
    <>
      <div className="page-head">
        <div className="container">
          <Breadcrumb trail={[{ label: page.title }]} />
          <h1 className="page-title">{page.title}</h1>
        </div>
      </div>
      <div className="container section policy-body">
        {page.body.split('\n\n').map((para, i) => (
          <p key={i}>
            {para.split('\n').map((line, j) => (
              <span key={j}>{line}<br /></span>
            ))}
          </p>
        ))}
      </div>
      <TrustStrip />
    </>
  );
}
