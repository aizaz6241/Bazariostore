import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { TERMS_MD, TERMS_VERSION } from './sellerTerms.js';

// **bold** and *italic* inside a line
function inline(text) {
  const out = [];
  const rx = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  let m;
  let k = 0;
  while ((m = rx.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    out.push(t.startsWith('**') ? <b key={k++}>{t.slice(2, -2)}</b> : <i key={k++}>{t.slice(1, -1)}</i>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// a very small reader for the terms text: headings, numbered items and paragraphs
function blocks(md) {
  const out = [];
  let list = null;
  md.split(/\n\n+/).forEach((chunk, i) => {
    const t = chunk.trim();
    if (!t) return;
    const item = t.match(/^(\d+)\.\s+([\s\S]*)$/);
    if (item && !/^\d+\.\d/.test(t)) {
      if (!list) { list = []; out.push({ type: 'ol', items: list, key: i }); }
      list.push(item[2]);
      return;
    }
    list = null;
    if (t.startsWith('### ')) out.push({ type: 'h3', text: t.slice(4), key: i });
    else if (t.startsWith('## ')) out.push({ type: 'h2', text: t.slice(3), key: i });
    else out.push({ type: 'p', text: t, key: i });
  });
  return out;
}

export default function SellerTerms() {
  return (
    <div className="st-terms">
      <div className="st-terms-card">
        <p className="st-terms-kicker">Bazario Seller Hub · Version {TERMS_VERSION}</p>
        <h1>Seller Terms &amp; Conditions</h1>
        {blocks(TERMS_MD).map((b) => {
          if (b.type === 'h2') return <h2 key={b.key}>{inline(b.text)}</h2>;
          if (b.type === 'h3') return <h3 key={b.key}>{inline(b.text)}</h3>;
          if (b.type === 'ol') return <ol key={b.key}>{b.items.map((it, j) => <li key={j}>{inline(it)}</li>)}</ol>;
          return (
            <p key={b.key}>
              {b.text.split(/ {2}\n|\n/).map((line, j, arr) => (
                <Fragment key={j}>{inline(line)}{j < arr.length - 1 && <br />}</Fragment>
              ))}
            </p>
          );
        })}
        <p className="st-terms-back"><Link to="/seller/login?mode=register">Back to seller registration</Link></p>
      </div>
    </div>
  );
}
