import { adminCan, idOf, peekSeller } from './hubBus.js';

/**
 * A store name that opens the store quick-view panel (balance, waiting orders, chat, profile)
 * without leaving the page. Plain text for an admin without the Sellers permission.
 */
export default function StoreLink({ id, name, className = '', title, children }) {
  const sid = idOf(id);
  const label = children ?? name;
  if (!sid || !adminCan('sellers')) return <span className={className}>{label}</span>;
  return (
    <button
      type="button"
      className={`hub-store-link ${className}`}
      title={title || `Quick view of ${name || 'this store'}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        peekSeller(sid, name);
      }}
    >
      {label}
    </button>
  );
}
