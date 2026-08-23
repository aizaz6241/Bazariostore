import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useCart } from '../cart.jsx';
import { useCurrency } from '../context/CurrencyContext.jsx';
import Ic from '../components/Icons.jsx';
import Stars from '../components/Stars.jsx';
import ProductCard from '../components/ProductCard.jsx';
import { Breadcrumb, TrustStrip } from '../components/Bits.jsx';

const TABS = ['DESCRIPTION', 'HOW TO USE', 'INGREDIENTS', 'SPECIFICATIONS', 'REVIEWS', 'SHIPPING & RETURNS'];

const SAMPLE_REVIEWS = [
  { name: 'Ahmad K.', rating: 5, text: '100% Original and authentic product! Arrived in 2 days via Express Prime shipping. Packaging was great.' },
  { name: 'Fatima R.', rating: 4.5, text: 'Very happy with my order. Seller dispatched the item immediately with real tracking code.' },
  { name: 'Usman S.', rating: 5, text: 'Top quality and reasonable price. Cash on delivery was smooth and driver was polite.' },
];

export default function ProductPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { add } = useCart();
  const { formatMoney } = useCurrency();

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
  if (!p) return <div className="container section center muted">Loading product details…</div>;

  const gallery = p.images?.length > 1 ? p.images.map((i) => i.url) : p.gallery?.length ? p.gallery : [p.image || '/img/products/serum.svg'];
  const activePrice = size && p.sizes?.length ? p.sizes.find((s) => s.label === size)?.price ?? p.price : p.price;
  const off = p.oldPrice ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;
  const out = p.stock <= 0;
  const low = !out && p.stock <= (p.lowStockThreshold || 5);
  const variantStr = Object.entries(variantSel).map(([k, v]) => `${k}: ${v}`).join(', ');
  const sellerName = p.seller?.storeName || p.sellerName || 'Amazon Verified Store';

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
          {/* Image Gallery */}
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

          {/* Product Meta & Actions */}
          <div className="pdp-info">
            {/* Seller Information Tag */}
            <div className="pdp-seller-box">
              <div className="pdp-seller-left">
                <span className="pdp-sold-by">Sold & Fulfilled by:</span>
                <Link to={`/shop?seller=${p.seller?._id || ''}`} className="pdp-seller-title">
                  <b>{sellerName}</b> <span className="badge-verified">✓ Verified Merchant</span>
                </Link>
                <div className="seller-rating-line">
                  ⭐ {p.seller?.rating || '4.9'} / 5.0 • {p.seller?.numReviews || 84} Store Ratings
                </div>
              </div>
              <Link to={`/shop?seller=${p.seller?._id || ''}`} className="btn-visit-store">
                Visit Store →
              </Link>
            </div>

            <h1>{p.name}</h1>
            <div className="pdp-rating">
              <Stars value={p.rating || 4.8} />
              <span className="muted">({p.numReviews || 35} Verified Customer Reviews)</span>
              <em>|</em>
              <span className="muted">{p.sold || 40} Sold</span>
              <em>|</em>
              {out ? (
                <span className="stock-out">Out of Stock</span>
              ) : low ? (
                <span className="stock-low">Only {p.stock} units left in stock!</span>
              ) : (
                <span className="stock-ok">In Stock ({p.stock} available)</span>
              )}
            </div>

            <div className="pdp-price">
              <b>{formatMoney(activePrice)}</b>
              {p.oldPrice && <s>{formatMoney(p.oldPrice)}</s>}
              {off > 0 && <span className="off-chip">-{off}%</span>}
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
                <span className="pdp-lbl">Size / Option: {size}</span>
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
            <button className="btn-buynow btn-block" onClick={buyNow} disabled={out}>⚡ BUY NOW WITH 1-CLICK</button>

            <div className="pdp-trust">
              {[
                { icon: 'badgeCheck', t: '100% Genuine', s: 'Authentic Items' },
                { icon: 'banknote', t: 'Cash on', s: 'Delivery (COD)' },
                { icon: 'truck', t: 'Fast Delivery', s: '1-2 Days Express' },
                { icon: 'refresh', t: '14 Days Easy', s: 'Return Policy' },
              ].map((f) => (
                <div key={f.t}><i><Ic name={f.icon} size={19} /></i><span>{f.t}<br />{f.s}</span></div>
              ))}
            </div>
          </div>
        </div>

        {/* Detailed Tabs */}
        <div className="pdp-tabs-card">
          <div className="pdp-tabs">
            {TABS.map((t, i) => (
              <button key={t} className={i === tab ? 'on' : ''} onClick={() => setTab(i)}>
                {t === 'REVIEWS' ? `REVIEWS (${p.numReviews || 35})` : t}
              </button>
            ))}
          </div>
          <div className="pdp-tab-body">
            {tab === 0 && (
              <div className="tab-desc">
                <p>{p.description || p.shortDescription || 'No description provided.'}</p>
                {p.bullets?.length > 0 && (
                  <ul className="bullets">
                    {p.bullets.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {tab === 1 && <p>{p.howToUse || 'Please follow product user guide and packaging instructions.'}</p>}
            {tab === 2 && <p>{p.ingredients || '100% compliant materials and ingredients certified by manufacturer.'}</p>}
            {tab === 3 && (
              <div className="specs-table">
                {p.specifications?.map((s) => (
                  <div key={s.key} className="spec-row">
                    <b>{s.key}</b>
                    <span>{s.value}</span>
                  </div>
                ))}
              </div>
            )}
            {tab === 4 && (
              <div className="reviews-tab">
                {SAMPLE_REVIEWS.map((r, i) => (
                  <div key={i} className="rev-card">
                    <div className="rev-head">
                      <b>{r.name}</b>
                      <Stars value={r.rating} />
                    </div>
                    <p>{r.text}</p>
                  </div>
                ))}
              </div>
            )}
            {tab === 5 && (
              <div className="tab-shipping">
                <p>We deliver orders worldwide using trusted international couriers. Standard delivery takes 3-7 business days depending on your location. Express delivery takes 1-3 business days.</p>
                <p>Enjoy a 14-day hassle-free return window if you receive a damaged or incorrect item. Full buyer protection on every order.</p>
              </div>
            )}
          </div>
        </div>

        {/* Related Products Carousel */}
        {related.length > 0 && (
          <div className="section">
            <div className="section-head">
              <h2>RELATED PRODUCTS YOU MAY ALSO LIKE</h2>
              <div className="carousel-arrows">
                <button onClick={() => scrollRel(-1)} aria-label="Previous"><Ic name="chevLeft" size={18} /></button>
                <button onClick={() => scrollRel(1)} aria-label="Next"><Ic name="chevRight" size={18} /></button>
              </div>
            </div>
            <div className="related-scroll" ref={relRef}>
              {related.map((rp) => (
                <ProductCard key={rp._id} p={rp} />
              ))}
            </div>
          </div>
        )}
      </div>
      <TrustStrip />
    </>
  );
}
