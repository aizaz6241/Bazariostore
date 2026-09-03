import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCart } from '../cart.jsx';
import { useCurrency } from '../context/CurrencyContext.jsx';
import { badgeFor } from '../data.js';
import Ic from './Icons.jsx';
import Stars from './Stars.jsx';

export default function ProductCard({ p }) {
  const { add } = useCart();
  const { formatMoney } = useCurrency();
  const [liked, setLiked] = useState(false);
  const badge = badgeFor(p);
  const out = p.stock <= 0;
  const sellerName = p.sellerName || p.seller?.storeName || 'Bazario Verified';
  const discountPercent = p.oldPrice > p.price ? Math.round(((p.oldPrice - p.price) / p.oldPrice) * 100) : 0;

  return (
    <div className={'pcard' + (out ? ' pcard-out' : '')}>
      <Link to={`/product/${p.slug}`} className="pcard-img">
        {discountPercent > 0 && <span className="discount-tag-badge">-{discountPercent}%</span>}
        {badge && !discountPercent && <span className={`pbadge pbadge-${badge.cls}`}>{badge.text}</span>}
        <img src={p.image || p.images?.[0]?.url || '/img/products/serum.svg'} alt={p.name} loading="lazy" />
      </Link>

      <div className="pcard-body">
        {/* Sold By Tag */}
        <div className="pcard-seller-tag">
          <span className="seller-sold-label">Sold by:</span>{' '}
          <Link
            to={`/shop?seller=${p.seller?._id || p.seller || ''}`}
            className="seller-store-link"
            title={`View all products from ${sellerName}`}
          >
            <b>{sellerName}</b> <span className="verified-check">✓</span>
          </Link>
        </div>

        <Link to={`/product/${p.slug}`} className="pcard-name">{p.name}</Link>

        <div className="pcard-rating">
          <Stars value={p.rating || 4.8} />
          <span className="review-count">({p.numReviews || 18})</span>
        </div>

        <div className="pcard-price">
          <b>{formatMoney(p.price)}</b>
          {p.oldPrice && <s>{formatMoney(p.oldPrice)}</s>}
        </div>

        {/* Prime / Express Badge */}
        <div className="prime-express-pill">
          <span className="prime-text">prime</span>
          <span className="express-text">Express Delivery</span>
        </div>

        <div className="pcard-actions">
          <button className="btn-add" onClick={() => add(p)} disabled={out}>
            <span className="btn-add-full">{out ? 'OUT OF STOCK' : 'ADD TO CART'}</span>
            <span className="btn-add-compact">{out ? 'Out' : '+ Add'}</span>
          </button>
          <button
            className={'btn-wish' + (liked ? ' liked' : '')}
            aria-label="Add to wishlist"
            onClick={() => setLiked(!liked)}
          >
            <Ic name="heart" size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
