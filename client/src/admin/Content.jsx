import { useEffect, useRef, useState } from 'react';
import { api, utKeyFromUrl } from '../api.js';
import { useContent } from '../content.jsx';
import { ErrorBox, OkBox } from './ui.jsx';
import Ic from '../components/Icons.jsx';

// ---- deep path helpers ----
const get = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
function set(obj, path, val) {
  const keys = path.split('.');
  const clone = structuredClone(obj || {});
  let cur = clone;
  keys.slice(0, -1).forEach((k, i) => {
    if (cur[k] == null) cur[k] = /^\d+$/.test(keys[i + 1]) ? [] : {};
    cur = cur[k];
  });
  cur[keys[keys.length - 1]] = val;
  return clone;
}

// ---- editable-sections schema (website ke tamam sections/pages/elements) ----
const SCHEMA = [
  {
    title: 'Top Bar',
    fields: [
      { path: 'topbar.welcome', label: 'Welcome text' },
      { path: 'topbar.promos', label: 'Promo items', list: [{ key: 'text', label: 'Text' }, { key: 'icon', label: 'Icon (badgeCheck/truck/banknote/tag/refresh/shield)' }] },
    ],
  },
  {
    title: 'Logo & Branding',
    fields: [
      { path: 'logo.script', label: 'Script word (e.g. Official)' },
      { path: 'logo.name', label: 'Brand name' },
      { path: 'logo.tagline', label: 'Tagline' },
    ],
  },
  {
    title: 'Hero Slider',
    fields: [
      { path: 'hero.button', label: 'Button text' },
      {
        path: 'hero.slides', label: 'Slides',
        list: [
          { key: 'a', label: 'Heading line 1' },
          { key: 'b', label: 'Heading line 2 (pink)' },
          { key: 'sub', label: 'Subtitle', type: 'textarea' },
          { key: 'imgs.0', label: 'Image 1', type: 'image' },
          { key: 'imgs.1', label: 'Image 2', type: 'image' },
          { key: 'imgs.2', label: 'Image 3', type: 'image' },
          { key: 'imgs.3', label: 'Image 4', type: 'image' },
        ],
      },
      { path: 'hero.features', label: 'Feature callouts', list: [{ key: 'icon', label: 'Icon' }, { key: 'l1', label: 'Line 1' }, { key: 'l2', label: 'Line 2' }] },
    ],
  },
  {
    title: 'Section Titles',
    fields: [
      { path: 'sections.categoriesTitle', label: 'Categories section title' },
      { path: 'sections.featuredTitle', label: 'Featured products title' },
      { path: 'sections.brandsTitle', label: 'Brands section title' },
    ],
  },
  {
    title: 'Promo Row (30% OFF / New Arrivals cards)',
    fields: [
      { path: 'promoRow.left.small', label: 'Left card — small text' },
      { path: 'promoRow.left.big', label: 'Left card — big text' },
      { path: 'promoRow.left.span', label: 'Left card — sub text' },
      { path: 'promoRow.left.btn', label: 'Left card — button' },
      { path: 'promoRow.left.img', label: 'Left card — image', type: 'image' },
      { path: 'promoRow.middle', label: 'Middle features', list: [{ key: 'icon', label: 'Icon' }, { key: 't', label: 'Line 1' }, { key: 's', label: 'Line 2' }] },
      { path: 'promoRow.right.big', label: 'Right card — big text' },
      { path: 'promoRow.right.span', label: 'Right card — sub text' },
      { path: 'promoRow.right.btn', label: 'Right card — button' },
      { path: 'promoRow.right.img', label: 'Right card — image', type: 'image' },
      { path: 'promoRow.right.img2', label: 'Right card — image 2', type: 'image' },
    ],
  },
  {
    title: 'Brand Logos Strip',
    fields: [{ path: 'brands', label: 'Brands', list: [{ key: 'name', label: 'Name' }, { key: 'sub', label: 'Sub text' }] }],
  },
  {
    title: 'Trust Strip (pre-footer icons)',
    fields: [{ path: 'trustStrip', label: 'Items', list: [{ key: 'icon', label: 'Icon' }, { key: 'title', label: 'Title' }, { key: 'sub', label: 'Subtitle' }] }],
  },
  {
    title: 'Footer',
    fields: [
      { path: 'footer.whyTitle', label: '"Why choose" heading' },
      { path: 'footer.why', label: 'Why-choose points', list: 'string' },
      { path: 'footer.contact.location', label: 'Location' },
      { path: 'footer.contact.email', label: 'Support email' },
      { path: 'footer.contact.phone', label: 'Phone' },
      { path: 'footer.contact.hours', label: 'Hours' },
      { path: 'footer.copyright', label: 'Copyright line' },
    ],
  },
  {
    title: 'Social Links',
    fields: [
      { path: 'social.facebook', label: 'Facebook URL' },
      { path: 'social.instagram', label: 'Instagram URL' },
      { path: 'social.tiktok', label: 'TikTok URL' },
      { path: 'social.youtube', label: 'YouTube URL' },
      { path: 'social.whatsapp', label: 'WhatsApp link' },
    ],
  },
  {
    title: 'Chat Widget',
    fields: [
      { path: 'chatWidget.title', label: 'Title' },
      { path: 'chatWidget.subtitle', label: 'Subtitle' },
      { path: 'chatWidget.welcome', label: 'Welcome message', type: 'textarea' },
    ],
  },
  {
    title: 'Policy Pages',
    fields: [
      { path: 'pages.shipping-policy.title', label: 'Shipping — title' },
      { path: 'pages.shipping-policy.body', label: 'Shipping — body', type: 'textarea' },
      { path: 'pages.returns-policy.title', label: 'Returns — title' },
      { path: 'pages.returns-policy.body', label: 'Returns — body', type: 'textarea' },
      { path: 'pages.terms.title', label: 'Terms — title' },
      { path: 'pages.terms.body', label: 'Terms — body', type: 'textarea' },
      { path: 'pages.privacy.title', label: 'Privacy — title' },
      { path: 'pages.privacy.body', label: 'Privacy — body', type: 'textarea' },
      { path: 'pages.faqs.title', label: 'FAQs — title' },
      { path: 'pages.faqs.body', label: 'FAQs — body', type: 'textarea' },
    ],
  },
];

function ImageField({ value, onChange }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const upload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('files', file);
      const [up] = await api('/uploads', { method: 'POST', body: fd });
      // purani UploadThing image replace hui — space free karne ke liye delete
      const oldKey = utKeyFromUrl(value);
      if (oldKey) api(`/uploads/${encodeURIComponent(oldKey)}`, { method: 'DELETE' }).catch(() => {});
      onChange(up.url);
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = '';
    }
  };
  return (
    <div className="cat-img-row">
      {value && <span className="cart-thumb"><img src={value} alt="" /></span>}
      <input value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder="/img/... ya upload karein" style={{ flex: 1 }} />
      <label className="btn-outline btn-sm">
        {busy ? '…' : 'Upload'}
        <input ref={ref} type="file" accept="image/*" hidden onChange={upload} />
      </label>
    </div>
  );
}

export default function Content() {
  const { refresh } = useContent();
  const [content, setContent] = useState(null);
  const [openSec, setOpenSec] = useState(0);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api('/content').then(setContent).catch((e) => setError(e.message));
  }, []);

  if (!content) return <p className="muted">Loading…</p>;

  const update = (path, val) => setContent((c) => set(c, path, val));

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await api('/content', { method: 'PUT', body: content });
      setOk('Website content saved — storefront par live ho gaya!');
      refresh();
      setTimeout(() => setOk(''), 3000);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const renderField = (f, basePath = '') => {
    const path = basePath ? `${basePath}.${f.path || f.key}` : f.path;
    const value = get(content, path);

    if (f.list) {
      const arr = Array.isArray(value) ? value : [];
      return (
        <div className="content-list" key={path}>
          <label className="content-list-label">{f.label}</label>
          {arr.map((item, i) => (
            <div className="content-list-item" key={i}>
              <div className="content-list-fields">
                {f.list === 'string' ? (
                  <input value={item || ''} onChange={(e) => update(`${path}.${i}`, e.target.value)} />
                ) : (
                  f.list.map((sub) =>
                    sub.type === 'image' ? (
                      <div className="field" key={sub.key}>
                        <label>{sub.label}</label>
                        <ImageField value={get(content, `${path}.${i}.${sub.key}`)} onChange={(v) => update(`${path}.${i}.${sub.key}`, v)} />
                      </div>
                    ) : sub.type === 'textarea' ? (
                      <div className="field" key={sub.key}>
                        <label>{sub.label}</label>
                        <textarea rows={2} value={get(content, `${path}.${i}.${sub.key}`) || ''} onChange={(e) => update(`${path}.${i}.${sub.key}`, e.target.value)} />
                      </div>
                    ) : (
                      <div className="field" key={sub.key}>
                        <label>{sub.label}</label>
                        <input value={get(content, `${path}.${i}.${sub.key}`) || ''} onChange={(e) => update(`${path}.${i}.${sub.key}`, e.target.value)} />
                      </div>
                    )
                  )
                )}
              </div>
              <button type="button" className="row-link danger" onClick={() => update(path, arr.filter((_, n) => n !== i))} aria-label="Remove">
                <Ic name="x" size={14} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn-outline btn-sm"
            onClick={() => update(path, [...arr, f.list === 'string' ? '' : Object.fromEntries(f.list.map((s) => [s.key.split('.')[0], s.key.includes('.') ? [] : ''])) ])}
          >
            <Ic name="plus" size={13} /> Add item
          </button>
        </div>
      );
    }

    if (f.type === 'image')
      return (
        <div className="field field-full" key={path}>
          <label>{f.label}</label>
          <ImageField value={value} onChange={(v) => update(path, v)} />
        </div>
      );

    if (f.type === 'textarea')
      return (
        <div className="field field-full" key={path}>
          <label>{f.label}</label>
          <textarea rows={5} value={value || ''} onChange={(e) => update(path, e.target.value)} />
        </div>
      );

    return (
      <div className="field" key={path}>
        <label>{f.label}</label>
        <input value={value || ''} onChange={(e) => update(path, e.target.value)} />
      </div>
    );
  };

  return (
    <>
      <div className="admin-h1-row">
        <h1 className="admin-h1">Website Content</h1>
        <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'SAVE & PUBLISH'}</button>
      </div>
      <p className="muted-sm">Website ke tamam sections, pages aur elements yahan se edit karein — save karte hi storefront par live ho jata hai.</p>
      <ErrorBox error={error} />
      <OkBox msg={ok} />

      {SCHEMA.map((sec, i) => (
        <div className="card content-sec" key={sec.title}>
          <button type="button" className="content-sec-head" onClick={() => setOpenSec(openSec === i ? -1 : i)}>
            <b>{sec.title}</b>
            <Ic name="chevDown" size={15} className={openSec === i ? 'rot' : ''} />
          </button>
          {openSec === i && <div className="content-sec-body">{sec.fields.map((f) => renderField(f))}</div>}
        </div>
      ))}

      <div className="form-actions sticky-actions">
        <button className="btn-primary btn-lg" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'SAVE & PUBLISH'}</button>
      </div>
    </>
  );
}
