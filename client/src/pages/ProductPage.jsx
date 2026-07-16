import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, money } from '../api.js';
import { useCart } from '../cart.jsx';
import Ic from '../components/Icons.jsx';
import Stars from '../components/Stars.jsx';
import ProductCard from '../components/ProductCard.jsx';
import { Breadcrumb, TrustStrip } from '../components/Bits.jsx';

const TABS = ['DESCRIPTION', 'HOW TO USE', 'INGREDIENTS', 'SPECIFICATIONS', 'REVIEWS', 'SHIPPING & RETURNS'];

const SAMPLE_REVIEWS = [
  { name: 'Ayesha K.', rating: 5, text: 'Original product, exactly as described. Delivery was fast and packaging was excellent. Highly recommended!' },
  { name: 'Fatima R.', rating: 4.5, text: 'Very happy with my purchase. My skin feels so much better after regular use. Will order again InshaAllah.' },
  { name: 'Hina S.', rating: 4, text: 'Good quality and reasonable price compared to other stores. Cash on delivery made it very easy.' },
];

export default function ProductPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { add } = useCart();

  const [p, setP] = useState(null);
  const [related, setRelated] = useState([]);
  const [notFound, setNotFound] = useState(false);
  const [imgIdx, setImgIdx] = useState(0);
  const [size, setSize] = useState('');
  const [variantSel, setVariantSel] = useState({});
  const [qty, setQty] = useState(1);
  const [tab, setTab] = useState(0);
  const [liked, setLiked] = useState(false);
  const relRef = useRef(null);

  useEffect(() => {
    setNotFound(false);
    setImgIdx(0);
    setQty(1);
    setTab(0);
    setVariantSel({});
    api(`/products/slug/${slug}`)
      .then((prod) => {
        setP(prod);
        setSize(prod.sizes?.[0]?.label || '');
      })
      .catch(() => setNotFound(true));
    api(`/products/related/${slug}`).then(setRelated).catch(() => {});
  }, [slug]);

  if (notFound)
    return (
      <div className="container section empty-box">
        <p>Product not found.</p>
        <Link to="/shop" className="btn-primary">BACK TO SHOP</Link>
      </div>
    );
  if (!p) return <div className="container section center muted">Loading…</div>;

  const gallery = p.images?.length > 1 ? p.images.map((i) => i.url) : p.gallery?.length ? p.gallery : [p.image, p.image, p.image, p.image];
  const activePrice = size && p.sizes?.length ? p.sizes.find((s) => s.label === size)?.price ?? p.price : p.price;
  const off = p.oldPrice ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;
  const out = p.stock <= 0;
  const low = !out && p.stock <= (p.lowStockThreshold || 5);
  const variantStr = Object.entries(variantSel).map(([k, v]) => `${k}: ${v}`).join(', ');

  const doAdd = () => add(p, qty, size, variantStr);
  const buyNow = () => {
    doAdd();
    navigate('/checkout');
  };

  const scrollRel = (dir) => relRef.current?.scrollBy({ left: dir * 480, behavior: 'smooth' });

  return (
    <>
      <div className="container">
        <Breadcrumb
          trail={[
            ...(p.category ? [{ label: p.category.name, to: `/shop?category=${p.category.slug}` }] : []),
            { label: p.name },
          ]}
        />

        <div className="pdp">
          <div className="pdp-gallery">
            <div className="pdp-thumbs">
              {gallery.map((g, i) => (
                <button key={i} className={'pdp-thumb' + (i === imgIdx ? ' on' : '')} onClick={() => setImgIdx(i)}>
                  <img src={g} alt="" />
                </button>
              ))}
            </div>
            <div className="pdp-main">
              {off > 0 && <span className="pdp-off">-{off}%</span>}
              <img src={gallery[imgIdx]} alt={p.name} />
            </div>
          </div>

          <div className="pdp-info">
            <h1>{p.name}</h1>
            <div className="pdp-rating">
              <Stars value={p.rating} />
              <span className="muted">({p.numReviews} Reviews)</span>
              <em>|</em>
              <span className="muted">{p.sold} Sold</span>
              <em>|</em>
              {out ? (
                <span className="stock-out">Out of Stock</span>
              ) : low ? (
                <span className="stock-low">Only {p.stock} left!</span>
              ) : (
                <span className="stock-ok">In Stock</span>
              )}
            </div>
            <div className="pdp-price">
              <b>{money(activePrice)}</b>
              {p.oldPrice && <s>{money(p.oldPrice)}</s>}
              {off > 0 && <span className="off-chip">{off}% OFF</span>}
            </div>
            <p className="pdp-short">{p.shortDescription}</p>

            {p.highlights?.length > 0 && (
              <div className="pdp-highlights">
                {p.highlights.map((h) => (
                  <span key={h.label} className="pdp-hl">
                    <i><Ic name={h.icon} size={17} /></i> {h.label}
                  </span>
                ))}
              </div>
            )}

            {p.sizes?.length > 0 && (
              <div className="pdp-sizes">
                <span className="pdp-lbl">Size: {size}</span>
                <div>
                  {p.sizes.map((s) => (
                    <button key={s.label} className={'size-btn' + (size === s.label ? ' on' : '')} onClick={() => setSize(s.label)}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {(p.variants || []).map((v) => (
              <div className="pdp-sizes" key={v.name}>
                <span className="pdp-lbl">{v.name}: {variantSel[v.name] || ''}</span>
                <div>
                  {v.options.map((o) => (
                    <button
                      key={o}
                      className={'size-btn' + (variantSel[v.name] === o ? ' on' : '')}
                      onClick={() => setVariantSel({ ...variantSel, [v.name]: o })}
                    >
                      {o}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            <div className="pdp-qty">
              <span className="pdp-lbl">Quantity:</span>
              <div className="qty-box">
                <button onClick={() => setQty(Math.max(1, qty - 1))} aria-label="Decrease"><Ic name="minus" size={14} /></button>
                <span>{qty}</span>
                <button onClick={() => setQty(Math.min(20, qty + 1))} aria-label="Increase"><Ic name="plus" size={14} /></button>
              </div>
            </div>

            <div className="pdp-cta">
              <button className="btn-primary btn-block" onClick={doAdd} disabled={out}>{out ? 'OUT OF STOCK' : 'ADD TO CART'}</button>
              <button className={'btn-wish-lg' + (liked ? ' liked' : '')} onClick={() => setLiked(!liked)} aria-label="Wishlist">
                <Ic name="heart" size={19} />
              </button>
            </div>
            <button className="btn-buynow btn-block" onClick={buyNow} disabled={out}>BUY NOW</button>

            <div className="pdp-trust">
              {[
                { icon: 'badgeCheck', t: '100% Original', s: 'Products' },
                { icon: 'banknote', t: 'Cash on', s: 'Delivery' },
                { icon: 'truck', t: 'Fast Delivery', s: 'Across Pakistan' },
                { icon: 'refresh', t: 'Easy Returns', s: '& Refunds' },
              ].map((f) => (
                <div key={f.t}><i><Ic name={f.icon} size={19} /></i><span>{f.t}<br />{f.s}</span></div>
              ))}
            </div>
          </div>
        </div>

        <div className="pdp-tabs-card">
          <div className="pdp-tabs">
            {TABS.map((t, i) => (
              <button key={t} className={i === tab ? 'on' : ''} onClick={() => setTab(i)}>
                {t === 'REVIEWS' ? `REVIEWS (${p.numReviews})` : t}
              </button>
            ))}
          </div>
          <div className="pdp-tab-body">
            {tab === 0 && (
              <div className="pdp-desc">
                <div>
                  <p>{p.description}</p>
                  <ul className="check-list">
                    {p.bullets?.map((b) => (
                      <li key={b}><Ic name="check" size={15} /> {b}</li>
                    ))}
                  </ul>
                </div>
                <div className="pdp-desc-img"><img src={p.image} alt="" /></div>
              </div>
            )}
            {tab === 1 && <p className="tab-text">{p.howToUse}</p>}
            {tab === 2 && <p className="tab-text">{p.ingredients}</p>}
            {tab === 3 && (
              <table className="spec-table">
                <tbody>
                  {(p.specifications?.length ? p.specifications : [{ key: 'Brand', value: p.brand }]).map((s, i) => (
                    <tr key={i}><td>{s.key}</td><td>{s.value}</td></tr>
                  ))}
                  {p.sku && <tr><td>SKU</td><td>{p.sku}</td></tr>}
                  {p.weight && <tr><td>Weight / Size</td><td>{p.weight}</td></tr>}
                  {p.dimensions && <tr><td>Dimensions</td><td>{p.dimensions}</td></tr>}
                </tbody>
              </table>
            )}
            {tab === 4 && (
              <div className="reviews">
                {SAMPLE_REVIEWS.map((r) => (
                  <div className="review" key={r.name}>
                    <div className="review-head">
                      <span className="review-av">{r.name[0]}</span>
                      <div><b>{r.name}</b><Stars value={r.rating} /></div>
                      <span className="verified"><Ic name="badgeCheck" size={13} /> Verified Purchase</span>
                    </div>
                    <p>{r.text}</p>
                  </div>
                ))}
              </div>
            )}
            {tab === 5 && (
              <div className="tab-text">
                <p><b>Shipping:</b> Standard delivery takes 3–5 business days anywhere in Pakistan. Express delivery (1–2 business days) is available at checkout.</p>
                <p><b>Cash on Delivery:</b> Pay in cash when your order arrives at your doorstep — no advance payment needed.</p>
                <p><b>Returns:</b> You can return unopened products within 7 days of delivery for a full refund or exchange. Contact our support team via the chat widget.</p>
              </div>
            )}
          </div>
        </div>

        {related.length > 0 && (
          <section className="section">
            <div className="section-title with-arrows">
              <h2>YOU MAY ALSO LIKE</h2>
              <span className="title-line" />
              <div className="rel-arrows">
                <button onClick={() => scrollRel(-1)} aria-label="Scroll left"><Ic name="chevLeft" size={17} /></button>
                <button onClick={() => scrollRel(1)} aria-label="Scroll right"><Ic name="chevRight" size={17} /></button>
              </div>
            </div>
            <div className="rel-row" ref={relRef}>
              {related.map((r) => (
                <div className="rel-item" key={r._id}><ProductCard p={r} /></div>
              ))}
            </div>
          </section>
        )}
      </div>
      <TrustStrip />
    </>
  );
}
