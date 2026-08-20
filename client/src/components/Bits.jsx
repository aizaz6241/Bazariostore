import { Link } from 'react-router-dom';
import { useContent } from '../content.jsx';
import Ic from './Icons.jsx';

export function SectionTitle({ children }) {
  return (
    <div className="section-title">
      <h2>{children}</h2>
      <span className="title-line" />
    </div>
  );
}

export function StepsBar({ active }) {
  const steps = ['Cart', 'Information', 'Shipping', 'Payment'];
  return (
    <div className="stepsbar">
      {steps.map((s, i) => (
        <div key={s} className={'step' + (i + 1 === active ? ' step-active' : '') + (i + 1 < active ? ' step-done' : '')}>
          <span className="step-dot">{i + 1}</span>
          <span className="step-label">{s}</span>
          {i < steps.length - 1 && <span className="step-line" />}
        </div>
      ))}
    </div>
  );
}

const DEFAULT_TRUST = [
  { icon: 'badgeCheck', title: '100% Original', sub: 'Authentic Products' },
  { icon: 'truck', title: 'Fast Delivery', sub: 'Express Worldwide Shipping' },
  { icon: 'banknote', title: 'Secure Payments', sub: 'Multiple Payment Options' },
  { icon: 'refresh', title: 'Easy Returns', sub: '14-Day Return Policy' },
  { icon: 'shield', title: 'Buyer Protection', sub: '100% Money-Back Guarantee' },
];

export function TrustStrip() {
  const { content } = useContent();
  const items = content.trustStrip?.length ? content.trustStrip : DEFAULT_TRUST;
  return (
    <div className="trust-strip container">
      {items.map((it) => (
        <div className="trust-item" key={it.title}>
          <span className="trust-ic"><Ic name={it.icon} size={22} /></span>
          <div><b>{it.title}</b><small>{it.sub}</small></div>
        </div>
      ))}
    </div>
  );
}

export function Breadcrumb({ trail }) {
  return (
    <div className="breadcrumb">
      <Link to="/"><Ic name="home" size={13} /> Home</Link>
      {trail.map((t, i) => (
        <span key={i}>
          <em>›</em>
          {t.to ? <Link to={t.to}>{t.label}</Link> : <span className="bc-current">{t.label}</span>}
        </span>
      ))}
    </div>
  );
}
