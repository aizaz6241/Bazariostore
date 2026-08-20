import { io } from 'socket.io-client';

let socket;

export function getSocket() {
  if (!socket) {
    const rawUrl = import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_URL || '';
    const socketOrigin = rawUrl ? rawUrl.replace(/\/api\/?$/, '') : undefined;
    socket = socketOrigin
      ? io(socketOrigin, { transports: ['websocket', 'polling'] })
      : io({ transports: ['websocket', 'polling'] });
  }
  return socket;
}

export function getGuestId() {
  let id = localStorage.getItem('ng_guest_id');
  if (!id) {
    id = (crypto.randomUUID ? crypto.randomUUID() : 'g-' + Date.now() + '-' + Math.random().toString(36).slice(2)).slice(0, 36);
    localStorage.setItem('ng_guest_id', id);
  }
  return id;
}
