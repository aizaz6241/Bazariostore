import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useContent } from '../content.jsx';
import Ic from '../components/Icons.jsx';
import ProductCard from '../components/ProductCard.jsx';
import { SectionTitle } from '../components/Bits.jsx';

const FALLBACK_SLIDE = {
  a: 'Mega Electronics &',
  b: 'Flagship Mobiles',
  sub: 'Explore Top Verified Sellers with Express Worldwide Delivery',
  imgs: [
    'https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=600&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&auto=format&fit=crop&q=80',
  ],
};

function Hero() {
  const { content } = useContent();
  const hero = content.hero || {};
  const slides = hero.slides?.length ? hero.slides : [FALLBACK_SLIDE];
  const features = hero.features || [
    { icon: 'badgeCheck', l1: '100% Genuine', l2: 'Verified Sellers' },
    { icon: 'truck', l1: 'Express Prime', l2: '1-2 Day Dispatch' },
    { icon: 'shield', l1: 'Buyer Protection', l2: 'Money Back Guarantee' },
    { icon: 'headset', l1: '24/7 Support', l2: 'Live Chat Support' },
  ];
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % slides.length), 6000);
    return () => clearInterval(t);
  }, [slides.length]);
  const s = slides[i] || slides[0];

  return (
    <section className="hero">
      <button className="hero-arrow hero-prev" onClick={() => setI((i + slides.length - 1) % slides.length)} aria-label="Previous slide">
        <Ic name="chevLeft" size={20} />
      </button>
      <div className="container hero-in">
        <div className="hero-text" key={i}>
          {s.badge && <span className="hero-deal-pill">🔥 {s.badge}</span>}
          <h1>
            {s.a}
            <span>{s.b}</span>
          </h1>
          <p className="hero-sub">{s.sub}</p>
          <div className="hero-features">
            {features.map((f) => (
              <div className="hero-feature" key={f.l1}>
                <span className="hf-ic"><Ic name={f.icon} size={20} /></span>
                <span>{f.l1}<br />{f.l2}</span>
              </div>
            ))}
          </div>
          <div className="hero-buttons-row">
            <Link to="/shop" className="btn-primary btn-shopnow">
              {hero.button || 'EXPLORE MARKETPLACE DEALS'} <Ic name="arrowRight" size={17} />
            </Link>
            <Link to="/seller/login" className="btn-outline">
              Sell on Bazario →
            </Link>
          </div>
        </div>
        <div className="hero-visual" key={'v' + i}>
          <div className="hero-blob" />
          {(s.imgs || []).map((im, n) => (
            <img key={n} src={im} alt="" className={`hero-img hero-img-${n + 1}`} />
          ))}
        </div>
      </div>
      <button className="hero-arrow hero-next" onClick={() => setI((i + 1) % slides.length)} aria-label="Next slide">
        <Ic name="chevRight" size={20} />
      </button>
      <div className="hero-dots">
        {slides.map((_, n) => (
          <button key={n} className={n === i ? 'on' : ''} onClick={() => setI(n)} aria-label={`Slide ${n + 1}`} />
        ))}
      </div>
    </section>
  );
}

export default function Home() {
  const { content, categories } = useContent();
  const [featured, setFeatured] = useState([]);

  useEffect(() => {
    api('/products?limit=8').then(setFeatured).catch(() => {});
  }, []);

  const sec = content.sections || {};
  const promo = content.promoRow || {};

  const FEATURED_SELLERS = [
    {
      name: 'TechZone Gadgets',
      slug: 'techzone-gadgets',
      category: 'Smartphones, Laptops & Audio',
      rating: 4.9,
      reviews: 128,
      location: 'Verified Seller',
      badge: 'Top Tech Merchant',
      logo: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=200&auto=format&fit=crop&q=80',
    },
    {
      name: 'Urban Vogue Fashion',
      slug: 'urban-vogue-fashion',
      category: 'Jackets, Hoodies & Sneakers',
      rating: 4.8,
      reviews: 94,
      location: 'Verified Seller',
      badge: 'Trending Streetwear',
      logo: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=200&auto=format&fit=crop&q=80',
    },
    {
      name: 'Apex Living & Home',
      slug: 'apex-living-home',
      category: 'Smart Blenders & Air Fryers',
      rating: 4.7,
      reviews: 62,
      location: 'Verified Seller',
      badge: 'Home Appliances',
      logo: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=200&auto=format&fit=crop&q=80',
    },
    {
      name: 'Glow & Aura Cosmetics',
      slug: 'glow-aura-cosmetics',
      category: '100% Authentic Serums & Perfumes',
      rating: 4.9,
      reviews: 140,
      location: 'Verified Seller',
      badge: 'Luxury Beauty',
      logo: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=200&auto=format&fit=crop&q=80',
    },
  ];

  return (
    <>
      <Hero />

      {/* Categories Grid */}
      <section className="section container">
        <SectionTitle>{sec.categoriesTitle || 'BROWSE BY DEPARTMENTS'}</SectionTitle>
        <div className="cat-grid">
          {categories.map((c) => (
            <Link to={`/shop?category=${c.slug}`} className="cat-item" key={c.slug}>
              <span className="cat-circle">
                <img src={c.image?.url || '/img/products/serum.svg'} alt={c.name} />
              </span>
              <span className="cat-label">{c.name}</span>
            </Link>
          ))}
        </div>
        <div className="center">
          <Link to="/shop" className="btn-primary btn-wide">EXPLORE ALL DEPARTMENTS</Link>
        </div>
      </section>

      {/* Featured Products */}
      <section className="section container">
        <SectionTitle>{sec.featuredTitle || 'TODAY’S BEST DEALS & TOP PICKS'}</SectionTitle>
        <div className="pgrid pgrid-4">
          {featured.map((p) => (
            <ProductCard p={p} key={p._id} />
          ))}
        </div>
        <div className="center">
          <Link to="/shop" className="btn-primary btn-wide">VIEW ALL PRODUCTS</Link>
        </div>
      </section>

      {/* Featured Marketplace Sellers */}
      <section className="section container">
        <SectionTitle>FEATURED VERIFIED MARKETPLACE SELLERS</SectionTitle>
        <div className="featured-sellers-grid">
          {FEATURED_SELLERS.map((s, idx) => (
            <div key={idx} className="seller-showcase-card">
              <div className="showcase-top">
                <img src={s.logo} alt={s.name} className="showcase-logo" />
                <div>
                  <span className="showcase-badge">{s.badge}</span>
                  <h3 className="showcase-name">{s.name}</h3>
                  <small className="muted">{s.category}</small>
                </div>
              </div>
              <div className="showcase-footer">
                <div className="showcase-rating">
                  ⭐ <b>{s.rating}</b> <span className="muted">({s.reviews} ratings)</span>
                </div>
                <Link to={`/shop?q=${encodeURIComponent(s.name)}`} className="btn-visit-merchant">
                  Shop Store →
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Promotional Banner Row */}
      <section className="section container promo-row">
        <Link to="/shop?label=sale" className="promo-card promo-left">
          <div>
            <small>{promo.left?.small || 'UP TO'}</small>
            <b>{promo.left?.big || '35% OFF'}</b>
            <span>{promo.left?.span || 'MEGA FLASH DEALS'}</span>
            <em className="promo-btn">{promo.left?.btn || 'SHOP NOW'}</em>
          </div>
          <img src={promo.left?.img || 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&auto=format&fit=crop&q=80'} alt="" />
        </Link>
        <div className="promo-mid">
          {(promo.middle || [
            { icon: 'badgeCheck', t: '100% Genuine', s: 'Verified Sellers' },
            { icon: 'tag', t: 'Affordable', s: 'Competitive Prices' },
            { icon: 'truck', t: 'Express Prime', s: '1-2 Days Delivery' },
            { icon: 'banknote', t: 'Cash on', s: 'Delivery' },
            { icon: 'refresh', t: '14 Days Easy', s: 'Returns & Refund' },
          ]).map((f, idx) => (
            <div className="promo-feature" key={idx}>
              <span className="pf-ic"><Ic name={f.icon} size={26} stroke={1.4} /></span>
              <span>{f.t}<br />{f.s}</span>
            </div>
          ))}
        </div>
        <Link to="/shop?label=new" className="promo-card promo-right">
          <div>
            <b>{promo.right?.big || 'NEW ARRIVALS'}</b>
            <span>{promo.right?.span || 'Flagship Mobiles & Laptops'}</span>
            <em className="promo-btn">{promo.right?.btn || 'EXPLORE'}</em>
          </div>
          <img src={promo.right?.img || 'https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=500&auto=format&fit=crop&q=80'} alt="" />
        </Link>
      </section>
    </>
  );
}
