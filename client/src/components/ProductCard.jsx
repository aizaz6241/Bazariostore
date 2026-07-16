import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCart } from '../cart.jsx';
import { money } from '../api.js';
import { badgeFor } from '../data.js';
import Ic from './Icons.jsx';
import Stars from './Stars.jsx';

export default function ProductCard({ p }) {
  const { add } = useCart();
  const [liked, setLiked] = useState(false);
  const badge = badgeFor(p);
  const out = p.stock <= 0;

  return (
    <div className={'pcard' + (out ? ' pcard-out' : '')}>
      <Link to={`/product/${p.slug}`} className="pcard-img">
        {badge && <span className={`pbadge pbadge-${badge.cls}`}>{badge.text}</span>}
        <img src={p.image} alt={p.name} loading="lazy" />
      </Link>
      <div className="pcard-body">
        <Link to={`/product/${p.slug}`} className="pcard-name">{p.name}</Link>
        <div className="pcard-price">
          {p.oldPrice && <s>{money(p.oldPrice)}</s>}
          <b>{money(p.price)}</b>
        </div>
        <div className="pcard-rating">
          <Stars value={p.rating} />
          <span>({p.numReviews})</span>
        </div>
        <div className="pcard-actions">
          <button className="btn-add" onClick={() => add(p)} disabled={out}>
            {out ? 'OUT OF STOCK' : 'ADD TO CART'}
          </button>
          <button
            className={'btn-wish' + (liked ? ' liked' : '')}
            aria-label="Add to wishlist"
            onClick={() => setLiked(!liked)}
          >
            <Ic name="heart" size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
