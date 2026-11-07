import { useEffect, useState } from 'react';
import { sapi } from '../api.js';
import Ic from '../components/Icons.jsx';

/**
 * "Complete your details" — ID card / PAN card photos a store did not have at registration.
 * Shown on the Seller Central dashboard until all 4 photos are on file, then it hides itself.
 * Only missing photos can be added (a photo on file is changed through support).
 * Server: GET / POST /api/sellers/me/documents.
 */
const SLOTS = [
  { field: 'aadhaarFront', label: 'ID card', side: 'Front' },
  { field: 'aadhaarBack', label: 'ID card', side: 'Back' },
  { field: 'panFront', label: 'PAN card', side: 'Front' },
  { field: 'panBack', label: 'PAN card', side: 'Back' },
];

// Phone photos are 2–6 MB: made smaller on the phone before sending (max 1600 px, JPEG)
function shrinkImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const encode = (maxSide, quality) => {
          const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
          const w = Math.max(1, Math.round(img.naturalWidth * scale));
          const h = Math.max(1, Math.round(img.naturalHeight * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          return canvas.toDataURL('image/jpeg', quality);
        };
        let out = encode(1600, 0.8);
        if (out.length > 900 * 1024) out = encode(1280, 0.7);
        if (out.length > 900 * 1024) out = encode(1024, 0.6);
        URL.revokeObjectURL(url);
        resolve(out);
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('unreadable'));
    };
    img.src = url;
  });
}
const readAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('unreadable'));
    r.readAsDataURL(file);
  });

export default function KycDocuments() {
  const [state, setState] = useState(null); // { docs, missing, complete }
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null); // { ok, text }

  useEffect(() => {
    let alive = true;
    sapi('/sellers/me/documents')
      .then((d) => alive && setState(d))
      .catch(() => {}); // an older server without this route: nothing is shown
    return () => {
      alive = false;
    };
  }, []);

  if (!state || state.complete) return null;
  const done = SLOTS.filter((s) => state.docs?.[s.field]).length;

  const upload = (field) => async (e) => {
    const input = e.target;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    setMsg(null);
    setBusy(field);
    try {
      const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
      let data;
      if (isPdf) {
        if (file.size > 1024 * 1024) throw new Error('This PDF is larger than 1 MB. Please upload a photo of the card instead.');
        data = await readAsDataUrl(file);
      } else {
        if (file.size > 25 * 1024 * 1024) throw new Error('This picture is too large. Please choose another photo.');
        try {
          data = await shrinkImage(file);
        } catch {
          if (file.size > 1024 * 1024) throw new Error('This picture could not be opened. Please take a JPG / PNG photo of the card.');
          data = await readAsDataUrl(file);
        }
      }
      const res = await sapi('/sellers/me/documents', { method: 'POST', body: { field, file: data }, timeout: 120000 });
      setState({ docs: res.docs, missing: res.missing, complete: res.complete });
      setMsg({ ok: true, text: res.complete ? 'Thank you! All documents are uploaded. Our team will check them.' : 'Photo uploaded ✓' });
    } catch (err) {
      if (err?.data?.docs) setState({ docs: err.data.docs, missing: err.data.missing, complete: err.data.complete });
      setMsg({ ok: false, text: err.message || 'Upload failed. Please try again.' });
    } finally {
      setBusy('');
    }
  };

  return (
    <section className="kyc-card" aria-labelledby="kyc-title">
      <div className="kyc-head">
        <span className="kyc-ic" aria-hidden="true"><Ic name="shield" size={20} /></span>
        <div>
          <h2 id="kyc-title">Complete your details</h2>
          <p>Please upload clear photos of your ID card and PAN card (front and back). Only our checking team sees them.</p>
        </div>
        <span className="kyc-count" aria-label={`${done} of 4 uploaded`}>{done}/4</span>
      </div>

      {msg && <p className={`kyc-msg ${msg.ok ? 'ok' : 'err'}`} role="status">{msg.text}</p>}

      <div className="kyc-slots">
        {SLOTS.map((s) => {
          const has = Boolean(state.docs?.[s.field]);
          const isBusy = busy === s.field;
          return has ? (
            <div key={s.field} className="kyc-slot has">
              <span className="kyc-slot-ic"><Ic name="check" size={18} /></span>
              <span className="kyc-slot-txt">
                <b>{s.label} — {s.side}</b>
                <small>Uploaded</small>
              </span>
            </div>
          ) : (
            <label key={s.field} className={`kyc-slot${isBusy ? ' busy' : ''}`}>
              <input type="file" accept="image/*,.pdf" onChange={upload(s.field)} disabled={Boolean(busy)} aria-label={`Upload ${s.label} ${s.side.toLowerCase()} side`} />
              <span className="kyc-slot-ic"><Ic name="image" size={18} /></span>
              <span className="kyc-slot-txt">
                <b>{s.label} — {s.side}</b>
                <small>{isBusy ? 'Uploading… please wait' : 'Tap to add photo'}</small>
              </span>
            </label>
          );
        })}
      </div>
    </section>
  );
}
