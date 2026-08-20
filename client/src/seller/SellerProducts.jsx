import { useEffect, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { sapi, money } from '../api.js';
import Ic from '../components/Icons.jsx';

export default function SellerProducts() {
  const { seller } = useOutletContext() || {};
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [stockFilter, setStockFilter] = useState('all');

  // Add / Edit Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProd, setEditingProd] = useState(null);
  const [urlInput, setUrlInput] = useState('');
  const [form, setForm] = useState({
    name: '',
    brand: '',
    category: '',
    price: '',
    oldPrice: '',
    costPrice: '',
    stock: 15,
    lowStockThreshold: 5,
    sku: '',
    active: true,
    shortDescription: '',
    description: '',
    images: [],
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [modalErr, setModalErr] = useState('');
  const fileInputRef = useRef(null);

  const loadProducts = () => {
    setLoading(true);
    sapi('/sellers/products')
      .then((data) => setProducts(data || []))
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadProducts();
    sapi('/categories')
      .then((data) => setCategories(data || []))
      .catch(() => {});
  }, []);

  const openAdd = () => {
    setEditingProd(null);
    setUrlInput('');
    setForm({
      name: '',
      brand: '',
      category: categories[0]?._id || '',
      price: '',
      oldPrice: '',
      costPrice: '',
      stock: 20,
      lowStockThreshold: 5,
      sku: `SKU-${Date.now().toString(36).toUpperCase()}`,
      active: true,
      shortDescription: '',
      description: '',
      images: [
        { url: 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=600&auto=format&fit=crop&q=80' },
      ],
    });
    setModalErr('');
    setModalOpen(true);
  };

  const openEdit = (p) => {
    setEditingProd(p);
    setUrlInput('');
    setForm({
      name: p.name || '',
      brand: p.brand || '',
      category: p.category?._id || p.category || '',
      price: p.price || '',
      oldPrice: p.oldPrice || '',
      costPrice: p.costs?.purchase || '',
      stock: p.stock ?? 0,
      lowStockThreshold: p.lowStockThreshold || 5,
      sku: p.sku || '',
      active: p.active !== false,
      shortDescription: p.shortDescription || '',
      description: p.description || '',
      images: p.images?.length ? p.images : (p.image ? [{ url: p.image }] : []),
    });
    setModalErr('');
    setModalOpen(true);
  };

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append('files', f));
      const res = await sapi('/uploads', { method: 'POST', body: fd });
      const uploadedList = Array.isArray(res) ? res : [res];

      setForm((prev) => ({
        ...prev,
        images: [
          ...prev.images,
          ...uploadedList.map((item) => ({ url: item.url, key: item.key })),
        ],
      }));
    } catch (err) {
      alert('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const addImageUrl = () => {
    if (!urlInput.trim()) return;
    setForm((prev) => ({
      ...prev,
      images: [...prev.images, { url: urlInput.trim() }],
    }));
    setUrlInput('');
  };

  const removeImage = (idx) => {
    setForm((prev) => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== idx),
    }));
  };

  const setCoverImage = (idx) => {
    if (idx === 0) return;
    setForm((prev) => {
      const copy = [...prev.images];
      const [chosen] = copy.splice(idx, 1);
      return { ...prev, images: [chosen, ...copy] };
    });
  };

  const generateSku = () => {
    const prefix = (form.brand || form.name || 'PRD').slice(0, 3).toUpperCase().replace(/[^A-Z]/g, 'X');
    const random = Math.floor(1000 + Math.random() * 9000);
    setForm((prev) => ({ ...prev, sku: `${prefix}-${Date.now().toString(36).toUpperCase()}-${random}` }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return setModalErr('Product title is required');
    if (!form.category) return setModalErr('Please select a category');
    if (!form.price || Number(form.price) <= 0) return setModalErr('Valid selling price is required');

    setSaving(true);
    setModalErr('');

    try {
      const payload = {
        ...form,
        price: Number(form.price),
        oldPrice: form.oldPrice ? Number(form.oldPrice) : undefined,
        costPrice: Number(form.costPrice || 0),
        stock: Number(form.stock || 0),
        lowStockThreshold: Number(form.lowStockThreshold || 5),
        image: form.images[0]?.url || '',
      };

      if (editingProd) {
        await sapi(`/sellers/products/${editingProd._id}`, {
          method: 'PUT',
          body: payload,
        });
      } else {
        await sapi('/sellers/products', {
          method: 'POST',
          body: payload,
        });
      }
      setModalOpen(false);
      loadProducts();
    } catch (err) {
      setModalErr(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`Are you sure you want to delete "${name}" from your store catalog?`)) return;
    try {
      await sapi(`/sellers/products/${id}`, { method: 'DELETE' });
      loadProducts();
    } catch (err) {
      alert(err.message);
    }
  };

  const filtered = products.filter((p) => {
    const matchQ = !q || p.name?.toLowerCase().includes(q.toLowerCase()) || p.sku?.toLowerCase().includes(q.toLowerCase());
    if (!matchQ) return false;
    if (stockFilter === 'low') return (p.stock || 0) <= (p.lowStockThreshold || 5) && (p.stock || 0) > 0;
    if (stockFilter === 'out') return (p.stock || 0) === 0;
    if (stockFilter === 'in') return (p.stock || 0) > (p.lowStockThreshold || 5);
    return true;
  });

  // Calculate live margin & profit preview in the form
  const curPrice = Number(form.price || 0);
  const curCost = Number(form.costPrice || 0);
  const curOldPrice = Number(form.oldPrice || 0);
  const commRate = seller?.commissionRate || 10;
  const platformFee = (curPrice * commRate) / 100;
  const netProfit = curPrice > 0 ? (curPrice - curCost - platformFee) : 0;
  const profitMargin = curPrice > 0 ? Math.round((netProfit / curPrice) * 100) : 0;
  const discountPercent = curOldPrice > curPrice ? Math.round(((curOldPrice - curPrice) / curOldPrice) * 100) : 0;

  return (
    <div className="seller-products-page">
      <div className="seller-page-header">
        <div>
          <h2>📦 Product Catalog & Listings</h2>
          <p>Add new products, adjust selling prices, upload high-res images, and monitor real-time stock levels.</p>
        </div>
        <button onClick={openAdd} className="seller-btn-pri">
          <Ic name="plus" size={17} /> Add New Product
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="seller-filter-bar">
        <div className="search-input-wrap">
          <Ic name="search" size={17} />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search products by title, SKU, or brand..."
          />
        </div>

        <div className="filter-chips">
          <button className={stockFilter === 'all' ? 'active' : ''} onClick={() => setStockFilter('all')}>
            All ({products.length})
          </button>
          <button className={stockFilter === 'in' ? 'active' : ''} onClick={() => setStockFilter('in')}>
            In Stock ({products.filter((p) => (p.stock || 0) > (p.lowStockThreshold || 5)).length})
          </button>
          <button className={stockFilter === 'low' ? 'active' : ''} onClick={() => setStockFilter('low')}>
            Low Stock ({products.filter((p) => (p.stock || 0) <= (p.lowStockThreshold || 5) && (p.stock || 0) > 0).length})
          </button>
          <button className={stockFilter === 'out' ? 'active' : ''} onClick={() => setStockFilter('out')}>
            Out of Stock ({products.filter((p) => (p.stock || 0) === 0).length})
          </button>
        </div>
      </div>

      {/* Products Table */}
      <div className="seller-card">
        <div className="seller-table-wrap">
          <table className="seller-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th>Selling Price</th>
                <th>Wholesale Cost</th>
                <th>Est. Profit / Unit</th>
                <th>Inventory Stock</th>
                <th>Total Sold</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan="9" className="text-center py-8 muted">Loading products catalog...</td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan="9" className="text-center py-8 muted">
                    No products found. Click <b>"Add New Product"</b> to create your first listing!
                  </td>
                </tr>
              )}
              {filtered.map((p) => {
                const cost = p.costs?.purchase || 0;
                const fee = (p.price * (seller?.commissionRate || 10)) / 100;
                const profit = p.price - cost - fee;
                const isLow = (p.stock || 0) <= (p.lowStockThreshold || 5) && (p.stock || 0) > 0;
                const isOut = (p.stock || 0) === 0;

                return (
                  <tr key={p._id}>
                    <td>
                      <div className="prod-cell">
                        <img
                          src={p.images?.[0]?.url || p.image || '/img/products/serum.svg'}
                          alt=""
                          className="prod-thumb"
                        />
                        <div>
                          <b className="prod-name-title">{p.name}</b>
                          <small className="muted block">SKU: {p.sku || 'N/A'} • {p.brand || 'Generic'}</small>
                        </div>
                      </div>
                    </td>
                    <td>{p.category?.name || 'Uncategorized'}</td>
                    <td>
                      <b>{money(p.price)}</b>
                      {p.oldPrice > p.price && <small className="old-price-del block">{money(p.oldPrice)}</small>}
                    </td>
                    <td>{money(cost)}</td>
                    <td>
                      <b className={profit >= 0 ? 'text-green' : 'text-red'}>{money(profit)}</b>
                    </td>
                    <td>
                      <span className={`stock-badge ${isOut ? 'out' : isLow ? 'low' : 'ok'}`}>
                        {p.stock || 0} units
                      </span>
                    </td>
                    <td>{p.sold || 0}</td>
                    <td>
                      <span className={`status-tag ${p.active !== false ? 'status-delivered' : 'status-cancelled'}`}>
                        {p.active !== false ? 'Active' : 'Draft'}
                      </span>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button onClick={() => openEdit(p)} className="btn-icon" title="Edit Product">
                          <Ic name="sparkle" size={15} /> Edit
                        </button>
                        <button onClick={() => handleDelete(p._id, p.name)} className="btn-icon text-red" title="Delete">
                          <Ic name="x" size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================
          ADD / EDIT PRODUCT MODAL (HIGHLY STYLED)
         ======================================================== */}
      {modalOpen && (
        <div className="seller-modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="seller-modal-dialog" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="modal-header-styled">
              <div className="modal-title-wrap">
                <div className="modal-icon-badge">
                  <Ic name={editingProd ? 'sparkle' : 'tag'} size={22} />
                </div>
                <div>
                  <h3 className="modal-heading-text">
                    {editingProd ? `Edit Product: ${editingProd.name}` : 'Add New Product to Store'}
                  </h3>
                  <p className="modal-subheading-text">
                    Fill in the product details, set wholesale pricing, and upload high-resolution images.
                  </p>
                </div>
              </div>

              <div className="modal-header-right">
                <label className="toggle-switch-wrap" title="Product active status">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) => setForm({ ...form, active: e.target.checked })}
                  />
                  <span className="toggle-slider"></span>
                  <span className="toggle-label">{form.active ? 'Active' : 'Draft'}</span>
                </label>
                <button onClick={() => setModalOpen(false)} className="modal-close-icon-btn" title="Close modal">
                  <Ic name="x" size={20} />
                </button>
              </div>
            </div>

            {modalErr && (
              <div className="modal-alert-error">
                <Ic name="shield" size={18} />
                <span>{modalErr}</span>
              </div>
            )}

            <form onSubmit={handleSave} className="seller-product-form">
              {/* SECTION 1: BASIC INFORMATION */}
              <div className="form-section-card">
                <div className="form-section-title">
                  <Ic name="box" size={18} />
                  <span>1. Basic Product Information</span>
                </div>

                <div className="form-grid-layout">
                  <div className="form-field full-width">
                    <label className="field-label">Product Title / Name *</label>
                    <input
                      type="text"
                      className="styled-input"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="e.g. Wireless Noise-Cancelling Headphones Pro"
                      required
                    />
                    <small className="field-hint">Use a descriptive title that customers search for.</small>
                  </div>

                  <div className="form-field">
                    <label className="field-label">Brand Name</label>
                    <input
                      type="text"
                      className="styled-input"
                      value={form.brand}
                      onChange={(e) => setForm({ ...form, brand: e.target.value })}
                      placeholder="e.g. Sony, Apple, Nike"
                    />
                  </div>

                  <div className="form-field">
                    <label className="field-label">Store Category *</label>
                    <select
                      className="styled-select"
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                      required
                    >
                      <option value="">Select Category</option>
                      {categories.map((c) => (
                        <option key={c._id} value={c._id}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-field">
                    <div className="flex justify-between items-center">
                      <label className="field-label">SKU / Product Code</label>
                      <button type="button" onClick={generateSku} className="sku-gen-btn">
                        ⚡ Auto-Generate
                      </button>
                    </div>
                    <input
                      type="text"
                      className="styled-input"
                      value={form.sku}
                      onChange={(e) => setForm({ ...form, sku: e.target.value })}
                      placeholder="e.g. SKU-HP100-PRO"
                    />
                  </div>

                  <div className="form-field">
                    <label className="field-label">Short Punchy Tagline / Highlight</label>
                    <input
                      type="text"
                      className="styled-input"
                      value={form.shortDescription}
                      onChange={(e) => setForm({ ...form, shortDescription: e.target.value })}
                      placeholder="e.g. 40-hour battery life with immersive spatial audio"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 2: PRICING & PROFIT CALCULATOR */}
              <div className="form-section-card">
                <div className="form-section-title">
                  <Ic name="banknote" size={18} />
                  <span>2. Pricing, Cost & Live Profit Calculation</span>
                </div>

                <div className="form-grid-layout">
                  <div className="form-field">
                    <label className="field-label">Customer Selling Price (₹) *</label>
                    <div className="currency-input-wrap">
                      <span className="currency-symbol">₹</span>
                      <input
                        type="number"
                        step="any"
                        min="1"
                        className="styled-input with-prefix"
                        value={form.price}
                        onChange={(e) => setForm({ ...form, price: e.target.value })}
                        placeholder="0.00"
                        required
                      />
                    </div>
                    <small className="field-hint">Actual price the customer will pay at checkout.</small>
                  </div>

                  <div className="form-field">
                    <div className="flex justify-between items-center">
                      <label className="field-label">Original / Compare Price (₹)</label>
                      {discountPercent > 0 && (
                        <span className="discount-live-badge">-{discountPercent}% OFF</span>
                      )}
                    </div>
                    <div className="currency-input-wrap">
                      <span className="currency-symbol">₹</span>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        className="styled-input with-prefix"
                        value={form.oldPrice}
                        onChange={(e) => setForm({ ...form, oldPrice: e.target.value })}
                        placeholder="0.00"
                      />
                    </div>
                    <small className="field-hint">Optional higher price to show a strikethrough sale badge.</small>
                  </div>

                  <div className="form-field">
                    <label className="field-label">Your Wholesale Cost Price (₹) *</label>
                    <div className="currency-input-wrap">
                      <span className="currency-symbol">₹</span>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        className="styled-input with-prefix"
                        value={form.costPrice}
                        onChange={(e) => setForm({ ...form, costPrice: e.target.value })}
                        placeholder="0.00"
                        required
                      />
                    </div>
                    <small className="field-hint">Your manufacturing or purchase cost per unit.</small>
                  </div>

                  <div className="form-field">
                    <label className="field-label">Platform Commission Fee</label>
                    <div className="readonly-box">
                      <b>{commRate}%</b>
                      <span className="muted-sm">({curPrice > 0 ? money(platformFee) : '₹0.00'} per unit)</span>
                    </div>
                  </div>
                </div>

                {/* LIVE PROFIT PREVIEW BOX */}
                <div className={`live-profit-card ${netProfit < 0 ? 'loss' : profitMargin >= 25 ? 'great' : 'ok'}`}>
                  <div className="profit-col">
                    <span className="profit-title">Estimated Net Profit / Unit</span>
                    <b className="profit-value">{curPrice > 0 ? money(netProfit) : '₹0.00'}</b>
                  </div>
                  <div className="profit-col">
                    <span className="profit-title">Estimated Profit Margin</span>
                    <b className="profit-value">{curPrice > 0 ? `${profitMargin}%` : '0%'}</b>
                  </div>
                  <div className="profit-badge-col">
                    {netProfit < 0 ? (
                      <span className="badge-loss">⚠️ Selling Below Cost Price</span>
                    ) : profitMargin >= 30 ? (
                      <span className="badge-great">🔥 High Profit Margin</span>
                    ) : (
                      <span className="badge-standard">✅ Healthy Profit</span>
                    )}
                  </div>
                </div>
              </div>

              {/* SECTION 3: INVENTORY & STOCK */}
              <div className="form-section-card">
                <div className="form-section-title">
                  <Ic name="package" size={18} />
                  <span>3. Inventory & Stock Control</span>
                </div>

                <div className="form-grid-layout">
                  <div className="form-field">
                    <label className="field-label">Stock Quantity in Warehouse *</label>
                    <input
                      type="number"
                      min="0"
                      className="styled-input"
                      value={form.stock}
                      onChange={(e) => setForm({ ...form, stock: e.target.value })}
                      required
                    />
                    <small className="field-hint">Available units ready to be dispatched.</small>
                  </div>

                  <div className="form-field">
                    <label className="field-label">Low Stock Alert Threshold</label>
                    <input
                      type="number"
                      min="1"
                      className="styled-input"
                      value={form.lowStockThreshold}
                      onChange={(e) => setForm({ ...form, lowStockThreshold: e.target.value })}
                    />
                    <small className="field-hint">You will be notified when stock dips below this.</small>
                  </div>
                </div>
              </div>

              {/* SECTION 4: PRODUCT GALLERY & PHOTOS */}
              <div className="form-section-card">
                <div className="form-section-title">
                  <Ic name="image" size={18} />
                  <span>4. Product Media & Photo Gallery</span>
                </div>

                {/* Upload & Add URL Toolbar */}
                <div className="gallery-toolbar">
                  <div className="url-add-box">
                    <input
                      type="url"
                      className="styled-input"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      placeholder="Paste Image URL (https://...)"
                    />
                    <button type="button" onClick={addImageUrl} className="btn-secondary-sm" disabled={!urlInput.trim()}>
                      + Add URL
                    </button>
                  </div>

                  <div className="upload-trigger-wrap">
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      multiple
                      style={{ display: 'none' }}
                    />
                    <button
                      type="button"
                      className="upload-dropzone-btn"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                    >
                      <Ic name="paperclip" size={17} />
                      <span>{uploading ? 'Uploading Photo...' : 'Upload Photos from Device'}</span>
                    </button>
                  </div>
                </div>

                {/* Image Thumbnails Gallery */}
                <div className="image-thumbs-grid">
                  {form.images.map((img, idx) => (
                    <div key={idx} className="thumb-item-card">
                      <img src={img.url} alt={`Product photo ${idx + 1}`} className="thumb-preview-img" />
                      {idx === 0 && <span className="cover-badge">⭐️ Cover Image</span>}
                      <div className="thumb-actions-overlay">
                        {idx !== 0 && (
                          <button
                            type="button"
                            onClick={() => setCoverImage(idx)}
                            className="thumb-set-cover-btn"
                            title="Set as Main Cover Photo"
                          >
                            Set Cover
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => removeImage(idx)}
                          className="thumb-delete-btn"
                          title="Delete photo"
                        >
                          <Ic name="x" size={15} />
                        </button>
                      </div>
                    </div>
                  ))}

                  {form.images.length === 0 && (
                    <div className="no-images-placeholder" onClick={() => fileInputRef.current?.click()}>
                      <Ic name="image" size={32} />
                      <p>No photos added yet. Click to upload high-quality product images.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* SECTION 5: DETAILED DESCRIPTION */}
              <div className="form-section-card">
                <div className="form-section-title">
                  <Ic name="fileText" size={18} />
                  <span>5. Detailed Description & Specifications</span>
                </div>

                <div className="form-field full-width">
                  <label className="field-label">Full Product Description</label>
                  <textarea
                    rows={5}
                    className="styled-textarea"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Write detailed product features, box contents, specifications, and warranty details..."
                  />
                  <small className="field-hint">Detailed descriptions increase conversion rates and build customer trust.</small>
                </div>
              </div>

              {/* MODAL FOOTER ACTIONS */}
              <div className="modal-sticky-footer">
                <button type="button" onClick={() => setModalOpen(false)} className="modal-btn-cancel">
                  Cancel
                </button>
                <button type="submit" className="modal-btn-submit" disabled={saving || uploading}>
                  {saving ? (
                    'Saving Listing...'
                  ) : editingProd ? (
                    <><Ic name="check" size={18} /> Save & Update Product</>
                  ) : (
                    <><Ic name="plus" size={18} /> Publish Product to Storefront</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
