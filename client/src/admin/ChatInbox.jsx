import { Fragment, useEffect, useState, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { api, compressImage, dropClearedMessages, addChatMessage, syncLatestMessages } from '../api.js';
import { getSocket } from '../socket.js';
import Ic from '../components/Icons.jsx';
import ChatMessageBubble from '../components/ChatMessageBubble.jsx';
import AiRewriteBox from '../components/AiRewriteBox.jsx';
import ClearChatModal from './ClearChatModal.jsx';
import VoiceRecordButton from '../components/VoiceRecordButton.jsx';
import { useAdminTyping, typingLabel } from './useAdminTyping.js';
import ChatShortcutPicker from './ChatShortcutPicker.jsx';
import ChatQuickReplies from './ChatQuickReplies.jsx';
import ChatSellerInfo from './ChatSellerInfo.jsx';
import ChatBroadcast from './ChatBroadcast.jsx';
import ChatAutoReply, { AutoReplyPill } from './ChatAutoReply.jsx';

/** How long a chat has waited for support: "4m", "2h 10m", "3d". */
const waitLabel = (ms) => {
  const m = Math.max(0, Math.floor(ms / 60000));
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}`;
  return `${Math.floor(m / 1440)}d`;
};

/** "AB" from "Abc Bazaar" (first letters of the first two words). */
const initialsOf = (name) => {
  const parts = String(name || '').replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || 'S') + (parts[1]?.[0] || '')).toUpperCase();
};
/** The same store always gets the same avatar colour. */
const AVATAR_TONES = ['blue', 'teal', 'violet', 'amber', 'rose', 'indigo', 'emerald', 'sky'];
const avatarTone = (name) => {
  let h = 0;
  for (const ch of String(name || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length];
};
/** List time: "3:42 PM" today, "Yesterday", "Mon", else "21 Oct". */
const whenLabel = (d) => {
  const t = new Date(d);
  if (Number.isNaN(t.getTime())) return '';
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const ts = t.getTime();
  if (ts >= startToday) return t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (ts >= startToday - 86400000) return 'Yesterday';
  if (ts >= startToday - 6 * 86400000) return t.toLocaleDateString('en-US', { weekday: 'short' });
  return t.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};
const dayKey = (d) => {
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? '' : `${t.getFullYear()}-${t.getMonth()}-${t.getDate()}`;
};
const dayLabel = (d) => {
  const t = new Date(d);
  const now = new Date();
  if (dayKey(t) === dayKey(now)) return 'Today';
  if (dayKey(t) === dayKey(new Date(now.getTime() - 86400000))) return 'Yesterday';
  return t.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: t.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
};
/** The last word in this chat is the store's / guest's and support has not answered yet. */
const isWaiting = (c) => c.status !== 'resolved' && ['seller', 'guest', 'customer'].includes(c.lastSender);

const ROLE_LABELS = {
  super_admin: '👑 Super Admin',
  admin: '🛡️ Admin',
  manager: '📊 Manager',
  support: '💬 Support Staff',
  order_manager: '📦 Order Manager',
  inventory: '🏷️ Inventory',
};

export default function ChatInbox() {
  // Current Logged-in Admin
  const [me, setMe] = useState(null);

  // Navigation Tab: 'sellers' | 'team'
  const [activeTab, setActiveTab] = useState('sellers');
  const [sellerFilter, setSellerFilter] = useState('all'); // 'all' | 'waiting' | 'sellers' | 'guests'

  // Seller Support State
  const [sellerConvos, setSellerConvos] = useState([]);
  // ?c=<conversation id> (from a phone notification) opens that chat directly
  const [selectedSellerId, setSelectedSellerId] = useState(() => {
    try { return new URLSearchParams(window.location.search).get('c') || null; } catch { return null; }
  });

  // a link to /admin/chat?c=<id> while this page is already open (Ctrl + K, Today, store panel)
  const location = useLocation();
  useEffect(() => {
    const c = new URLSearchParams(location.search).get('c');
    if (c) {
      setActiveTab('sellers');
      setSelectedSellerId(c);
    }
  }, [location.search]);

  // Team & Super Admin State
  const [teamMembers, setTeamMembers] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const [selectedTeamTarget, setSelectedTeamTarget] = useState(null);

  // Auto-reply settings ({ config, defaults } from the server; null until loaded)
  const [autoReply, setAutoReply] = useState(null);
  const [autoReplyModal, setAutoReplyModal] = useState(false);

  // Message Edit Modal State
  const [editModal, setEditModal] = useState(null); // { messageId, text }
  const [savingEdit, setSavingEdit] = useState(false);

  // Clear chat dialog: 'seller' (the open seller / guest chat) | 'team' (the open team chat) | null
  const [clearChat, setClearChat] = useState(null);

  // Messages & Form State
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
  // a shortcut button to send with the next message (page / order / product of this store)
  const [pendingAction, setPendingAction] = useState(null);
  const [shortcutOpen, setShortcutOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [shortcutPages, setShortcutPages] = useState([]);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  // a clock for the "waiting for reply" timers in the list (every 30 seconds is enough)
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  // a button suggested from what is being typed ("diamond", "deposit", "order 182"…)
  const [suggestion, setSuggestion] = useState(null);
  const [dismissedSuggestion, setDismissedSuggestion] = useState('');
  useEffect(() => {
    api('/chat/admin/shortcut-pages')
      .then((d) => setShortcutPages(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);
  // a button picked for one chat never goes to another
  useEffect(() => {
    setPendingAction(null);
    setShortcutOpen(false);
  }, [selectedSellerId, activeTab]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  const scrollRef = useRef(null);
  const threadMessagesRef = useRef(null);
  const fileInputRef = useRef(null);
  const textInputRef = useRef(null);
  const isNearBottomRef = useRef(true);
  // Which chat is open right now: an answer that arrives after the admin switched chats is ignored,
  // so one chat's messages never land in another
  const openThreadRef = useRef('');
  openThreadRef.current = activeTab === 'sellers' ? `sellers:${selectedSellerId || ''}` : `team:${selectedTeamId || ''}`;
  // Blocks a second send while one is still going (fast double Enter / double click)
  const sendingRef = useRef(false);

  // "Steve is typing…" between admins (seller / guest chats only, never shown to the seller)
  const peerTyping = useAdminTyping(true);
  const noteSellerTyping = (value) => {
    if (activeTab === 'sellers' && selectedSellerId) peerTyping.noteTyping(selectedSellerId, value);
  };
  // switching chat or tab = no longer typing in the old chat
  useEffect(() => () => peerTyping.stopTyping(), [activeTab, selectedSellerId]);

  // Load current admin info & auto-reply settings
  useEffect(() => {
    try {
      const stored = localStorage.getItem('ng_admin');
      if (stored) setMe(JSON.parse(stored));
    } catch {}

    api('/auth/me')
      .then((res) => {
        if (res?.admin) {
          setMe(res.admin);
          localStorage.setItem('ng_admin', JSON.stringify(res.admin));
        }
      })
      .catch(() => {});

    api('/chat/settings/auto-reply')
      .then((res) => {
        if (res?.config) setAutoReply(res);
      })
      .catch((err) => console.error('Error loading auto-reply settings:', err));
  }, []);

  // 1. Fetch Seller Inquiries
  const loadSellerConvos = () => {
    api('/chat/admin/conversations')
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setSellerConvos(list);
      })
      .catch((e) => console.error('Seller convos error:', e));
  };

  // 2. Fetch Team & Super Admins
  const loadTeamMembers = () => {
    api('/chat/admin/team')
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setTeamMembers(list);
      })
      .catch((e) => console.error('Team members error:', e));
  };

  // Initial load
  useEffect(() => {
    setLoading(true);
    Promise.all([
      api('/chat/admin/conversations').catch(() => []),
      api('/chat/admin/team').catch(() => []),
    ]).then(([sellers, team]) => {
      const sList = Array.isArray(sellers) ? sellers : [];
      const tList = Array.isArray(team) ? team : [];
      setSellerConvos(sList);
      setTeamMembers(tList);

      // On desktop, auto-select first conversation
      if (typeof window !== 'undefined' && window.innerWidth > 768) {
        if (activeTab === 'sellers' && sList.length && !selectedSellerId) {
          setSelectedSellerId(sList[0]._id);
        } else if (activeTab === 'team' && tList.length && !selectedTeamId) {
          setSelectedTeamId(tList[0]._id);
        }
      }
    }).finally(() => setLoading(false));
  }, []);

  const scrollToBottom = (behavior = 'smooth') => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior });
    }
  };

  const handleThreadScroll = (e) => {
    const el = e.currentTarget;
    const threshold = 150;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isNearBottomRef.current = distanceToBottom <= threshold;
  };

  // Periodic Refresh (keeps active conversation & unread counts fresh without scroll jumps)
  useEffect(() => {
    const interval = setInterval(() => {
      // a tab left open in the background does not need to ask the server every 4 seconds
      // (live messages still arrive over the socket; the next look at the tab refreshes)
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      loadSellerConvos();
      loadTeamMembers();
      if (activeTab === 'sellers' && selectedSellerId) {
        loadSellerMessages(selectedSellerId, true);
      } else if (activeTab === 'team' && selectedTeamId) {
        loadTeamMessages(selectedTeamId, true);
      }
    }, 20000); // safety net only: live messages arrive over the socket (it was every 4 s, 3 requests each)
    return () => clearInterval(interval);
  }, [activeTab, selectedSellerId, selectedTeamId]);

  // A refresh of the open chat: the server's latest page decides (deleted / edited messages update,
  // every message stays at its own time), and we only scroll when a newer message came in
  const applyPolledMessages = (msgList, more) => {
    setMessages((prev) => {
      const next = syncLatestMessages(prev, msgList, more);
      if (next !== prev && isNearBottomRef.current && next[next.length - 1]?._id !== prev?.[prev.length - 1]?._id) {
        setTimeout(() => scrollToBottom('smooth'), 50);
      }
      return next;
    });
  };

  // Load Messages for Selected Seller
  const loadSellerMessages = (cid, isPolling = false) => {
    if (!cid) return;
    api(`/chat/admin/conversations/${cid}/messages?limit=100`)
      .then((data) => {
        if (openThreadRef.current !== `sellers:${cid}`) return; // admin moved to another chat meanwhile
        const msgList = Array.isArray(data) ? data : (data?.messages || []);
        const more = Boolean(data?.hasMore);

        if (!isPolling) {
          setMessages(msgList);
          setHasMore(more);
          setTimeout(() => scrollToBottom('auto'), 50);
        } else {
          applyPolledMessages(msgList, more);
        }

        setSellerConvos((prev) =>
          Array.isArray(prev) ? prev.map((c) => (c._id === cid ? { ...c, unreadForAdmin: 0 } : c)) : []
        );
      })
      .catch((e) => console.error('Load seller messages error:', e));
  };

  // Load Messages for Selected Team Member
  const loadTeamMessages = (targetAdminId, isPolling = false) => {
    if (!targetAdminId) return;
    api(`/chat/admin/team/${targetAdminId}/messages?limit=100`)
      .then((data) => {
        if (openThreadRef.current !== `team:${targetAdminId}`) return; // admin moved to another chat meanwhile
        const msgList = Array.isArray(data?.messages) ? data.messages : (Array.isArray(data) ? data : []);
        const more = Boolean(data?.hasMore);
        if (data?.targetAdmin) setSelectedTeamTarget(data.targetAdmin);

        if (!isPolling) {
          setMessages(msgList);
          setHasMore(more);
          setTimeout(() => scrollToBottom('auto'), 50);
        } else {
          applyPolledMessages(msgList, more);
        }

        setTeamMembers((prev) =>
          Array.isArray(prev) ? prev.map((t) => (t._id === targetAdminId ? { ...t, unreadCount: 0 } : t)) : []
        );
      })
      .catch((e) => console.error('Load team messages error:', e));
  };

  // Load Earlier (Older) Messages with Scroll Anchoring
  const handleLoadEarlier = async () => {
    if (loadingEarlier || !hasMore || messages.length === 0) return;
    const earliest = messages[0]?.createdAt;
    if (!earliest) return;

    setLoadingEarlier(true);
    const container = threadMessagesRef.current;
    const prevScrollHeight = container ? container.scrollHeight : 0;
    const prevScrollTop = container ? container.scrollTop : 0;

    const threadAtStart = openThreadRef.current;
    try {
      let data;
      if (activeTab === 'sellers') {
        data = await api(`/chat/admin/conversations/${selectedSellerId}/messages?before=${encodeURIComponent(earliest)}&limit=100`);
      } else {
        data = await api(`/chat/admin/team/${selectedTeamId}/messages?before=${encodeURIComponent(earliest)}&limit=100`);
      }

      if (openThreadRef.current !== threadAtStart) return; // admin moved to another chat meanwhile
      const olderMsgs = Array.isArray(data) ? data : (data?.messages || []);
      const more = Boolean(data?.hasMore);
      setHasMore(more);

      if (olderMsgs.length > 0) {
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m._id));
          const freshOlder = olderMsgs.filter((m) => !existingIds.has(m._id));
          return [...freshOlder, ...prev];
        });

        // Anchor scroll position to prevent visual jump
        requestAnimationFrame(() => {
          if (container) {
            const newScrollHeight = container.scrollHeight;
            container.scrollTop = prevScrollTop + (newScrollHeight - prevScrollHeight);
          }
        });
      }
    } catch (err) {
      console.error('Failed to load earlier messages:', err);
    } finally {
      setLoadingEarlier(false);
    }
  };

  // Switch Selected Seller
  useEffect(() => {
    if (activeTab === 'sellers' && selectedSellerId) {
      loadSellerMessages(selectedSellerId, false);
    }
  }, [activeTab, selectedSellerId]);

  // Switch Selected Team Member
  useEffect(() => {
    if (activeTab === 'team' && selectedTeamId) {
      loadTeamMessages(selectedTeamId, false);
    }
  }, [activeTab, selectedTeamId]);

  // Real-time WebSockets
  useEffect(() => {
    let socket;
    try {
      socket = getSocket();
    } catch (e) {
      console.warn('Socket warning:', e);
    }

    const onNewSellerMsg = (msg) => {
      if (!msg) return;
      if (activeTab === 'sellers' && msg.conversation === selectedSellerId) {
        setMessages((prev) => addChatMessage(prev, msg));
        if (isNearBottomRef.current) {
          setTimeout(() => scrollToBottom('smooth'), 50);
        }
        api(`/chat/admin/conversations/${selectedSellerId}/read`, { method: 'POST' }).catch(() => {});
      }
      loadSellerConvos();
    };

    const onNewTeamMsg = (msg) => {
      if (!msg) return;
      if (activeTab === 'team') {
        const isCurrentThread = String(msg.senderAdmin) === String(selectedTeamId) || (msg.senderAdmin === me?.id && selectedTeamId);
        if (isCurrentThread) {
          setMessages((prev) => addChatMessage(prev, msg));
          if (isNearBottomRef.current) {
            setTimeout(() => scrollToBottom('smooth'), 50);
          }
          if (selectedTeamId) {
            api(`/chat/admin/team/${selectedTeamId}/read`, { method: 'POST' }).catch(() => {});
          }
        }
      }
      loadTeamMembers();
    };

    const onMessageEdit = (payload) => {
      const targetId = payload?.messageId || payload?._id;
      if (!targetId) return;
      setMessages((prev) =>
        Array.isArray(prev)
          ? prev.map((m) =>
              m._id === targetId
                ? { ...m, text: payload.text, isEdited: true, editedAt: payload.editedAt || new Date() }
                : m
            )
          : prev
      );
    };

    const onMessageDelete = (payload) => {
      const targetId = payload?.messageId || payload?._id;
      if (!targetId) return;
      setMessages((prev) => (Array.isArray(prev) ? prev.filter((m) => m._id !== targetId) : prev));
      if (activeTab === 'sellers') loadSellerConvos();
      else if (activeTab === 'team') loadTeamMembers();
    };

    const onMessagesSeen = ({ conversationId, guestId: seenGuestId, seenAt }) => {
      setMessages((prev) =>
        Array.isArray(prev)
          ? prev.map((m) => {
              const isMatch =
                (m.sender === 'admin' || m.sender === 'staff') &&
                (!conversationId || !m.conversation || String(m.conversation) === String(conversationId) || String(m.conversation?._id) === String(conversationId) || (seenGuestId && m.guestId === seenGuestId));
              return isMatch ? { ...m, isSeen: true, seenAt: seenAt || new Date() } : m;
            })
          : prev
      );
    };

    // another admin saved the auto-reply settings
    const onSettingsUpdate = (s) => {
      if (s?.config) setAutoReply(s);
    };

    // A chat was cleared (by this admin or another one): drop those messages from the open thread
    const onChatCleared = (payload) => {
      if (!payload) return;
      if (payload.internal) {
        if (activeTab === 'team' && selectedTeamId) loadTeamMessages(selectedTeamId, false);
        loadTeamMembers();
        return;
      }
      if (activeTab === 'sellers' && String(payload.conversationId) === String(selectedSellerId)) {
        setMessages((prev) => dropClearedMessages(prev, payload));
      }
      loadSellerConvos();
    };

    // the seller tapped a shortcut button: show "Opened" on it at once
    const onActionOpened = (p) => {
      if (!p?.messageId) return;
      setMessages((prev) =>
        Array.isArray(prev) ? prev.map((m) => (m._id === p.messageId && m.action ? { ...m, action: { ...m.action, openedAt: p.openedAt } } : m)) : prev
      );
    };

    // the seller did what a button asked (deposit sent, order confirmed…): show "Done" on it
    const onActionDone = (p) => {
      const ids = new Set((p?.messageIds || []).map(String));
      if (!ids.size) return;
      setMessages((prev) =>
        Array.isArray(prev) ? prev.map((m) => (ids.has(String(m._id)) && m.action ? { ...m, action: { ...m.action, doneAt: p.doneAt, doneText: p.doneText } } : m)) : prev
      );
    };

    if (socket) {
      socket.on('message:action_opened', onActionOpened);
      socket.on('message:action_done', onActionDone);
      socket.on('chat:broadcast_done', loadSellerConvos);
      socket.on('message:new', onNewSellerMsg);
      socket.on('admin:message:new', onNewTeamMsg);
      socket.on('chat:cleared', onChatCleared);
      socket.on('message:edit', onMessageEdit);
      socket.on('message:delete', onMessageDelete);
      socket.on('messages:seen', onMessagesSeen);
      socket.on('chat:settings_update', onSettingsUpdate);
    }
    return () => {
      if (socket) {
        socket.off('message:action_opened', onActionOpened);
        socket.off('message:action_done', onActionDone);
        socket.off('chat:broadcast_done', loadSellerConvos);
        socket.off('chat:cleared', onChatCleared);
        socket.off('message:new', onNewSellerMsg);
        socket.off('admin:message:new', onNewTeamMsg);
        socket.off('message:edit', onMessageEdit);
        socket.off('message:delete', onMessageDelete);
        socket.off('messages:seen', onMessagesSeen);
        socket.off('chat:settings_update', onSettingsUpdate);
      }
    };
  }, [activeTab, selectedSellerId, selectedTeamId, me]);

  // Note: Auto-scroll is handled via smart scrollToBottom on new send / receive when near bottom

  // Attachments Handling
  const handleFileChange = (e) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    if (selected.size > 15 * 1024 * 1024) {
      alert('File size exceeds 15 MB limit');
      return;
    }

    setFile(selected);
    if (selected.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (ev) => setFilePreview(ev.target.result);
      reader.readAsDataURL(selected);
    } else {
      setFilePreview(null);
    }
  };

  const removeFile = () => {
    setFile(null);
    setFilePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleStartReply = (msg) => {
    setReplyingTo(msg);
    textInputRef.current?.focus();
  };

  // Send Message (Dual Route: Seller vs Team)
  const handleSend = async (e, overrideText = null) => {
    if (e?.preventDefault) e.preventDefault();
    const clean = (overrideText !== null ? overrideText : text).trim();
    const actionToSend = activeTab === 'sellers' ? pendingAction : null;
    if (!clean && !file && !actionToSend) return;

    if (activeTab === 'sellers' && !selectedSellerId) return;
    if (activeTab === 'team' && !selectedTeamId) return;
    if (sendingRef.current) return;
    if (activeTab === 'sellers') peerTyping.stopTyping();

    sendingRef.current = true;
    setSending(true);
    let attachmentUrl = null;
    let attachmentType = null;
    let attachmentName = '';
    let attachmentSize = 0;

    try {
      if (file) {
        setUploading(true);
        const fileToUpload = await compressImage(file);
        const fd = new FormData();
        fd.append('files', fileToUpload);

        const uploadRes = await api('/uploads', {
          method: 'POST',
          body: fd,
        });

        const uploadedItem = Array.isArray(uploadRes) ? uploadRes[0] : uploadRes;
        if (uploadedItem?.url) {
          attachmentUrl = uploadedItem.url;
          attachmentType = uploadedItem.type || (file.type === 'application/pdf' ? 'pdf' : 'image');
          attachmentName = uploadedItem.name || file.name;
          attachmentSize = uploadedItem.size || file.size;
        }
        setUploading(false);
      }

      const targetReply = replyingTo ? {
        messageId: replyingTo._id,
        sender: replyingTo.sender,
        senderName: replyingTo.senderName || (replyingTo.sender === 'admin' ? 'Admin' : 'Seller'),
        text: replyingTo.text || (replyingTo.attachmentType === 'pdf' ? `📄 ${replyingTo.attachmentName || 'PDF Document'}` : '📷 Image Attachment'),
        attachmentType: replyingTo.attachmentType || null,
        attachmentName: replyingTo.attachmentName || '',
      } : null;

      setText('');
      removeFile();
      setReplyingTo(null);
      setPendingAction(null);

      if (activeTab === 'sellers') {
        // Send to Seller Support Thread
        const newMsg = await api(`/chat/admin/conversations/${selectedSellerId}/reply`, {
          method: 'POST',
          body: {
            text: clean,
            attachment: attachmentUrl,
            attachmentType,
            attachmentName,
            attachmentSize,
            replyTo: targetReply,
            action: actionToSend ? { kind: actionToSend.kind, key: actionToSend.key, refId: actionToSend.refId } : undefined,
          },
        });
        if (newMsg?._id) {
          setMessages((prev) => addChatMessage(prev, newMsg));
        }
        setTimeout(() => scrollToBottom('smooth'), 50);
        loadSellerConvos();
      } else {
        // Send to Team Member Direct Thread
        const newMsg = await api(`/chat/admin/team/${selectedTeamId}/send`, {
          method: 'POST',
          body: {
            text: clean,
            attachment: attachmentUrl,
            attachmentType,
            attachmentName,
            attachmentSize,
            replyTo: targetReply,
          },
        });
        if (newMsg?._id) {
          setMessages((prev) => addChatMessage(prev, newMsg));
        }
        setTimeout(() => scrollToBottom('smooth'), 50);
        loadTeamMembers();
      }
    } catch (err) {
      setText(clean);
      if (actionToSend) setPendingAction(actionToSend);
      alert('Failed to send message: ' + err.message);
    } finally {
      sendingRef.current = false;
      setSending(false);
      setUploading(false);
    }
  };

  const handleToggleResolve = async () => {
    if (!selectedSellerConv) return;
    const next = selectedSellerConv.status === 'resolved' ? 'open' : 'resolved';
    try {
      await api(`/chat/admin/conversations/${selectedSellerId}/status`, {
        method: 'POST',
        body: { status: next },
      });
      loadSellerConvos();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleStartEdit = (msg) => {
    setEditModal({ messageId: msg._id, text: msg.text || '' });
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editModal || !editModal.text.trim()) return;
    setSavingEdit(true);
    try {
      const res = await api(`/chat/messages/${editModal.messageId}`, {
        method: 'PUT',
        body: { text: editModal.text.trim() },
      });
      const updatedText = res.text || res.msg?.text || editModal.text.trim();
      const updatedEditedAt = res.editedAt || res.msg?.editedAt || new Date();
      setMessages((prev) =>
        prev.map((m) => (m._id === editModal.messageId ? { ...m, text: updatedText, isEdited: true, editedAt: updatedEditedAt } : m))
      );
      setEditModal(null);
    } catch (err) {
      alert(err.message || 'Failed to edit message');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteMessage = async (msg) => {
    if (!window.confirm('Are you sure you want to delete this message? It will be removed for both admin and seller.')) return;
    try {
      await api(`/chat/messages/${msg._id}`, {
        method: 'DELETE',
      });
      setMessages((prev) => prev.filter((m) => m._id !== msg._id));
      if (activeTab === 'sellers') loadSellerConvos();
      else if (activeTab === 'team') loadTeamMembers();
    } catch (err) {
      alert(err.message || 'Failed to delete message');
    }
  };

  // Selected Entities
  const selectedSellerConv = Array.isArray(sellerConvos)
    ? sellerConvos.find((c) => c._id === selectedSellerId)
    : null;

  const isStoreChat = activeTab === 'sellers' && !!selectedSellerConv?.seller && !selectedSellerConv?.isGuest && selectedSellerConv?.type !== 'guest';

  // Typing suggestions: a word in the message → offer its button (only in a store's chat)
  useEffect(() => {
    if (!isStoreChat || pendingAction || !text.trim()) {
      setSuggestion(null);
      if (!text.trim()) setDismissedSuggestion('');
      return undefined;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      const orderNo = text.match(/\b(?:ord(?:er)?[\s#:-]*|#)(\d{1,7})\b/i);
      if (orderNo) {
        try {
          const list = await api(`/chat/admin/conversations/${selectedSellerId}/shortcuts?kind=order&q=${encodeURIComponent(orderNo[1])}`);
          const hit = (Array.isArray(list) ? list : []).find((o) => new RegExp(`(^|\\D)${orderNo[1]}$`).test(String(o.title || '')));
          if (!cancelled && hit) {
            setSuggestion({ kind: 'order', refId: hit.id, label: `🧾 Open order ${hit.title}`, sub: 'Tap to see this order', id: `order:${hit.id}` });
            return;
          }
        } catch {}
      }
      const RULES = [
        [/\b(diamond|upgrade)\b/i, 'diamond'],
        [/\b(deposit|recharge|top ?up|add (funds|money|balance))\b/i, 'deposit'],
        [/\b(withdraw|withdrawal|payout)\b/i, 'withdraw'],
        [/\b(treasury|import)\b/i, 'treasury'],
        [/\b(coupons?|discounts?)\b/i, 'discounts'],
        [/\b(refunds?|returns?)\b/i, 'refunds'],
        [/\bshipping\b/i, 'shipping'],
        [/\b(bank|upi|store settings|payout details)\b/i, 'settings'],
        [/\b(analytics|reports?)\b/i, 'analytics'],
        [/\b(orders?|confirm)\b/i, 'orders'],
        [/\b(products?|listing)\b/i, 'products'],
        [/\b(wallet|balance)\b/i, 'wallet'],
      ];
      const rule = RULES.find(([re]) => re.test(text));
      const page = rule ? shortcutPages.find((p) => p.key === rule[1]) : null;
      if (!cancelled) setSuggestion(page ? { kind: 'page', key: page.key, label: page.label, sub: page.sub, id: `page:${page.key}` } : null);
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [text, isStoreChat, pendingAction, selectedSellerId, shortcutPages]);

  const currentTeamMember = Array.isArray(teamMembers)
    ? teamMembers.find((t) => t._id === selectedTeamId)
    : null;

  // Unread Totals for Tabs
  const totalSellerUnread = sellerConvos.reduce((sum, c) => sum + (c.unreadForAdmin || 0), 0);
  const totalTeamUnread = teamMembers.reduce((sum, t) => sum + (t.unreadCount || 0), 0);
  const waitingCount = (Array.isArray(sellerConvos) ? sellerConvos : []).filter(isWaiting).length;

  // Filtered Lists
  const filteredSellerConvos = (Array.isArray(sellerConvos) ? sellerConvos : []).filter((c) => {
    if (sellerFilter === 'sellers' && (c.isGuest || c.type === 'guest')) return false;
    if (sellerFilter === 'guests' && (!c.isGuest && c.type !== 'guest')) return false;
    if (sellerFilter === 'waiting' && !isWaiting(c)) return false;
    if (!q) return true;
    const name = (c.seller?.storeName || c.storeName || '').toLowerCase();
    const sub = (c.subject || '').toLowerCase();
    return name.includes(q.toLowerCase()) || sub.includes(q.toLowerCase());
  });

  const filteredTeamMembers = (Array.isArray(teamMembers) ? teamMembers : []).filter((t) => {
    if (!q) return true;
    const name = (t.name || '').toLowerCase();
    const email = (t.email || '').toLowerCase();
    const role = (t.role || '').toLowerCase();
    return name.includes(q.toLowerCase()) || email.includes(q.toLowerCase()) || role.includes(q.toLowerCase());
  });

  const hasSelection = activeTab === 'sellers' ? !!selectedSellerId : !!selectedTeamId;

  return (
    <div className={`admin-chat-layout sci ${hasSelection ? 'mobile-thread-view' : 'mobile-list-view'}`}>
      {/* SIDEBAR */}
      <aside className="admin-chat-sidebar">
        <div className="admin-chat-sidebar-head">
          <div className="sci-head-row">
            <div className="sci-head-title">
              <h2>Support inbox</h2>
              <span>
                {activeTab === 'sellers'
                  ? `${sellerConvos.length} chats${waitingCount ? ` · ${waitingCount} waiting for reply` : ''}`
                  : `${teamMembers.length} team members`}
              </span>
            </div>
            <div className="sci-head-actions">
              {activeTab === 'sellers' && (
                <button type="button" className="sci-icon-btn" onClick={() => setBroadcastOpen(true)} title="Broadcast: one message (+ button) to a group of stores" aria-label="Broadcast">
                  📣
                </button>
              )}
              {autoReply && <AutoReplyPill config={autoReply.config} onClick={() => setAutoReplyModal(true)} />}
            </div>
          </div>

          {/* Inquiries / Team */}
          <div className="admin-chat-tabs">
            <button
              type="button"
              className={`admin-chat-tab-btn ${activeTab === 'sellers' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('sellers');
                setQ('');
              }}
            >
              <span>Inquiries</span>
              {totalSellerUnread > 0 && <span className="tab-badge">{totalSellerUnread}</span>}
            </button>
            <button
              type="button"
              className={`admin-chat-tab-btn ${activeTab === 'team' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('team');
                setQ('');
              }}
            >
              <span>Team</span>
              {totalTeamUnread > 0 && <span className="tab-badge">{totalTeamUnread}</span>}
            </button>
          </div>

          {/* Search Box */}
          <div className="admin-search-box search-field-sm">
            <Ic name="search" size={15} />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={activeTab === 'sellers' ? 'Search store or subject…' : 'Search team members or role…'}
            />
            {q && (
              <button type="button" onClick={() => setQ('')} className="btn-clear-search" aria-label="Clear search">
                ✕
              </button>
            )}
          </div>

          {/* Stores / guests / waiting */}
          {activeTab === 'sellers' && (
            <div className="sci-filters" role="tablist">
              {[
                { id: 'all', label: 'All', count: sellerConvos.length },
                { id: 'waiting', label: 'Waiting', count: waitingCount, tone: 'warn' },
                { id: 'sellers', label: 'Stores', count: sellerConvos.filter((c) => !c.isGuest && c.type !== 'guest').length },
                { id: 'guests', label: 'Guests', count: sellerConvos.filter((c) => c.isGuest || c.type === 'guest').length },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  role="tab"
                  aria-selected={sellerFilter === f.id}
                  className={`${sellerFilter === f.id ? 'on' : ''} ${f.tone && f.count ? f.tone : ''}`}
                  onClick={() => setSellerFilter(f.id)}
                >
                  {f.label}
                  <em>{f.count}</em>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* CONVERSATION LIST */}
        <div className="admin-convos-list">
          {loading && <div className="sci-list-state">Loading conversations…</div>}

          {/* 1. SELLER SUPPORT INBOX */}
          {activeTab === 'sellers' && (
            <>
              {!loading && filteredSellerConvos.length === 0 && (
                <div className="sci-list-state">{sellerFilter === 'waiting' ? '🎉 No chat is waiting for a reply.' : 'No conversations match.'}</div>
              )}
              {filteredSellerConvos.map((c) => {
                const isSelected = c._id === selectedSellerId;
                const unreadCount = c.unreadForAdmin || 0;
                const hasUnread = unreadCount > 0;
                const isGuestConvo = c.isGuest || c.type === 'guest';
                const storeTitle = c.storeName || c.seller?.storeName || (isGuestConvo ? 'Guest Visitor' : 'Unknown Store');
                const typingHere = peerTyping.typersIn(c._id);
                // the last word is the seller's / guest's and nobody answered yet
                const waitingMs = isWaiting(c) && c.lastAt ? nowTick - new Date(c.lastAt).getTime() : -1;
                const waitTone = waitingMs >= 30 * 60000 ? 'late' : waitingMs >= 10 * 60000 ? 'warn' : 'ok';

                return (
                  <div
                    key={c._id}
                    className={`admin-convo-item ${isSelected ? 'selected' : ''} ${hasUnread ? 'has-unread' : ''}`}
                    onClick={() => {
                      setSelectedSellerId(c._id);
                      if (hasUnread) {
                        setSellerConvos((prev) =>
                          Array.isArray(prev) ? prev.map((item) => (item._id === c._id ? { ...item, unreadForAdmin: 0 } : item)) : []
                        );
                        api(`/chat/admin/conversations/${c._id}/read`, { method: 'POST' }).catch(() => {});
                      }
                    }}
                  >
                    <div className={`convo-avatar sci-av ${isGuestConvo ? 'is-guest' : `tone-${avatarTone(storeTitle)}`}`}>
                      <span>{isGuestConvo ? '👤' : initialsOf(storeTitle)}</span>
                      {hasUnread && <span className="avatar-unread-dot" />}
                    </div>
                    <div className="convo-body">
                      <div className="convo-top">
                        <b className="convo-name">{storeTitle}</b>
                        <small className={`convo-time ${hasUnread ? 'is-new' : ''}`}>{c.lastAt ? whenLabel(c.lastAt) : ''}</small>
                      </div>
                      <div className="convo-sub">
                        {typingHere.length > 0 ? (
                          <span className="convo-last-msg convo-peer-typing" title={typingLabel(typingHere)}>
                            ✍️ {typingLabel(typingHere)}
                          </span>
                        ) : (
                          <span className={`convo-last-msg ${hasUnread ? 'convo-last-msg-bold' : ''}`}>
                            {c.lastSender === 'admin' || c.lastSender === 'staff' ? <i className="sci-you">You: </i> : null}
                            {c.lastMessage || 'No messages yet'}
                          </span>
                        )}
                        {hasUnread && <span className="convo-unread-bubble-count">{unreadCount}</span>}
                      </div>
                      <div className="sci-convo-tags">
                        <span className={`sci-tag ${isGuestConvo ? 'guest' : 'store'}`}>{isGuestConvo ? 'Guest' : 'Store'}</span>
                        {c.status === 'resolved' && <span className="sci-tag ok">Resolved</span>}
                        {waitingMs >= 0 && (
                          <span className={`convo-wait ${waitTone}`} title="Waiting for a reply from support">
                            ⏱ {waitLabel(waitingMs)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {/* 2. TEAM & SUPER ADMIN INBOX */}
          {activeTab === 'team' && (
            <>
              {!loading && filteredTeamMembers.length === 0 && <div className="sci-list-state">No team members found.</div>}
              {filteredTeamMembers.map((t) => {
                const isSelected = t._id === selectedTeamId;
                const unreadCount = t.unreadCount || 0;
                const hasUnread = unreadCount > 0;
                const isSuper = t.role === 'super_admin';

                return (
                  <div
                    key={t._id}
                    className={`admin-convo-item ${isSelected ? 'selected' : ''} ${hasUnread ? 'has-unread' : ''}`}
                    onClick={() => {
                      setSelectedTeamId(t._id);
                      if (hasUnread) {
                        setTeamMembers((prev) =>
                          Array.isArray(prev) ? prev.map((item) => (item._id === t._id ? { ...item, unreadCount: 0 } : item)) : []
                        );
                        api(`/chat/admin/team/${t._id}/read`, { method: 'POST' }).catch(() => {});
                      }
                    }}
                  >
                    <div className={`convo-avatar sci-av ${isSuper ? 'tone-violet' : 'tone-slate'}`}>
                      <span>{initialsOf(t.name || 'A')}</span>
                      {hasUnread && <span className="avatar-unread-dot" />}
                    </div>
                    <div className="convo-body">
                      <div className="convo-top">
                        <b className="convo-name">{t.name}</b>
                        <small className={`convo-time ${hasUnread ? 'is-new' : ''}`}>{t.lastAt ? whenLabel(t.lastAt) : ''}</small>
                      </div>
                      <div className="convo-sub">
                        <span className={`convo-last-msg ${hasUnread ? 'convo-last-msg-bold' : ''}`}>{t.lastMessage || 'Start a conversation'}</span>
                        {hasUnread && <span className="convo-unread-bubble-count">{unreadCount}</span>}
                      </div>
                      <div className="sci-convo-tags">
                        <span className={`admin-role-badge-sm role-${t.role}`}>{ROLE_LABELS[t.role] || t.role}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </aside>
      {/* CHAT THREAD AREA */}
      <div className="admin-chat-thread">
        {/* 1. SELLER SUPPORT THREAD */}
        {activeTab === 'sellers' && selectedSellerConv && (() => {
          const guest = selectedSellerConv.isGuest || selectedSellerConv.type === 'guest';
          const title = selectedSellerConv.storeName || selectedSellerConv.seller?.storeName || (guest ? 'Guest Support' : 'Support Thread');
          const resolved = selectedSellerConv.status === 'resolved';
          return (
          <>
            <div className="admin-thread-head">
              <div className="ath-left">
                <button type="button" className="mobile-back-btn" onClick={() => setSelectedSellerId(null)} title="Back to the list" aria-label="Back to the list">
                  <Ic name="arrowLeft" size={18} />
                </button>
                <div className={`convo-avatar sci-av sm ${guest ? 'is-guest' : `tone-${avatarTone(title)}`}`}>
                  <span>{guest ? '👤' : initialsOf(title)}</span>
                </div>
                <div className="ath-info">
                  <div className="ath-title-row">
                    <b className="ath-name">{title}</b>
                    <span className={`sci-tag ${guest ? 'guest' : 'store'}`}>{guest ? 'Guest · before login' : 'Registered store'}</span>
                    {resolved && <span className="sci-tag ok">Resolved</span>}
                  </div>
                  <div className="ath-meta">
                    <span>{guest ? `Guest ID: ${selectedSellerConv.guestId || 'unregistered'}` : `Owner: ${selectedSellerConv.sellerName || selectedSellerConv.seller?.ownerName || 'Merchant'}`}</span>
                    <span className="dot">•</span>
                    <span>{selectedSellerConv.sellerEmail || selectedSellerConv.seller?.email || selectedSellerConv.email || 'Live chat'}</span>
                  </div>
                </div>
              </div>

              <div className="ath-actions">
                {isStoreChat && (
                  <button type="button" className={`sci-btn ${infoOpen ? 'on' : ''}`} onClick={() => setInfoOpen((v) => !v)} title="Balance, waiting orders, plan… of this store">
                    📋<span className="sci-btn-txt">Store info</span>
                  </button>
                )}
                <button type="button" className="sci-btn danger" onClick={() => setClearChat('seller')} title="Delete messages and their pictures / files for good">
                  🧹<span className="sci-btn-txt">Clear</span>
                </button>
                <button
                  type="button"
                  className={`sci-btn ${resolved ? 'ok' : 'primary'} btn-status-toggle ${resolved ? 'status-resolved' : 'status-open'}`}
                  onClick={handleToggleResolve}
                  title={resolved ? 'Reopen this chat' : 'Mark this chat as resolved'}
                >
                  {resolved ? '✓ Resolved' : '✓ Resolve'}
                </button>
              </div>
            </div>

            {infoOpen && isStoreChat && (
              <ChatSellerInfo
                key={selectedSellerId}
                conversationId={selectedSellerId}
                onClose={() => setInfoOpen(false)}
                onButton={(a) => {
                  setPendingAction(a);
                  textInputRef.current?.focus();
                }}
              />
            )}

            <div ref={threadMessagesRef} onScroll={handleThreadScroll} className="admin-thread-messages">
              {hasMore && (
                <div className="sci-earlier">
                  <button type="button" onClick={handleLoadEarlier} disabled={loadingEarlier}>
                    {loadingEarlier ? 'Loading earlier messages…' : '↑ Load earlier messages'}
                  </button>
                </div>
              )}
              {!hasMore && messages.length > 0 && <div className="sci-begin">Start of the conversation</div>}

              {messages.map((m, i) => {
                const isAdmin = m.sender === 'admin' || m.sender === 'staff';
                const day = dayKey(m.createdAt);
                const newDay = i === 0 || day !== dayKey(messages[i - 1]?.createdAt);
                return (
                  <Fragment key={m._id}>
                    {newDay && day && (
                      <div className="sci-day">
                        <span>{dayLabel(m.createdAt)}</span>
                      </div>
                    )}
                    <ChatMessageBubble msg={m} isMe={isAdmin} myRole="admin" onReply={handleStartReply} onEdit={handleStartEdit} onDelete={handleDeleteMessage} />
                  </Fragment>
                );
              })}
              <div ref={scrollRef} />
            </div>
          </>
          );
        })()}

        {/* 2. TEAM & SUPER ADMIN DIRECT THREAD */}
        {activeTab === 'team' && currentTeamMember && (
          <>
            <div className="admin-thread-head">
              <div className="ath-left">
                <button type="button" className="mobile-back-btn" onClick={() => setSelectedTeamId(null)} title="Back to team list" aria-label="Back to team list">
                  <Ic name="arrowLeft" size={18} />
                </button>
                <div className={`convo-avatar sci-av sm ${currentTeamMember.role === 'super_admin' ? 'tone-violet' : 'tone-slate'}`}>
                  <span>{initialsOf(currentTeamMember.name || 'A')}</span>
                </div>
                <div className="ath-info">
                  <div className="ath-title-row">
                    <b className="ath-name">{currentTeamMember.name}</b>
                    <span className={`admin-role-badge-sm role-${currentTeamMember.role}`}>{ROLE_LABELS[currentTeamMember.role] || currentTeamMember.role}</span>
                  </div>
                  <div className="ath-meta">
                    <span>{currentTeamMember.email}</span>
                    {currentTeamMember.phone && (
                      <>
                        <span className="dot">•</span>
                        <span>{currentTeamMember.phone}</span>
                      </>
                    )}
                    <span className="dot">•</span>
                    <span className="sci-internal">● Internal team chat</span>
                  </div>
                </div>
              </div>
              <div className="ath-actions">
                <button type="button" className="sci-btn danger" onClick={() => setClearChat('team')} title="Delete messages and their pictures / files for good">
                  🧹<span className="sci-btn-txt">Clear</span>
                </button>
              </div>
            </div>

            <div ref={threadMessagesRef} onScroll={handleThreadScroll} className="admin-thread-messages">
              {hasMore && (
                <div className="sci-earlier">
                  <button type="button" onClick={handleLoadEarlier} disabled={loadingEarlier}>
                    {loadingEarlier ? 'Loading earlier messages…' : '↑ Load earlier messages'}
                  </button>
                </div>
              )}
              {!hasMore && messages.length > 0 && <div className="sci-begin">Start of the conversation</div>}

              {messages.map((m, i) => {
                const isMe = String(m.senderAdmin) === String(me?.id) || (m.sender === 'admin' && !m.senderAdmin && m.senderName === me?.name);
                const day = dayKey(m.createdAt);
                const newDay = i === 0 || day !== dayKey(messages[i - 1]?.createdAt);
                return (
                  <Fragment key={m._id}>
                    {newDay && day && (
                      <div className="sci-day">
                        <span>{dayLabel(m.createdAt)}</span>
                      </div>
                    )}
                    <ChatMessageBubble msg={m} isMe={isMe} myRole="admin" onReply={handleStartReply} onEdit={handleStartEdit} onDelete={handleDeleteMessage} />
                  </Fragment>
                );
              })}
              <div ref={scrollRef} />
            </div>
          </>
        )}

        {/* EMPTY STATE */}
        {!hasSelection && (
          <div className="admin-chat-empty sci-empty">
            <div className="empty-icon">
              <Ic name={activeTab === 'sellers' ? 'chat' : 'user'} size={34} />
            </div>
            <h3>{activeTab === 'sellers' ? 'Pick a conversation' : 'Pick a team member'}</h3>
            <p>
              {activeTab === 'sellers'
                ? 'Choose a store or a guest from the list to read their messages and reply.'
                : 'Choose an admin or staff member to start an internal chat.'}
            </p>
            {activeTab === 'sellers' && waitingCount > 0 && (
              <button type="button" className="sci-btn primary" onClick={() => setSellerFilter('waiting')}>
                ⏱ {waitingCount} {waitingCount === 1 ? 'chat is' : 'chats are'} waiting for a reply
              </button>
            )}
          </div>
        )}

        {/* SHARED INPUT & REPLY FORM (WITH MULTILINE AUTO-EXPANDING TEXTAREA) */}
        {hasSelection && (
          <>
            {/* Another admin is writing a reply in this chat (only admins see this) */}
            {activeTab === 'sellers' && peerTyping.typersIn(selectedSellerId).length > 0 && (
              <div className="peer-typing-bar" role="status" aria-live="polite">
                <span className="peer-typing-dots"><i /><i /><i /></span>
                <span>{typingLabel(peerTyping.typersIn(selectedSellerId))}</span>
              </div>
            )}

            {/* WhatsApp Replying Preview */}
            {replyingTo && (
              <div className="chat-replying-bar">
                <div className="crb-left">
                  <div className="crb-indicator"></div>
                  <div className="crb-info">
                    <span className="crb-title">
                      Replying to <b>{replyingTo.senderName || 'Message'}</b>
                    </span>
                    <span className="crb-snippet">
                      {replyingTo.text || (replyingTo.attachmentType === 'pdf' ? `📄 ${replyingTo.attachmentName || 'PDF Document'}` : '📷 Image Attachment')}
                    </span>
                  </div>
                </div>
                <button type="button" className="crb-close" onClick={() => setReplyingTo(null)} title="Cancel reply">
                  <Ic name="x" size={16} />
                </button>
              </div>
            )}

            {/* Suggested button from what is being typed */}
            {suggestion && !pendingAction && isStoreChat && dismissedSuggestion !== suggestion.id && (
              <div className="chat-suggest-bar" role="status">
                <span>💡 Add a button?</span>
                <button
                  type="button"
                  className="sg"
                  onClick={() => {
                    const { id, ...a } = suggestion;
                    setPendingAction(a);
                    setSuggestion(null);
                    textInputRef.current?.focus();
                  }}
                >
                  {suggestion.label}
                </button>
                <button type="button" className="x" onClick={() => setDismissedSuggestion(suggestion.id)} aria-label="Not now">
                  ✕
                </button>
              </div>
            )}

            {/* Shortcut button that goes with the next message */}
            {pendingAction && activeTab === 'sellers' && (
              <div className="chat-replying-bar csp-pending">
                <div className="crb-left">
                  <div className="crb-indicator" style={{ background: '#0891b2' }}></div>
                  <div className="crb-info">
                    <span className="crb-title">
                      Button: <b>{pendingAction.label}</b>
                    </span>
                    <span className="crb-snippet">Add a message (optional) and press Send — the seller taps the button to open it.</span>
                  </div>
                </div>
                <button type="button" className="crb-close" onClick={() => setPendingAction(null)} title="Remove button">
                  <Ic name="x" size={16} />
                </button>
              </div>
            )}

            {/* File Upload Preview */}
            {file && (
              <div className="chat-attachment-preview-bar admin-preview-bar">
                <div className="preview-file-box">
                  {filePreview ? (
                    <img src={filePreview} alt="Upload preview" className="preview-thumb" />
                  ) : (
                    <div className="preview-pdf-icon"><Ic name="fileText" size={24} /><span>PDF</span></div>
                  )}
                  <div className="preview-file-details">
                    <b className="preview-file-name">{file.name}</b>
                    <small className="muted-sm">{(file.size / 1024).toFixed(1)} KB • {file.type.startsWith('image/') ? 'Image' : 'PDF'}</small>
                  </div>
                </div>
                <button type="button" className="btn-remove-preview" onClick={removeFile} title="Remove"><Ic name="x" size={16} /></button>
              </div>
            )}

            {/* Composer: message box on top, tools and Send below */}
            <form onSubmit={handleSend} className="admin-reply-bar sci-composer">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
                style={{ display: 'none' }}
              />
              <textarea
                ref={textInputRef}
                className="sci-input"
                rows={2}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  noteSellerTyping(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend(e);
                  }
                }}
                placeholder={
                  file
                    ? 'Add a caption…'
                    : replyingTo
                    ? `Reply to ${replyingTo.senderName || 'message'}…`
                    : activeTab === 'sellers'
                    ? `Message ${selectedSellerConv?.seller?.storeName || selectedSellerConv?.storeName || 'merchant'}…`
                    : `Message ${currentTeamMember?.name || 'admin'}…`
                }
                disabled={sending}
              />
              <div className="sci-toolbar">
                <div className="sci-tools">
                  <button type="button" className="chat-attach-btn sci-tool" onClick={() => fileInputRef.current?.click()} disabled={sending} title="Attach a photo or PDF" aria-label="Attach file">
                    <Ic name="paperclip" size={18} stroke={2} />
                  </button>
                  {activeTab === 'sellers' && (
                    <button type="button" className="chat-attach-btn sci-tool" onClick={() => setQuickOpen(true)} disabled={sending} title="Saved replies" aria-label="Saved replies">
                      <span className="sci-emoji">⚡</span>
                    </button>
                  )}
                  {isStoreChat && (
                    <button
                      type="button"
                      className="chat-attach-btn csp-trigger sci-tool"
                      onClick={() => setShortcutOpen(true)}
                      disabled={sending}
                      title="Send a shortcut button (Diamond, Deposit, an order, a product…)"
                      aria-label="Shortcut button"
                    >
                      <Ic name="link" size={18} stroke={2} />
                    </button>
                  )}
                  <span className="sci-tool-voice">
                    <VoiceRecordButton
                      onTranscribed={(spokenText) => {
                        setText((prev) => (prev ? `${prev.trim()} ${spokenText}` : spokenText));
                        noteSellerTyping(spokenText);
                        textInputRef.current?.focus();
                      }}
                      disabled={sending || uploading}
                    />
                  </span>
                  <span className="sci-hint">Enter to send · Shift + Enter for a new line</span>
                </div>
                <div className="sci-send-row">
                  <AiRewriteBox
                    text={text}
                    onApply={(rewritten) => {
                      setText(rewritten);
                      noteSellerTyping(rewritten);
                      textInputRef.current?.focus();
                    }}
                    onApplyAndSend={(rewritten) => {
                      handleSend(null, rewritten);
                    }}
                    disabled={sending || uploading}
                  />
                  <button
                    type="submit"
                    className="btn-primary sci-send"
                    disabled={sending || (!text.trim() && !file && !(activeTab === 'sellers' && pendingAction))}
                  >
                    {sending ? (uploading ? 'Uploading…' : 'Sending…') : <><Ic name="send" size={15} /> Send</>}
                  </button>
                </div>
              </div>
            </form>
          </>
        )}
      </div>

      {/* AUTO-REPLY SETTINGS */}
      {autoReplyModal && autoReply && (
        <ChatAutoReply
          value={autoReply.config}
          defaults={autoReply.defaults}
          onSaved={(r) => r?.config && setAutoReply(r)}
          onClose={() => setAutoReplyModal(false)}
        />
      )}

      {/* SAVED REPLIES */}
      {quickOpen && (
        <ChatQuickReplies
          pages={shortcutPages}
          canButton={isStoreChat}
          onClose={() => setQuickOpen(false)}
          onUse={(r, page) => {
            if (r.text) {
              setText(r.text);
              noteSellerTyping(r.text);
            }
            if (isStoreChat && page) setPendingAction({ kind: 'page', key: page.key, label: page.label, sub: page.sub });
            setQuickOpen(false);
            setTimeout(() => textInputRef.current?.focus(), 30);
          }}
        />
      )}

      {/* BROADCAST: one message (+ button) to a group of stores */}
      {broadcastOpen && <ChatBroadcast pages={shortcutPages} onClose={() => setBroadcastOpen(false)} />}

      {/* SHORTCUT BUTTON PICKER (page / order / product of this store) */}
      {shortcutOpen && selectedSellerId && (
        <ChatShortcutPicker
          conversationId={selectedSellerId}
          storeName={selectedSellerConv?.seller?.storeName || selectedSellerConv?.storeName || ''}
          onClose={() => setShortcutOpen(false)}
          onPick={(a) => {
            setPendingAction(a);
            setShortcutOpen(false);
            textInputRef.current?.focus();
          }}
        />
      )}

      {/* CLEAR CHAT (whole chat or by date; pictures / files are removed from storage too) */}
      {clearChat === 'seller' && selectedSellerConv && (
        <ClearChatModal
          chatName={`Chat with ${selectedSellerConv.storeName || selectedSellerConv.seller?.storeName || selectedSellerConv.name || 'Guest'}`}
          endpoint={`/chat/admin/conversations/${selectedSellerId}/clear`}
          onClose={() => setClearChat(null)}
          onCleared={() => {
            loadSellerMessages(selectedSellerId, false);
            loadSellerConvos();
          }}
        />
      )}
      {clearChat === 'team' && currentTeamMember && (
        <ClearChatModal
          chatName={`Team chat with ${currentTeamMember.name}`}
          endpoint={`/chat/admin/team/${selectedTeamId}/clear`}
          onClose={() => setClearChat(null)}
          onCleared={() => {
            loadTeamMessages(selectedTeamId, false);
            loadTeamMembers();
          }}
        />
      )}

      {/* MESSAGE EDIT MODAL */}
      {editModal && (
        <div className="admin-modal-overlay" onClick={() => setEditModal(null)}>
          <div className="admin-modal-box" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-top">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 20 }}>✏️</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16 }}>Edit Message</h3>
                  <p className="muted" style={{ margin: '2px 0 0', fontSize: 12 }}>Modify message content</p>
                </div>
              </div>
              <button onClick={() => setEditModal(null)} className="btn-close-modal">✕</button>
            </div>

            <form onSubmit={handleSaveEdit} style={{ padding: '18px 22px' }}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12.5, fontWeight: 700, display: 'block', marginBottom: 6 }}>
                  Message Content:
                </label>
                <textarea
                  rows={4}
                  value={editModal.text}
                  onChange={(e) => setEditModal({ ...editModal, text: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, fontFamily: 'inherit' }}
                  required
                  autoFocus
                />
              </div>

              <div className="modal-bottom-actions">
                <button type="button" onClick={() => setEditModal(null)} className="btn-cancel">Cancel</button>
                <button type="submit" className="btn-primary" disabled={savingEdit || !editModal.text.trim()}>
                  {savingEdit ? 'Saving...' : '💾 Update Message'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
