import React from 'react';

/**
 * VerifiedStoreBadge Component
 * Renders an official platform verified checkmark icon and/or label.
 *
 * Variants:
 *  - 'pill'   : Icon + "Verified Store" text in a sleek pill container
 *  - 'icon'   : Just the verified tick icon (ideal for inline titles/headers)
 *  - 'badge'  : Small compact tag (for tables, mobile views)
 *  - 'banner' : Celebratory notification strip for seller dashboard
 */
export default function VerifiedStoreBadge({
  variant = 'pill',
  size = 16,
  text = 'Verified Store',
  title = 'Official Verified Merchant Store — Reviewed & Approved by Platform Admin',
  className = '',
  style = {},
}) {
  const checkIcon = (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      className="verified-seal-svg"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <circle cx="12" cy="12" r="10" fill="#0284c7" />
      <path
        d="M8.2 12.2l2.6 2.6L16.2 9"
        stroke="#ffffff"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  if (variant === 'icon') {
    return (
      <span
        className={`verified-badge-icon-wrap ${className}`}
        title={title}
        style={{ display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle', ...style }}
      >
        {checkIcon}
      </span>
    );
  }

  if (variant === 'banner') {
    return (
      <div className={`verified-store-hero-banner ${className}`} style={style}>
        <div className="vshb-icon-box">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
            <circle cx="12" cy="12" r="10" fill="#10b981" />
            <path d="M8.2 12.2l2.6 2.6L16.2 9" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="vshb-body">
          <div className="vshb-title-row">
            <span className="vshb-badge">✓ FULLY VERIFIED STORE</span>
            <b className="vshb-main-title">Official Merchant Certification Active</b>
          </div>
          <p className="vshb-desc">
            Your store is officially approved by Bazario Admin. Full selling privileges, trusted merchant badge, and priority payouts are enabled.
          </p>
        </div>
      </div>
    );
  }

  // Default 'pill' or 'badge'
  return (
    <span
      className={`verified-store-pill variant-${variant} ${className}`}
      title={title}
      style={style}
    >
      {checkIcon}
      <span className="vsp-label">{text}</span>
    </span>
  );
}
