import Ic from '../components/Icons.jsx';

export function Modal({ title, onClose, children, wide }) {
  return (
    <div className="admin-modal-overlay modal-back" onClick={onClose}>
      <div className={'admin-modal-box modal' + (wide ? ' large modal-wide' : '')} onClick={(e) => e.stopPropagation()}>
        <div className="modal-top modal-head">
          <h3>{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="btn-close-modal">
            <Ic name="x" size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Toggle({ on, onChange, small }) {
  return (
    <button type="button" className={'toggle' + (on ? ' on' : '') + (small ? ' toggle-sm' : '')} onClick={onChange} aria-pressed={on}>
      <span />
    </button>
  );
}

export function F({ label, children, full, hint }) {
  return (
    <div className={'field' + (full ? ' field-full' : '')}>
      {label && <label>{label}</label>}
      {children}
      {hint && <small className="muted-sm">{hint}</small>}
    </div>
  );
}

export function ErrorBox({ error }) {
  if (!error) return null;
  return <div className="alert-error"><Ic name="x" size={14} /> {error}</div>;
}

export function OkBox({ msg }) {
  if (!msg) return null;
  return <div className="alert-ok"><Ic name="check" size={14} /> {msg}</div>;
}

export const CHART_COLORS = ['#e0446e', '#f0a63c', '#6b46c1', '#2b6cb0', '#2ea84f', '#c8102e', '#b05e1d', '#109448', '#9c6f10'];
