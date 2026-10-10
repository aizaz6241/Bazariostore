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

// Call whenever the logged-in admin/seller changes (login, logout, token expired, another tab
// switched account). Dropping the connection makes the server forget every room this socket
// had joined ('admins', 'admin:<id>', 'seller:<id>'), so the next person in this tab never
// receives the previous person's chat or notifications. The same socket object reconnects
// straight away, and each open screen re-joins its own room from its 'connect' handler,
// reading the token that is in storage at that moment.
export function resetSocketSession() {
  if (!socket) return;
  socket.disconnect();
  socket.connect();
}

export function getGuestId() {
  let id = localStorage.getItem('ng_guest_id');
  if (!id) {
    id = (crypto.randomUUID ? crypto.randomUUID() : 'g-' + Date.now() + '-' + Math.random().toString(36).slice(2)).slice(0, 36);
    localStorage.setItem('ng_guest_id', id);
  }
  return id;
}
