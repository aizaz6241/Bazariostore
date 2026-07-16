import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, money, utKeyFromUrl } from '../api.js';
import { PRODUCT_LABELS } from '../data.js';
import { Toggle, ErrorBox, OkBox, F } from './ui.jsx';
import Ic from '../components/Icons.jsx';

const LABEL_KEYS = ['new', 'hot', 'best', 'featured', 'sale', 'limited', 'out'];

const EMPTY = {
  name: '', brand: '', category: '', price: '', oldPrice: '', active: true,
  sku: '', stock: 0, lowStockThreshold: 5, weight: '', dimensions: '',
  costs: { purchase: 0, delivery: 0, packaging: 0, tax: 0, other: 0 },
  labels: [], tags: [], images: [],
  shortDescription: '', description: '', bullets: [], howToUse: '', ingredients: '',
  specifications: [], variants: [], sizes: [],
  seoTitle: '', seoDescription: '',
};

export default function ProductEdit() {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const fileRef = useRef(null);

  const [p, setP] = useState(EMPTY);
  const [originalKeys, setOriginalKeys] = useState([]);
  const [cats, setCats] = useState([]);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    api('/categories/admin/list').then(setCats).catch(() => {});
    if (!isNew) {
      api(`/products/admin/${id}`)
        .then((prod) => {
          setP({ ...EMPTY, ...prod, category: prod.category || '', costs: { ...EMPTY.costs, ...(prod.costs || {}) } });
          setOriginalKeys((prod.images || []).map((i) => i.key).filter(Boolean));
        })
        .catch((e) => setError(e.message));
    }
  }, [id, isNew]);

  const set = (k) => (e) => setP({ ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const setCost = (k) => (e) => setP({ ...p, costs: { ...p.costs, [k]: Number(e.target.value) || 0 } });

  const toggleLabel = (l) =>
    setP({ ...p, labels: p.labels.includes(l) ? p.labels.filter((x) => x !== l) : [...p.labels, l] });

  const uploadImages = async (e) => {
    const files = [...e.target.files];
    if (!files.length) return;
    setUploading(true);
    setError('');
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append('files', f));
      const uploaded = await api('/uploads', { method: 'POST', body: fd });
      setP((prev) => ({ ...prev, images: [...prev.images, ...uploaded] }));
    } catch (err) {
      setError('Image upload failed: ' + err.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const removeImage = async (idx) => {
    const im = p.images[idx];
    // agar image isi session mein upload hui thi (save se pehle), UploadThing se turant delete
    // karo taake space free ho; purani (saved) images ka cleanup server PUT par karta hai
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

  // list-of-objects editors (specs / variants / sizes / bullets)
  const listAdd = (k, item) => setP({ ...p, [k]: [...(p[k] || []), item] });
  const listSet = (k, i, field, val) =>
    setP({ ...p, [k]: p[k].map((x, n) => (n === i ? (field == null ? val : { ...x, [field]: val }) : x)) });
  const listDel = (k, i) => setP({ ...p, [k]: p[k].filter((_, n) => n !== i) });

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setOk('');
    try {
      const body = {
        ...p,
        price: Number(p.price),
        oldPrice: p.oldPrice ? Number(p.oldPrice) : null,
        stock: Number(p.stock) || 0,
        lowStockThreshold: Number(p.lowStockThreshold) || 5,
        category: p.category?._id || p.category || null,
        tags: typeof p.tags === 'string' ? p.tags.split(',').map((t) => t.trim()).filter(Boolean) : p.tags,
        variants: (p.variants || []).map((v) => ({
          name: v.name,
          options: typeof v.options === 'string' ? v.options.split(',').map((o) => o.trim()).filter(Boolean) : v.options,
        })),
      };
      const saved = isNew
        ? await api('/products', { method: 'POST', body })
        : await api(`/products/${id}`, { method: 'PUT', body });
      setOk('Product saved!');
      if (isNew) navigate(`/admin/products/${saved._id}`, { replace: true });
      else {
        setP({ ...EMPTY, ...saved, costs: { ...EMPTY.costs, ...(saved.costs || {}) } });
        setOriginalKeys((saved.images || []).map((i) => i.key).filter(Boolean));
      }
      setTimeout(() => setOk(''), 2500);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const unitCost = Object.values(p.costs || {}).reduce((s, v) => s + (Number(v) || 0), 0);
  const netUnit = (Number(p.price) || 0) - unitCost;

  return (
    <>
      <Link to="/admin/products" className="back-link"><Ic name="arrowLeft" size={14} /> All products</Link>
      <div className="admin-h1-row">
        <h1 className="admin-h1">{isNew ? 'Add Product' : 'Edit Product'}</h1>
        <label className="inline-toggle">Active <Toggle on={!!p.active} onChange={() => setP({ ...p, active: !p.active })} /></label>
      </div>
      <ErrorBox error={error} />
      <OkBox msg={ok} />

      <form onSubmit={save} className="pedit">
        <div className="card form-card">
          <h3>Basic Information</h3>
          <div className="form-grid">
            <F label="Product Title *" full><input value={p.name} onChange={set('name')} required /></F>
            <F label="Brand"><input value={p.brand} onChange={set('brand')} /></F>
            <F label="Category">
              <select value={p.category?._id || p.category || ''} onChange={set('category')}>
                <option value="">Select category</option>
                {cats.map((c) => <option key={c._id} value={c._id}>{c.name}{c.active ? '' : ' (inactive)'}</option>)}
              </select>
            </F>
            <F label="Selling Price (Rs) *"><input type="number" value={p.price} onChange={set('price')} required min={1} /></F>
            <F label="Old Price (strike-through)"><input type="number" value={p.oldPrice || ''} onChange={set('oldPrice')} /></F>
          </div>
          <F label="Short Description" full><textarea rows={2} value={p.shortDescription} onChange={set('shortDescription')} /></F>
          <F label="Full Description" full><textarea rows={4} value={p.description} onChange={set('description')} /></F>
        </div>

        <div className="card form-card">
          <h3>Images (multiple — pehli image primary hogi)</h3>
          <div className="img-grid">
            {(p.images || []).map((im, i) => (
              <div className="img-tile" key={i}>
                <img src={im.url} alt="" />
                {i === 0 && <span className="img-primary">PRIMARY</span>}
                <div className="img-actions">
                  <button type="button" onClick={() => moveImage(i, -1)} aria-label="Move left"><Ic name="chevLeft" size={13} /></button>
                  <button type="button" onClick={() => removeImage(i)} aria-label="Remove" className="danger"><Ic name="x" size={13} /></button>
                  <button type="button" onClick={() => moveImage(i, 1)} aria-label="Move right"><Ic name="chevRight" size={13} /></button>
                </div>
              </div>
            ))}
            <label className={'img-add' + (uploading ? ' busy' : '')}>
              <Ic name="plus" size={20} />
              <span>{uploading ? 'Uploading…' : 'Upload Images'}</span>
              <input ref={fileRef} type="file" accept="image/*" multiple onChange={uploadImages} hidden />
            </label>
          </div>
          <small className="muted-sm">Images UploadThing par host hoti hain — remove/replace karne par wahan se bhi delete ho jati hain.</small>
        </div>

        <div className="card form-card">
          <h3>Inventory & Physical</h3>
          <div className="form-grid form-grid-3">
            <F label="SKU"><input value={p.sku} onChange={set('sku')} /></F>
            <F label="Stock Quantity"><input type="number" value={p.stock} onChange={set('stock')} /></F>
            <F label="Low Stock Alert At"><input type="number" value={p.lowStockThreshold} onChange={set('lowStockThreshold')} /></F>
            <F label="Weight / Size"><input value={p.weight} onChange={set('weight')} placeholder="e.g. 30ml / 200g" /></F>
            <F label="Dimensions"><input value={p.dimensions} onChange={set('dimensions')} placeholder="e.g. 10 x 4 x 4 cm" /></F>
          </div>
        </div>

        <div className="card form-card">
          <h3>Cost & Profit (per unit)</h3>
          <div className="form-grid form-grid-3">
            <F label="Purchase Cost"><input type="number" value={p.costs.purchase} onChange={setCost('purchase')} /></F>
            <F label="Delivery Charges"><input type="number" value={p.costs.delivery} onChange={setCost('delivery')} /></F>
            <F label="Packaging Cost"><input type="number" value={p.costs.packaging} onChange={setCost('packaging')} /></F>
            <F label="Tax"><input type="number" value={p.costs.tax} onChange={setCost('tax')} /></F>
            <F label="Other Expenses"><input type="number" value={p.costs.other} onChange={setCost('other')} /></F>
          </div>
          <div className="profit-preview">
            <span>Total Unit Cost: <b>{money(unitCost)}</b></span>
            <span>Gross Profit/unit: <b>{money((Number(p.price) || 0) - (Number(p.costs.purchase) || 0))}</b></span>
            <span className={netUnit < 0 ? 'stock-out' : 'stock-ok'}>Net Profit/unit: <b>{money(netUnit)}</b> ({p.price ? Math.round((netUnit / Number(p.price)) * 100) : 0}%)</span>
          </div>
        </div>

        <div className="card form-card">
          <h3>Labels & Tags</h3>
          <div className="label-picker">
            {LABEL_KEYS.map((l) => (
              <button
                type="button"
                key={l}
                className={'chip' + (p.labels.includes(l) ? ' chip-on' : '')}
                onClick={() => toggleLabel(l)}
              >
                {PRODUCT_LABELS[l]?.text || l}
              </button>
            ))}
          </div>
          <F label="Tags (comma separated)">
            <input
              value={Array.isArray(p.tags) ? p.tags.join(', ') : p.tags}
              onChange={(e) => setP({ ...p, tags: e.target.value })}
              placeholder="serum, skincare, hydrating"
            />
          </F>
        </div>

        <div className="card form-card">
          <h3>Specifications</h3>
          {(p.specifications || []).map((s, i) => (
            <div className="list-row" key={i}>
              <input value={s.key} onChange={(e) => listSet('specifications', i, 'key', e.target.value)} placeholder="Name (e.g. Volume)" />
              <input value={s.value} onChange={(e) => listSet('specifications', i, 'value', e.target.value)} placeholder="Value (e.g. 30ml)" />
              <button type="button" className="row-link danger" onClick={() => listDel('specifications', i)}><Ic name="x" size={14} /></button>
            </div>
          ))}
          <button type="button" className="btn-outline btn-sm" onClick={() => listAdd('specifications', { key: '', value: '' })}><Ic name="plus" size={13} /> Add Specification</button>
        </div>

        <div className="card form-card">
          <h3>Variants (Color, Shade, etc.)</h3>
          {(p.variants || []).map((v, i) => (
            <div className="list-row" key={i}>
              <input value={v.name} onChange={(e) => listSet('variants', i, 'name', e.target.value)} placeholder="Variant name (e.g. Color)" />
              <input
                value={Array.isArray(v.options) ? v.options.join(', ') : v.options}
                onChange={(e) => listSet('variants', i, 'options', e.target.value)}
                placeholder="Options, comma separated (e.g. Red, Pink, Nude)"
              />
              <button type="button" className="row-link danger" onClick={() => listDel('variants', i)}><Ic name="x" size={14} /></button>
            </div>
          ))}
          <button type="button" className="btn-outline btn-sm" onClick={() => listAdd('variants', { name: '', options: '' })}><Ic name="plus" size={13} /> Add Variant Group</button>

          <h3 style={{ marginTop: 18 }}>Sizes (with own price)</h3>
          {(p.sizes || []).map((s, i) => (
            <div className="list-row" key={i}>
              <input value={s.label} onChange={(e) => listSet('sizes', i, 'label', e.target.value)} placeholder="Label (e.g. 30ml)" />
              <input type="number" value={s.price} onChange={(e) => listSet('sizes', i, 'price', Number(e.target.value) || 0)} placeholder="Price" />
              <button type="button" className="row-link danger" onClick={() => listDel('sizes', i)}><Ic name="x" size={14} /></button>
            </div>
          ))}
          <button type="button" className="btn-outline btn-sm" onClick={() => listAdd('sizes', { label: '', price: 0 })}><Ic name="plus" size={13} /> Add Size</button>
        </div>

        <div className="card form-card">
          <h3>Details</h3>
          <F label="Key Points (one per line — product page checklist)" full>
            <textarea
              rows={4}
              value={(p.bullets || []).join('\n')}
              onChange={(e) => setP({ ...p, bullets: e.target.value.split('\n').filter((b) => b.trim()) })}
            />
          </F>
          <F label="How To Use" full><textarea rows={3} value={p.howToUse} onChange={set('howToUse')} /></F>
          <F label="Ingredients" full><textarea rows={3} value={p.ingredients} onChange={set('ingredients')} /></F>
        </div>

        <div className="card form-card">
          <h3>SEO</h3>
          <F label="SEO Title" full><input value={p.seoTitle} onChange={set('seoTitle')} /></F>
          <F label="SEO Description" full><textarea rows={2} value={p.seoDescription} onChange={set('seoDescription')} /></F>
        </div>

        <div className="form-actions sticky-actions">
          <button className="btn-primary btn-lg" disabled={saving}>{saving ? 'Saving…' : 'SAVE PRODUCT'}</button>
          <Link to="/admin/products" className="btn-outline">CANCEL</Link>
        </div>
      </form>
    </>
  );
}
