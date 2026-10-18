import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import Ic from '../../components/Icons.jsx';
import { useTour } from './TourProvider.jsx';

/** Dashboard card: the store's first steps, ticked from its real data, each with "Show me". */
export default function GettingStarted() {
  const { data, reload, startTour, enabled, hideChecklist } = useTour();
  useEffect(() => { reload(); }, [reload]);
  if (!enabled || !data || data.checklistHidden) return null;
  const steps = data.steps || [];
  const done = data.doneCount || 0;
  if (!steps.length || done >= steps.length) return null;
  const pct = Math.round((done / steps.length) * 100);
  const next = steps.find((s) => !s.done);

  return (
    <section className="gs" id="getting-started" aria-label="Getting started">
      <div className="gs-head">
        <div className="gs-ring" style={{ '--p': pct }} aria-hidden="true"><span>{done}/{steps.length}</span></div>
        <div className="gs-head-txt">
          <h2>Get your store going</h2>
          <p>{next ? <>Next step: <b>{next.label}</b></> : 'All done!'}</p>
        </div>
        <div className="gs-head-btns">
          <button type="button" className="gs-btn ghost" onClick={() => startTour('welcome')}><Ic name="sparkle" size={14} /> Take the tour</button>
          <button type="button" className="gs-x" onClick={hideChecklist} aria-label="Hide checklist" title="Hide — you can open it again from Help"><Ic name="x" size={15} /></button>
        </div>
      </div>
      <div className="gs-bar"><i style={{ width: `${pct}%` }} /></div>
      <ol className="gs-list">
        {steps.map((s) => (
          <li key={s.key} className={s.done ? 'done' : next?.key === s.key ? 'next' : ''}>
            <span className="gs-check">{s.done ? <Ic name="check" size={13} /> : null}</span>
            <span className="gs-label">{s.label}</span>
            {!s.done && (
              <span className="gs-actions">
                {s.tour && <button type="button" className="gs-btn ghost sm" onClick={() => startTour(s.tour)}>Show me</button>}
                {s.path && <Link to={s.path} className="gs-btn sm">Go <Ic name="arrowRight" size={13} /></Link>}
              </span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
