'use client';

import React, { useState, useEffect, useLayoutEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { useNotifications } from '@/components/NotificationManager';
import VoiceRecorder from '@/components/VoiceRecorder';
import AudioPlayer from '@/components/AudioPlayer';
import { readCache, writeCache, dropCache } from '@/lib/clientCache';
import { useRealtime, useRealtimeEvent } from '@/components/RealtimeProvider';
import { useLiveRefresh } from '@/components/LiveProvider';
import PaymentProofsPane from '@/components/PaymentProofsPane';
import MyProofsPane from '@/components/MyProofsPane';
import { getSavedMedia, saveMedia, dropSavedMedia } from '@/lib/mediaCache';
import {
  Send,
  Mic,
  Image as ImageIcon,
  Users,
  Shield,
  Sparkles,
  CheckCheck,
  ChevronLeft,
  Search,
  MessageSquare,
  Calendar,
  Edit2,
  Trash2,
  X,
  ArrowDown,
  Ban,
  Clock,
  ChevronDown,
  Loader2,
  Download,
  ZoomIn,
  Lock,
  ReceiptText,
} from 'lucide-react';

// Pictures / voice notes already downloaded in this visit (message id -> data), so opening a
// chat again never downloads them twice.
const mediaStore = new Map();
const MEDIA_STORE_MAX = 120;
const rememberMedia = (id, data, keepOnDevice = true) => {
  mediaStore.set(id, data);
  if (mediaStore.size > MEDIA_STORE_MAX) mediaStore.delete(mediaStore.keys().next().value);
  // also kept on the device, so the next visit shows it without downloading
  // (a picture that lives on the file storage is a link: the browser keeps those by itself)
  if (keepOnDevice && String(data).startsWith('data:')) saveMedia(id, data);
};
// A picture stored on the file storage arrives as a link (`mediaLink`): that IS its media.
const withMedia = (m) => (m && m.mediaLink && !m.mediaUrl && !m.isDeleted ? { ...m, mediaUrl: m.mediaLink } : m);
// A message was deleted (or its chat cleared): its picture / voice note leaves this device too
const forgetMedia = (id) => {
  mediaStore.delete(id);
  dropSavedMedia(id);
};
const isMediaMessage = (m) => m.messageType === 'voice' || m.messageType === 'image';
// Voice notes: a short one travels inside its message; a longer one is sent in pieces, because
// the hosting refuses a request above a few MB (this is what made 3-5 minute notes fail).
const VOICE_INLINE_MAX_BYTES = 1.5 * 1024 * 1024;
const VOICE_PIECE_BYTES = 2 * 1024 * 1024; // must match PIECE_BYTES in lib/utils/chatAudio.js
const VOICE_MAX_BYTES = 300 * 1024 * 1024;
const newUploadId = () => {
  const b = new Uint8Array(16);
  (window.crypto || window.msCrypto).getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
};
const blobToDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the recording'));
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const needsMedia = (m) =>
  isMediaMessage(m) && !m.isDeleted && !m.mediaUrl && !m.pending && !m.failed && !String(m._id).startsWith('tmp_');
// What is kept on the device between visits: the latest messages as text (media is re-fetched)
const SAVED_MESSAGES = 40;
const lightCopy = (list) =>
  list
    .slice(-SAVED_MESSAGES)
    .map((m) => (isMediaMessage(m) && !/^https?:/i.test(m.mediaUrl || '') ? { ...m, mediaUrl: '' } : m));

// "last seen today at 2:05 PM" (shown to admins only)
const formatLastSeen = (at) => {
  const d = new Date(at);
  if (!at || isNaN(d.getTime())) return '';
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(new Date()) - startOf(d)) / 86400000);
  if (days <= 0) return `last seen today at ${time}`;
  if (days === 1) return `last seen yesterday at ${time}`;
  return `last seen ${d.toLocaleDateString([], { day: 'numeric', month: 'short' })} at ${time}`;
};

// Unread messages of a chat, shown on its row in the chat list
function UnreadLabel({ count }) {
  const n = Number(count) || 0;
  if (n <= 0) return null;
  return (
    <span
      className="!ml-auto shrink-0 inline-flex items-center gap-1 pl-1 pr-2.5 py-0.5 rounded-full bg-emerald-600 text-white text-[11px] font-bold shadow-sm"
      aria-label={`${n} unread message${n === 1 ? '' : 's'}`}
    >
      <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-white text-emerald-700 flex items-center justify-center text-[11px] font-extrabold">
        {n > 99 ? '99+' : n}
      </span>
      <span>unread</span>
    </span>
  );
}

// The open conversation lives in the address (/chat?chatType=...), so the phone's "back" (and the
// swipe from the left edge on iPhone) returns to the chat list instead of leaving the chat screen.
export default function ChatPage() {
  return (
    <Suspense fallback={null}>
      <ChatPageInner />
    </Suspense>
  );
}

const chatUrlOf = (chat) =>
  chat.type === 'proofs'
    ? '/chat?chatType=proofs'
    : chat.type === 'myproofs'
    ? '/chat?chatType=myproofs'
    : chat.type === 'personal' && chat.contact?._id
    ? `/chat?chatType=personal&contactId=${chat.contact._id}`
    : `/chat?chatType=${chat.type === 'materials' ? 'materials' : 'group'}`;
const chatKeyOf = (chat) => `${chat?.type || ''}:${chat?.contact?._id || ''}`;

function ChatPageInner() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const urlChatType = searchParams.get('chatType') || '';
  const urlContactId = searchParams.get('contactId') || '';
  const { playMessageSound, playCashSound } = useNotifications();
  const uid = user?._id || '';
  const contactsKey = `chat_contacts_${uid}`;
  const chatCacheKey = (chatKey) => `chat_msgs_${uid}_${chatKey}`;

  // Unified Active Chat State:
  // { type: 'group' } OR { type: 'personal', contact: contactObject }
  const [activeChat, setActiveChat] = useState({ type: 'group' });
  // The chat list starts from what this device saw last time and is refreshed right after
  const [contacts, setContacts] = useState(() => readCache(contactsKey)?.contacts || []);
  const [groupMeta, setGroupMeta] = useState(
    () => readCache(contactsKey)?.group || { unreadCount: 0, lastMessage: null }
  );
  const [materialsMeta, setMaterialsMeta] = useState(
    () => readCache(contactsKey)?.materialsGroup || { unreadCount: 0, lastMessage: null }
  );
  const [contactsLoaded, setContactsLoaded] = useState(() => !!readCache(contactsKey));
  // "Payment Proofs" group (partners only): how many deposits still wait for their proof
  const [proofsMeta, setProofsMeta] = useState(() => readCache(contactsKey)?.proofs || null);
  // Everyone's own proofs group: the complete proofs of the person's own sellers
  const [myProofsMeta, setMyProofsMeta] = useState(() => readCache(contactsKey)?.myProofs || null);

  // Mobile View Flow (WhatsApp Style): 'list' (shows all chats) or 'chat' (inside active conversation)
  const [mobileView, setMobileView] = useState('list');
  // On a wide screen the list and the conversation are side by side; on a phone only one shows
  const [isDesktop, setIsDesktop] = useState(() => (typeof window !== 'undefined' ? window.matchMedia('(min-width: 768px)').matches : true));
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const onChange = () => setIsDesktop(mq.matches);
    onChange();
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);
  // Is the conversation really in front of the person? Only then is it loaded and marked as read:
  // while the phone shows the chat LIST, nothing is read behind the person's back and the unread
  // numbers stay until the chat is opened.
  const paneVisible = isDesktop || mobileView === 'chat';
  const paneVisibleRef = useRef(paneVisible);
  paneVisibleRef.current = paneVisible;

  // "N unread messages" line inside an opened chat: { chatKey, count, beforeId }
  const [unreadDivider, setUnreadDivider] = useState(null);
  const pendingUnreadRef = useRef(0); // unread count of the chat at the moment it was opened
  const justOpenedRef = useRef(false); // the next answer is the first one since the chat was opened

  // Messages in current chat
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [pendingImagePreview, setPendingImagePreview] = useState(null); // { file, previewUrl, caption: '' }
  const [fullscreenImage, setFullscreenImage] = useState(null); // Image URL for lightbox viewer
  const [downloadToast, setDownloadToast] = useState(''); // Toast for mobile & desktop image download feedback
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Scroll to Bottom & Unread Highlights
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [unreadWhileScrolled, setUnreadWhileScrolled] = useState(0);
  const [highlightedMsgId, setHighlightedMsgId] = useState(null);

  // Jump to Date Dropdown
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);

  // Edit Message State
  const [editingMessage, setEditingMessage] = useState(null);
  const [editText, setEditText] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  // Delete Message Confirmation State
  const [deleteConfirmMsg, setDeleteConfirmMsg] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const messagesContainerRef = useRef(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const prevMessagesLengthRef = useRef(0);
  const messagesSigRef = useRef(''); // fingerprint of the messages already on screen
  const messagesCursorRef = useRef(0); // newest change we already have (for delta polling)
  const messagesRef = useRef([]); // always the latest list, for merging poll results
  const chatKeyRef = useRef(''); // which conversation the refs above belong to
  const activeKeyRef = useRef(''); // the conversation that is open right now
  const [clearingChat, setClearingChat] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const hasMoreRef = useRef(false);
  const firstScrollRef = useRef(true); // the first paint of a chat jumps to the end (no slow glide)
  const skipAutoScrollRef = useRef(false);
  const keepScrollRef = useRef(null); // scroll position to restore after older messages are added
  const mediaBusyRef = useRef(false);
  const mediaMissRef = useRef(new Set()); // media the server could not give us: do not ask again
  const mediaDeviceAskedRef = useRef(new Set()); // media already looked for on this device
  const showScrollBottomRef = useRef(false);
  const [, setMediaTick] = useState(0); // redraw when a picture / voice note turns out to be unavailable

  const isAdmin = user?.role === 'admin';
  const isAdminRef = useRef(isAdmin);
  isAdminRef.current = isAdmin;

  activeKeyRef.current = `${activeChat.type}:${activeChat.contact?._id || ''}`;

  // ─── Realtime: new messages are pushed to this page (see RealtimeProvider) ───
  const realtime = useRealtime();
  const pushedRef = useRef(false); // is the server pushing chat news right now?
  pushedRef.current = !!realtime.status.chat;
  const lastMessagesFetchRef = useRef(0);
  const lastContactsFetchRef = useRef(0);
  const syncTimerRef = useRef(null);
  const syncAgainRef = useRef(false);
  const lastSyncRef = useRef(0);
  // The id the server uses for the conversation that is open
  const conversationIdOf = (chat) =>
    chat.type === 'proofs'
      ? 'payment_proofs'
      : chat.type === 'myproofs'
      ? 'my_payment_proofs'
      : chat.type === 'materials'
      ? 'materials_group'
      : chat.type === 'personal'
      ? chat.contact?._id
        ? `personal_${[String(uid), String(chat.contact._id)].sort().join('_')}`
        : ''
      : 'main_group';
  const activeConvRef = useRef('');
  activeConvRef.current = conversationIdOf(activeChat);
  // Latest chat list, for updating it in place when a message is pushed
  const contactsRef = useRef(contacts);
  contactsRef.current = contacts;
  const groupMetaRef = useRef(groupMeta);
  groupMetaRef.current = groupMeta;
  const materialsMetaRef = useRef(materialsMeta);
  materialsMetaRef.current = materialsMeta;
  const proofsMetaRef = useRef(proofsMeta);
  proofsMetaRef.current = proofsMeta;
  const myProofsMetaRef = useRef(myProofsMeta);
  myProofsMetaRef.current = myProofsMeta;

  // ─── Typing & online / last seen — ADMINS ONLY ───
  // The server sends these to admin accounts only, so for a member everything below stays
  // empty. `isAdmin` is checked here as well so nothing of it is ever drawn for a member.
  const presence = realtime.presence;
  const showPresence = isAdmin && realtime.status.connected && presence.known;
  const isOnline = (memberId) => showPresence && !!presence.online[String(memberId)];
  const presenceText = (memberId) => {
    if (!showPresence || !memberId) return '';
    if (presence.online[String(memberId)]) return 'Online';
    return formatLastSeen(presence.lastSeen[String(memberId)]);
  };
  // who is typing where: { [conversationId]: { [memberId]: { name, until } } }
  const [typingMap, setTypingMap] = useState({});
  const typingSentAtRef = useRef(0);
  const typingOnRef = useRef(false);

  useRealtimeEvent('typing', (p) => {
    if (!isAdmin || !p?.conversationId || !p?.memberId || String(p.memberId) === String(uid)) return;
    setTypingMap((prev) => {
      const conv = { ...(prev[p.conversationId] || {}) };
      if (p.typing) conv[p.memberId] = { name: p.name || 'Someone', until: Date.now() + 5000 };
      else delete conv[p.memberId];
      return { ...prev, [p.conversationId]: conv };
    });
  });
  // "typing" goes away by itself a few seconds after the last keystroke
  useEffect(() => {
    const anyone = Object.values(typingMap).some((conv) => Object.keys(conv).length > 0);
    if (!anyone) return undefined;
    const timer = setInterval(() => {
      const now = Date.now();
      setTypingMap((prev) => {
        let changed = false;
        const next = {};
        for (const [convId, people] of Object.entries(prev)) {
          const kept = {};
          for (const [id, t] of Object.entries(people)) {
            if (t.until > now) kept[id] = t;
            else changed = true;
          }
          next[convId] = kept;
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [typingMap]);

  const typingNames = (conversationId) =>
    isAdmin ? Object.values(typingMap[conversationId] || {}).map((t) => t.name) : [];
  const typingText = (conversationId, { short = false } = {}) => {
    const names = typingNames(conversationId);
    if (names.length === 0) return '';
    if (short) return 'typing…';
    if (names.length === 1) return `${names[0]} is typing…`;
    return `${names.slice(0, 2).join(', ')}${names.length > 2 ? ` +${names.length - 2}` : ''} are typing…`;
  };

  // This person is typing: told to the server, which passes it on to admins only
  const reportTyping = (value) => {
    const conversationId = activeConvRef.current;
    if (!conversationId || conversationId === 'materials_group') return;
    const typing = !!String(value || '').trim();
    const now = Date.now();
    if (typing) {
      if (typingOnRef.current && now - typingSentAtRef.current < 2500) return;
      typingOnRef.current = true;
      typingSentAtRef.current = now;
      realtime.emit('typing', { conversationId, typing: true });
    } else if (typingOnRef.current) {
      typingOnRef.current = false;
      realtime.emit('typing', { conversationId, typing: false });
    }
  };

  showScrollBottomRef.current = showScrollBottom;

  useEffect(() => {
    messagesRef.current = messages;
    // Remember this chat: the full list for this visit, a light text copy for the next one
    const key = chatKeyRef.current;
    if (key && key === activeKeyRef.current) {
      const real = messages.filter((m) => !m.pending && !m.failed);
      const entry = {
        messages: real,
        sig: messagesSigRef.current,
        cursor: messagesCursorRef.current,
        hasMore: hasMoreRef.current,
      };
      writeCache(chatCacheKey(key), entry, {
        ...entry,
        sig: '',
        messages: lightCopy(real),
        hasMore: entry.hasMore || real.length > SAVED_MESSAGES,
      });
    }
    pumpMedia();
  }, [messages]);

  // ─── Pictures & voice notes are downloaded after the text, newest first ───
  const applyMedia = (found) => {
    const next = messagesRef.current.map((m) =>
      found[m._id] && !m.mediaUrl && !m.isDeleted ? { ...m, mediaUrl: found[m._id] } : m
    );
    messagesRef.current = next;
    setMessages(next);
  };

  const pumpMedia = async () => {
    if (mediaBusyRef.current) return;
    mediaBusyRef.current = true;
    try {
      for (let round = 0; round < 200; round++) {
        const waiting = messagesRef.current.filter((m) => needsMedia(m) && !mediaMissRef.current.has(m._id));
        if (waiting.length === 0) break;

        // already downloaded earlier in this visit
        const local = {};
        waiting.forEach((m) => {
          if (mediaStore.has(m._id)) local[m._id] = mediaStore.get(m._id);
        });
        if (Object.keys(local).length > 0) {
          applyMedia(local);
          continue;
        }

        // kept on this device from an earlier visit
        const askDevice = waiting.filter((m) => !mediaDeviceAskedRef.current.has(m._id)).map((m) => m._id);
        if (askDevice.length > 0) {
          askDevice.forEach((id) => mediaDeviceAskedRef.current.add(id));
          const saved = await getSavedMedia(askDevice);
          if (Object.keys(saved).length > 0) {
            Object.entries(saved).forEach(([id, value]) => rememberMedia(id, value, false));
            applyMedia(saved);
            continue;
          }
        }

        // The rest comes from the server, newest first: two small requests side by side
        const newestFirst = waiting.slice(-4).reverse().map((m) => m._id);
        const batches = [newestFirst.slice(0, 2), newestFirst.slice(2, 4)].filter((b) => b.length > 0);
        const token = localStorage.getItem('portal_token');
        const answers = await Promise.all(
          batches.map(async (ids) => {
            const res = await fetch(`/api/chat/media?ids=${ids.join(',')}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            return res.ok ? res.json() : null;
          })
        );
        if (answers.every((a) => !a)) break;
        const found = {};
        const missing = [];
        answers.filter(Boolean).forEach((data) => {
          Object.assign(found, data.media || {});
          missing.push(...(data.missing || []));
        });
        missing.forEach((id) => mediaMissRef.current.add(id));
        if (missing.length > 0) setMediaTick((n) => n + 1);
        Object.entries(found).forEach(([id, value]) => rememberMedia(id, value));
        // nothing usable came back: stop instead of asking for the same ids forever
        if (Object.keys(found).length === 0 && missing.length === 0) break;
        applyMedia(found);
      }
    } catch (err) {
      console.error('Chat media load failed:', err);
    } finally {
      mediaBusyRef.current = false;
    }
  };

  // A picture finished drawing: stay at the end of the chat if the user was there
  const handleMediaShown = () => {
    if (!showScrollBottomRef.current) {
      const el = messagesContainerRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  };

  const sortByTime = (list) => [...list].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  // ─── 1. Fetch Contacts & Group Metadata ───
  const fetchContacts = async () => {
    try {
      lastContactsFetchRef.current = Date.now();
      const token = localStorage.getItem('portal_token');
      const res = await fetch('/api/chat/contacts', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const group = data.group || { unreadCount: 0, lastMessage: null };
        const materialsGroup = data.materialsGroup || { unreadCount: 0, lastMessage: null };
        setContacts(data.contacts || []);
        setGroupMeta(group);
        setMaterialsMeta(materialsGroup);
        proofsMetaRef.current = data.proofs || null;
        setProofsMeta(data.proofs || null);
        myProofsMetaRef.current = data.myProofs || null;
        setMyProofsMeta(data.myProofs || null);
        writeCache(contactsKey, { contacts: data.contacts || [], group, materialsGroup, proofs: data.proofs || null, myProofs: data.myProofs || null });
        if (typeof data.totalUnreadCount === 'number') {
          window.dispatchEvent(new CustomEvent('chat_unread_updated', { detail: data.totalUnreadCount }));
        }
      }
    } catch (err) {
      console.error('Fetch chat contacts error:', err);
    } finally {
      setContactsLoaded(true);
    }
  };

  // A new deposit / a proof added by the other partner: refresh the "N pending" label
  useLiveRefresh(() => {
    fetchContacts();
  });

  // The chat list changed on this screen (a pushed message, a chat that was opened): show it,
  // remember it and tell the navigation badge, without asking the server.
  const applyChatList = ({ contacts: nextContacts, group, materialsGroup }) => {
    const c = nextContacts || contactsRef.current;
    const g = group || groupMetaRef.current;
    const m = materialsGroup || materialsMetaRef.current;
    if (nextContacts) {
      contactsRef.current = c;
      setContacts(c);
    }
    if (group) {
      groupMetaRef.current = g;
      setGroupMeta(g);
    }
    if (materialsGroup) {
      materialsMetaRef.current = m;
      setMaterialsMeta(m);
    }
    writeCache(contactsKey, { contacts: c, group: g, materialsGroup: m, proofs: proofsMetaRef.current, myProofs: myProofsMetaRef.current });
    const total = (g.unreadCount || 0) + (m.unreadCount || 0) + c.reduce((sum, x) => sum + (x.unreadCount || 0), 0);
    window.dispatchEvent(new CustomEvent('chat_unread_updated', { detail: total }));
  };

  // `message` becomes the last message of its conversation; `unread` adds one to its badge
  const noteLastMessage = (conversationId, message, unread) => {
    if (!conversationId || !message) return;
    const last = {
      conversationId,
      messageType: message.messageType,
      text: message.text,
      createdAt: message.createdAt,
      senderId: message.senderId,
      senderName: message.senderName,
      isDeleted: !!message.isDeleted,
      isEdited: !!message.isEdited,
    };
    const bump = (meta) => ({ ...meta, lastMessage: last, unreadCount: (meta.unreadCount || 0) + (unread ? 1 : 0) });
    if (conversationId === 'main_group') return applyChatList({ group: bump(groupMetaRef.current) });
    if (conversationId === 'materials_group') return applyChatList({ materialsGroup: bump(materialsMetaRef.current) });
    if (!contactsRef.current.some((x) => x.conversationId === conversationId)) {
      // someone who is not in the list yet: load the list properly
      fetchContacts();
      return;
    }
    applyChatList({ contacts: contactsRef.current.map((x) => (x.conversationId === conversationId ? bump(x) : x)) });
  };

  // The open conversation is being read: its badge goes away at once
  const clearUnreadOf = (conversationId) => {
    if (!conversationId) return;
    if (conversationId === 'main_group') {
      if (groupMetaRef.current.unreadCount > 0) applyChatList({ group: { ...groupMetaRef.current, unreadCount: 0 } });
    } else if (conversationId === 'materials_group') {
      if (materialsMetaRef.current.unreadCount > 0) applyChatList({ materialsGroup: { ...materialsMetaRef.current, unreadCount: 0 } });
    } else if (contactsRef.current.some((x) => x.conversationId === conversationId && x.unreadCount > 0)) {
      applyChatList({ contacts: contactsRef.current.map((x) => (x.conversationId === conversationId ? { ...x, unreadCount: 0 } : x)) });
    }
  };

  useEffect(() => {
    fetchContacts();
    // Poll only while the tab is visible; refresh at once when the user comes back.
    // While the server pushes chat news the list is kept up to date by those pushes, and this
    // is only a slow safety check.
    const interval = setInterval(() => {
      if (document.hidden) return;
      if (pushedRef.current && Date.now() - lastContactsFetchRef.current < 45000) return;
      fetchContacts();
    }, 6000);
    const onVisible = () => {
      if (!document.hidden) fetchContacts();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // ─── 1b. Which chat is open: kept in the address ───
  // Opening a chat adds one step to the browser history (/chat -> /chat?chatType=...), so "back"
  // (the header arrow, the phone's back button, the iPhone edge swipe) lands on the chat list.
  const openChat = (chat) => {
    setActiveChat((prev) => (chatKeyOf(prev) === chatKeyOf(chat) ? prev : chat));
    setMobileView('chat');
    if (typeof window === 'undefined') return;
    const url = chatUrlOf(chat);
    if (window.location.pathname + window.location.search === url) return;
    const alreadyInAChat = new URLSearchParams(window.location.search).has('chatType');
    if (alreadyInAChat) {
      // switching from one chat to another (desktop): stay one step above the list
      window.history.replaceState({ __chatOpen: !!window.history.state?.__chatOpen }, '', url);
    } else {
      window.history.pushState({ __chatOpen: true }, '', url);
    }
  };

  const closeChat = () => {
    setMobileView('list');
    if (typeof window === 'undefined') return;
    if (!new URLSearchParams(window.location.search).has('chatType')) return;
    if (window.history.state?.__chatOpen) window.history.back();
    else window.history.replaceState(null, '', '/chat');
  };

  const chatFromParams = (ct, cid) => {
    if (ct === 'materials') return { type: 'materials' };
    if (ct === 'group') return { type: 'group' };
    // partners only (the server refuses everyone else as well)
    if (ct === 'proofs') return isAdminRef.current ? { type: 'proofs' } : null;
    // everyone's own group (the proofs of the person's own sellers)
    if (ct === 'myproofs') return { type: 'myproofs' };
    if (ct === 'personal' && cid) {
      const match = contactsRef.current.find((c) => String(c._id) === String(cid));
      return { type: 'personal', contact: match || { _id: cid, name: 'Direct Message', username: 'user', role: 'member', placeholder: true } };
    }
    return null;
  };

  // The address changed (a chat was opened, "back" was used, or a notification link was followed)
  useEffect(() => {
    if (!urlChatType) {
      setMobileView('list');
      return;
    }
    const target = chatFromParams(urlChatType, urlContactId);
    if (!target) return;
    setActiveChat((prev) => (chatKeyOf(prev) === chatKeyOf(target) ? prev : target));
    setMobileView('chat');

    // Arrived straight on a chat link (from a notification): put the chat list underneath it, so
    // "back" shows the list and not whatever screen was open before.
    if (typeof window !== 'undefined' && !window.history.state?.__chatOpen) {
      const full = window.location.pathname + window.location.search;
      window.history.replaceState(null, '', '/chat');
      window.history.pushState({ __chatOpen: true }, '', full);
    }
  }, [urlChatType, urlContactId, isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  // A notification for another chat was tapped while this screen is already open
  useEffect(() => {
    const onOpenUrl = (e) => {
      const url = e.detail?.url || '';
      const q = url.includes('?') ? url.slice(url.indexOf('?')) : '';
      const params = new URLSearchParams(q);
      const target = chatFromParams(params.get('chatType'), params.get('contactId'));
      if (target) openChat(target);
    };
    window.addEventListener('portal_open_chat_url', onOpenUrl);
    return () => window.removeEventListener('portal_open_chat_url', onOpenUrl);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The chat was opened from a link before the contact list arrived: fill in the real name
  useEffect(() => {
    if (activeChat.type !== 'personal' || !activeChat.contact?.placeholder) return;
    const match = contacts.find((c) => String(c._id) === String(activeChat.contact._id));
    if (match) setActiveChat({ type: 'personal', contact: match });
  }, [contacts, activeChat]);

  // ─── 2. Fetch Messages for Current Active Chat ───
  // Someone else's messages just appeared in the open chat: highlight and chime
  const announceArrived = (arrived) => {
    if (arrived.length === 0) return;
    if (showScrollBottomRef.current) {
      setUnreadWhileScrolled((prev) => prev + arrived.length);
    }
    const latest = arrived[arrived.length - 1];
    setHighlightedMsgId(latest._id);
    setTimeout(() => setHighlightedMsgId(null), 4000);

    // Audio notification chime
    const hasBonus = arrived.some((m) => m.messageType === 'system_bonus');
    if (hasBonus) {
      playCashSound();
    } else {
      playMessageSound();
    }
  };

  const fetchMessages = async (quiet = false) => {
    // Loading a chat also marks it as read on the server. While the phone shows the chat list the
    // conversation is not in front of anyone, so it is left alone (and stays unread).
    // "Payment Proofs" is not a message chat: its own screen loads its cards
    if (!paneVisibleRef.current || activeChat.type === 'proofs' || activeChat.type === 'myproofs') {
      if (!quiet) setLoadingMessages(false);
      return;
    }
    try {
      if (!quiet) setLoadingMessages(true);
      lastMessagesFetchRef.current = Date.now();
      const token = localStorage.getItem('portal_token');

      let url = `/api/chat?chatType=${activeChat.type}`;
      if (activeChat.type === 'personal') {
        if (!activeChat.contact?._id) return;
        url += `&targetMemberId=${activeChat.contact._id}`;
      }
      // Background polls send what we already have: an unchanged chat answers "unchanged",
      // and a changed one sends back only the new / edited messages.
      const chatKey = `${activeChat.type}:${activeChat.contact?._id || ''}`;
      const isDelta = chatKeyRef.current === chatKey && messagesCursorRef.current > 0;
      if (messagesSigRef.current) url += `&sig=${encodeURIComponent(messagesSigRef.current)}`;
      if (isDelta) url += `&after=${messagesCursorRef.current}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        // The user switched to another chat while this request was on its way: ignore it
        if (chatKey !== activeKeyRef.current) return;
        const firstAnswer = justOpenedRef.current;
        justOpenedRef.current = false;
        if (data.unchanged) return;

        const incoming = (data.messages || []).map(withMedia);
        const current = messagesRef.current;
        let next;

        if (data.delta) {
          const byId = new Map(current.map((m) => [m._id, m]));
          for (const inc of incoming) {
            const old = byId.get(inc._id);
            if (old) {
              // edited / deleted / read update of a message we already show (media is kept locally)
              if (inc.isDeleted && !old.isDeleted) forgetMedia(inc._id);
              byId.set(inc._id, { ...old, ...inc, mediaUrl: inc.isDeleted ? '' : inc.mediaUrl || old.mediaUrl || '' });
            } else if (!inc.partial) {
              byId.set(inc._id, inc);
            }
          }
          next = sortByTime([...byId.values()]);

          // The chat was cleared (or trimmed) on the server: reload it from scratch
          const realCount = next.filter((m) => !m.pending && !m.failed).length;
          if (typeof data.count === 'number' && data.count < realCount) {
            if (data.count === 0) {
              next.filter((m) => !m.pending && !m.failed && isMediaMessage(m)).forEach((m) => forgetMedia(m._id));
              next = next.filter((m) => m.pending || m.failed);
            } else {
              messagesSigRef.current = '';
              messagesCursorRef.current = 0;
              chatKeyRef.current = '';
              fetchMessages(true);
              return;
            }
          }
        } else {
          // full load: keep messages that are still being sent
          const sending = current.filter((m) => m.pending || m.failed);
          next = sortByTime([...incoming, ...sending]);
          hasMoreRef.current = !!data.hasMore;
          setHasMoreOlder(!!data.hasMore);
        }

        chatKeyRef.current = chatKey;
        messagesSigRef.current = data.sig || '';
        messagesCursorRef.current = data.cursor || 0;

        // New messages from someone else while the user was scrolled up
        const known = new Set(current.map((m) => m._id));
        const arrived = next.filter((m) => !known.has(m._id) && !m.pending && m.senderId !== user?._id);
        if (prevMessagesLengthRef.current > 0 && arrived.length > 0) {
          announceArrived(arrived);
        }

        // First answer after opening a chat that had unread messages: remember where they start,
        // so a "N unread messages" line can be shown above them and the chat opens at that line.
        // (the chat list's number, or what the server says it has just marked as read)
        const waiting = firstAnswer ? Math.max(pendingUnreadRef.current, Number(data.justRead) || 0) : 0;
        pendingUnreadRef.current = 0;
        if (waiting > 0) {
          const theirs = next.filter((m) => !m.pending && !m.failed && String(m.senderId) !== String(user?._id));
          const count = Math.min(waiting, theirs.length);
          if (count > 0) {
            skipAutoScrollRef.current = true; // the view goes to the line, not to the very end
            firstScrollRef.current = false;
            setUnreadDivider({ chatKey, count, beforeId: theirs[theirs.length - count]._id });
          }
        }

        prevMessagesLengthRef.current = next.length;
        messagesRef.current = next;
        setMessages(next);
        // this request also marked the conversation as read
        if (!document.hidden) clearUnreadOf(data.conversationId);
      }
    } catch (err) {
      console.error('Failed to load chat messages:', err);
    } finally {
      if (!quiet) setLoadingMessages(false);
    }
  };

  // Immediate message fetch when activeChat changes, plus light polling every 2 seconds
  useEffect(() => {
    const chatKey = `${activeChat.type}:${activeChat.contact?._id || ''}`;
    // Seen before (this visit or an earlier one): show it at once, then fetch only what is new
    const saved = readCache(chatCacheKey(chatKey));
    const known =
      saved && Array.isArray(saved.messages) && saved.messages.length > 0
        ? { ...saved, messages: saved.messages.map(withMedia) }
        : null;

    firstScrollRef.current = true;
    keepScrollRef.current = null;
    setShowScrollBottom(false);
    setUnreadWhileScrolled(0);
    setLoadingOlder(false);

    // How many messages were waiting in this chat at the moment it is opened (see the
    // "N unread messages" line). Taken before loading, because loading marks them as read.
    setUnreadDivider(null);
    if (paneVisible) {
      const conv = conversationIdOf(activeChat);
      pendingUnreadRef.current =
        conv === 'main_group'
          ? groupMetaRef.current.unreadCount || 0
          : conv === 'materials_group'
          ? materialsMetaRef.current.unreadCount || 0
          : contactsRef.current.find((x) => x.conversationId === conv)?.unreadCount || 0;
    } else {
      pendingUnreadRef.current = 0;
    }
    justOpenedRef.current = paneVisible;

    if (activeChat.type === 'proofs' || activeChat.type === 'myproofs') {
      chatKeyRef.current = '';
      messagesSigRef.current = '';
      messagesCursorRef.current = 0;
      hasMoreRef.current = false;
      prevMessagesLengthRef.current = 0;
      messagesRef.current = [];
      pendingUnreadRef.current = 0;
      justOpenedRef.current = false;
      setHasMoreOlder(false);
      setMessages([]);
      setLoadingMessages(false);
      return undefined;
    }

    if (known) {
      chatKeyRef.current = chatKey;
      messagesSigRef.current = known.sig || '';
      messagesCursorRef.current = known.cursor || 0;
      hasMoreRef.current = !!known.hasMore;
      prevMessagesLengthRef.current = known.messages.length;
      messagesRef.current = known.messages;
      setHasMoreOlder(!!known.hasMore);
      setMessages(known.messages);
      setLoadingMessages(false);
      fetchMessages(true);
    } else {
      chatKeyRef.current = '';
      messagesSigRef.current = '';
      messagesCursorRef.current = 0;
      hasMoreRef.current = false;
      prevMessagesLengthRef.current = 0;
      messagesRef.current = [];
      setHasMoreOlder(false);
      setMessages([]);
      fetchMessages(false);
    }

    // Without the realtime channel: ask every 2 seconds, as before. With it, new messages are
    // pushed to this page, and this is only a slow safety check.
    const interval = setInterval(() => {
      if (document.hidden) return;
      if (pushedRef.current && Date.now() - lastMessagesFetchRef.current < 25000) return;
      fetchMessages(true);
    }, 2000);
    const onVisible = () => {
      if (!document.hidden) fetchMessages(true);
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(interval);
      clearTimeout(syncTimerRef.current);
      syncTimerRef.current = null;
      syncAgainRef.current = false;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [activeChat.type, activeChat.contact?._id, paneVisible]);

  // The chat opened with unread messages: start at the "unread" line instead of the very end
  useLayoutEffect(() => {
    if (!unreadDivider) return;
    const line = document.getElementById('unread-divider');
    const box = messagesContainerRef.current;
    if (!line || !box) return;
    const top = line.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
    box.scrollTop = Math.max(0, top - Math.min(120, box.clientHeight * 0.25));
  }, [unreadDivider?.beforeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── 2b. Realtime: messages pushed by the server ───
  // Ask the portal for the small update of the open chat (this also marks it as read). Several
  // reasons arriving together cost one request, and never more than one about every second.
  const syncSoon = (delay = 120) => {
    if (syncTimerRef.current) {
      syncAgainRef.current = true;
      return;
    }
    const sinceLast = Date.now() - lastSyncRef.current;
    const wait = Math.max(delay, sinceLast < 1200 ? 1200 - sinceLast : 0);
    syncTimerRef.current = setTimeout(async () => {
      syncTimerRef.current = null;
      lastSyncRef.current = Date.now();
      if (!document.hidden) await fetchMessages(true);
      if (syncAgainRef.current) {
        syncAgainRef.current = false;
        syncSoon(300);
      }
    }, wait);
  };

  // A new message, complete: show it now. No request is needed to see it.
  useRealtimeEvent('chat:message', (payload) => {
    const message = withMedia(payload?.message);
    const conversationId = payload?.conversationId || message?.conversationId;
    if (!message || !message._id || !conversationId) return;

    const mine = String(message.senderId) === String(uid);
    // "open" = this conversation is in front of the person (on a phone: not the chat list)
    const isOpen = conversationId === activeConvRef.current && paneVisibleRef.current;
    if (message.mediaUrl) rememberMedia(message._id, message.mediaUrl);

    // chat list: last message, and a badge unless the user is looking at that chat
    noteLastMessage(conversationId, message, !mine && !(isOpen && !document.hidden));

    if (!isOpen) return;
    // still loading this chat: its first load brings the message
    if (chatKeyRef.current !== activeKeyRef.current) return;
    const current = messagesRef.current;
    if (current.some((m) => m._id === message._id)) return;
    // being sent from this very screen: the answer of the send request puts it in place
    if (mine && current.some((m) => m.pending)) return;

    const next = sortByTime([...current, message]);
    // (a hidden tab stays quiet: the phone / desktop notification already makes the sound)
    if (!mine && !document.hidden) announceArrived([message]);
    prevMessagesLengthRef.current = next.length;
    messagesRef.current = next;
    setMessages(next);

    // mark it as read and pick up anything else that changed
    if (!mine) syncSoon(120);
  });

  // Read / edited / deleted / cleared: fetch the small update of the open chat
  useRealtimeEvent('chat:changed', (payload) => {
    const conversationId = payload?.conversationId || '';
    if (conversationId && conversationId !== activeConvRef.current) return;
    syncSoon(250);
    // a cleared or unknown change may also have changed the chat list
    if (!conversationId) fetchContacts();
  });

  // The channel was (re)opened: whatever happened meanwhile was not pushed
  useRealtimeEvent('resync', () => {
    if (document.hidden) return;
    syncSoon(50);
    if (Date.now() - lastContactsFetchRef.current > 3000) fetchContacts();
  });

  // Older messages were added above: keep the message the user was reading in place
  useLayoutEffect(() => {
    const keep = keepScrollRef.current;
    const el = messagesContainerRef.current;
    if (keep && el) {
      el.scrollTop = el.scrollHeight - keep.height + keep.top;
      keepScrollRef.current = null;
    }
  }, [messages]);

  // Auto-scroll on initial load or when at bottom
  useEffect(() => {
    if (skipAutoScrollRef.current) {
      skipAutoScrollRef.current = false;
      return;
    }
    if (messages.length === 0) return;
    const el = messagesContainerRef.current;
    if (firstScrollRef.current) {
      // opening a chat: be at the newest message immediately
      if (el) el.scrollTop = el.scrollHeight;
      firstScrollRef.current = false;
      return;
    }
    if (!showScrollBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, showScrollBottom]);

  // Phone: the conversation becomes visible only now, so place it at the newest message
  useEffect(() => {
    if (mobileView !== 'chat') return;
    const el = messagesContainerRef.current;
    if (el && !document.getElementById('unread-divider')) el.scrollTop = el.scrollHeight;
  }, [mobileView]);

  // ─── "Load earlier messages" ───
  const loadOlderMessages = async () => {
    if (loadingOlder || !hasMoreRef.current) return;
    const chatKey = activeKeyRef.current;
    const oldest = messagesRef.current.find((m) => !m.pending && !m.failed);
    if (!oldest) return;

    try {
      setLoadingOlder(true);
      const token = localStorage.getItem('portal_token');
      let url = `/api/chat?chatType=${activeChat.type}&before=${new Date(oldest.createdAt).getTime()}`;
      if (activeChat.type === 'personal') url += `&targetMemberId=${activeChat.contact?._id}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok || chatKey !== activeKeyRef.current) return;
      const data = await res.json();

      const have = new Set(messagesRef.current.map((m) => m._id));
      const older = (data.messages || []).map(withMedia).filter((m) => !have.has(m._id));
      const el = messagesContainerRef.current;
      if (el) keepScrollRef.current = { height: el.scrollHeight, top: el.scrollTop };
      skipAutoScrollRef.current = true;

      const next = sortByTime([...older, ...messagesRef.current]);
      hasMoreRef.current = !!data.hasMore;
      setHasMoreOlder(!!data.hasMore);
      prevMessagesLengthRef.current = next.length;
      messagesRef.current = next;
      setMessages(next);
    } catch (err) {
      console.error('Load earlier messages failed:', err);
    } finally {
      setLoadingOlder(false);
    }
  };

  // Scroll detection for floating Down Arrow button
  const handleScroll = () => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const isUp = el.scrollHeight - el.scrollTop - el.clientHeight > 180;
    setShowScrollBottom(isUp);
    if (!isUp) setUnreadWhileScrolled(0);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    setShowScrollBottom(false);
    setUnreadWhileScrolled(0);
  };

  // ─── Global Clipboard Paste & Keyboard Shortcuts ───
  useEffect(() => {
    const handleGlobalPaste = (e) => {
      // Check if clipboard contains image files or image items
      const clipboardFiles = e.clipboardData?.files;
      const items = e.clipboardData?.items;
      let hasImage = false;

      if (clipboardFiles && clipboardFiles.length > 0) {
        for (let i = 0; i < clipboardFiles.length; i++) {
          const f = clipboardFiles[i];
          if (f.type?.startsWith('image/') || f.name?.match(/\.(png|jpe?g|webp|gif|bmp|svg)$/i)) {
            hasImage = true;
            break;
          }
        }
      }

      if (!hasImage && items && items.length > 0) {
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item.type?.indexOf('image') !== -1 || (item.kind === 'file' && item.type?.startsWith('image/'))) {
            hasImage = true;
            break;
          }
        }
      }

      if (!hasImage) {
        const text = e.clipboardData?.getData('text') || '';
        if (
          text.trim().startsWith('data:image/') ||
          /^https?:\/\/.*\.(png|jpe?g|webp|gif|bmp|svg)(\?.*)?$/i.test(text.trim())
        ) {
          hasImage = true;
        }
      }

      if (hasImage) {
        handlePasteEvent(e);
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (fullscreenImage) setFullscreenImage(null);
        if (pendingImagePreview && !uploadingImage) setPendingImagePreview(null);
        if (editingMessage) setEditingMessage(null);
        if (deleteConfirmMsg) setDeleteConfirmMsg(null);
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('paste', handleGlobalPaste);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [fullscreenImage, pendingImagePreview, uploadingImage, editingMessage, deleteConfirmMsg]);

  // ─── 3. Send Message ───
  // The message appears at once ("Sending…") and is confirmed in the background, so typing and
  // sending never wait for the server.
  const handleSendMessage = async (payload) => {
    const chatKey = `${activeChat.type}:${activeChat.contact?._id || ''}`;
    const tempId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const optimistic = {
      _id: tempId,
      conversationId: '',
      senderId: user?._id,
      senderName: user?.name || 'You',
      senderRole: user?.role,
      messageType: payload.messageType || 'text',
      text: payload.text || '',
      mediaUrl: payload.mediaUrl || payload.localUrl || '',
      audioDuration: payload.audioDuration || 0,
      readBy: [],
      createdAt: new Date().toISOString(),
      pending: true,
      progress: payload.blob ? 0 : null,
      // kept so that "tap to resend" can send exactly the same thing again
      retry: payload,
    };

    const withTemp = [...messagesRef.current, optimistic];
    messagesRef.current = withTemp;
    setMessages(withTemp);
    setShowScrollBottom(false);
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 30);

    const settle = (replacement) => {
      // only touch the list if the user is still in the same chat
      if (activeKeyRef.current !== chatKey) return;
      const without = messagesRef.current.filter((m) => m._id !== tempId);
      const next = replacement
        ? without.some((m) => m._id === replacement._id)
          ? without
          : sortByTime([...without, replacement])
        : without;
      messagesRef.current = next;
      prevMessagesLengthRef.current = next.length;
      setMessages(next);
    };

    // "Sending… 40%" on a long voice note
    const showProgress = (pct) => {
      if (activeKeyRef.current !== chatKey) return;
      const next = messagesRef.current.map((m) => (m._id === tempId ? { ...m, progress: pct } : m));
      messagesRef.current = next;
      setMessages(next);
    };

    try {
      const token = localStorage.getItem('portal_token');
      const { blob, localUrl, upload, ...plain } = payload;
      const body = {
        chatType: activeChat.type,
        targetMemberId: activeChat.type === 'personal' ? activeChat.contact?._id : null,
        ...plain,
      };

      if (blob) {
        if (blob.size <= VOICE_INLINE_MAX_BYTES) {
          body.mediaUrl = await blobToDataUrl(blob);
        } else {
          // A long voice note goes up in pieces. A piece that fails is tried again; what has
          // already arrived is remembered, so "tap to resend" continues instead of starting over.
          if (!payload.upload) payload.upload = { id: newUploadId(), sent: 0 };
          const up = payload.upload;
          const pieces = Math.ceil(blob.size / VOICE_PIECE_BYTES);
          for (let i = up.sent; i < pieces; i++) {
            const piece = blob.slice(i * VOICE_PIECE_BYTES, (i + 1) * VOICE_PIECE_BYTES);
            let lastError = 'Network error';
            let done = false;
            for (let attempt = 0; attempt < 3 && !done; attempt++) {
              if (attempt > 0) await wait(1200 * attempt);
              try {
                const r = await fetch(`/api/chat/upload?uploadId=${up.id}&index=${i}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/octet-stream', Authorization: `Bearer ${token}` },
                  body: piece,
                });
                if (r.ok) done = true;
                else {
                  lastError = (await r.json().catch(() => ({}))).message || 'Upload failed';
                  if (r.status < 500 && r.status !== 408 && r.status !== 429) break; // trying again will not help
                }
              } catch (e) {
                lastError = 'Network error';
              }
            }
            if (!done) {
              settle({ ...optimistic, pending: false, failed: true, failReason: lastError });
              return;
            }
            up.sent = i + 1;
            showProgress(Math.round((up.sent / pieces) * 95));
          }
          body.uploadId = up.id;
        }
      }

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = await res.json();
        // the server does not echo the picture / voice note back: keep the copy we just sent
        // (a picture that went to the file storage needs no copy on the device: it is a link now)
        // (a recording is kept as its data, never as the temporary address used while sending)
        const sentMedia = body.mediaUrl || '';
        if (sentMedia && data.chatMessage?._id && !data.chatMessage.mediaLink) {
          rememberMedia(data.chatMessage._id, sentMedia);
        }
        settle({ ...data.chatMessage, mediaUrl: data.chatMessage?.mediaUrl || data.chatMessage?.mediaLink || sentMedia });
        // chat list: this is now the last message of that conversation
        if (data.chatMessage?.conversationId) noteLastMessage(data.chatMessage.conversationId, data.chatMessage, false);
        else fetchContacts();
      } else {
        const errData = await res.json().catch(() => ({}));
        settle({ ...optimistic, pending: false, failed: true, failReason: errData.message || 'Failed to send' });
      }
    } catch (err) {
      console.error('Send message failed:', err);
      settle({ ...optimistic, pending: false, failed: true, failReason: 'Network error' });
    }
  };

  // Try a message that could not be sent once more (a long voice note continues where it stopped)
  const resendFailedMessage = (msg) => {
    if (!msg?.retry) return;
    const next = messagesRef.current.filter((m) => m._id !== msg._id);
    messagesRef.current = next;
    prevMessagesLengthRef.current = next.length;
    setMessages(next);
    handleSendMessage(msg.retry);
  };

  // Remove a message that could not be sent
  const dismissFailedMessage = (id) => {
    const next = messagesRef.current.filter((m) => m._id !== id);
    messagesRef.current = next;
    setMessages(next);
  };

  // ─── Admin: clear the whole conversation for everyone ───
  const handleClearChat = async () => {
    if (!isAdmin || clearingChat) return;
    const label =
      activeChat.type === 'materials'
        ? 'the Materials Group'
        : activeChat.type === 'group'
        ? 'the Team Group chat'
        : `your chat with ${activeChat.contact?.name || 'this member'}`;
    if (!window.confirm(`Clear ${label}?\n\nAll messages, pictures and voice notes in it will be deleted for everyone. This cannot be undone.`)) return;

    try {
      setClearingChat(true);
      const token = localStorage.getItem('portal_token');
      let url = `/api/chat?chatType=${activeChat.type}`;
      if (activeChat.type === 'personal') url += `&targetMemberId=${activeChat.contact?._id}`;
      const res = await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.message || 'Could not clear the chat');
        return;
      }
      messagesRef.current = [];
      messagesSigRef.current = '';
      messagesCursorRef.current = 0;
      prevMessagesLengthRef.current = 0;
      hasMoreRef.current = false;
      setHasMoreOlder(false);
      dropCache(chatCacheKey(`${activeChat.type}:${activeChat.contact?._id || ''}`));
      setMessages([]);
      fetchContacts();
    } catch (err) {
      console.error('Clear chat failed:', err);
      alert('Network error while clearing the chat. Please try again.');
    } finally {
      setClearingChat(false);
    }
  };

  const handleTextSubmit = (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    if (activeChat.type === 'materials') {
      alert('Materials Group is for photos and promotional materials. Please attach or paste a picture to send.');
      return;
    }

    handleSendMessage({
      messageType: 'text',
      text: inputText.trim(),
    });
    setInputText('');
    reportTyping('');
  };

  const handleSendVoice = (blob, durationSec, localUrl) => {
    setIsRecordingVoice(false);
    if (!blob || blob.size === 0) return;
    if (blob.size > VOICE_MAX_BYTES) {
      alert('This voice note is too long to send. Please record it in two parts.');
      return;
    }
    handleSendMessage({
      messageType: 'voice',
      blob,
      localUrl, // played from the device while it is being sent
      audioDuration: durationSec,
    });
  };

  // Compress & optimize image for lightning-fast delivery (WhatsApp-grade)
  const compressImage = (file) => {
    return new Promise((resolve, reject) => {
      if (file.type === 'image/gif') {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const MAX_WIDTH = 1280;
          const MAX_HEIGHT = 1280;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height = Math.round((height * MAX_WIDTH) / width);
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width = Math.round((width * MAX_HEIGHT) / height);
              height = MAX_HEIGHT;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          // Convert to compact high-clarity JPEG
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.8);
          resolve(compressedDataUrl);
        };
        img.onerror = () => resolve(e.target.result);
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // ─── Image Helpers (Popup Preview & Safe Send) ───
  const openImagePreview = (file, previewUrl = null) => {
    if (!file && !previewUrl) return;

    if (previewUrl) {
      setPendingImagePreview({
        file: file || null,
        previewUrl,
        caption: '',
      });
      return;
    }

    if (file) {
      if (file.size > 25 * 1024 * 1024) {
        alert('Image exceeds 25MB limit. Please choose a smaller image.');
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        setPendingImagePreview({
          file,
          previewUrl: event.target.result,
          caption: '',
        });
      };
      reader.readAsDataURL(file);
    }
  };

  // Image Selection Handler (Opens WhatsApp-style preview & caption dialog)
  const handleImageFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select a valid image file (JPG, PNG, WEBP, GIF)');
      return;
    }

    openImagePreview(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Confirm and Send Image from Preview Modal ONLY
  const handleConfirmSendImage = async (e) => {
    e?.preventDefault();
    if (!pendingImagePreview) return;

    try {
      setUploadingImage(true);
      let mediaBase64 = pendingImagePreview.previewUrl;

      if (pendingImagePreview.file) {
        mediaBase64 = await compressImage(pendingImagePreview.file);
      } else if (/^data:image\/(?!gif)/i.test(mediaBase64 || '')) {
        // a pasted picture that never was a file: make it small as well
        try {
          const blob = await (await fetch(mediaBase64)).blob();
          mediaBase64 = await compressImage(new File([blob], 'pasted', { type: blob.type || 'image/png' }));
        } catch (_) {}
      }

      await handleSendMessage({
        messageType: 'image',
        mediaUrl: mediaBase64,
        text: pendingImagePreview.caption.trim(),
      });

      setPendingImagePreview(null);
    } catch (err) {
      console.error('Error sending picture:', err);
      alert('Failed to process and send picture. Please try again.');
    } finally {
      setUploadingImage(false);
    }
  };

  // ─── Robust Mobile & Desktop Image Download / Save Helper ───
  const downloadImageFile = async (imageUrl, defaultFilename = `photo-${Date.now()}.jpg`) => {
    if (!imageUrl) return;

    try {
      setDownloadToast('Saving picture to your device...');

      let blob;
      let mimeType = 'image/jpeg';

      if (imageUrl.startsWith('data:')) {
        const parts = imageUrl.split(',');
        const mimeMatch = parts[0].match(/:(.*?);/);
        if (mimeMatch) mimeType = mimeMatch[1];

        const byteCharacters = atob(parts[1]);
        const byteArrays = [];
        const sliceSize = 1024;
        for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
          const slice = byteCharacters.slice(offset, offset + sliceSize);
          const byteNumbers = new Array(slice.length);
          for (let i = 0; i < slice.length; i++) {
            byteNumbers[i] = slice.charCodeAt(i);
          }
          byteArrays.push(new Uint8Array(byteNumbers));
        }
        blob = new Blob(byteArrays, { type: mimeType });
      } else {
        const res = await fetch(imageUrl);
        blob = await res.blob();
        mimeType = blob.type || 'image/jpeg';
      }

      let extension = 'jpg';
      if (mimeType.includes('png')) extension = 'png';
      else if (mimeType.includes('webp')) extension = 'webp';
      else if (mimeType.includes('gif')) extension = 'gif';

      const filename = defaultFilename.includes('.')
        ? defaultFilename
        : `${defaultFilename}.${extension}`;

      // 1. Mobile Web Share API (Direct save to mobile gallery/files on Android & iOS)
      const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      if (isMobile && navigator.canShare && typeof File !== 'undefined') {
        try {
          const testFile = new File([blob], filename, { type: mimeType });
          if (navigator.canShare({ files: [testFile] })) {
            await navigator.share({
              files: [testFile],
              title: 'Bazario Picture',
              text: 'Save picture from chat',
            });
            setDownloadToast('Picture saved / shared!');
            setTimeout(() => setDownloadToast(''), 3000);
            return;
          }
        } catch (shareErr) {
          if (shareErr.name === 'AbortError') {
            setDownloadToast('');
            return; // User dismissed share dialog
          }
          console.warn('Web Share failed, continuing to blob download:', shareErr);
        }
      }

      // 2. Universal Blob URL Download (Standard for Chrome, Safari, Firefox)
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();

      setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(blobUrl);
      }, 2000);

      setDownloadToast('Picture saved to your device!');
      setTimeout(() => setDownloadToast(''), 3000);
    } catch (err) {
      console.error('Download image error:', err);
      // Fallback: open in new window for manual save
      try {
        const w = window.open();
        if (w) {
          w.document.write(`<img src="${imageUrl}" style="max-width:100%;height:auto;margin:auto;display:block;" /><p style="text-align:center;font-family:sans-serif;margin-top:20px;">Tap and hold image to save to your device.</p>`);
          setDownloadToast('Opened image. Tap and hold to save.');
        } else {
          window.location.href = imageUrl;
        }
      } catch (e) {
        setDownloadToast('Tap and hold the image to save.');
      }
      setTimeout(() => setDownloadToast(''), 4000);
    }
  };

  // Unified Clipboard Paste Support (Ctrl+V screenshot / photo)
  const handlePasteEvent = (e) => {
    // 1. Check if files in clipboard (e.g. Snipping tool, copied image file in explorer)
    const clipboardFiles = e.clipboardData?.files;
    if (clipboardFiles && clipboardFiles.length > 0) {
      for (let i = 0; i < clipboardFiles.length; i++) {
        const file = clipboardFiles[i];
        if (file.type?.startsWith('image/') || file.name?.match(/\.(png|jpe?g|webp|gif|bmp|svg)$/i)) {
          e.preventDefault();
          e.stopPropagation();
          openImagePreview(file);
          return;
        }
      }
    }

    // 2. Check clipboard items
    const items = e.clipboardData?.items;
    if (items && items.length > 0) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type?.indexOf('image') !== -1 || (item.kind === 'file' && item.type?.startsWith('image/'))) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            e.stopPropagation();
            openImagePreview(file);
            return;
          }
        }
      }
    }

    // 3. Check if plain text contains a direct base64 data URL or image link
    const pastedText = e.clipboardData?.getData('text');
    if (pastedText) {
      const trimmed = pastedText.trim();
      if (
        trimmed.startsWith('data:image/') ||
        /^https?:\/\/.*\.(png|jpe?g|webp|gif|bmp|svg)(\?.*)?$/i.test(trimmed)
      ) {
        e.preventDefault();
        e.stopPropagation();
        openImagePreview(null, trimmed);
        return;
      }
    }
  };

  // Drag and Drop handlers for chat window
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.type?.startsWith('image/') || file.name?.match(/\.(png|jpe?g|webp|gif|bmp|svg)$/i)) {
          openImagePreview(file);
          return;
        }
      }
    }
  };

  // ─── 4. Message Edit & Delete ───
  const handleEditSubmit = async (e) => {
    e?.preventDefault();
    if (!editingMessage || !editText.trim()) return;

    try {
      setEditLoading(true);
      const token = localStorage.getItem('portal_token');
      const res = await fetch(`/api/chat/${editingMessage._id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text: editText.trim() }),
      });

      if (res.ok) {
        const data = await res.json();
        setMessages((prev) =>
          prev.map((m) => (m._id === editingMessage._id ? data.chatMessage : m))
        );
        setEditingMessage(null);
        setEditText('');
      } else {
        const err = await res.json();
        alert(err.message || 'Failed to edit message');
      }
    } catch (err) {
      console.error('Edit error:', err);
    } finally {
      setEditLoading(false);
    }
  };

  const handleDeleteSubmit = async () => {
    if (!deleteConfirmMsg) return;

    try {
      setDeleteLoading(true);
      const token = localStorage.getItem('portal_token');
      const res = await fetch(`/api/chat/${deleteConfirmMsg._id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        setMessages((prev) =>
          prev.map((m) => (m._id === deleteConfirmMsg._id ? data.chatMessage : m))
        );
        setDeleteConfirmMsg(null);
      } else {
        const err = await res.json();
        alert(err.message || 'Failed to delete message');
      }
    } catch (err) {
      console.error('Delete message error:', err);
    } finally {
      setDeleteLoading(false);
    }
  };

  // ─── 5. Day Separator & Formatting ───
  const getDayKey = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const getDayLabel = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';

    return date.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatMessageTime = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const distinctDays = Array.from(
    new Map(
      messages
        .filter((m) => m.createdAt)
        .map((m) => [getDayKey(m.createdAt), { key: getDayKey(m.createdAt), label: getDayLabel(m.createdAt) }])
    ).values()
  ).filter((d) => d.key && d.label);

  const jumpToDate = (dayKey) => {
    setIsDatePickerOpen(false);
    const el = document.getElementById(`day-divider-${dayKey}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Search filter across contacts
  const filteredContacts = contacts.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="-mx-4 -my-4 sm:mx-0 sm:my-0 h-[calc(100dvh-64px-64px)] sm:h-[calc(100vh-115px)] flex bg-white rounded-none sm:rounded-3xl border-0 sm:border border-slate-200 shadow-none sm:shadow-md overflow-hidden relative">
      {/* ───────────────────────────────────────────────────────────
          LEFT SIDEBAR: Full WhatsApp-Style Chats List
          (Shown for both Admins & Members on Desktop, and as Screen 1 on Mobile)
      ─────────────────────────────────────────────────────────── */}
      <div
        className={`w-full md:w-80 lg:w-96 bg-white border-r border-slate-200 flex flex-col shrink-0 ${
          mobileView === 'chat' ? 'hidden md:flex' : 'flex'
        }`}
      >
        {/* Top Header */}
        <div className="p-4 border-b border-slate-200 bg-slate-900 text-white">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold flex items-center space-x-2">
              <MessageSquare className="w-5 h-5 text-emerald-400" />
              <span>Bazario Chats</span>
            </h2>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-emerald-300 border border-slate-700">
              {contacts.length + 1} Channels
            </span>
          </div>

          {/* Search Bar */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search chats or members..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-800 border border-slate-700 text-white rounded-xl text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
            />
          </div>
        </div>

        {/* Scrollable Chats List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {/* ── 1. PINNED: Team General Discussion ── */}
          <button
            onClick={() => openChat({ type: 'group' })}
            className={`w-full p-3.5 flex items-start space-x-3 text-left transition-all ${
              activeChat.type === 'group' && paneVisible
                ? 'bg-emerald-50/90 border-l-4 border-emerald-600'
                : 'hover:bg-slate-50'
            }`}
          >
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shrink-0 shadow-sm">
              <Users className="w-6 h-6" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className={`text-xs text-slate-900 truncate ${groupMeta.unreadCount > 0 ? 'font-extrabold' : 'font-bold'}`}>
                  Team General Discussion
                </span>
                {groupMeta.lastMessage && (
                  <span className={`text-[10px] shrink-0 ml-1 ${groupMeta.unreadCount > 0 ? 'text-emerald-700 font-bold' : 'text-slate-400'}`}>
                    {formatMessageTime(groupMeta.lastMessage.createdAt)}
                  </span>
                )}
              </div>

              {typingText('main_group') ? (
                <p className="text-[11px] text-emerald-600 font-semibold truncate mt-0.5">{typingText('main_group')}</p>
              ) : (
              <p className={`text-[11px] truncate mt-0.5 ${groupMeta.unreadCount > 0 ? 'text-slate-900 font-semibold' : 'text-slate-500'}`}>
                {groupMeta.lastMessage
                  ? `${groupMeta.lastMessage.senderName}: ${
                      groupMeta.lastMessage.isDeleted
                        ? '🚫 Message deleted'
                        : groupMeta.lastMessage.messageType === 'voice'
                        ? '🎤 Voice note'
                        : groupMeta.lastMessage.messageType === 'image'
                        ? '📷 Photo'
                        : groupMeta.lastMessage.text
                    }`
                  : 'Group room for all admins and members'}
              </p>
              )}

              <div className="flex items-center space-x-1.5 mt-1">
                <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-bold uppercase">
                  All Team
                </span>
                <UnreadLabel count={groupMeta.unreadCount} />
              </div>
            </div>
          </button>

          {/* ── 2. PINNED: Materials Group (Admins post photos, all view/download) ── */}
          <button
            onClick={() => openChat({ type: 'materials' })}
            className={`w-full p-3.5 flex items-start space-x-3 text-left transition-all ${
              activeChat.type === 'materials'
                ? 'bg-purple-50/90 border-l-4 border-purple-600'
                : 'hover:bg-slate-50'
            }`}
          >
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-blue-600 flex items-center justify-center text-white shrink-0 shadow-sm">
              <ImageIcon className="w-6 h-6" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className={`text-xs text-slate-900 truncate ${materialsMeta.unreadCount > 0 ? 'font-extrabold' : 'font-bold'}`}>
                  Materials Group
                </span>
                {materialsMeta.lastMessage && (
                  <span className={`text-[10px] shrink-0 ml-1 ${materialsMeta.unreadCount > 0 ? 'text-emerald-700 font-bold' : 'text-slate-400'}`}>
                    {formatMessageTime(materialsMeta.lastMessage.createdAt)}
                  </span>
                )}
              </div>

              <p className={`text-[11px] truncate mt-0.5 ${materialsMeta.unreadCount > 0 ? 'text-slate-900 font-semibold' : 'text-slate-500'}`}>
                {materialsMeta.lastMessage
                  ? `${materialsMeta.lastMessage.senderName}: ${
                      materialsMeta.lastMessage.isDeleted
                        ? '🚫 Message deleted'
                        : materialsMeta.lastMessage.messageType === 'image'
                        ? '📷 Photo & Material'
                        : materialsMeta.lastMessage.text
                    }`
                  : 'Official photos & assets channel (Admins post only)'}
              </p>

              <div className="flex items-center space-x-1.5 mt-1">
                <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-purple-100 text-purple-800 font-bold uppercase">
                  Admins Post
                </span>
                <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 font-medium">
                  View & Download
                </span>
                <UnreadLabel count={materialsMeta.unreadCount} />
              </div>
            </div>
          </button>

          {/* ── 3. PINNED: Payment Proofs (partners only): one card per real seller deposit ── */}
          {isAdmin && (
            <button
              onClick={() => openChat({ type: 'proofs' })}
              className={`w-full p-3.5 flex items-start space-x-3 text-left transition-all ${
                activeChat.type === 'proofs' && paneVisible ? 'bg-amber-50/90 border-l-4 border-amber-500' : 'hover:bg-slate-50'
              }`}
            >
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center text-white shrink-0 shadow-sm">
                <ReceiptText className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className={`text-xs text-slate-900 truncate ${proofsMeta?.draft > 0 ? 'font-extrabold' : 'font-bold'}`}>Payment Proofs</span>
                  {proofsMeta?.latest?.depositAt && (
                    <span className={`text-[10px] shrink-0 ml-1 ${proofsMeta.draft > 0 ? 'text-amber-700 font-bold' : 'text-slate-400'}`}>
                      {formatMessageTime(proofsMeta.latest.depositAt)}
                    </span>
                  )}
                </div>
                <p className={`text-[11px] truncate mt-0.5 ${proofsMeta?.draft > 0 ? 'text-slate-900 font-semibold' : 'text-slate-500'}`}>
                  {proofsMeta?.draft > 0
                    ? `${proofsMeta.draft} deposit${proofsMeta.draft === 1 ? '' : 's'} waiting for USDT + screenshots`
                    : 'Every deposit has its proof'}
                </p>
                <div className="mt-1 flex items-center space-x-1.5">
                  <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 font-bold tracking-wide uppercase">Partners only</span>
                  {proofsMeta?.requests > 0 && (
                    <span className="shrink-0 px-2 py-0.5 rounded-full bg-blue-600 text-white text-[10px] font-bold">
                      {proofsMeta.requests} request{proofsMeta.requests === 1 ? '' : 's'}
                    </span>
                  )}
                  {proofsMeta?.draft > 0 && (
                    <span className="!ml-auto shrink-0 px-2 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-bold">{proofsMeta.draft} pending</span>
                  )}
                </div>
              </div>
            </button>
          )}

          {/* ── 4. PINNED: the person's OWN proofs (complete proofs of his own sellers, view only) ── */}
          {(() => {
            const fresh = (myProofsMeta?.fresh || 0) + (myProofsMeta?.answered || 0);
            return (
              <button
                onClick={() => openChat({ type: 'myproofs' })}
                className={`w-full p-3.5 flex items-start space-x-3 text-left transition-all ${
                  activeChat.type === 'myproofs' && paneVisible ? 'bg-emerald-50/90 border-l-4 border-emerald-600' : 'hover:bg-slate-50'
                }`}
              >
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-600 flex items-center justify-center text-white shrink-0 shadow-sm">
                  <ReceiptText className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className={`text-xs text-slate-900 truncate ${fresh > 0 ? 'font-extrabold' : 'font-bold'}`}>{isAdmin ? 'My Payment Proofs' : 'Payment Proofs'}</span>
                    {myProofsMeta?.latest?.at && (
                      <span className={`text-[10px] shrink-0 ml-1 ${fresh > 0 ? 'text-emerald-700 font-bold' : 'text-slate-400'}`}>{formatMessageTime(myProofsMeta.latest.at)}</span>
                    )}
                  </div>
                  <p className={`text-[11px] truncate mt-0.5 ${fresh > 0 ? 'text-slate-900 font-semibold' : 'text-slate-500'}`}>
                    {myProofsMeta?.latest
                      ? `${myProofsMeta.latest.storeName}: proof added`
                      : 'Proofs of your own sellers appear here'}
                  </p>
                  <div className="mt-1 flex items-center space-x-1.5">
                    <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-bold tracking-wide uppercase">My sellers</span>
                    {myProofsMeta?.open > 0 && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 font-medium">
                        {myProofsMeta.open} request{myProofsMeta.open === 1 ? '' : 's'} waiting
                      </span>
                    )}
                    {fresh > 0 && <span className="!ml-auto shrink-0 px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-bold">{fresh} new</span>}
                  </div>
                </div>
              </button>
            );
          })()}

          {/* Section Divider: Direct 1-on-1 Messages */}
          <div className="px-4 py-2 bg-slate-100/70 text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between">
            <span>Direct Messages (Admins & Members)</span>
            <span className="text-[9px] lowercase font-normal text-slate-400">1-on-1</span>
          </div>

          {/* ── 2. Direct Contacts (Admins & Members alike) ── */}
          {!contactsLoaded && contacts.length === 0 ? (
            <div className="divide-y divide-slate-100" aria-label="Loading chats">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="p-3.5 flex items-start space-x-3 animate-pulse">
                  <div className="w-12 h-12 rounded-2xl bg-slate-200 shrink-0" />
                  <div className="flex-1 space-y-2 pt-1">
                    <div className="h-3 w-1/2 rounded bg-slate-200" />
                    <div className="h-2.5 w-3/4 rounded bg-slate-100" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredContacts.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400">
              No contacts available
            </div>
          ) : (
            filteredContacts.map((contact) => {
              const isSelected =
                paneVisible && activeChat.type === 'personal' && activeChat.contact?._id === contact._id;
              const isContactAdmin = contact.role === 'admin';

              return (
                <button
                  key={contact._id}
                  onClick={() => openChat({ type: 'personal', contact })}
                  className={`w-full p-3.5 flex items-start space-x-3 text-left transition-all ${
                    isSelected
                      ? 'bg-purple-50/90 border-l-4 border-purple-600'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  <div
                    className={`relative w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-base shrink-0 shadow-sm ${
                      isContactAdmin
                        ? 'bg-gradient-to-tr from-purple-600 to-indigo-600 text-white'
                        : 'bg-gradient-to-tr from-slate-700 to-slate-800 text-white'
                    }`}
                  >
                    {/* Admins only: green dot while this person has the portal open */}
                    {isOnline(contact._id) && (
                      <span
                        title="Online"
                        className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white"
                      />
                    )}
                    {isContactAdmin ? (
                      <Shield className="w-5 h-5" />
                    ) : (
                      contact.name.charAt(0).toUpperCase()
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className={`text-xs text-slate-900 truncate ${contact.unreadCount > 0 ? 'font-extrabold' : 'font-bold'}`}>
                        {contact.name}
                      </span>
                      {contact.lastMessage && (
                        <span className={`text-[10px] shrink-0 ml-1 ${contact.unreadCount > 0 ? 'text-emerald-700 font-bold' : 'text-slate-400'}`}>
                          {formatMessageTime(contact.lastMessage.createdAt)}
                        </span>
                      )}
                    </div>

                    {typingText(contact.conversationId, { short: true }) ? (
                      <p className="text-[11px] text-emerald-600 font-semibold truncate mt-0.5">typing…</p>
                    ) : (
                    <p className={`text-[11px] truncate mt-0.5 ${contact.unreadCount > 0 ? 'text-slate-900 font-semibold' : 'text-slate-500'}`}>
                      {contact.lastMessage
                        ? `${
                            contact.lastMessage.senderId === user?._id ? 'You: ' : ''
                          }${
                            contact.lastMessage.isDeleted
                              ? '🚫 Message deleted'
                              : contact.lastMessage.messageType === 'voice'
                              ? '🎤 Voice note'
                              : contact.lastMessage.messageType === 'image'
                              ? '📷 Photo'
                              : contact.lastMessage.text
                          }`
                        : `Tap to message @${contact.username}`}
                    </p>
                    )}
                    {/* Admins only: Online / last seen */}
                    {presenceText(contact._id) && (
                      <p
                        className={`text-[10px] truncate mt-0.5 ${
                          isOnline(contact._id) ? 'text-emerald-600 font-semibold' : 'text-slate-400'
                        }`}
                      >
                        {presenceText(contact._id)}
                      </p>
                    )}

                    <div className="flex items-center space-x-1.5 mt-1 flex-wrap gap-y-1">
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded-md font-bold uppercase ${
                          isContactAdmin
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {isContactAdmin ? 'Admin' : 'Member'}
                      </span>
                      {!isContactAdmin && (
                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded-md font-bold ${
                            contact.commissionLabel === 'inr_50'
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          }`}
                        >
                          {contact.commissionLabel === 'inr_50' ? '50% INR' : '1:1 PKR'}
                        </span>
                      )}
                      <span className="text-[10px] text-slate-400">@{contact.username}</span>

                      <UnreadLabel count={contact.unreadCount} />
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────
          RIGHT CHAT WINDOW: WhatsApp Active Room
          (Shown alongside left pane on Desktop, or as Screen 2 on Mobile)
      ─────────────────────────────────────────────────────────── */}
      {activeChat.type === 'proofs' && isAdmin && (
        <div className={`flex-1 min-w-0 ${mobileView === 'list' ? 'hidden md:flex' : 'flex'}`}>
          <PaymentProofsPane
            visible={paneVisible}
            onBack={closeChat}
            onCounts={(c) => setProofsMeta((prev) => ({ ...(prev || {}), draft: c?.draft || 0, requests: typeof c?.requests === 'number' ? c.requests : prev?.requests || 0 }))}
          />
        </div>
      )}
      {activeChat.type === 'myproofs' && (
        <div className={`flex-1 min-w-0 ${mobileView === 'list' ? 'hidden md:flex' : 'flex'}`}>
          <MyProofsPane
            visible={paneVisible}
            isPartner={isAdmin}
            onBack={closeChat}
            onSeen={(c) => setMyProofsMeta((prev) => ({ ...(prev || {}), fresh: 0, answered: 0, total: c?.total || 0, open: c?.open || 0 }))}
          />
        </div>
      )}
      <div
        className={`flex-1 flex-col bg-slate-50/60 min-w-0 relative ${
          (activeChat.type === 'proofs' && isAdmin) || activeChat.type === 'myproofs' ? 'hidden' : mobileView === 'list' ? 'hidden md:flex' : 'flex'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Drag-and-Drop Picture Overlay */}
        {isDraggingOver && (
          <div className="absolute inset-0 z-40 bg-emerald-600/90 backdrop-blur-xs flex flex-col items-center justify-center text-white border-4 border-dashed border-white rounded-3xl m-4 pointer-events-none animate-fade-in shadow-2xl">
            <ImageIcon className="w-16 h-16 mb-2 animate-bounce" />
            <h3 className="text-xl font-bold">Drop Picture to Preview</h3>
            <p className="text-xs sm:text-sm opacity-90">Preview dialog will open so you can confirm before sending</p>
          </div>
        )}

        {/* Chat Room Top Bar */}
        <div className="bg-slate-900 text-white px-4 py-3 sm:px-6 flex items-center justify-between shrink-0 z-20">
          <div className="flex items-center space-x-3 min-w-0">
            {/* Back Button on Mobile (Returns to Chats List) */}
            <button
              onClick={closeChat}
              className="md:hidden p-1.5 -ml-1 text-slate-300 hover:text-white rounded-xl hover:bg-slate-800 transition"
              title="Back to all chats"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            {/* Avatar */}
            <div
              className={`w-9 h-9 rounded-2xl flex items-center justify-center font-bold text-white shrink-0 ${
                activeChat.type === 'materials'
                  ? 'bg-gradient-to-tr from-purple-600 via-indigo-600 to-blue-600'
                  : activeChat.type === 'group'
                  ? 'bg-gradient-to-tr from-emerald-600 to-teal-500'
                  : activeChat.contact?.role === 'admin'
                  ? 'bg-gradient-to-tr from-purple-600 to-indigo-600'
                  : 'bg-gradient-to-tr from-slate-700 to-slate-800'
              }`}
            >
              {activeChat.type === 'materials' ? (
                <ImageIcon className="w-4 h-4" />
              ) : activeChat.type === 'group' ? (
                <Users className="w-4 h-4" />
              ) : activeChat.contact?.role === 'admin' ? (
                <Shield className="w-4 h-4" />
              ) : (
                activeChat.contact?.name?.charAt(0).toUpperCase() || 'U'
              )}
            </div>

            {/* Title & Status */}
            <div className="min-w-0">
              <div className="flex items-center space-x-2">
                <h2 className="text-xs sm:text-sm font-bold text-slate-100 truncate">
                  {activeChat.type === 'materials'
                    ? 'Materials Group'
                    : activeChat.type === 'group'
                    ? 'Team General Discussion'
                    : activeChat.contact
                    ? activeChat.contact.name
                    : 'Direct Chat'}
                </h2>
                <span
                  className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider shrink-0 ${
                    activeChat.type === 'materials'
                      ? 'bg-purple-500/25 text-purple-300 border border-purple-500/30'
                      : activeChat.type === 'group'
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : activeChat.contact?.role === 'admin'
                      ? 'bg-purple-500/20 text-purple-300'
                      : 'bg-slate-500/20 text-slate-300'
                  }`}
                >
                  {activeChat.type === 'materials'
                    ? 'Admins Post Only'
                    : activeChat.type === 'group'
                    ? 'Public'
                    : activeChat.contact?.role === 'admin'
                    ? 'Admin'
                    : 'Member'}
                </span>
                {activeChat.type === 'personal' && activeChat.contact?.role !== 'admin' && (
                  <span
                    className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider shrink-0 ${
                      activeChat.contact.commissionLabel === 'inr_50'
                        ? 'bg-amber-500/25 text-amber-300 border border-amber-500/30'
                        : 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/30'
                    }`}
                  >
                    {activeChat.contact.commissionLabel === 'inr_50' ? '🇮🇳 50% INR Deal' : '🇵🇰 1:1 PKR Deal'}
                  </span>
                )}
              </div>
              {/* Admins only: "typing…", or Online / last seen of the person in a 1-on-1 chat */}
              {typingText(activeConvRef.current) ? (
                <p className="text-[10px] text-emerald-300 font-semibold truncate animate-pulse">
                  {typingText(activeConvRef.current)}
                </p>
              ) : activeChat.type === 'personal' && presenceText(activeChat.contact?._id) ? (
                <p className="text-[10px] truncate flex items-center space-x-1.5">
                  {isOnline(activeChat.contact?._id) && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block shrink-0" />}
                  <span className={isOnline(activeChat.contact?._id) ? 'text-emerald-300 font-semibold' : 'text-slate-400'}>
                    {presenceText(activeChat.contact?._id)}
                  </span>
                </p>
              ) : (
              <p className="text-[10px] text-slate-400 truncate">
                {activeChat.type === 'materials'
                  ? 'Official pictures & marketing assets • All members can view & download'
                  : activeChat.type === 'group'
                  ? 'All admins and members can view & reply here'
                  : activeChat.contact
                  ? `Private 1-on-1 line (@${activeChat.contact.username})`
                  : 'Secure 1-on-1 line'}
              </p>
              )}
            </div>
          </div>

          {/* Right Header Controls: Clear chat (admin) + Jump to Date */}
          <div className="relative flex items-center space-x-2">
            {isAdmin && (
              <button
                type="button"
                onClick={handleClearChat}
                disabled={clearingChat || messages.length === 0}
                className="p-2 rounded-xl bg-slate-800 hover:bg-red-600 text-slate-300 hover:text-white transition flex items-center space-x-1.5 text-xs font-medium disabled:opacity-40 disabled:hover:bg-slate-800"
                title="Delete every message in this chat for everyone"
              >
                {clearingChat ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4 text-red-400" />}
                <span className="hidden sm:inline">Clear chat</span>
              </button>
            )}
            <button
              onClick={() => setIsDatePickerOpen(!isDatePickerOpen)}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition flex items-center space-x-1.5 text-xs font-medium"
              title="Jump to specific date"
            >
              <Calendar className="w-4 h-4 text-emerald-400" />
              <span className="hidden sm:inline">Jump to Date</span>
            </button>

            {/* Date Dropdown */}
            {isDatePickerOpen && (
              <div className="absolute right-0 top-full mt-2 w-56 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-2 z-40 animate-scale-up">
                <div className="px-3 py-1.5 text-[11px] font-bold uppercase text-slate-400 border-b border-slate-800">
                  Select Chat Day
                </div>
                {distinctDays.length === 0 ? (
                  <div className="p-3 text-xs text-slate-400 text-center">No dates recorded</div>
                ) : (
                  <div className="max-h-56 overflow-y-auto divide-y divide-slate-800/60 mt-1">
                    {distinctDays.map((day) => (
                      <button
                        key={day.key}
                        onClick={() => jumpToDate(day.key)}
                        className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-slate-800 hover:text-white rounded-xl transition flex items-center justify-between"
                      >
                        <span>{day.label}</span>
                        <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ─── Messages Feed ─── */}
        <div
          ref={messagesContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3.5"
        >
          {messages.length > 0 && hasMoreOlder && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={loadOlderMessages}
                disabled={loadingOlder}
                className="px-3.5 py-1.5 rounded-full bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 text-[11px] font-bold shadow-xs flex items-center space-x-1.5 disabled:opacity-60"
              >
                {loadingOlder ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Clock className="w-3.5 h-3.5" />}
                <span>{loadingOlder ? 'Loading…' : 'Load earlier messages'}</span>
              </button>
            </div>
          )}
          {messages.length === 0 && loadingMessages ? (
            <div className="space-y-3.5 animate-pulse" aria-label="Loading messages">
              {[52, 38, 64, 44, 58, 36].map((w, i) => (
                <div key={i} className={`flex ${i % 2 ? 'justify-end' : 'justify-start'}`}>
                  <div className="h-10 rounded-2xl bg-slate-200/80" style={{ width: `${w}%` }} />
                </div>
              ))}
            </div>
          ) : messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
              <div className="w-12 h-12 rounded-2xl bg-slate-200/80 text-slate-600 flex items-center justify-center mb-2">
                {activeChat.type === 'materials' ? <ImageIcon className="w-6 h-6" /> : <MessageSquare className="w-6 h-6" />}
              </div>
              <p className="text-sm font-semibold text-slate-700">
                {activeChat.type === 'materials'
                  ? 'No materials or photos shared yet'
                  : activeChat.type === 'group'
                  ? 'No messages in group yet'
                  : `Start conversation with ${activeChat.contact?.name || 'user'}`}
              </p>
              <p className="text-xs text-slate-400 max-w-xs mt-1">
                {activeChat.type === 'materials'
                  ? isAdmin
                    ? 'Upload product photos and promotional materials for members to view and download.'
                    : 'Admins will post product photos and materials here for you to download.'
                  : 'Type a text, record a voice note, or attach a picture to begin.'}
              </p>
            </div>
          ) : (
            messages.map((msg, index) => {
              const isMe = msg.senderId === user?._id;
              const isSystemBonus = msg.messageType === 'system_bonus';
              const isSystemAlert = msg.messageType === 'system_alert';
              const isHighlighted = highlightedMsgId === msg._id;

              // Day divider check
              const currentDayKey = getDayKey(msg.createdAt);
              const prevDayKey = index > 0 ? getDayKey(messages[index - 1].createdAt) : null;
              const isNewDay = currentDayKey && currentDayKey !== prevDayKey;
              const currentDay = getDayLabel(msg.createdAt);

              // Seen by users
              const seenUsers = (msg.readBy || []).filter(
                (reader) => reader._id !== msg.senderId && reader._id !== user?._id
              );

              // Admin or sender can edit/delete
              const canModify = (isAdmin || isMe) && !msg.isDeleted && !msg.pending && !msg.failed;

              const startsUnread = unreadDivider && unreadDivider.beforeId === msg._id && unreadDivider.chatKey === activeKeyRef.current;

              return (
                <React.Fragment key={msg._id}>
                  {/* "N unread messages": everything below this line arrived while the chat was closed */}
                  {startsUnread && (
                    <div id="unread-divider" className="relative flex items-center justify-center my-4 select-none px-2" role="separator" aria-label={`${unreadDivider.count} unread messages`}>
                      <div className="absolute inset-0 flex items-center" aria-hidden="true">
                        <div className="w-full border-t-2 border-emerald-500/70" />
                      </div>
                      <div className="relative px-4 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-full shadow-sm">
                        {unreadDivider.count} unread message{unreadDivider.count === 1 ? '' : 's'}
                      </div>
                    </div>
                  )}

                  {/* WhatsApp-Style Sticky Day Divider with Horizontal Rule */}
                  {isNewDay && (
                    <div
                      id={`day-divider-${currentDayKey}`}
                      className="relative flex items-center justify-center my-6 sticky top-2 z-10 select-none px-2"
                    >
                      <div className="absolute inset-0 flex items-center" aria-hidden="true">
                        <div className="w-full border-t border-slate-200/90 shadow-2xs" />
                      </div>
                      <div className="relative flex items-center space-x-1.5 px-4 py-1.5 bg-white/95 backdrop-blur-md border border-slate-200/90 text-slate-700 text-xs font-bold rounded-full shadow-xs">
                        <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                        <span>{currentDay}</span>
                      </div>
                    </div>
                  )}

                  {/* System Bonus Celebration Banner */}
                  {isSystemBonus ? (
                    <div className="mx-auto max-w-lg bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 text-slate-950 p-4 rounded-3xl shadow-lg border-2 border-amber-200/80 my-4 text-center transform hover:scale-[1.01] transition-transform">
                      <div className="flex items-center justify-center space-x-1.5 text-xs uppercase font-black tracking-wider text-amber-950 mb-1">
                        <Sparkles className="w-4 h-4 fill-amber-950" />
                        <span>Official Bonus Announcement</span>
                        <Sparkles className="w-4 h-4 fill-amber-950" />
                      </div>
                      <pre className="font-sans text-xs sm:text-sm font-semibold whitespace-pre-wrap leading-relaxed">
                        {msg.text}
                      </pre>
                      <div className="text-[10px] text-amber-950/70 font-medium mt-1">
                        {formatMessageTime(msg.createdAt)}
                      </div>
                    </div>
                  ) : isSystemAlert ? (
                    <div className="mx-auto max-w-md bg-blue-50 border border-blue-200 text-blue-900 p-3 rounded-2xl text-xs text-center my-2">
                      <p className="font-medium">{msg.text}</p>
                      <span className="text-[10px] text-blue-500 mt-1 block">
                        {formatMessageTime(msg.createdAt)}
                      </span>
                    </div>
                  ) : (
                    /* User / Admin Message Bubble */
                    <div
                      className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-full group/msg`}
                    >
                      {/* Sender Name & Role */}
                      {!isMe && (
                        <div className="flex items-center space-x-1.5 mb-1 px-1">
                          <span className="text-xs font-bold text-slate-800">
                            {msg.senderName}
                          </span>
                          <span
                            className={`text-[9px] px-1.5 py-0.2 rounded-full font-bold uppercase ${
                              msg.senderRole === 'admin'
                                ? 'bg-purple-100 text-purple-700 border border-purple-200'
                                : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                            }`}
                          >
                            {msg.senderRole}
                          </span>
                        </div>
                      )}

                      {/* Bubble with Hover Actions */}
                      <div className="relative flex items-center group/bubble max-w-[85%] sm:max-w-[75%]">
                        {/* Hover Action Menu (Edit / Delete) */}
                        {canModify && (
                          <div
                            className={`hidden group-hover/bubble:flex items-center space-x-1 px-1.5 py-0.5 rounded-xl bg-white border border-slate-200 shadow-sm ${
                              isMe ? 'order-first mr-1.5' : 'order-last ml-1.5'
                            }`}
                          >
                            {/* Edit Button */}
                            {msg.messageType === 'text' && (
                              <button
                                onClick={() => {
                                  setEditingMessage(msg);
                                  setEditText(msg.text);
                                }}
                                className="p-1 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-slate-100 transition"
                                title="Edit message"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {/* Delete Button */}
                            <button
                              onClick={() => setDeleteConfirmMsg(msg)}
                              className="p-1 rounded-lg text-slate-400 hover:text-red-600 hover:bg-slate-100 transition"
                              title="Delete message"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}

                        {/* Bubble Body */}
                        <div
                          className={`relative px-4 py-2.5 rounded-3xl shadow-sm transition-all ${
                            isHighlighted
                              ? 'ring-2 ring-emerald-500 ring-offset-2 scale-[1.01]'
                              : ''
                          } ${
                            msg.isDeleted
                              ? 'bg-slate-100 text-slate-400 border border-slate-200 italic'
                              : isMe
                              ? 'bg-emerald-600 text-white rounded-tr-sm'
                              : 'bg-white border border-slate-200 text-slate-900 rounded-tl-sm'
                          }`}
                        >
                          {/* Deleted Notice */}
                          {msg.isDeleted ? (
                            <div className="flex items-center space-x-1.5 text-xs text-slate-500 py-0.5">
                              <Ban className="w-3.5 h-3.5 text-slate-400" />
                              <span>This message was deleted</span>
                            </div>
                          ) : (
                            <>
                              {/* Text Message */}
                              {msg.messageType === 'text' && (
                                <p className="text-xs sm:text-sm whitespace-pre-wrap leading-relaxed break-words">
                                  {msg.text}
                                </p>
                              )}

                              {/* Voice Note Player */}
                              {msg.messageType === 'voice' && !msg.mediaUrl && (
                                <div className="flex items-center space-x-2 text-xs opacity-80 py-1 min-w-[150px]">
                                  {mediaMissRef.current.has(msg._id) ? (
                                    <span>🎤 Voice note not available</span>
                                  ) : (
                                    <>
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                      <span>Loading voice note…</span>
                                    </>
                                  )}
                                </div>
                              )}
                              {msg.messageType === 'voice' && msg.mediaUrl && (
                                <AudioPlayer
                                  src={msg.mediaUrl}
                                  duration={msg.audioDuration}
                                  isOutgoing={isMe}
                                />
                              )}

                              {/* Image Attachment */}
                              {msg.messageType === 'image' && !msg.mediaUrl && (
                                <div className="space-y-1.5 my-1">
                                  <div className="w-56 max-w-full h-40 rounded-2xl bg-black/10 flex flex-col items-center justify-center text-xs opacity-80 gap-1.5">
                                    {mediaMissRef.current.has(msg._id) ? (
                                      <span>📷 Photo not available</span>
                                    ) : (
                                      <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        <span>Loading photo…</span>
                                      </>
                                    )}
                                  </div>
                                  {msg.text && (
                                    <p className="text-xs sm:text-sm whitespace-pre-wrap leading-relaxed break-words px-1">
                                      {msg.text}
                                    </p>
                                  )}
                                </div>
                              )}
                              {msg.messageType === 'image' && msg.mediaUrl && (
                                <div className="space-y-1.5 my-1">
                                  <div
                                    className="relative rounded-2xl overflow-hidden cursor-pointer group/img max-w-xs sm:max-w-sm bg-black/5"
                                    onClick={() => setFullscreenImage(msg.mediaUrl)}
                                    title="Click to view full photo"
                                  >
                                    <img
                                      src={msg.mediaUrl}
                                      alt="Shared photo"
                                      onLoad={handleMediaShown}
                                      className="max-h-72 w-auto object-contain rounded-2xl border border-black/10 group-hover/img:scale-[1.01] transition duration-200 mx-auto"
                                    />
                                    <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/30 transition flex items-center justify-center opacity-0 group-hover/img:opacity-100">
                                      <span className="px-3 py-1.5 rounded-xl bg-black/75 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-md backdrop-blur-xs">
                                        <ZoomIn className="w-4 h-4" />
                                        <span>Click to View</span>
                                      </span>
                                    </div>

                                    {/* Direct Save / Download button (always visible & 1-tap accessible on mobile) */}
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        downloadImageFile(
                                          msg.mediaUrl,
                                          `chat-photo-${new Date(msg.createdAt).getTime()}.jpg`
                                        );
                                      }}
                                      className="absolute bottom-2 right-2 px-2.5 py-1 rounded-xl bg-black/75 hover:bg-black/90 active:scale-95 text-white shadow-lg backdrop-blur-md flex items-center gap-1.5 text-[11px] font-semibold transition z-10 border border-white/20"
                                      title="Save / Download Picture"
                                    >
                                      <Download className="w-3.5 h-3.5 text-emerald-400" />
                                      <span>Save</span>
                                    </button>
                                  </div>
                                  {msg.text && (
                                    <p className="text-xs sm:text-sm whitespace-pre-wrap leading-relaxed break-words px-1">
                                      {msg.text}
                                    </p>
                                  )}
                                </div>
                              )}
                            </>
                          )}

                          {/* Timestamp, Edited Badge & Delivery Ticks */}
                          <div
                            className={`flex items-center justify-end space-x-1 mt-1 text-[10px] ${
                              msg.isDeleted
                                ? 'text-slate-400'
                                : isMe
                                ? 'text-emerald-100'
                                : 'text-slate-400'
                            }`}
                          >
                            {msg.isEdited && !msg.isDeleted && (
                              <span className="italic opacity-80 mr-0.5">(edited)</span>
                            )}
                            {msg.failed ? (
                              <span className="flex items-center gap-2" title={msg.failReason || 'Not sent'}>
                                {msg.retry ? (
                                  <button type="button" onClick={() => resendFailedMessage(msg)} className="font-bold text-red-200 underline">
                                    Not sent • tap to resend
                                  </button>
                                ) : (
                                  <span className="font-bold text-red-200">Not sent</span>
                                )}
                                <button type="button" onClick={() => dismissFailedMessage(msg._id)} className="text-red-200/90 underline">
                                  Remove
                                </button>
                              </span>
                            ) : msg.pending ? (
                              <span className="italic opacity-80 flex items-center gap-1">
                                <Clock className="w-3 h-3 inline" /> Sending…{typeof msg.progress === 'number' && msg.progress > 0 ? ` ${msg.progress}%` : ''}
                              </span>
                            ) : (
                              <span>{formatMessageTime(msg.createdAt)}</span>
                            )}
                            {isMe && !msg.pending && !msg.failed && <CheckCheck className="w-3.5 h-3.5 inline" />}
                          </div>
                        </div>
                      </div>

                      {/* ─── Messenger-Style Seen Mini-Avatars with Animated Tooltip ─── */}
                      {seenUsers.length > 0 && !msg.isDeleted && (
                        <div className="flex items-center -space-x-1.5 mt-1 justify-end px-1">
                          {seenUsers.map((reader) => (
                            <div key={reader._id} className="group/reader relative">
                              <div
                                className={`w-4 h-4 rounded-full text-white text-[8px] font-bold border-2 border-white flex items-center justify-center cursor-pointer shadow-xs ${
                                  reader.role === 'admin'
                                    ? 'bg-purple-600'
                                    : 'bg-emerald-600'
                                }`}
                              >
                                {reader.name?.charAt(0).toUpperCase()}
                              </div>

                              {/* Tooltip on Hover */}
                              <div className="absolute bottom-full right-0 mb-1.5 hidden group-hover/reader:flex items-center px-2 py-1 bg-slate-900 text-white text-[10px] font-semibold rounded-lg shadow-xl whitespace-nowrap z-30 pointer-events-none transform -translate-y-1 transition-all duration-200 animate-scale-up">
                                Seen by {reader.name} (@{reader.username})
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </React.Fragment>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* ─── Floating Scroll to Bottom Button (WhatsApp Style) ─── */}
        {showScrollBottom && (
          <button
            onClick={scrollToBottom}
            className="absolute bottom-20 right-6 sm:bottom-24 sm:right-8 w-10 h-10 rounded-full bg-white text-slate-700 hover:text-emerald-600 border border-slate-200 shadow-xl flex items-center justify-center transition-all transform hover:scale-105 active:scale-95 z-30"
            title="Scroll to latest message"
          >
            <ArrowDown className="w-5 h-5" />
            {unreadWhileScrolled > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-emerald-600 text-white text-[10px] font-extrabold flex items-center justify-center shadow-md animate-pulse">
                {unreadWhileScrolled}
              </span>
            )}
          </button>
        )}

        {/* ─── Input / Controls Bar ─── */}
        <div className="p-3 sm:p-4 bg-white border-t border-slate-200 shrink-0 z-20">
          {activeChat.type === 'materials' && !isAdmin ? (
            <div className="p-3 bg-purple-50/70 border border-purple-200/80 rounded-2xl flex items-center justify-center space-x-2 text-slate-700 text-xs text-center shadow-2xs">
              <Lock className="w-4 h-4 text-purple-600 shrink-0" />
              <span>
                <strong>Materials Group</strong> is view & download only for members. Only Admins can upload photos and marketing materials.
              </span>
            </div>
          ) : isRecordingVoice ? (
            <VoiceRecorder
              onSendAudio={handleSendVoice}
              onCancel={() => setIsRecordingVoice(false)}
            />
          ) : (
            <form onSubmit={handleTextSubmit} className="flex items-center space-x-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageFileSelect}
              />

              {/* Photo Button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingImage}
                className={`p-2.5 rounded-2xl transition active:scale-95 shrink-0 disabled:opacity-50 ${
                  activeChat.type === 'materials'
                    ? 'bg-purple-100/80 text-purple-700 hover:bg-purple-200/80 border border-purple-300'
                    : 'text-slate-500 hover:text-emerald-600 hover:bg-emerald-50'
                }`}
                title={activeChat.type === 'materials' ? 'Upload Photo / Material' : 'Attach Picture'}
              >
                {uploadingImage ? (
                  <Loader2 className="w-5 h-5 animate-spin text-purple-600" />
                ) : (
                  <ImageIcon className="w-5 h-5" />
                )}
              </button>

              {/* Voice Button (hidden in Materials Group) */}
              {activeChat.type !== 'materials' && (
                <button
                  type="button"
                  onClick={() => setIsRecordingVoice(true)}
                  disabled={uploadingImage}
                  className="p-2.5 rounded-2xl text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 transition active:scale-95 shrink-0 disabled:opacity-50"
                  title="Record Voice Note"
                >
                  <Mic className="w-5 h-5" />
                </button>
              )}

              {/* Text Input */}
              <input
                type="text"
                value={inputText}
                onChange={(e) => {
                  setInputText(e.target.value);
                  reportTyping(e.target.value);
                }}
                onBlur={() => reportTyping('')}
                onPaste={handlePasteEvent}
                disabled={uploadingImage}
                placeholder={
                  uploadingImage
                    ? 'Processing picture...'
                    : activeChat.type === 'materials'
                    ? 'Click 📷 or paste (Ctrl+V) picture — caption optional...'
                    : activeChat.type === 'group'
                    ? 'Message team (Ctrl+V screenshot anywhere)...'
                    : `Message ${activeChat.contact?.name || 'privately'} (Ctrl+V screenshot)...`
                }
                className="flex-1 min-w-0 px-4 py-2.5 bg-slate-100 border border-slate-200 rounded-2xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition"
              />

              {/* Send Button */}
              <button
                type="submit"
                disabled={!inputText.trim() || uploadingImage}
                className={`p-2.5 rounded-2xl disabled:opacity-40 text-white transition active:scale-95 shadow-md shrink-0 ${
                  activeChat.type === 'materials'
                    ? 'bg-purple-600 hover:bg-purple-700 shadow-purple-500/20'
                    : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20'
                }`}
                title="Send Message"
              >
                <Send className="w-5 h-5" />
              </button>
            </form>
          )}
        </div>
      </div>

      {/* ─── MODAL: Edit Message ─── */}
      {editingMessage && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-slate-200 animate-scale-up">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <div className="w-9 h-9 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                  <Edit2 className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-slate-900 text-base">Edit Message</h3>
              </div>
              <button
                onClick={() => setEditingMessage(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <textarea
                rows={3}
                required
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />

              <div className="flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setEditingMessage(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editLoading || !editText.trim()}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                >
                  {editLoading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL: Delete Message Confirmation ─── */}
      {deleteConfirmMsg && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl border border-slate-200 animate-scale-up text-center">
            <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-3">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-slate-900 text-base mb-1">Delete Message?</h3>
            <p className="text-xs text-slate-500 mb-5 leading-relaxed">
              This will remove the message content for everyone in this chat, exactly like WhatsApp.
            </p>

            <div className="flex justify-center space-x-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmMsg(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteSubmit}
                disabled={deleteLoading}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-red-600 hover:bg-red-700 text-white shadow-sm"
              >
                {deleteLoading ? 'Deleting...' : 'Delete for Everyone'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: Send Image Preview & Caption (WhatsApp-grade) ─── */}
      {pendingImagePreview && (
        <div className="fixed inset-0 z-[999] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 text-white rounded-3xl p-5 w-full max-w-lg shadow-2xl border border-slate-700 animate-scale-up flex flex-col max-h-[92vh]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                  <ImageIcon className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm sm:text-base leading-tight">Send Picture</h3>
                  <p className="text-[11px] text-slate-400">
                    {activeChat.type === 'materials'
                      ? 'Posting to Materials Group (Admins)'
                      : activeChat.type === 'group'
                      ? 'Sending to Team General'
                      : `Sending to ${activeChat.contact?.name || 'Contact'}`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPendingImagePreview(null)}
                disabled={uploadingImage}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition disabled:opacity-50"
                title="Cancel (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Image Preview Box */}
            <div className="my-4 flex-1 flex items-center justify-center bg-black/50 rounded-2xl p-2 overflow-hidden max-h-[52vh] border border-slate-800">
              <img
                src={pendingImagePreview.previewUrl}
                alt="Preview"
                className="max-h-full max-w-full object-contain rounded-xl shadow-lg"
              />
            </div>

            {/* Caption Input & Action Buttons */}
            <form onSubmit={handleConfirmSendImage} className="space-y-3 pt-1">
              <input
                type="text"
                value={pendingImagePreview.caption}
                onChange={(e) =>
                  setPendingImagePreview((prev) => ({ ...prev, caption: e.target.value }))
                }
                placeholder="Add a caption (optional)..."
                autoFocus
                disabled={uploadingImage}
                className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-2xl text-xs sm:text-sm text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
              />

              <div className="flex items-center justify-end space-x-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setPendingImagePreview(null)}
                  disabled={uploadingImage}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-800 transition disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={uploadingImage}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center space-x-2 transition active:scale-95 disabled:opacity-50 shadow-md shadow-emerald-600/30"
                >
                  {uploadingImage ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Sending...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Send Photo</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL: Fullscreen Image Viewer / Lightbox ─── */}
      {fullscreenImage && (
        <div
          className="fixed inset-0 z-[999] bg-black/95 backdrop-blur-md flex flex-col justify-between p-4 animate-fade-in select-none"
          onClick={() => setFullscreenImage(null)}
        >
          {/* Top Controls */}
          <div
            className="flex items-center justify-between text-white max-w-6xl mx-auto w-full py-2 z-10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center space-x-2">
              <ImageIcon className="w-5 h-5 text-emerald-400" />
              <span className="text-sm font-semibold tracking-wide">Photo Viewer</span>
            </div>
            <div className="flex items-center space-x-2 sm:space-x-3">
              <button
                type="button"
                onClick={() => downloadImageFile(fullscreenImage, `chat-photo-${Date.now()}.jpg`)}
                className="px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white transition flex items-center space-x-1.5 text-xs font-bold shadow-md shadow-emerald-600/30"
                title="Download / Save Photo to Device"
              >
                <Download className="w-4 h-4" />
                <span>Save to Device</span>
              </button>
              <button
                onClick={() => setFullscreenImage(null)}
                className="p-1.5 sm:p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition"
                title="Close (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Centered Image */}
          <div 
            className="flex-1 flex items-center justify-center p-2 max-w-6xl mx-auto w-full overflow-hidden"
            onClick={() => setFullscreenImage(null)}
          >
            <img
              src={fullscreenImage}
              alt="Fullscreen"
              className="max-h-[82vh] max-w-full object-contain rounded-2xl shadow-2xl cursor-default"
              onClick={(e) => e.stopPropagation()}
            />
          </div>

          <div className="text-center text-xs text-slate-400 py-1">
            Tap <strong className="text-emerald-400">&quot;Save to Device&quot;</strong> or tap &amp; hold photo to save to gallery
          </div>
        </div>
      )}

      {/* ─── FLOATING TOAST: Download & Save Status (Mobile & Desktop) ─── */}
      {downloadToast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[1001] px-4 py-2.5 rounded-2xl bg-slate-900/95 text-white border border-slate-700 shadow-2xl flex items-center space-x-2.5 text-xs font-semibold backdrop-blur-md animate-fade-in pointer-events-none">
          <Download className="w-4 h-4 text-emerald-400 shrink-0 animate-bounce" />
          <span>{downloadToast}</span>
        </div>
      )}
    </div>
  );
}
