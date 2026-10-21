import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useCart } from '../cart.jsx';
import { useCurrency } from '../context/CurrencyContext.jsx';
import { badgeFor } from '../data.js';
import Ic from './Icons.jsx';
import Stars from './Stars.jsx';

// Storefront product card (styles: styles/storefront/catalog-v2.css, scoped `.pc`)
export default function ProductCard({ p }) {
  const { add } = useCart();
  const { formatMoney } = useCurrency();
  const [liked, setLiked] = useState(false);
  const [added, setAdded] = useState(false);
  const addLockRef = useRef(false);

  const badge = badgeFor(p);
  const out = p.stock <= 0;
  const sellerName = p.sellerName || p.seller?.storeName || 'Bazario Verified';
  const discountPercent = p.oldPrice > p.price ? Math.round(((p.oldPrice - p.price) / p.oldPrice) * 100) : 0;
  const img = p.image || p.images?.[0]?.url || '/img/products/serum.svg';
  const rating = p.rating || 4.8;
  const reviews = p.numReviews || 18;

  const handleAdd = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (out || addLockRef.current) return;
    addLockRef.current = true;
    add(p);
    setAdded(true);
    setTimeout(() => {
      setAdded(false);
      addLockRef.current = false;
    }, 600);
  };

  return (
    <div className={'pc' + (out ? ' pc-out' : '')}>
      <div className="pc-media">
        <Link to={`/product/${p.slug}`} className="pc-img" aria-label={p.name}>
          <img src={img} alt={p.name} loading="lazy" />
        </Link>
        {discountPercent > 0 ? (
          <span className="pc-tag pc-tag-sale">-{discountPercent}%</span>
        ) : badge && !out ? (
          <span className={`pc-tag pc-tag-${badge.cls}`}>{badge.text}</span>
        ) : null}
        {out && <span className="pc-soldout">Out of stock</span>}
        <button
          type="button"
          className={'pc-wish' + (liked ? ' on' : '')}
          aria-label={liked ? 'Remove from wishlist' : 'Add to wishlist'}
          aria-pressed={liked}
          onClick={() => setLiked(!liked)}
        >
          <Ic name="heart" size={15} />
        </button>
      </div>

      <div className="pc-body">
        <Link
          to={`/shop?seller=${p.seller?._id || p.seller || ''}`}
          className="pc-seller"
          title={`View all products from ${sellerName}`}
        >
          <span>{sellerName}</span>
          <Ic name="badgeCheck" size={12} />
        </Link>

        <Link to={`/product/${p.slug}`} className="pc-name">{p.name}</Link>

        <div className="pc-rating">
          <Stars value={rating} />
          <span className="pc-rating-num">{Number(rating).toFixed(1)}</span>
          <span className="pc-rating-count">({reviews})</span>
        </div>

        <div className="pc-price">
          <b>{formatMoney(p.price)}</b>
          {p.oldPrice > p.price && <s>{formatMoney(p.oldPrice)}</s>}
        </div>

        <div className="pc-ship">
          <Ic name="truck" size={13} />
          <span>Express delivery</span>
        </div>

        <button
          type="button"
          className={'pc-add' + (added ? ' done' : '')}
          onClick={handleAdd}
          disabled={out || added}
        >
          {out ? (
            'Out of stock'
          ) : added ? (
            <><Ic name="check" size={15} /> <span>Added</span></>
          ) : (
            <><Ic name="cart" size={15} /> <span className="pc-add-long">Add to cart</span><span className="pc-add-short">Add</span></>
          )}
        </button>
      </div>
    </div>
  );
}
