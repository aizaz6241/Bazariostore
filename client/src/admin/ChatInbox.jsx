import { Fragment, useEffect, useState, useRef } from 'react';
import { api, compressImage, dropClearedMessages, addChatMessage, syncLatestMessages } from '../api.js';
import { getSocket } from '../socket.js';
import Ic from '../components/Icons.jsx';
import ChatMessageBubble from '../components/ChatMessageBubble.jsx';
import AiRewriteBox from '../components/AiRewriteBox.jsx';
import ClearChatModal from './ClearChatModal.jsx';
import VoiceRecordButton from '../components/VoiceRecordButton.jsx';
import { Toggle } from './ui.jsx';

const ROLE_NAMES = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  manager: 'Manager',
  support: 'Support',
  order_manager: 'Order Manager',
  inventory: 'Inventory',
};

// [background, text] per role, and a few soft tones for store avatars
const ROLE_TONES = {
  super_admin: ['#ece9fb', '#4b3bb3'],
  admin: ['#e8f1fc', '#1d5fae'],
  manager: ['#e4f6ef', '#0f7a55'],
  support: ['#fdf3dc', '#97690a'],
  order_manager: ['#fbe9f0', '#a83a66'],
  inventory: ['#eef1f5', '#475569'],
};
const AVATAR_TONES = [
  ['#e8f1fc', '#1d5fae'],
  ['#fdeee6', '#b4471b'],
  ['#e4f6ef', '#0f7a55'],
  ['#fdf3dc', '#97690a'],
  ['#fbe9f0', '#a83a66'],
  ['#ece9fb', '#4b3bb3'],
];
function toneFor(key = '') {
  let h = 0;
  for (const ch of String(key)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length];
}

const isGuestConv = (c) => Boolean(c?.isGuest || c?.type === 'guest');
const convTitle = (c) => c.storeName || c.seller?.storeName || (isGuestConv(c) ? 'Guest visitor' : 'Unknown store');

const dayKey = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
};
function dayLabel(d) {
  const x = new Date(d);
  const today = new Date();
  const yest = new Date(Date.now() - 864e5);
  if (dayKey(x) === dayKey(today)) return 'Today';
  if (dayKey(x) === dayKey(yest)) return 'Yesterday';
  return x.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'short', ...(x.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}) });
}
// Short time for the conversation list: 14:05 · Yesterday · Mon · 3 Oct
function listTime(d) {
  if (!d) return '';
  const x = new Date(d);
  const now = new Date();
  if (dayKey(x) === dayKey(now)) return x.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (dayKey(x) === dayKey(new Date(Date.now() - 864e5))) return 'Yesterday';
  if (now - x < 6 * 864e5) return x.toLocaleDateString('en-US', { weekday: 'short' });
  return x.toLocaleDateString('en-US', { day: 'numeric', month: 'short', ...(x.getFullYear() !== now.getFullYear() ? { year: '2-digit' } : {}) });
}

export default function ChatInbox() {
  // Current Logged-in Admin
  const [me, setMe] = useState(null);

  // Navigation Tab: 'sellers' | 'team'
  const [activeTab, setActiveTab] = useState('sellers');
  const [sellerFilter, setSellerFilter] = useState('all'); // 'all' | 'sellers' | 'guests'

  // Seller Support State
  const [sellerConvos, setSellerConvos] = useState([]);
  // ?c=<conversation id> (from a phone notification) opens that chat directly
  const [selectedSellerId, setSelectedSellerId] = useState(() => {
    try { return new URLSearchParams(window.location.search).get('c') || null; } catch { return null; }
  });

  // Team & Super Admin State
  const [teamMembers, setTeamMembers] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const [selectedTeamTarget, setSelectedTeamTarget] = useState(null);

  // Auto-Reply Settings State
  const [autoReply, setAutoReply] = useState({
    enabled: false,
    message: 'Assalam o Alaikum! 👋 Thanks for reaching out. We are currently away from the desk, but we have received your inquiry and our support team will respond to you shortly.',
    awayMode: false,
  });
  const [autoReplyModal, setAutoReplyModal] = useState(false);
  const [savingAutoReply, setSavingAutoReply] = useState(false);

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
        if (res) {
          setAutoReply({
            enabled: Boolean(res.autoReplyEnabled ?? res.enabled),
            message: res.autoReplyMessage || res.message || 'Assalam o Alaikum! 👋 Thanks for reaching out. We are currently away from the desk, but we have received your inquiry and our support team will respond to you shortly.',
            awayMode: Boolean(res.awayMode),
          });
        }
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

    const onSettingsUpdate = (s) => {
      if (s) {
        setAutoReply({
          enabled: Boolean(s.autoReplyEnabled ?? s.enabled),
          message: s.autoReplyMessage || s.message || '',
          awayMode: Boolean(s.awayMode),
        });
      }
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

    if (socket) {
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
    if (!clean && !file) return;

    if (activeTab === 'sellers' && !selectedSellerId) return;
    if (activeTab === 'team' && !selectedTeamId) return;
    if (sendingRef.current) return;

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

  const handleSaveAutoReply = async (e) => {
    e.preventDefault();
    setSavingAutoReply(true);
    try {
      const res = await api('/chat/settings/auto-reply', {
        method: 'POST',
        body: {
          autoReplyEnabled: Boolean(autoReply.enabled),
          autoReplyMessage: autoReply.message,
          awayMode: Boolean(autoReply.awayMode),
          enabled: Boolean(autoReply.enabled),
          message: autoReply.message,
        },
      });
      const s = res?.settings || res || {};
      setAutoReply({
        enabled: Boolean(s.autoReplyEnabled ?? s.enabled ?? autoReply.enabled),
        message: s.autoReplyMessage || s.message || autoReply.message,
        awayMode: Boolean(s.awayMode ?? autoReply.awayMode),
      });
      setAutoReplyModal(false);
    } catch (err) {
      alert(err.message || 'Failed to save auto-reply settings');
    } finally {
      setSavingAutoReply(false);
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

  const currentTeamMember = Array.isArray(teamMembers)
    ? teamMembers.find((t) => t._id === selectedTeamId)
    : null;

  // Unread Totals for Tabs
  const totalSellerUnread = sellerConvos.reduce((sum, c) => sum + (c.unreadForAdmin || 0), 0);
  const totalTeamUnread = teamMembers.reduce((sum, t) => sum + (t.unreadCount || 0), 0);

  // Filtered Lists
  const filteredSellerConvos = (Array.isArray(sellerConvos) ? sellerConvos : []).filter((c) => {
    if (sellerFilter === 'sellers' && (c.isGuest || c.type === 'guest')) return false;
    if (sellerFilter === 'guests' && (!c.isGuest && c.type !== 'guest')) return false;
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

  // Textarea grows with what is typed (up to ~6 lines), and shrinks back after sending
  useEffect(() => {
    const el = textInputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text, hasSelection]);

  const openCount = sellerConvos.filter((c) => c.status !== 'resolved').length;
  const merchantCount = sellerConvos.filter((c) => !isGuestConv(c)).length;
  const guestCount = sellerConvos.length - merchantCount;
  const autoState = autoReply.awayMode ? 'away' : autoReply.enabled ? 'on' : 'off';

  const threadName =
    activeTab === 'sellers'
      ? selectedSellerConv
        ? convTitle(selectedSellerConv)
        : ''
      : currentTeamMember?.name || '';

  // Messages with a date line whenever the day changes
  const renderMessages = (isMine) =>
    messages.map((m, idx) => {
      const prev = messages[idx - 1];
      const newDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);
      return (
        <Fragment key={m._id}>
          {newDay && m.createdAt && (
            <div className="scd-day">
              <span>{dayLabel(m.createdAt)}</span>
            </div>
          )}
          <ChatMessageBubble
            msg={m}
            isMe={isMine(m)}
            myRole="admin"
            onReply={handleStartReply}
            onEdit={handleStartEdit}
            onDelete={handleDeleteMessage}
          />
        </Fragment>
      );
    });

  const historyControls = (
    <>
      {hasMore && (
        <div className="scd-earlier">
          <button type="button" onClick={handleLoadEarlier} disabled={loadingEarlier}>
            {loadingEarlier ? (
              <>
                <span className="scd-spinner" /> Loading earlier messages…
              </>
            ) : (
              <>
                <Ic name="chevDown" size={14} style={{ transform: 'rotate(180deg)' }} /> Load earlier messages
              </>
            )}
          </button>
        </div>
      )}
      {!hasMore && messages.length >= 50 && <div className="scd-history-start">Beginning of conversation</div>}
    </>
  );

  return (
    <div className={`scd admin-chat-layout ${hasSelection ? 'mobile-thread-view' : 'mobile-list-view'}`}>
      {/* ───────────── SIDEBAR ───────────── */}
      <aside className="scd-side">
        <div className="scd-side-head">
          <div className="scd-side-title">
            <div>
              <h2>Support Desk</h2>
              <small>
                {activeTab === 'sellers'
                  ? `${openCount} open · ${totalSellerUnread} unread`
                  : `${teamMembers.length} team member${teamMembers.length === 1 ? '' : 's'}`}
              </small>
            </div>
            <button
              type="button"
              className={`scd-auto scd-auto-${autoState}`}
              onClick={() => setAutoReplyModal(true)}
              title="Auto-reply settings"
            >
              <i className="scd-auto-dot" />
              <span>{autoState === 'away' ? 'Away mode' : autoState === 'on' ? 'Auto-reply on' : 'Auto-reply off'}</span>
              <Ic name="gear" size={13} />
            </button>
          </div>

          <div className="scd-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'sellers'}
              className={activeTab === 'sellers' ? 'on' : ''}
              onClick={() => {
                setActiveTab('sellers');
                setQ('');
              }}
            >
              <Ic name="headset" size={15} />
              <span>Inquiries</span>
              {totalSellerUnread > 0 && <span className="scd-count">{totalSellerUnread}</span>}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'team'}
              className={activeTab === 'team' ? 'on' : ''}
              onClick={() => {
                setActiveTab('team');
                setQ('');
              }}
            >
              <Ic name="users" size={15} />
              <span>Team</span>
              {totalTeamUnread > 0 && <span className="scd-count">{totalTeamUnread}</span>}
            </button>
          </div>

          <div className="scd-search">
            <Ic name="search" size={15} />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={activeTab === 'sellers' ? 'Search store or subject…' : 'Search name, email or role…'}
            />
            {q && (
              <button type="button" onClick={() => setQ('')} className="scd-search-clear" aria-label="Clear search">
                <Ic name="x" size={13} />
              </button>
            )}
          </div>

          {activeTab === 'sellers' && (
            <div className="scd-filters">
              {[
                ['all', 'All', sellerConvos.length],
                ['sellers', 'Merchants', merchantCount],
                ['guests', 'Guests', guestCount],
              ].map(([key, label, n]) => (
                <button key={key} type="button" className={sellerFilter === key ? 'on' : ''} onClick={() => setSellerFilter(key)}>
                  {label} <span>{n}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="scd-list">
          {loading &&
            [0, 1, 2, 3].map((i) => (
              <div key={i} className="scd-skel">
                <i />
                <div>
                  <span />
                  <span />
                </div>
              </div>
            ))}

          {/* Seller / guest inquiries */}
          {activeTab === 'sellers' && (
            <>
              {!loading && filteredSellerConvos.length === 0 && (
                <div className="scd-list-empty">
                  <Ic name="chat" size={22} />
                  <p>{q ? 'No conversation matches your search.' : 'No conversations here yet.'}</p>
                </div>
              )}
              {filteredSellerConvos.map((c) => {
                const isSelected = c._id === selectedSellerId;
                const unreadCount = c.unreadForAdmin || 0;
                const hasUnread = unreadCount > 0;
                const guest = isGuestConv(c);
                const title = convTitle(c);
                const tone = toneFor(title);
                const fromUs = c.lastSender === 'admin' || c.lastSender === 'staff';

                return (
                  <button
                    type="button"
                    key={c._id}
                    className={`scd-item ${isSelected ? 'on' : ''} ${hasUnread ? 'unread' : ''}`}
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
                    <span className={`scd-avatar ${guest ? 'guest' : ''}`} style={guest ? undefined : { background: tone[0], color: tone[1] }}>
                      {guest ? <Ic name="user" size={18} /> : (title[0] || 'S').toUpperCase()}
                    </span>
                    <span className="scd-item-body">
                      <span className="scd-item-top">
                        <b>{title}</b>
                        <time>{listTime(c.lastAt)}</time>
                      </span>
                      <span className="scd-item-mid">
                        <span className="scd-item-msg">
                          {fromUs && <em>You: </em>}
                          {c.lastMessage || 'No messages yet'}
                        </span>
                        {hasUnread && <span className="scd-unread" title={`${unreadCount} unread`}>{unreadCount}</span>}
                      </span>
                      <span className="scd-item-tags">
                        <span className={`scd-tag ${guest ? 'guest' : 'seller'}`}>{guest ? 'Guest' : 'Seller'}</span>
                        {c.status === 'resolved' && (
                          <span className="scd-tag resolved">
                            <Ic name="check" size={10} /> Resolved
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                );
              })}
            </>
          )}

          {/* Team & admins */}
          {activeTab === 'team' && (
            <>
              {!loading && filteredTeamMembers.length === 0 && (
                <div className="scd-list-empty">
                  <Ic name="users" size={22} />
                  <p>No team members found.</p>
                </div>
              )}
              {filteredTeamMembers.map((t) => {
                const isSelected = t._id === selectedTeamId;
                const unreadCount = t.unreadCount || 0;
                const hasUnread = unreadCount > 0;
                const tone = ROLE_TONES[t.role] || ROLE_TONES.inventory;

                return (
                  <button
                    type="button"
                    key={t._id}
                    className={`scd-item ${isSelected ? 'on' : ''} ${hasUnread ? 'unread' : ''}`}
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
                    <span className="scd-avatar" style={{ background: tone[0], color: tone[1] }}>
                      {(t.name?.[0] || 'A').toUpperCase()}
                    </span>
                    <span className="scd-item-body">
                      <span className="scd-item-top">
                        <b>{t.name}</b>
                        <time>{listTime(t.lastAt)}</time>
                      </span>
                      <span className="scd-item-mid">
                        <span className="scd-item-msg">{t.lastMessage || 'Start a conversation'}</span>
                        {hasUnread && <span className="scd-unread">{unreadCount}</span>}
                      </span>
                      <span className="scd-item-tags">
                        <span className="scd-tag role" style={{ background: tone[0], color: tone[1] }}>
                          {ROLE_NAMES[t.role] || t.role}
                        </span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </>
          )}
        </div>
      </aside>

      {/* ───────────── THREAD ───────────── */}
      <section className="scd-thread">
        {/* Seller / guest conversation */}
        {activeTab === 'sellers' && selectedSellerConv && (() => {
          const guest = isGuestConv(selectedSellerConv);
          const resolved = selectedSellerConv.status === 'resolved';
          const tone = toneFor(threadName);
          return (
            <>
              <header className="scd-thread-head">
                <button type="button" className="scd-back" onClick={() => setSelectedSellerId(null)} aria-label="Back to conversations">
                  <Ic name="arrowLeft" size={18} />
                </button>
                <span className={`scd-avatar lg ${guest ? 'guest' : ''}`} style={guest ? undefined : { background: tone[0], color: tone[1] }}>
                  {guest ? <Ic name="user" size={19} /> : (threadName[0] || 'S').toUpperCase()}
                </span>
                <div className="scd-thread-info">
                  <div className="scd-thread-name">
                    <b>{threadName}</b>
                    <span className={`scd-status ${resolved ? 'resolved' : 'open'}`}>{resolved ? 'Resolved' : 'Open'}</span>
                  </div>
                  <small>
                    <span className={`scd-tag ${guest ? 'guest' : 'seller'}`}>{guest ? 'Guest · pre-login' : 'Registered merchant'}</span>
                    <span className="scd-meta-text">
                      {guest
                        ? `Guest ID: ${selectedSellerConv.guestId || 'Unregistered'}`
                        : `${selectedSellerConv.sellerName || selectedSellerConv.seller?.ownerName || 'Merchant'} · ${selectedSellerConv.sellerEmail || selectedSellerConv.seller?.email || 'Live channel'}`}
                    </span>
                  </small>
                </div>
                <div className="scd-thread-actions">
                  <button
                    type="button"
                    className={`scd-btn ${resolved ? '' : 'primary'}`}
                    onClick={handleToggleResolve}
                    title={resolved ? 'Reopen this conversation' : 'Mark this conversation as resolved'}
                  >
                    <Ic name={resolved ? 'refresh' : 'checkCircle'} size={15} />
                    <span>{resolved ? 'Reopen' : 'Mark resolved'}</span>
                  </button>
                  <button
                    type="button"
                    className="scd-btn danger icon"
                    onClick={() => setClearChat('seller')}
                    title="Clear chat — delete messages and their pictures / files for good"
                    aria-label="Clear chat"
                  >
                    <Ic name="trash" size={15} />
                    <span>Clear</span>
                  </button>
                </div>
              </header>

              <div ref={threadMessagesRef} onScroll={handleThreadScroll} className="scd-messages">
                {historyControls}
                {renderMessages((m) => m.sender === 'admin' || m.sender === 'staff')}
                <div ref={scrollRef} />
              </div>
            </>
          );
        })()}

        {/* Team member conversation */}
        {activeTab === 'team' && currentTeamMember && (() => {
          const tone = ROLE_TONES[currentTeamMember.role] || ROLE_TONES.inventory;
          return (
            <>
              <header className="scd-thread-head">
                <button type="button" className="scd-back" onClick={() => setSelectedTeamId(null)} aria-label="Back to team list">
                  <Ic name="arrowLeft" size={18} />
                </button>
                <span className="scd-avatar lg" style={{ background: tone[0], color: tone[1] }}>
                  {(currentTeamMember.name?.[0] || 'A').toUpperCase()}
                </span>
                <div className="scd-thread-info">
                  <div className="scd-thread-name">
                    <b>{currentTeamMember.name}</b>
                    <span className="scd-status internal">Internal</span>
                  </div>
                  <small>
                    <span className="scd-tag role" style={{ background: tone[0], color: tone[1] }}>
                      {ROLE_NAMES[currentTeamMember.role] || currentTeamMember.role}
                    </span>
                    <span className="scd-meta-text">
                      {currentTeamMember.email}
                      {currentTeamMember.phone ? ` · ${currentTeamMember.phone}` : ''}
                    </span>
                  </small>
                </div>
                <div className="scd-thread-actions">
                  <button
                    type="button"
                    className="scd-btn danger icon"
                    onClick={() => setClearChat('team')}
                    title="Clear chat — delete messages and their pictures / files for good"
                    aria-label="Clear chat"
                  >
                    <Ic name="trash" size={15} />
                    <span>Clear</span>
                  </button>
                </div>
              </header>

              <div ref={threadMessagesRef} onScroll={handleThreadScroll} className="scd-messages">
                {historyControls}
                {renderMessages((m) => String(m.senderAdmin) === String(me?.id) || (m.sender === 'admin' && !m.senderAdmin && m.senderName === me?.name))}
                <div ref={scrollRef} />
              </div>
            </>
          );
        })()}

        {/* Nothing open */}
        {!hasSelection && (
          <div className="scd-empty">
            <div className="scd-empty-icon">
              <Ic name={activeTab === 'sellers' ? 'chat' : 'users'} size={30} />
            </div>
            <h3>{activeTab === 'sellers' ? 'Pick a conversation' : 'Message your team'}</h3>
            <p>
              {activeTab === 'sellers'
                ? 'Choose a merchant or guest on the left to read their messages and reply in real time.'
                : 'Choose an admin or staff member on the left to start a private internal chat.'}
            </p>
            {activeTab === 'sellers' && (
              <div className="scd-empty-stats">
                <div>
                  <b>{openCount}</b>
                  <small>Open</small>
                </div>
                <div>
                  <b>{totalSellerUnread}</b>
                  <small>Unread</small>
                </div>
                <div>
                  <b>{guestCount}</b>
                  <small>Guests</small>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Composer (shared by both kinds of chat) */}
        {hasSelection && (
          <div className="scd-composer-wrap">
            {replyingTo && (
              <div className="chat-replying-bar scd-replying">
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

            {file && (
              <div className="chat-attachment-preview-bar admin-preview-bar scd-preview">
                <div className="preview-file-box">
                  {filePreview ? (
                    <img src={filePreview} alt="Upload preview" className="preview-thumb" />
                  ) : (
                    <div className="preview-pdf-icon">
                      <Ic name="fileText" size={24} />
                      <span>PDF</span>
                    </div>
                  )}
                  <div className="preview-file-details">
                    <b className="preview-file-name">{file.name}</b>
                    <small className="muted-sm">
                      {(file.size / 1024).toFixed(1)} KB • {file.type.startsWith('image/') ? 'Image' : 'PDF'}
                    </small>
                  </div>
                </div>
                <button type="button" className="btn-remove-preview" onClick={removeFile} title="Remove">
                  <Ic name="x" size={16} />
                </button>
              </div>
            )}

            <form onSubmit={handleSend} className="scd-composer">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
                style={{ display: 'none' }}
              />
              <div className="scd-composer-box">
                <textarea
                  ref={textInputRef}
                  rows={1}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
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
                      : `Message ${threadName || (activeTab === 'sellers' ? 'merchant' : 'admin')}…`
                  }
                  disabled={sending}
                />
                <div className="scd-composer-bar">
                  <div className="scd-composer-tools">
                    <button
                      type="button"
                      className="scd-tool"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={sending}
                      title="Attach a photo or PDF (max 15 MB)"
                      aria-label="Attach file"
                    >
                      <Ic name="paperclip" size={18} />
                    </button>
                    <VoiceRecordButton
                      onTranscribed={(spokenText) => {
                        setText((prev) => (prev ? `${prev.trim()} ${spokenText}` : spokenText));
                        textInputRef.current?.focus();
                      }}
                      disabled={sending || uploading}
                    />
                    <AiRewriteBox
                      text={text}
                      onApply={(rewritten) => {
                        setText(rewritten);
                        textInputRef.current?.focus();
                      }}
                      onApplyAndSend={(rewritten) => {
                        handleSend(null, rewritten);
                      }}
                      disabled={sending || uploading}
                    />
                    <span className="scd-hint">
                      <kbd>Enter</kbd> to send · <kbd>Shift</kbd> + <kbd>Enter</kbd> new line
                    </span>
                  </div>
                  <button type="submit" className="scd-send" disabled={sending || (!text.trim() && !file)}>
                    {sending ? (
                      <>
                        <span className="scd-spinner light" />
                        <span>{uploading ? 'Uploading…' : 'Sending…'}</span>
                      </>
                    ) : (
                      <>
                        <Ic name="send" size={16} />
                        <span>Send</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}
      </section>

      {/* AUTO-REPLY SETTINGS */}
      {autoReplyModal && (
        <div className="admin-modal-overlay" onClick={() => setAutoReplyModal(false)}>
          <div className="admin-modal-box scd-modal" onClick={(e) => e.stopPropagation()}>
            <div className="scd-modal-head">
              <span className="scd-modal-icon">
                <Ic name="sparkle" size={18} />
              </span>
              <div>
                <h3>Auto-reply</h3>
                <p>Answer sellers and guests automatically while the desk is away.</p>
              </div>
              <button type="button" onClick={() => setAutoReplyModal(false)} className="scd-modal-close" aria-label="Close">
                <Ic name="x" size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveAutoReply} className="scd-modal-body">
              <div className="scd-setting">
                <div>
                  <b>Automatic response</b>
                  <small>Send the message below as soon as a new inquiry arrives.</small>
                </div>
                <Toggle on={autoReply.enabled} onChange={() => setAutoReply({ ...autoReply, enabled: !autoReply.enabled })} />
              </div>

              <div className="scd-setting">
                <div>
                  <b>Away / offline mode</b>
                  <small>Reply automatically while support is unavailable or off duty.</small>
                </div>
                <Toggle on={autoReply.awayMode} onChange={() => setAutoReply({ ...autoReply, awayMode: !autoReply.awayMode })} />
              </div>

              <label className="scd-field">
                <span>Message</span>
                <textarea
                  rows={4}
                  value={autoReply.message}
                  onChange={(e) => setAutoReply({ ...autoReply, message: e.target.value })}
                  placeholder="Type the auto-reply message…"
                  required
                />
              </label>

              <div className="scd-modal-actions">
                <button type="button" onClick={() => setAutoReplyModal(false)} className="scd-btn">
                  Cancel
                </button>
                <button type="submit" className="scd-btn primary" disabled={savingAutoReply}>
                  {savingAutoReply ? 'Saving…' : 'Save settings'}
                </button>
              </div>
            </form>
          </div>
        </div>
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

      {/* EDIT MESSAGE */}
      {editModal && (
        <div className="admin-modal-overlay" onClick={() => setEditModal(null)}>
          <div className="admin-modal-box scd-modal" onClick={(e) => e.stopPropagation()}>
            <div className="scd-modal-head">
              <span className="scd-modal-icon">
                <Ic name="edit" size={18} />
              </span>
              <div>
                <h3>Edit message</h3>
                <p>The change is shown to the other person straight away.</p>
              </div>
              <button type="button" onClick={() => setEditModal(null)} className="scd-modal-close" aria-label="Close">
                <Ic name="x" size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="scd-modal-body">
              <label className="scd-field">
                <span>Message</span>
                <textarea rows={4} value={editModal.text} onChange={(e) => setEditModal({ ...editModal, text: e.target.value })} required autoFocus />
              </label>
              <div className="scd-modal-actions">
                <button type="button" onClick={() => setEditModal(null)} className="scd-btn">
                  Cancel
                </button>
                <button type="submit" className="scd-btn primary" disabled={savingEdit || !editModal.text.trim()}>
                  {savingEdit ? 'Saving…' : 'Update message'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
