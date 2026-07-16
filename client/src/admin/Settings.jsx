import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Toggle, ErrorBox, OkBox, F } from './ui.jsx';

const CRED_LABELS = {
  merchantId: 'Merchant ID',
  storeId: 'Store ID',
  apiKey: 'API Key',
  apiSecret: 'API Secret',
  password: 'Password',
  integritySalt: 'Integrity Salt',
  gateway: 'Gateway Name (e.g. PayFast)',
};

export default function Settings() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api('/settings/admin').then(setData).catch((e) => setError(e.message));
  }, []);

  if (!data) return <p className="muted">Loading…</p>;

  const setPay = (key, field, value) =>
    setData({ ...data, payments: { ...data.payments, [key]: { ...data.payments[key], [field]: value } } });

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await api('/settings/admin', { method: 'PUT', body: { payments: data.payments, store: data.store } });
      setOk('Settings saved!');
      setTimeout(() => setOk(''), 2500);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="admin-h1-row">
        <h1 className="admin-h1">Settings</h1>
        <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'SAVE SETTINGS'}</button>
      </div>
      <ErrorBox error={error} />
      <OkBox msg={ok} />

      <div className="card form-card">
        <h3>Payment Methods</h3>
        <p className="muted-sm">
          Method enable karte hi checkout par selectable ho jata hai. Gateway credentials dalne ke baad live API integration
          <code> server/src/services/payments.js</code> ke TODO blocks mein already structure ke sath ready hai.
        </p>
        {data.paymentMeta.map((m) => {
          const cfg = data.payments[m.key] || {};
          const credKeys = Object.keys(cfg).filter((k) => k !== 'enabled');
          return (
            <div className="pay-setting" key={m.key}>
              <div className="pay-setting-head">
                <b>{m.name}</b>
                <small className="muted">{m.sub}</small>
                <Toggle on={!!cfg.enabled} onChange={() => setPay(m.key, 'enabled', !cfg.enabled)} />
              </div>
              {cfg.enabled && credKeys.length > 0 && (
                <div className="form-grid form-grid-3 pay-setting-creds">
                  {credKeys.map((k) => (
                    <F label={CRED_LABELS[k] || k} key={k}>
                      <input value={cfg[k] || ''} onChange={(e) => setPay(m.key, k, e.target.value)} placeholder={`${CRED_LABELS[k] || k} (live integration ke liye)`} />
                    </F>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="card form-card">
        <h3>Store Settings</h3>
        <div className="form-grid form-grid-3">
          <F label="Tax Rate (%) — display only">
            <input type="number" value={data.store.taxRate ?? 0} onChange={(e) => setData({ ...data, store: { ...data.store, taxRate: Number(e.target.value) } })} />
          </F>
          <F label="Default Low Stock Threshold">
            <input type="number" value={data.store.lowStockThreshold ?? 5} onChange={(e) => setData({ ...data, store: { ...data.store, lowStockThreshold: Number(e.target.value) } })} />
          </F>
        </div>
      </div>
    </>
  );
}
