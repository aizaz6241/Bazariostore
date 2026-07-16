import { useParams, Link } from 'react-router-dom';
import { useContent } from '../content.jsx';
import { Breadcrumb, TrustStrip } from '../components/Bits.jsx';

export default function PolicyPage() {
  const { key } = useParams();
  const { content, loading } = useContent();
  const page = content.pages?.[key];

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
