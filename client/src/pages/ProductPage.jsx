import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useCart } from '../cart.jsx';
import { useCurrency } from '../context/CurrencyContext.jsx';
import Ic from '../components/Icons.jsx';
import Stars from '../components/Stars.jsx';
import ProductCard from '../components/ProductCard.jsx';
import { Breadcrumb, TrustStrip } from '../components/Bits.jsx';

// Product detail page (styles: styles/storefront/catalog-v2.css, scoped `.pv`)

const SAMPLE_REVIEWS = [
  { name: 'Ahmad K.', rating: 5, text: '100% Original and authentic product! Arrived in 2 days via Express Prime shipping. Packaging was great.' },
  { name: 'Fatima R.', rating: 4.5, text: 'Very happy with my order. Seller dispatched the item immediately with real tracking code.' },
  { name: 'Usman S.', rating: 5, text: 'Top quality and reasonable price. Cash on delivery was smooth and driver was polite.' },
];

const PERKS = [
  { icon: 'badgeCheck', t: '100% Genuine', s: 'Authentic items' },
  { icon: 'banknote', t: 'Cash on Delivery', s: 'Pay when it arrives' },
  { icon: 'truck', t: 'Fast Delivery', s: '1-2 days express' },
  { icon: 'refresh', t: '14-Day Returns', s: 'Easy return policy' },
];

function PageSkeleton() {
  return (
    <div className="pv">
      <div className="container">
        <div className="pv-grid" aria-hidden="true">
          <div className="pv-gallery"><div className="sk pv-sk-img" /></div>
          <div className="pv-info">
            <div className="sk sk-line" style={{ width: '30%' }} />
            <div className="sk sk-line" style={{ height: 30, width: '90%' }} />
            <div className="sk sk-line" style={{ height: 30, width: '60%' }} />
            <div className="sk sk-line" style={{ width: '40%' }} />
            <div className="sk sk-line" style={{ height: 38, width: '35%', marginTop: 12 }} />
            <div className="sk sk-btn" style={{ height: 50, marginTop: 24 }} />
            <div className="sk sk-btn" style={{ height: 50 }} />
          </div>
        </div>
      </div>
    </div>
  );
}

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
  const [tab, setTab] = useState('desc');
  const [liked, setLiked] = useState(false);
  const [added, setAdded] = useState(false);
  const addLockRef = useRef(false);
  const relRef = useRef(null);

  useEffect(() => {
    setNotFound(false);
    setImgIdx(0);
    setQty(1);
    setTab('desc');
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
      <div className="pv">
        <div className="container">
          <div className="sf-empty" style={{ marginTop: 32 }}>
            <span className="sf-empty-ic"><Ic name="search" size={26} /></span>
            <h3>Product not found</h3>
            <p>This product may have been removed or the link is wrong.</p>
            <Link to="/shop" className="sf-btn-dark">Back to shop</Link>
          </div>
        </div>
      </div>
    );
  if (!p) return <PageSkeleton />;

  const gallery = p.images?.length > 1 ? p.images.map((i) => i.url) : p.gallery?.length ? p.gallery : [p.image || '/img/products/serum.svg'];
  const activePrice = size && p.sizes?.length ? p.sizes.find((s) => s.label === size)?.price ?? p.price : p.price;
  const off = p.oldPrice ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;
  const out = p.stock <= 0;
  const low = !out && p.stock <= (p.lowStockThreshold || 5);
  const variantStr = Object.entries(variantSel).map(([k, v]) => `${k}: ${v}`).join(', ');
  const sellerName = p.seller?.storeName || p.sellerName || 'Bazario Verified Store';
  const sellerId = p.seller?._id || '';
  const sellerPlace = [p.seller?.address?.city, p.seller?.address?.country].filter(Boolean).join(', ');
  const sellerRated = p.seller?.rating && p.seller?.numReviews > 0;
  const rating = p.rating || 4.8;
  const reviews = p.numReviews || 35;
  const save = p.oldPrice > activePrice ? p.oldPrice - activePrice : 0;

  const tabs = [
    { key: 'desc', label: 'Description' },
    p.specifications?.length > 0 && { key: 'specs', label: 'Specifications' },
    p.howToUse && { key: 'use', label: 'How to use' },
    p.ingredients && { key: 'ingr', label: 'Ingredients' },
    { key: 'reviews', label: `Reviews (${reviews})` },
    { key: 'ship', label: 'Shipping & returns' },
  ].filter(Boolean);
  const curTab = tabs.some((t) => t.key === tab) ? tab : 'desc';

  const doAdd = () => {
    if (out || addLockRef.current) return;
    addLockRef.current = true;
    add(p, qty, size, variantStr);
    setAdded(true);
    setTimeout(() => {
      setAdded(false);
      addLockRef.current = false;
    }, 600);
  };
  const buyNow = () => {
    if (out) return;
    add(p, qty, size, variantStr);
    navigate('/checkout');
  };

  const step = (dir) => setImgIdx((i) => (i + dir + gallery.length) % gallery.length);
  const scrollRel = (dir) => relRef.current?.scrollBy({ left: dir * (relRef.current.clientWidth * 0.8), behavior: 'smooth' });

  return (
    <div className="pv">
      <div className="container">
        <Breadcrumb
          trail={[
            { label: 'Shop', to: '/shop' },
            ...(p.category ? [{ label: p.category.name, to: `/shop?category=${p.category.slug}` }] : []),
            { label: p.name },
          ]}
        />

        <div className="pv-grid">
          {/* ── Gallery ── */}
          <div className="pv-gallery">
            <div className="pv-main">
              {off > 0 && <span className="pv-off">-{off}%</span>}
              <img src={gallery[imgIdx]} alt={p.name} />
              {gallery.length > 1 && (
                <>
                  <button type="button" className="pv-nav l" onClick={() => step(-1)} aria-label="Previous image"><Ic name="chevLeft" size={18} /></button>
                  <button type="button" className="pv-nav r" onClick={() => step(1)} aria-label="Next image"><Ic name="chevRight" size={18} /></button>
                  <span className="pv-count">{imgIdx + 1} / {gallery.length}</span>
                </>
              )}
            </div>
            {gallery.length > 1 && (
              <div className="pv-thumbs">
                {gallery.map((g, i) => (
                  <button type="button" key={i} className={'pv-thumb' + (i === imgIdx ? ' on' : '')} onClick={() => setImgIdx(i)} aria-label={`Image ${i + 1}`}>
                    <img src={g} alt="" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── Info & buy box ── */}
          <div className="pv-info">
            <div className="pv-eyebrow">
              {p.brand && <span>{p.brand}</span>}
              {p.brand && p.category && <i>·</i>}
              {p.category && <Link to={`/shop?category=${p.category.slug}`}>{p.category.name}</Link>}
            </div>

            <h1 className="pv-title">{p.name}</h1>

            <div className="pv-rating">
              <Stars value={rating} />
              <b>{Number(rating).toFixed(1)}</b>
              <button type="button" className="pv-rating-link" onClick={() => { setTab('reviews'); document.getElementById('pv-details')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
                {reviews} reviews
              </button>
              {p.sold > 0 && <><i>·</i><span>{p.sold} sold</span></>}
            </div>

            <div className="pv-price">
              <b>{formatMoney(activePrice)}</b>
              {p.oldPrice > activePrice && <s>{formatMoney(p.oldPrice)}</s>}
              {save > 0 && off > 0 && <span className="pv-save">Save {formatMoney(save)} ({off}%)</span>}
            </div>

            {p.shortDescription && <p className="pv-short">{p.shortDescription}</p>}

            {p.highlights?.length > 0 && (
              <div className="pv-hls">
                {p.highlights.map((h) => (
                  <span key={h.label} className="pv-hl">
                    <Ic name={h.icon} size={15} /> {h.label}
                  </span>
                ))}
              </div>
            )}

            <div className="pv-buy">
              {p.sizes?.length > 0 && (
                <div className="pv-opt">
                  <span className="pv-lbl">Size <b>{size}</b></span>
                  <div className="pv-opt-row">
                    {p.sizes.map((s) => (
                      <button type="button" key={s.label} className={'pv-chip' + (size === s.label ? ' on' : '')} onClick={() => setSize(s.label)}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {(p.variants || []).map((v) => (
                <div className="pv-opt" key={v.name}>
                  <span className="pv-lbl">{v.name} <b>{variantSel[v.name] || ''}</b></span>
                  <div className="pv-opt-row">
                    {v.options.map((o) => (
                      <button
                        type="button"
                        key={o}
                        className={'pv-chip' + (variantSel[v.name] === o ? ' on' : '')}
                        onClick={() => setVariantSel({ ...variantSel, [v.name]: o })}
                      >
                        {o}
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              <div className={'pv-stock ' + (out ? 'out' : low ? 'low' : 'ok')}>
                <span className="pv-dot" />
                {out ? 'Out of stock' : low ? `Only ${p.stock} left in stock, order soon` : 'In stock, ready to ship'}
              </div>

              <div className="pv-actions">
                <div className="pv-qty" aria-label="Quantity">
                  <button type="button" onClick={() => setQty(Math.max(1, qty - 1))} aria-label="Decrease" disabled={qty <= 1}><Ic name="minus" size={15} /></button>
                  <span>{qty}</span>
                  <button type="button" onClick={() => setQty(Math.min(20, qty + 1))} aria-label="Increase" disabled={qty >= 20}><Ic name="plus" size={15} /></button>
                </div>
                <button type="button" className={'pv-add' + (added ? ' done' : '')} onClick={doAdd} disabled={out || added}>
                  {out ? 'Out of stock' : added ? <><Ic name="check" size={17} /> Added to cart</> : <><Ic name="cart" size={17} /> Add to cart</>}
                </button>
                <button type="button" className={'pv-wish' + (liked ? ' on' : '')} onClick={() => setLiked(!liked)} aria-label="Wishlist" aria-pressed={liked}>
                  <Ic name="heart" size={19} />
                </button>
              </div>
              <button type="button" className="pv-buynow" onClick={buyNow} disabled={out}>
                Buy now
              </button>
            </div>

            <div className="pv-perks">
              {PERKS.map((f) => (
                <div key={f.t} className="pv-perk">
                  <span className="pv-perk-ic"><Ic name={f.icon} size={18} /></span>
                  <span><b>{f.t}</b><small>{f.s}</small></span>
                </div>
              ))}
            </div>

            <div className="pv-seller">
              <span className={'pv-seller-av' + (p.seller?.logo ? ' has-logo' : '')}>
                {p.seller?.logo ? <img src={p.seller.logo} alt="" /> : (sellerName[0] || 'S').toUpperCase()}
              </span>
              <div className="pv-seller-txt">
                <small>Sold &amp; shipped by</small>
                <Link to={`/shop?seller=${sellerId}`} className="pv-seller-name">
                  {sellerName} <span className="pv-verified"><Ic name="badgeCheck" size={13} /> Verified</span>
                </Link>
                {(sellerRated || sellerPlace) && (
                  <span className="pv-seller-meta">
                    {sellerRated && <>★ {Number(p.seller.rating).toFixed(1)} · {p.seller.numReviews} store ratings</>}
                    {sellerRated && sellerPlace && ' · '}
                    {sellerPlace}
                  </span>
                )}
              </div>
              <Link to={`/shop?seller=${sellerId}`} className="pv-seller-btn">Visit store</Link>
            </div>

            {p.otherOffers?.length > 0 && (
              <div className="pv-offers">
                <div className="pv-offers-head">Also sold by {p.otherOffers.length} other seller{p.otherOffers.length === 1 ? '' : 's'}</div>
                {p.otherOffers.map((offer) => (
                  <div key={offer._id} className="pv-offer">
                    <div className="pv-offer-who">
                      <b>{offer.sellerName || offer.seller?.storeName}</b>
                      <span><Ic name="badgeCheck" size={12} /> Verified · {offer.stock > 0 ? `In stock (${offer.stock})` : 'Out of stock'}</span>
                    </div>
                    <b className="pv-offer-price">{formatMoney(offer.price)}</b>
                    <Link to={`/product/${offer.slug}`} className="pv-offer-btn">View</Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Details ── */}
        <div className="pv-details" id="pv-details">
          <div className="pv-tabs" role="tablist">
            {tabs.map((t) => (
              <button type="button" role="tab" aria-selected={curTab === t.key} key={t.key} className={curTab === t.key ? 'on' : ''} onClick={() => setTab(t.key)}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="pv-tab-body">
            {curTab === 'desc' && (
              <div className="pv-desc">
                <p>{p.description || p.shortDescription || 'No description provided.'}</p>
                {p.bullets?.length > 0 && (
                  <ul>
                    {p.bullets.map((b, i) => (
                      <li key={i}><Ic name="check" size={15} /><span>{b}</span></li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {curTab === 'specs' && (
              <dl className="pv-specs">
                {p.specifications.map((s) => (
                  <div key={s.key} className="pv-spec">
                    <dt>{s.key}</dt>
                    <dd>{s.value}</dd>
                  </div>
                ))}
              </dl>
            )}
            {curTab === 'use' && <p>{p.howToUse}</p>}
            {curTab === 'ingr' && <p>{p.ingredients}</p>}
            {curTab === 'reviews' && (
              <div className="pv-reviews">
                <div className="pv-rev-sum">
                  <b>{Number(rating).toFixed(1)}</b>
                  <Stars value={rating} />
                  <span>{reviews} reviews</span>
                </div>
                <div className="pv-rev-list">
                  {SAMPLE_REVIEWS.map((r, i) => (
                    <div key={i} className="pv-rev">
                      <div className="pv-rev-head">
                        <span className="pv-rev-av">{r.name[0]}</span>
                        <b>{r.name}</b>
                        <Stars value={r.rating} />
                      </div>
                      <p>{r.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {curTab === 'ship' && (
              <div className="pv-ship">
                <p>We deliver orders worldwide using trusted international couriers. Standard delivery takes 3-7 business days depending on your location. Express delivery takes 1-3 business days.</p>
                <p>Enjoy a 14-day hassle-free return window if you receive a damaged or incorrect item. Full buyer protection on every order.</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Related ── */}
        {related.length > 0 && (
          <div className="pv-related">
            <div className="pv-related-head">
              <h2>You may also like</h2>
              <div className="pv-related-arrows">
                <button type="button" onClick={() => scrollRel(-1)} aria-label="Previous"><Ic name="chevLeft" size={18} /></button>
                <button type="button" onClick={() => scrollRel(1)} aria-label="Next"><Ic name="chevRight" size={18} /></button>
              </div>
            </div>
            <div className="pv-related-row" ref={relRef}>
              {related.map((rp) => (
                <ProductCard key={rp._id} p={rp} />
              ))}
            </div>
          </div>
        )}
      </div>
      <TrustStrip />
    </div>
  );
}
