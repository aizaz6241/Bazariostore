import { adminCan, idOf, peekSeller } from './hubBus.js';
import { Nick } from '../nicknames.jsx';

/**
 * A store name that opens the store quick-view panel (balance, waiting orders, chat, profile)
 * without leaving the page. Plain text for an admin without the Sellers permission.
 * The store's admin-only nickname is shown next to it (nick={false} to leave it out, e.g. when
 * the screen shows the nickname somewhere else).
 */
export default function StoreLink({ id, name, className = '', title, children, nick = true }) {
  const sid = idOf(id);
  const label = children ?? name;
  const tag = nick && sid ? <Nick id={sid} compact /> : null;
  if (!sid || !adminCan('sellers')) return (
    <>
      <span className={className}>{label}</span>
      {tag}
    </>
  );
  return (
    <>
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
      {tag}
    </>
  );
}
