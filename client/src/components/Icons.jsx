// Small inline icon set — stroke-based, inherits currentColor
const S = {
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.8-3.8" /></>,
  cart: <><circle cx="9" cy="20" r="1.6" /><circle cx="17" cy="20" r="1.6" /><path d="M3 4h2l2.4 11.2a1.5 1.5 0 0 0 1.5 1.2h7.6a1.5 1.5 0 0 0 1.5-1.1L20 8H6" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4.5 20c1.2-3.4 4-5 7.5-5s6.3 1.6 7.5 5" /></>,
  heart: <path d="M12 20.5C7 16.5 3.5 13.4 3.5 9.7 3.5 7 5.6 5 8.2 5c1.5 0 3 .7 3.8 2 .8-1.3 2.3-2 3.8-2 2.6 0 4.7 2 4.7 4.7 0 3.7-3.5 6.8-8.5 10.8Z" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  checkCircle: <><circle cx="12" cy="12" r="9" /><path d="m8.5 12.3 2.5 2.5 4.8-5" /></>,
  badgeCheck: <><path d="M12 2.8 14 5l3-.4.6 3 2.7 1.4-1.2 2.8 1.2 2.8L17.6 16l-.6 3-3-.4-2 2.2-2-2.2-3 .4-.6-3-2.7-1.4L4.9 12 3.7 9.2 6.4 7.8l.6-3 3 .4 2-2.4Z" /><path d="m9.2 12 2 2 3.6-3.8" /></>,
  truck: <><path d="M2.5 6h11v11h-11z" /><path d="M13.5 10h4l3 3v4h-7" /><circle cx="6.5" cy="17.8" r="1.8" /><circle cx="16.5" cy="17.8" r="1.8" /></>,
  shield: <><path d="M12 3 5 5.5v5.2c0 4.5 3 7.6 7 9.8 4-2.2 7-5.3 7-9.8V5.5L12 3Z" /><path d="m9 11.5 2.2 2.2L15.5 9.5" /></>,
  headset: <><path d="M4.5 13v-1.5a7.5 7.5 0 0 1 15 0V13" /><rect x="3.5" y="12.5" width="4" height="6" rx="2" /><rect x="16.5" y="12.5" width="4" height="6" rx="2" /><path d="M19 18.5c0 1.7-1.6 2.5-3.5 2.5" /></>,
  box: <><path d="M3.5 7.5 12 3.5l8.5 4v9l-8.5 4-8.5-4v-9Z" /><path d="m3.5 7.5 8.5 4 8.5-4M12 11.5v9" /></>,
  refresh: <><path d="M20 12a8 8 0 1 1-2.5-5.8" /><path d="M20 3v4h-4" /></>,
  lock: <><rect x="5" y="10.5" width="14" height="9.5" rx="2.5" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></>,
  phone: <path d="M5 4h4l1.5 4.5L8 10a12 12 0 0 0 6 6l1.5-2.5L20 15v4a1.8 1.8 0 0 1-2 1.8C10 20 4 14 3.2 6A1.8 1.8 0 0 1 5 4Z" />,
  mail: <><rect x="3" y="5.5" width="18" height="13" rx="2" /><path d="m3.5 7 8.5 6 8.5-6" /></>,
  mapPin: <><path d="M12 21c4-4 7-7.5 7-11a7 7 0 1 0-14 0c0 3.5 3 7 7 11Z" /><circle cx="12" cy="10" r="2.6" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5.2l3.4 2" /></>,
  chevDown: <path d="m6.5 9.5 5.5 5.5 5.5-5.5" />,
  chevLeft: <path d="M14.5 6 9 12l5.5 6" />,
  chevRight: <path d="m9.5 6 5.5 6-5.5 6" />,
  arrowRight: <><path d="M4 12h15" /><path d="m13.5 6.5 5.5 5.5-5.5 5.5" /></>,
  arrowLeft: <><path d="M20 12H5" /><path d="m10.5 6.5L5 12l5.5 5.5" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  x: <path d="m6 6 12 12M18 6 6 18" />,
  send: <path d="m3.5 11 17-7-4.5 16.5-4.5-6.5-8-3Zm8 3 8.5-10" />,
  chat: <path d="M4 5.5h16v11H9l-5 4v-15Z" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  tag: <><path d="m3.5 12.5 8-8H20v8.5l-8 8-8.5-8.5Z" /><circle cx="16" cy="8" r="1.4" /></>,
  wallet: <><rect x="3" y="6.5" width="18" height="13" rx="2.5" /><path d="M16 6.5V5a1.5 1.5 0 0 0-1.8-1.4L4.5 6" /><circle cx="16.8" cy="13" r="1.2" /></>,
  card: <><rect x="3" y="5.5" width="18" height="13" rx="2" /><path d="M3 10h18" /></>,
  banknote: <><rect x="2.5" y="6.5" width="19" height="11" rx="2" /><circle cx="12" cy="12" r="2.6" /><path d="M6 12h.01M18 12h.01" /></>,
  drop: <path d="M12 3.5c-3 4-5.5 7-5.5 10a5.5 5.5 0 0 0 11 0c0-3-2.5-6-5.5-10Z" />,
  sparkle: <path d="M12 3.5 13.8 9l5.7 1.8-5.7 1.8L12 18.5l-1.8-5.9L4.5 10.8 10.2 9 12 3.5ZM19 16.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" />,
  feather: <path d="M19.5 4.5c-5 0-10 2.5-12.5 7.5S4.5 19.5 4.5 19.5s3-1 6-1c5 0 9-5 9-14ZM4.5 19.5 15 9" />,
  skin: <><circle cx="12" cy="12" r="8.5" /><path d="M8.5 13.5c1 1.4 2.2 2 3.5 2s2.5-.6 3.5-2" /><circle cx="9.3" cy="10" r=".4" /><circle cx="14.7" cy="10" r=".4" /></>,
  home: <path d="M4 11.5 12 4l8 7.5V20h-5.5v-5h-5v5H4v-8.5Z" />,
  grid: <><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></>,
  list: <path d="M8 6.5h12M8 12h12M8 17.5h12M4 6.5h.01M4 12h.01M4 17.5h.01" />,
  logout: <><path d="M14 4H6a1.5 1.5 0 0 0-1.5 1.5v13A1.5 1.5 0 0 0 6 20h8" /><path d="M10 12h10.5m-3.5-4 4 4-4 4" /></>,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></>,
  package: <><path d="M3.5 7.5 12 3.5l8.5 4v9l-8.5 4-8.5-4v-9Z" /><path d="m7.5 5.5 9 4.2M3.5 7.5l8.5 4 8.5-4M12 11.5v9" /></>,
  gift: <><rect x="3.5" y="8" width="17" height="4" rx="1" /><path d="M5 12v8h14v-8M12 8v12M12 8s-4.5.5-5.5-2C5.8 4 8 3 9.5 4.2 11 5.4 12 8 12 8Zm0 0s4.5.5 5.5-2C18.2 4 16 3 14.5 4.2 13 5.4 12 8 12 8Z" /></>,
  bell: <><path d="M6 9.5a6 6 0 0 1 12 0c0 5 1.8 6.5 1.8 6.5H4.2S6 14.5 6 9.5Z" /><path d="M10 19.5a2.2 2.2 0 0 0 4 0" /></>,
  paperclip: <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l7.88-7.88" />,
  fileText: <><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><line x1="10" y1="9" x2="8" y2="9" /></>,
  download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>,
  image: <><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></>,
  alert: <><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>,
};

// Filled brand/social icons
const F = {
  facebook: <path d="M13.5 21v-7h2.4l.4-3h-2.8V9.1c0-.9.3-1.5 1.6-1.5h1.3V4.9c-.6-.1-1.4-.2-2.3-.2-2.3 0-3.9 1.4-3.9 4v2.3H7.8v3h2.4v7h3.3Z" />,
  instagram: (
    <path d="M12 4.3c2.5 0 2.8 0 3.8.1 2.5.1 3.7 1.3 3.8 3.8 0 1 .1 1.3.1 3.8s0 2.8-.1 3.8c-.1 2.5-1.3 3.7-3.8 3.8-1 0-1.3.1-3.8.1s-2.8 0-3.8-.1c-2.5-.1-3.7-1.3-3.8-3.8 0-1-.1-1.3-.1-3.8s0-2.8.1-3.8C4.5 5.7 5.7 4.5 8.2 4.4c1-.1 1.3-.1 3.8-.1Zm0 3.4a4.3 4.3 0 1 0 0 8.6 4.3 4.3 0 0 0 0-8.6Zm0 7.1a2.8 2.8 0 1 1 0-5.6 2.8 2.8 0 0 1 0 5.6Zm4.5-8.2a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z" />
  ),
  tiktok: <path d="M16.6 3c.4 2.3 1.8 3.7 4 3.9v2.9c-1.5.1-2.9-.4-4-1.2v5.6a5.9 5.9 0 1 1-5.9-5.9c.3 0 .7 0 1 .1v3a2.9 2.9 0 1 0 2 2.8V3h2.9Z" />,
  youtube: <path d="M21.5 8.2c-.2-1.4-.9-2.3-2.4-2.5C16.8 5.5 12 5.5 12 5.5s-4.8 0-7.1.2C3.4 5.9 2.7 6.8 2.5 8.2 2.3 9.6 2.3 12 2.3 12s0 2.4.2 3.8c.2 1.4.9 2.3 2.4 2.5 2.3.2 7.1.2 7.1.2s4.8 0 7.1-.2c1.5-.2 2.2-1.1 2.4-2.5.2-1.4.2-3.8.2-3.8s0-2.4-.2-3.8ZM10 15V9l5.5 3L10 15Z" />,
  whatsapp: (
    <path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3Zm4.9 12.5c-.2.6-1.2 1.1-1.7 1.2-.4.1-1 .1-1.6-.1a13 13 0 0 1-1.5-.5c-2.6-1.1-4.2-3.7-4.4-3.9-.1-.2-1-1.4-1-2.6s.6-1.8.9-2.1c.2-.2.5-.3.7-.3h.5c.2 0 .4-.1.6.4l.9 2.1c.1.2.1.4 0 .6l-.4.6-.5.5c-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1.1 2.2 1.4 2.5 1.5.3.1.5.1.7-.1l1-1.2c.2-.3.4-.2.7-.1l2 .9c.3.1.5.2.6.4 0 .1 0 .7-.2 1.2Z" />
  ),
  star: <path d="M12 2.5l2.9 5.9 6.6 1-4.8 4.6 1.2 6.5-5.9-3.1-5.9 3.1 1.2-6.5L2.5 9.4l6.6-1L12 2.5Z" />,
};

export default function Ic({ name, size = 20, stroke = 1.7, className = '', style }) {
  if (F[name]) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" className={className} style={style} aria-hidden="true">
        {F[name]}
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {S[name] || S.sparkle}
    </svg>
  );
}
