import { Link, useLocation } from 'react-router-dom';
import { useCart } from '../cart.jsx';
import Ic from './Icons.jsx';

export default function MobileBottomNav() {
  const location = useLocation();
  const { totalItems } = useCart();
  const path = location.pathname;

  // Don't show bottom nav inside full screen admin portal or seller portal subpages where sidebars exist
  if (path.startsWith('/admin')) {
    return null;
  }

  const isStore = path === '/' || path.startsWith('/product') || path.startsWith('/category');
  const isOrders = path.startsWith('/account/orders') || path.startsWith('/order');
  const isCart = path.startsWith('/cart') || path.startsWith('/checkout');
  const isSeller = path.startsWith('/seller');
  const isCategories = path.startsWith('/categories');

  return (
    <nav className="mobile-bottom-nav">
      <Link to="/" className={`mob-nav-item ${isStore && !isCategories ? 'active' : ''}`}>
        <Ic name="home" size={20} />
        <span>Shop</span>
      </Link>

      <Link to="/categories" className={`mob-nav-item ${isCategories ? 'active' : ''}`}>
        <Ic name="grid" size={20} />
        <span>Categories</span>
      </Link>

      <Link to="/cart" className={`mob-nav-item ${isCart ? 'active' : ''}`}>
        <div className="mob-cart-icon-box">
          <Ic name="cart" size={20} />
          {totalItems > 0 && <span className="mob-nav-badge">{totalItems}</span>}
        </div>
        <span>Cart</span>
      </Link>

      <Link to="/account/orders" className={`mob-nav-item ${isOrders ? 'active' : ''}`}>
        <Ic name="package" size={20} />
        <span>Orders</span>
      </Link>

      <Link to="/seller" className={`mob-nav-item ${isSeller ? 'active' : ''}`}>
        <Ic name="store" size={20} />
        <span>Seller</span>
      </Link>
    </nav>
  );
}
