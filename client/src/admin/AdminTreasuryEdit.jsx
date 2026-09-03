import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, money, utKeyFromUrl } from '../api.js';
import { Toggle, ErrorBox, OkBox, F } from './ui.jsx';
import Ic from '../components/Icons.jsx';

const EMPTY = {
  name: '',
  brand: '',
  category: '',
  price: '',
  costPrice: '',
  oldPrice: '',
  stock: 1000,
  lowStockThreshold: 10,
  sku: '',
  barcode: '',
  weight: '',
  dimensions: '',
  active: true,
  image: '',
  images: [],
  shortDescription: '',
  description: '',
  bullets: [],
  specifications: [],
  variants: [],
  sizes: [],
  tags: [],
  labels: [],
  primeEligible: true,
  freeDelivery: true,
};

export default function AdminTreasuryEdit() {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const fileRef = useRef(null);

  const [p, setP] = useState(EMPTY);
  const [cats, setCats] = useState([]);
  const [urlInput, setUrlInput] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [originalKeys, setOriginalKeys] = useState([]);

  useEffect(() => {
    api('/categories/admin/list')
      .then(setCats)
      .catch(() => {});

    if (!isNew) {
      api(`/treasury/${id}`)
        .then((data) => {
          const prod = data.product || data;
          setP({
            ...EMPTY,
            ...prod,
            category: prod.category?._id || prod.category || '',
            price: prod.price ?? '',
            costPrice: prod.costPrice ?? '',
            oldPrice: prod.oldPrice ?? '',
            stock: prod.stock ?? 0,
          });
          setOriginalKeys((prod.images || []).map((i) => i.key).filter(Boolean));
        })
        .catch((e) => setError(e.message));
    } else {
      setP((prev) => ({
        ...prev,
        sku: `TRZ-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`,
        images: [
          { url: 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=800&auto=format&fit=crop&q=80', key: null },
        ],
      }));
    }
  }, [id, isNew]);

  const set = (k) => (e) =>
    setP({ ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const uploadImages = async (e) => {
    const files = [...e.target.files];
    if (!files.length) return;
    setUploading(true);
    setError('');
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append('files', f));
      const uploaded = await api('/uploads', { method: 'POST', body: fd });
      const list = Array.isArray(uploaded) ? uploaded : [uploaded];
      setP((prev) => ({ ...prev, images: [...prev.images, ...list] }));
    } catch (err) {
      setError('Image upload failed: ' + err.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const addImageUrl = () => {
    if (!urlInput.trim()) return;
    setP((prev) => ({
      ...prev,
      images: [...prev.images, { url: urlInput.trim(), key: null }],
    }));
    setUrlInput('');
  };

  const removeImage = (idx) => {
    const im = p.images[idx];
    const key = im.key || utKeyFromUrl(im.url);
    if (key && !originalKeys.includes(key)) {
      api(`/uploads/${encodeURIComponent(key)}`, { method: 'DELETE' }).catch(() => {});
    }
    setP((prev) => ({ ...prev, images: prev.images.filter((_, i) => i !== idx) }));
  };

  const moveImage = (idx, dir) => {
    const arr = [...p.images];
    const j = idx + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    setP({ ...p, images: arr });
  };

  // List helpers (specifications, variants, bullets)
  const listAdd = (k, item) => setP({ ...p, [k]: [...(p[k] || []), item] });
  const listSet = (k, i, field, val) =>
    setP({
      ...p,
      [k]: p[k].map((x, n) => (n === i ? (field == null ? val : { ...x, [field]: val }) : x)),
    });
  const listDel = (k, i) => setP({ ...p, [k]: p[k].filter((_, n) => n !== i) });

  const save = async (e) => {
    e.preventDefault();
    if (!p.name?.trim()) return setError('Product title is required');
    if (!p.category) return setError('Please select a category');
    if (!p.price || Number(p.price) < 0) return setError('Valid retail price is required');

    setSaving(true);
    setError('');
    setOk('');

    try {
      const payload = {
        ...p,
        price: Number(p.price),
        costPrice: Number(p.costPrice || 0),
        oldPrice: p.oldPrice ? Number(p.oldPrice) : null,
        stock: Math.max(0, Number(p.stock || 0)),
        lowStockThreshold: Number(p.lowStockThreshold || 10),
        image: p.images[0]?.url || '',
      };

      if (isNew) {
        const created = await api('/treasury', { method: 'POST', body: payload });
        setOk('Master product created successfully in Treasury!');
        setTimeout(() => navigate(`/admin/treasury/${created._id}`), 700);
      } else {
        const updated = await api(`/treasury/${id}`, { method: 'PUT', body: payload });
        setP((prev) => ({ ...prev, ...updated }));
        setOk('Treasury product updated & synchronized across all seller listings!');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Live profit calculation
  const curPrice = Number(p.price || 0);
  const curCost = Number(p.costPrice || 0);
  const marginAmt = curPrice - curCost;
  const marginPct = curPrice > 0 ? Math.round((marginAmt / curPrice) * 100) : 0;

  return (
    <div style={{ maxWidth: '1080px', margin: '0 auto', paddingBottom: '60px' }}>
      <div className="admin-h1-row" style={{ marginBottom: '20px' }}>
        <div>
          <Link to="/admin/treasury" className="muted" style={{ fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
            ← Back to Product Treasury
          </Link>
          <h1 className="admin-h1">
            {isNew ? '✨ Add Master Product to Treasury' : `✏️ Edit Master: ${p.name || 'Product'}`}
          </h1>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <Link to="/admin/treasury" className="btn-sec">
            Cancel
          </Link>
          <button type="button" onClick={save} disabled={saving} className="btn-primary">
            {saving ? 'Saving…' : isNew ? 'Add to Treasury' : 'Save & Sync Everywhere'}
          </button>
        </div>
      </div>

      <ErrorBox error={error} />
      <OkBox message={ok} />

      <form onSubmit={save} className="admin-treasury-edit-grid">
        {/* Left Column: Core Info, Pricing, Description */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Basic Details Card */}
          <div className="card" style={{ padding: '24px' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '16px', color: '#0f172a' }}>Basic Information</h3>

            <F label="Product Title *" hint="Clear, descriptive title shown in the master catalog and seller stores">
              <input
                value={p.name}
                onChange={set('name')}
                placeholder="e.g. Sony WH-1000XM5 Wireless Noise Canceling Headphones"
                required
              />
            </F>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <F label="Category *">
                <select value={p.category} onChange={set('category')} required>
                  <option value="">Select Category</option>
                  {cats.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </F>

              <F label="Brand Name">
                <input value={p.brand} onChange={set('brand')} placeholder="e.g. Sony, Apple, Nike" />
              </F>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <F label="Master SKU">
                <input value={p.sku} onChange={set('sku')} placeholder="e.g. TRZ-SONY-001" />
              </F>

              <F label="Barcode / UPC / EAN">
                <input value={p.barcode} onChange={set('barcode')} placeholder="e.g. 190199220011" />
              </F>
            </div>
          </div>

          {/* Pricing & Stock Card */}
          <div className="card" style={{ padding: '24px' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '16px', color: '#0f172a' }}>
              💰 Pricing & Central Inventory
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
              <F label="Recommended Retail Price ($) *">
                <input
                  type="number"
                  step="0.01"
                  value={p.price}
                  onChange={set('price')}
                  placeholder="e.g. 399.99"
                  required
                />
              </F>

              <F label="Wholesale Cost Price ($)" hint="Admin cost / what seller is credited">
                <input
                  type="number"
                  step="0.01"
                  value={p.costPrice}
                  onChange={set('costPrice')}
                  placeholder="e.g. 280.00"
                />
              </F>

              <F label="Compare-At / Strike Price ($)">
                <input
                  type="number"
                  step="0.01"
                  value={p.oldPrice || ''}
                  onChange={set('oldPrice')}
                  placeholder="e.g. 449.99"
                />
              </F>
            </div>

            {/* Profit Margin Preview Callout */}
            {curPrice > 0 && curCost > 0 && (
              <div
                style={{
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  borderRadius: '8px',
                  padding: '12px 16px',
                  marginBottom: '16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <span style={{ fontSize: '12px', color: '#166534', fontWeight: 600 }}>
                    ESTIMATED SELLER MARGIN:
                  </span>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: '#15803d' }}>
                    ${marginAmt.toFixed(2)} / unit ({marginPct}%)
                  </div>
                </div>
                <div style={{ fontSize: '12px', color: '#166534', maxWidth: '240px', textAlign: 'right' }}>
                  Sellers see this profit potential when deciding to add this item to their store.
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <F
                label="Central Warehouse Stock (Pieces) *"
                hint="Total physical inventory in treasury warehouse. All sellers share this central pool."
              >
                <input
                  type="number"
                  min="0"
                  value={p.stock}
                  onChange={set('stock')}
                  placeholder="e.g. 1000"
                  required
                />
              </F>

              <F label="Low Stock Alert Threshold">
                <input
                  type="number"
                  min="0"
                  value={p.lowStockThreshold}
                  onChange={set('lowStockThreshold')}
                  placeholder="10"
                />
              </F>
            </div>
          </div>

          {/* Media & Images Card */}
          <div className="card" style={{ padding: '24px' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '16px', color: '#0f172a' }}>
              🖼️ Product Gallery (Upload or URL)
            </h3>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
              <button
                type="button"
                className="btn-sec"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Ic name="upload" size={15} /> {uploading ? 'Uploading…' : 'Upload Images'}
              </button>
              <input
                ref={fileRef}
                type="file"
                multiple
                accept="image/*"
                onChange={uploadImages}
                style={{ display: 'none' }}
              />

              <div style={{ display: 'flex', gap: '6px', flex: 1 }}>
                <input
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="Or paste external image URL and click Add…"
                  style={{ flex: 1 }}
                />
                <button type="button" onClick={addImageUrl} className="btn-sec">
                  + Add URL
                </button>
              </div>
            </div>

            {p.images.length === 0 ? (
              <p className="muted" style={{ textAlign: 'center', padding: '24px', background: '#f8fafc', borderRadius: '8px' }}>
                No images added yet. Upload high-res images or paste URLs.
              </p>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
                  gap: '12px',
                }}
              >
                {p.images.map((im, i) => (
                  <div
                    key={i}
                    style={{
                      position: 'relative',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      border: i === 0 ? '2px solid #2563eb' : '1px solid #e2e8f0',
                      background: '#fff',
                    }}
                  >
                    <img
                      src={im.url}
                      alt=""
                      style={{ width: '100%', height: '95px', objectFit: 'cover', display: 'block' }}
                    />
                    {i === 0 && (
                      <span
                        style={{
                          position: 'absolute',
                          top: 4,
                          left: 4,
                          background: '#2563eb',
                          color: '#fff',
                          fontSize: '10px',
                          fontWeight: 700,
                          padding: '2px 5px',
                          borderRadius: '4px',
                        }}
                      >
                        COVER
                      </span>
                    )}
                    <div
                      style={{
                        padding: '4px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        background: '#f8fafc',
                      }}
                    >
                      <div>
                        {i > 0 && (
                          <button
                            type="button"
                            onClick={() => moveImage(i, -1)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px' }}
                          >
                            ◀
                          </button>
                        )}
                        {i < p.images.length - 1 && (
                          <button
                            type="button"
                            onClick={() => moveImage(i, 1)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px' }}
                          >
                            ▶
                          </button>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeImage(i)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: '12px' }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Description & Specifications Card */}
          <div className="card" style={{ padding: '24px' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '16px', color: '#0f172a' }}>
              📝 Descriptions & Highlights
            </h3>

            <F label="Short Summary / Subtitle">
              <input
                value={p.shortDescription}
                onChange={set('shortDescription')}
                placeholder="One or two sentences summarizing the product"
              />
            </F>

            <F label="Full Product Description">
              <textarea
                rows={5}
                value={p.description}
                onChange={set('description')}
                placeholder="Detailed features, specifications, and warranty details…"
              />
            </F>

            {/* Bullet Points */}
            <div style={{ marginTop: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600 }}>Key Feature Bullets</label>
                <button
                  type="button"
                  onClick={() => listAdd('bullets', '')}
                  className="btn-sec"
                  style={{ fontSize: '11px', padding: '2px 8px' }}
                >
                  + Add Bullet
                </button>
              </div>

              {(p.bullets || []).map((b, i) => (
                <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <input
                    value={b}
                    onChange={(e) => listSet('bullets', i, null, e.target.value)}
                    placeholder="e.g. Industry-leading Noise Cancellation with Dual Processors"
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    onClick={() => listDel('bullets', i)}
                    style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer' }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            {/* Technical Specifications */}
            <div style={{ marginTop: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600 }}>Technical Specifications</label>
                <button
                  type="button"
                  onClick={() => listAdd('specifications', { key: '', value: '' })}
                  className="btn-sec"
                  style={{ fontSize: '11px', padding: '2px 8px' }}
                >
                  + Add Spec
                </button>
              </div>

              {(p.specifications || []).map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <input
                    value={s.key}
                    onChange={(e) => listSet('specifications', i, 'key', e.target.value)}
                    placeholder="Feature (e.g. Battery Life)"
                    style={{ flex: 1 }}
                  />
                  <input
                    value={s.value}
                    onChange={(e) => listSet('specifications', i, 'value', e.target.value)}
                    placeholder="Value (e.g. Up to 30 hours)"
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    onClick={() => listDel('specifications', i)}
                    style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer' }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Settings, Shipping, Status */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Status & Availability Card */}
          <div className="card" style={{ padding: '20px' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '15px', color: '#0f172a' }}>Publishing Status</h3>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <b style={{ display: 'block', fontSize: '13.5px' }}>Active in Treasury</b>
                <span className="muted" style={{ fontSize: '12px' }}>
                  Visible to sellers for store import
                </span>
              </div>
              <Toggle on={p.active} onChange={() => setP({ ...p, active: !p.active })} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <b style={{ display: 'block', fontSize: '13.5px' }}>Prime Delivery</b>
                <span className="muted" style={{ fontSize: '12px' }}>Fast warehouse fulfillment</span>
              </div>
              <Toggle on={p.primeEligible} onChange={() => setP({ ...p, primeEligible: !p.primeEligible })} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <b style={{ display: 'block', fontSize: '13.5px' }}>Free Shipping</b>
                <span className="muted" style={{ fontSize: '12px' }}>Standard free shipping</span>
              </div>
              <Toggle on={p.freeDelivery} onChange={() => setP({ ...p, freeDelivery: !p.freeDelivery })} />
            </div>
          </div>

          {/* Shipping Dimensions Card */}
          <div className="card" style={{ padding: '20px' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '15px', color: '#0f172a' }}>Logistics & Shipping</h3>

            <F label="Package Weight">
              <input value={p.weight} onChange={set('weight')} placeholder="e.g. 1.2 kg or 2.5 lbs" />
            </F>

            <F label="Dimensions (L × W × H)">
              <input value={p.dimensions} onChange={set('dimensions')} placeholder="e.g. 24 x 18 x 8 cm" />
            </F>
          </div>

          {/* Save Action Sticky Card */}
          <div className="card" style={{ padding: '20px', background: '#f8fafc' }}>
            <button
              type="submit"
              disabled={saving}
              className="btn-primary"
              style={{ width: '100%', padding: '12px', fontSize: '14px', fontWeight: 700 }}
            >
              {saving ? 'Saving Changes…' : isNew ? 'Publish to Treasury' : 'Save & Sync Everywhere'}
            </button>

            <Link
              to="/admin/treasury"
              className="btn-sec"
              style={{ display: 'block', textAlign: 'center', width: '100%', marginTop: '10px', padding: '9px' }}
            >
              Cancel
            </Link>
          </div>
        </div>
      </form>
    </div>
  );
}
