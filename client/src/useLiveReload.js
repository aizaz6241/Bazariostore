import { useEffect, useRef } from 'react';
import { getSocket } from './socket.js';

/**
 * Reload a screen's data when the server signals that something it shows has changed
 * (e.g. 'sellers:changed', 'refunds:changed'). The signal carries only ids; the screen asks for
 * its own data. A burst of signals causes ONE reload; a tab in the background reloads when it is
 * looked at again instead of loading data nobody sees.
 */
export default function useLiveReload(events, reload, delay = 1200) {
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  const key = events.join('|');

  useEffect(() => {
    let socket;
    try {
      socket = getSocket();
    } catch {
      return undefined;
    }
    if (!socket) return undefined;

    let timer = null;
    let missed = false;
    const run = () => {
      timer = null;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        missed = true;
        return;
      }
      reloadRef.current();
    };
    const onSignal = () => {
      clearTimeout(timer);
      timer = setTimeout(run, delay);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible' && missed) {
        missed = false;
        reloadRef.current();
      }
    };

    const list = key.split('|');
    list.forEach((ev) => socket.on(ev, onSignal));
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer);
      list.forEach((ev) => socket.off(ev, onSignal));
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [key, delay]);
}
