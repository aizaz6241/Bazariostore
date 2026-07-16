import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useContent } from '../content.jsx';
import Ic from '../components/Icons.jsx';
import ProductCard from '../components/ProductCard.jsx';
import { SectionTitle } from '../components/Bits.jsx';

const FALLBACK_SLIDE = {
  a: 'Reveal Your',
  b: 'Natural Glow',
  sub: 'Premium Beauty & Personal Care Products for a More Beautiful You',
  imgs: ['/img/products/oil.svg', '/img/products/serum.svg', '/img/products/jar.svg', '/img/products/perfume.svg'],
};

function Hero() {
  const { content } = useContent();
  const hero = content.hero || {};
  const slides = hero.slides?.length ? hero.slides : [FALLBACK_SLIDE];
  const features = hero.features || [];
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
          <Link to="/shop" className="btn-primary btn-shopnow">{hero.button || 'SHOP NOW'} <Ic name="arrowRight" size={17} /></Link>
        </div>
        <div className="hero-visual" key={'v' + i}>
          <div className="hero-blob" />
          {(s.imgs || []).map((im, n) => (
            <img key={n} src={im} alt="" className={`hero-img hero-img-${n + 1}`} />
          ))}
          <span className="hero-petal p1" /><span className="hero-petal p2" /><span className="hero-petal p3" />
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
    api('/products?featured=1&limit=8').then(setFeatured).catch(() => {});
  }, []);

  const sec = content.sections || {};
  const promo = content.promoRow || {};
  const brands = content.brands || [];

  return (
    <>
      <Hero />

      <section className="section container">
        <SectionTitle>{sec.categoriesTitle || 'SHOP BY CATEGORY'}</SectionTitle>
        <div className="cat-grid">
          {categories.map((c) => (
            <Link to={`/shop?category=${c.slug}`} className="cat-item" key={c.slug}>
              <span className="cat-circle"><img src={c.image?.url} alt="" /></span>
              <span className="cat-label">{c.name}</span>
            </Link>
          ))}
        </div>
        <div className="center">
          <Link to="/shop" className="btn-primary btn-wide">VIEW ALL CATEGORIES</Link>
        </div>
      </section>

      <section className="section container">
        <SectionTitle>{sec.featuredTitle || 'FEATURED PRODUCTS'}</SectionTitle>
        <div className="pgrid pgrid-4">
          {featured.map((p) => (
            <ProductCard p={p} key={p._id} />
          ))}
        </div>
        <div className="center">
          <Link to="/shop" className="btn-primary btn-wide">VIEW ALL PRODUCTS</Link>
        </div>
      </section>

      <section className="section container promo-row">
        <Link to="/shop?label=sale" className="promo-card promo-left">
          <div>
            <small>{promo.left?.small || 'UP TO'}</small>
            <b>{promo.left?.big || '30% OFF'}</b>
            <span>{promo.left?.span || 'ON SELECTED ITEMS'}</span>
            <em className="promo-btn">{promo.left?.btn || 'SHOP NOW'}</em>
          </div>
          <img src={promo.left?.img || '/img/products/brush.svg'} alt="" />
        </Link>
        <div className="promo-mid">
          {(promo.middle || []).map((f) => (
            <div className="promo-feature" key={f.t}>
              <span className="pf-ic"><Ic name={f.icon} size={26} stroke={1.4} /></span>
              <span>{f.t}<br />{f.s}</span>
            </div>
          ))}
        </div>
        <Link to="/shop?label=new" className="promo-card promo-right">
          <div>
            <b>{promo.right?.big || 'NEW ARRIVALS'}</b>
            <span>{promo.right?.span || 'Check Out Our Latest Products'}</span>
            <em className="promo-btn">{promo.right?.btn || 'SHOP NOW'}</em>
          </div>
          <img src={promo.right?.img || '/img/products/perfume.svg'} alt="" />
          <img src={promo.right?.img2 || '/img/products/essence.svg'} alt="" className="promo-img2" />
        </Link>
      </section>

      <section className="section container">
        <SectionTitle>{sec.brandsTitle || 'TOP BRANDS WE DEAL IN'}</SectionTitle>
        <div className="brand-strip">
          {brands.map((b) => (
            <Link to={`/shop?q=${encodeURIComponent(b.name === 'The' ? 'Ordinary' : b.name.split(' ')[0])}`} className={'brand ' + (b.cls || '')} key={b.name + b.sub}>
              <span>{b.name}</span>
              {b.sub && <small>{b.sub}</small>}
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
