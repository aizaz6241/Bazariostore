import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { sapi } from '../../api.js';
import Ic from '../../components/Icons.jsx';
import { TOURS, tourById } from './tours.js';

/**
 * First-time help for stores: a welcome box, guided "spotlight" tours (the page goes dark and
 * one button stays lit with a short explanation) and the getting-started checklist data.
 * No outside library: a small spotlight that follows the element while the page scrolls.
 */
const TourCtx = createContext({ startTour: () => {}, data: null, reload: () => {}, enabled: false, hideChecklist: () => {}, showChecklist: () => {} });
export const useTour = () => useContext(TourCtx);

const PAD = 8;
const WAIT_MS = 4000;

function visibleEl(selector) {
  if (!selector) return null;
  let list = [];
  try { list = Array.from(document.querySelectorAll(selector)); } catch { return null; }
  for (const el of list) {
    const r = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    if (r.width > 2 && r.height > 2 && r.right > 0 && r.left < window.innerWidth && style.visibility !== 'hidden' && style.display !== 'none') return el;
  }
  return null;
}

export function TourProvider({ seller, children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const status = seller?.status;
  const enabled = Boolean(seller?._id) && status !== 'frozen' && status !== 'suspended';
  const [data, setData] = useState(null);
  const [run, setRun] = useState(null); // { id, index }
  const [welcome, setWelcome] = useState(false);

  const reload = useCallback(() => {
    if (!enabled) return Promise.resolve();
    return sapi('/sellers/onboarding').then(setData).catch(() => {});
  }, [enabled]);
  useEffect(() => { reload(); }, [reload, seller?._id]);

  // the welcome box: once, for new stores, a moment after the panel opens
  useEffect(() => {
    if (!enabled || !data || run) return undefined;
    if (data.welcomeSeen || !data.isNewStore || (data.toursDone || []).includes('welcome')) return undefined;
    const t = setTimeout(() => setWelcome(true), 900);
    return () => clearTimeout(t);
  }, [enabled, data, run]);

  const save = useCallback((body) => sapi('/sellers/onboarding', { method: 'POST', body }).catch(() => {}), []);

  const startTour = useCallback((id) => {
    if (!tourById(id)) return;
    setWelcome(false);
    setRun({ id, index: 0 });
  }, []);

  const runRef = useRef(null);
  runRef.current = run;
  const finish = useCallback((completed) => {
    const r = runRef.current;
    setRun(null);
    if (r && completed) save({ tourDone: r.id, ...(r.id === 'welcome' ? { welcomeSeen: true } : {}) }).then(reload);
    else if (r?.id === 'welcome') {
      setData((d) => (d ? { ...d, welcomeSeen: true } : d));
      save({ welcomeSeen: true });
    }
  }, [save, reload]);

  const dismissWelcome = () => {
    setWelcome(false);
    setData((d) => (d ? { ...d, welcomeSeen: true } : d));
    save({ welcomeSeen: true });
  };

  const hideChecklist = () => {
    setData((d) => (d ? { ...d, checklistHidden: true } : d));
    save({ checklistHidden: true });
  };
  const showChecklist = () => {
    setData((d) => (d ? { ...d, checklistHidden: false } : d));
    save({ checklistHidden: false });
    if (location.pathname !== '/seller') navigate('/seller');
    setTimeout(() => document.getElementById('getting-started')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 400);
  };

  const tour = run ? tourById(run.id) : null;
  const step = tour ? tour.steps[run.index] : null;

  // open the step's page first
  useEffect(() => {
    if (step?.path && location.pathname !== step.path) navigate(step.path);
  }, [step, location.pathname, navigate]);

  return (
    <TourCtx.Provider value={{ startTour, data, reload, enabled, hideChecklist, showChecklist }}>
      {children}
      {welcome && !run && <WelcomeBox seller={seller} onStart={() => startTour('welcome')} onLater={dismissWelcome} />}
      {tour && step && (
        <Spotlight
          key={`${run.id}-${run.index}`}
          tour={tour}
          step={step}
          index={run.index}
          onBack={() => setRun((r) => ({ ...r, index: Math.max(0, r.index - 1) }))}
          onNext={() => (run.index >= tour.steps.length - 1 ? finish(true) : setRun((r) => ({ ...r, index: r.index + 1 })))}
          onSkip={() => finish(false)}
          ready={!step.path || location.pathname === step.path}
        />
      )}
    </TourCtx.Provider>
  );
}

function Spotlight({ tour, step, index, onBack, onNext, onSkip, ready }) {
  const [rect, setRect] = useState(null);
  const [usedFallback, setUsedFallback] = useState(false);
  const [searching, setSearching] = useState(Boolean(step.target));
  const [box, setBox] = useState({ top: 0, left: 0, place: 'center' });
  const elRef = useRef(null);
  const cardRef = useRef(null);
  const total = tour.steps.length;
  const last = index === total - 1;
  const isPhone = typeof window !== 'undefined' && window.innerWidth <= 640;

  // find the element (pages load their data first, so wait a little for it)
  useEffect(() => {
    if (!ready) return undefined;
    if (!step.target) { setSearching(false); return undefined; }
    let alive = true;
    const t0 = Date.now();
    const look = () => {
      if (!alive) return;
      let el = visibleEl(step.target);
      let fb = false;
      if (!el && step.fallback) { el = visibleEl(step.fallback); fb = Boolean(el); }
      if (el) {
        elRef.current = el;
        setUsedFallback(fb);
        const r = el.getBoundingClientRect();
        if (r.top < 70 || r.bottom > window.innerHeight - 40) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        setTimeout(() => alive && setSearching(false), 280);
        return;
      }
      if (Date.now() - t0 > WAIT_MS) { setSearching(false); return; }
      setTimeout(look, 150);
    };
    look();
    return () => { alive = false; };
  }, [step, ready]);

  // follow the element while the page scrolls or resizes
  useEffect(() => {
    if (searching) return undefined;
    let raf;
    const tick = () => {
      const el = elRef.current;
      if (el && el.isConnected) {
        const r = el.getBoundingClientRect();
        setRect((prev) => (prev && Math.abs(prev.top - r.top) < 0.5 && Math.abs(prev.left - r.left) < 0.5 && Math.abs(prev.width - r.width) < 0.5 && Math.abs(prev.height - r.height) < 0.5 ? prev : { top: r.top, left: r.left, width: r.width, height: r.height }));
      } else setRect(null);
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [searching]);

  // place the explanation card next to the element (bottom sheet on a phone)
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    if (!rect || isPhone) {
      // on a phone the card is a sheet at the bottom — or at the top when the lit element is low on the screen
      const low = rect && rect.top + rect.height / 2 > window.innerHeight * 0.55;
      setBox({ top: 0, left: 0, place: !rect ? 'center' : low ? 'sheet-top' : 'sheet' });
      return;
    }
    const cw = card.offsetWidth;
    const ch = card.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gap = 14;
    const clampX = (x) => Math.max(12, Math.min(x, vw - cw - 12));
    const clampY = (y) => Math.max(12, Math.min(y, vh - ch - 12));
    let place = 'bottom';
    let top = rect.top + rect.height + PAD + gap;
    let left = clampX(rect.left + rect.width / 2 - cw / 2);
    if (top + ch > vh - 12) {
      if (rect.top - PAD - gap - ch > 12) { place = 'top'; top = rect.top - PAD - gap - ch; }
      else if (rect.left + rect.width + PAD + gap + cw < vw - 12) { place = 'right'; left = rect.left + rect.width + PAD + gap; top = clampY(rect.top + rect.height / 2 - ch / 2); }
      else if (rect.left - PAD - gap - cw > 12) { place = 'left'; left = rect.left - PAD - gap - cw; top = clampY(rect.top + rect.height / 2 - ch / 2); }
      else { place = 'inside'; top = clampY(vh - ch - 24); }
    }
    setBox({ top, left, place });
  }, [rect, isPhone, step]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onSkip();
      else if (e.key === 'ArrowRight') onNext();
      else if (e.key === 'ArrowLeft' && index > 0) onBack();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onNext, onBack, onSkip, index]);

  const body = usedFallback && step.mobileBody ? step.mobileBody : step.body;
  const hole = rect && !searching
    ? { top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }
    : null;

  return createPortal(
    <div className="tour-root" role="dialog" aria-modal="true" aria-label={step.title}>
      {/* catches clicks so the page under the tour is not changed by accident */}
      <div className="tour-catch" onClick={(e) => e.stopPropagation()} />
      {hole ? <div className="tour-hole" style={hole} /> : <div className="tour-dim" />}
      <div
        ref={cardRef}
        className={`tour-card place-${box.place} ${searching ? 'is-wait' : ''}`}
        style={['center', 'sheet', 'sheet-top'].includes(box.place) ? undefined : { top: box.top, left: box.left }}
      >
        <div className="tour-card-top">
          <span className="tour-kicker">{tour.title} · {index + 1} of {total}</span>
          <button type="button" className="tour-x" onClick={onSkip} aria-label="Close tour"><Ic name="x" size={15} /></button>
        </div>
        <h3>{step.title}</h3>
        <p>{body}</p>
        <div className="tour-foot">
          <div className="tour-dots" aria-hidden="true">
            {tour.steps.map((_, i) => <i key={i} className={i === index ? 'on' : i < index ? 'done' : ''} />)}
          </div>
          <div className="tour-btns">
            {index === 0 ? (
              <button type="button" className="tour-btn ghost" onClick={onSkip}>Skip</button>
            ) : (
              <button type="button" className="tour-btn ghost" onClick={onBack}>Back</button>
            )}
            <button type="button" className="tour-btn primary" onClick={onNext} autoFocus>
              {last ? 'Done' : 'Next'} {!last && <Ic name="arrowRight" size={14} />}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function WelcomeBox({ seller, onStart, onLater }) {
  const first = String(seller?.ownerName || '').trim().split(/\s+/)[0];
  return createPortal(
    <div className="tour-root" role="dialog" aria-modal="true" aria-label="Welcome">
      <div className="tour-dim" onClick={onLater} />
      <div className="tour-welcome">
        <span className="tour-welcome-ico">👋</span>
        <h2>Welcome{first ? `, ${first}` : ''}!</h2>
        <p>Your store <b>{seller?.storeName || ''}</b> is ready. Take a 1-minute tour to see how products, orders and your wallet work.</p>
        <ul>
          <li><Ic name="tag" size={15} /> Add products from the Treasury</li>
          <li><Ic name="package" size={15} /> Confirm orders and get paid</li>
          <li><Ic name="wallet" size={15} /> Deposit and withdraw</li>
        </ul>
        <div className="tour-welcome-btns">
          <button type="button" className="tour-btn ghost" onClick={onLater}>Maybe later</button>
          <button type="button" className="tour-btn primary" onClick={onStart} autoFocus>Take the tour <Ic name="arrowRight" size={14} /></button>
        </div>
        <small>You can start any tour later from <b>Help</b> at the top.</small>
      </div>
    </div>,
    document.body
  );
}

/** The "Help" button for the top bar: every tour, and the getting-started list. */
export function HelpButton() {
  const { startTour, data, enabled, showChecklist } = useTour();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('touchstart', close); document.removeEventListener('keydown', onKey); };
  }, [open]);
  if (!enabled) return null;
  const done = data?.toursDone || [];
  return (
    <div className="tour-help" ref={ref}>
      <button type="button" className="stb-icon-btn tour-help-btn" data-tour="help-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Help and tours" title="Help & guided tours">
        <span aria-hidden="true">?</span>
      </button>
      {open && (
        <div className="tour-menu" role="menu">
          <div className="tour-menu-head">
            <b>Help & guided tours</b>
            <small>Short walkthroughs of each part of your panel.</small>
          </div>
          <ul>
            {TOURS.map((t) => (
              <li key={t.id}>
                <button type="button" role="menuitem" onClick={() => { setOpen(false); startTour(t.id); }}>
                  <span className="tour-menu-ico"><Ic name={t.icon} size={16} /></span>
                  <span className="tour-menu-txt"><b>{t.title}</b><small>{t.summary}</small></span>
                  {done.includes(t.id) ? <span className="tour-menu-done" title="Seen"><Ic name="check" size={13} /></span> : <span className="tour-menu-new">New</span>}
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="tour-menu-foot" onClick={() => { setOpen(false); showChecklist(); }}>
            <Ic name="checkCircle" size={15} /> Getting started checklist
            {data && <span>{data.doneCount}/{data.steps?.length || 0}</span>}
          </button>
        </div>
      )}
    </div>
  );
}
