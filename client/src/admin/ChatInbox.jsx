import { useEffect, useState, useRef } from 'react';
import { api, fmtDay, compressImage } from '../api.js';
import { getSocket } from '../socket.js';
import Ic from '../components/Icons.jsx';
import ChatMessageBubble from '../components/ChatMessageBubble.jsx';

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
  const [sellerFilter, setSellerFilter] = useState('all'); // 'all' | 'sellers' | 'guests'

  // Seller Support State
  const [sellerConvos, setSellerConvos] = useState([]);
  const [selectedSellerId, setSelectedSellerId] = useState(null);

  // Team & Super Admin State
  const [teamMembers, setTeamMembers] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const [selectedTeamTarget, setSelectedTeamTarget] = useState(null);

  // Auto-Reply Settings State
  const [autoReply, setAutoReply] = useState({ enabled: false, message: 'Hello! Our support team is currently offline. We have received your inquiry and will respond as soon as possible.' });
  const [autoReplyModal, setAutoReplyModal] = useState(false);
  const [savingAutoReply, setSavingAutoReply] = useState(false);

  // Message Edit Modal State
  const [editModal, setEditModal] = useState(null); // { messageId, text }
  const [savingEdit, setSavingEdit] = useState(false);

  // Messages & Form State
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);
  const textInputRef = useRef(null);

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
        if (res) setAutoReply({ enabled: !!res.enabled, message: res.message || '' });
      })
      .catch(() => {});
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

  // Periodic Refresh (keeps active conversation & unread counts fresh)
  useEffect(() => {
    const interval = setInterval(() => {
      loadSellerConvos();
      loadTeamMembers();
      if (activeTab === 'sellers' && selectedSellerId) {
        loadSellerMessages(selectedSellerId, false);
      } else if (activeTab === 'team' && selectedTeamId) {
        loadTeamMessages(selectedTeamId, false);
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [activeTab, selectedSellerId, selectedTeamId]);

  // Load Messages for Selected Seller
  const loadSellerMessages = (cid, clearExisting = true) => {
    if (!cid) return;
    api(`/chat/admin/conversations/${cid}/messages`)
      .then((data) => {
        const msgList = Array.isArray(data) ? data : (data?.messages || []);
        setMessages(msgList);
        setSellerConvos((prev) =>
          Array.isArray(prev) ? prev.map((c) => (c._id === cid ? { ...c, unreadForAdmin: 0 } : c)) : []
        );
      })
      .catch((e) => console.error('Load seller messages error:', e));
  };

  // Load Messages for Selected Team Member
  const loadTeamMessages = (targetAdminId, clearExisting = true) => {
    if (!targetAdminId) return;
    api(`/chat/admin/team/${targetAdminId}/messages`)
      .then((data) => {
        const msgList = Array.isArray(data?.messages) ? data.messages : [];
        setMessages(msgList);
        if (data?.targetAdmin) setSelectedTeamTarget(data.targetAdmin);
        setTeamMembers((prev) =>
          Array.isArray(prev) ? prev.map((t) => (t._id === targetAdminId ? { ...t, unreadCount: 0 } : t)) : []
        );
      })
      .catch((e) => console.error('Load team messages error:', e));
  };

  // Switch Selected Seller
  useEffect(() => {
    if (activeTab === 'sellers' && selectedSellerId) {
      loadSellerMessages(selectedSellerId);
    }
  }, [activeTab, selectedSellerId]);

  // Switch Selected Team Member
  useEffect(() => {
    if (activeTab === 'team' && selectedTeamId) {
      loadTeamMessages(selectedTeamId);
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
        setMessages((prev) => {
          if (!Array.isArray(prev)) return [msg];
          if (prev.some((m) => m?._id === msg?._id)) return prev;
          return [...prev, msg];
        });
        api(`/chat/admin/conversations/${selectedSellerId}/read`, { method: 'POST' }).catch(() => {});
      }
      loadSellerConvos();
    };

    const onNewTeamMsg = (msg) => {
      if (!msg) return;
      if (activeTab === 'team') {
        const isCurrentThread = String(msg.senderAdmin) === String(selectedTeamId) || (msg.senderAdmin === me?.id && selectedTeamId);
        if (isCurrentThread) {
          setMessages((prev) => {
            if (!Array.isArray(prev)) return [msg];
            if (prev.some((m) => m?._id === msg?._id)) return prev;
            return [...prev, msg];
          });
          if (selectedTeamId) {
            api(`/chat/admin/team/${selectedTeamId}/read`, { method: 'POST' }).catch(() => {});
          }
        }
      }
      loadTeamMembers();
    };

    const onMessageEdit = ({ messageId, text, isEdited, editedAt }) => {
      setMessages((prev) =>
        prev.map((m) => (m._id === messageId ? { ...m, text, isEdited: true, editedAt } : m))
      );
    };

    const onMessageDelete = ({ messageId }) => {
      setMessages((prev) =>
        prev.map((m) => (m._id === messageId ? { ...m, isDeleted: true, text: '' } : m))
      );
    };

    const onMessagesSeen = ({ conversationId, seenAt }) => {
      setMessages((prev) =>
        Array.isArray(prev)
          ? prev.map((m) =>
              (m.sender === 'admin' || m.sender === 'staff') &&
              (!conversationId || !m.conversation || String(m.conversation) === String(conversationId) || String(m.conversation?._id) === String(conversationId))
                ? { ...m, isSeen: true, seenAt: seenAt || new Date() }
                : m
            )
          : prev
      );
    };

    if (socket) {
      socket.on('message:new', onNewSellerMsg);
      socket.on('admin:message:new', onNewTeamMsg);
      socket.on('message:edit', onMessageEdit);
      socket.on('message:delete', onMessageDelete);
      socket.on('messages:seen', onMessagesSeen);
    }
    return () => {
      if (socket) {
        socket.off('message:new', onNewSellerMsg);
        socket.off('admin:message:new', onNewTeamMsg);
        socket.off('message:edit', onMessageEdit);
        socket.off('message:delete', onMessageDelete);
        socket.off('messages:seen', onMessagesSeen);
      }
    };
  }, [activeTab, selectedSellerId, selectedTeamId, me]);

  // Auto-scroll on new messages
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
  const handleSend = async (e) => {
    e.preventDefault();
    const clean = text.trim();
    if (!clean && !file) return;

    if (activeTab === 'sellers' && !selectedSellerId) return;
    if (activeTab === 'team' && !selectedTeamId) return;

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
        await api(`/chat/admin/conversations/${selectedSellerId}/reply`, {
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
        loadSellerMessages(selectedSellerId);
        loadSellerConvos();
      } else {
        // Send to Team Member Direct Thread
        await api(`/chat/admin/team/${selectedTeamId}/send`, {
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
        loadTeamMessages(selectedTeamId);
        loadTeamMembers();
      }
    } catch (err) {
      setText(clean);
      alert('Failed to send message: ' + err.message);
    } finally {
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
        body: autoReply,
      });
      setAutoReply({ enabled: !!res.enabled, message: res.message });
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
      const updated = await api(`/chat/messages/${editModal.messageId}`, {
        method: 'PUT',
        body: { text: editModal.text.trim() },
      });
      setMessages((prev) =>
        prev.map((m) => (m._id === editModal.messageId ? { ...m, text: updated.text, isEdited: true, editedAt: updated.editedAt } : m))
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
      setMessages((prev) =>
        prev.map((m) => (m._id === msg._id ? { ...m, isDeleted: true, text: '' } : m))
      );
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

  return (
    <div className={`admin-chat-layout ${hasSelection ? 'mobile-thread-view' : 'mobile-list-view'}`}>
      {/* SIDEBAR */}
      <div className="admin-chat-sidebar">
        <div className="admin-chat-sidebar-head">
          {/* Segmented Tab Switcher */}
          <div className="admin-chat-tabs">
            <button
              type="button"
              className={`admin-chat-tab-btn ${activeTab === 'sellers' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('sellers');
                setQ('');
              }}
            >
              <span>🏬 Inquiries</span>
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
              <span>👥 Team &amp; Admins</span>
              {totalTeamUnread > 0 && <span className="tab-badge">{totalTeamUnread}</span>}
            </button>
          </div>

          {/* Auto-Reply Status Pill & Settings Trigger */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '8px 0', padding: '0 4px' }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: '#64748b' }}>Support Automation:</span>
            <button
              type="button"
              onClick={() => setAutoReplyModal(true)}
              style={{
                background: autoReply.enabled ? '#ecfdf5' : '#f1f5f9',
                color: autoReply.enabled ? '#065f46' : '#64748b',
                border: `1px solid ${autoReply.enabled ? '#a7f3d0' : '#cbd5e1'}`,
                borderRadius: 14,
                padding: '3px 10px',
                fontSize: 11.5,
                fontWeight: 800,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <span>🤖 Auto-Reply:</span>
              <b>{autoReply.enabled ? 'ON' : 'OFF'}</b>
              <span>⚙️</span>
            </button>
          </div>

          {/* Guest vs Seller sub-filters */}
          {activeTab === 'sellers' && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 8, padding: '0 4px' }}>
              <button
                type="button"
                onClick={() => setSellerFilter('all')}
                style={{
                  flex: 1,
                  padding: '4px 8px',
                  borderRadius: 6,
                  border: 'none',
                  fontSize: 11.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: sellerFilter === 'all' ? '#0f172a' : '#f1f5f9',
                  color: sellerFilter === 'all' ? '#fff' : '#64748b',
                }}
              >
                All ({sellerConvos.length})
              </button>
              <button
                type="button"
                onClick={() => setSellerFilter('sellers')}
                style={{
                  flex: 1,
                  padding: '4px 8px',
                  borderRadius: 6,
                  border: 'none',
                  fontSize: 11.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: sellerFilter === 'sellers' ? '#0f172a' : '#f1f5f9',
                  color: sellerFilter === 'sellers' ? '#fff' : '#64748b',
                }}
              >
                Merchants ({sellerConvos.filter((c) => !c.isGuest && c.type !== 'guest').length})
              </button>
              <button
                type="button"
                onClick={() => setSellerFilter('guests')}
                style={{
                  flex: 1,
                  padding: '4px 8px',
                  borderRadius: 6,
                  border: 'none',
                  fontSize: 11.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: sellerFilter === 'guests' ? '#0284c7' : '#f1f5f9',
                  color: sellerFilter === 'guests' ? '#fff' : '#64748b',
                }}
              >
                Guests ({sellerConvos.filter((c) => c.isGuest || c.type === 'guest').length})
              </button>
            </div>
          )}

          {/* Search Box */}
          <div className="admin-search-box search-field-sm">
            <Ic name="search" size={15} />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={activeTab === 'sellers' ? 'Search store or subject...' : 'Search team members or role...'}
            />
            {q && (
              <button type="button" onClick={() => setQ('')} className="btn-clear-search">
                ✕
              </button>
            )}
          </div>
        </div>

        {/* CONVERSATION LIST */}
        <div className="admin-convos-list">
          {loading && <div className="p-4 text-center muted">Loading conversations...</div>}

          {/* 1. SELLER SUPPORT INBOX */}
          {activeTab === 'sellers' && (
            <>
              {!loading && filteredSellerConvos.length === 0 && (
                <div className="p-6 text-center muted">No conversations found matching filter.</div>
              )}
              {filteredSellerConvos.map((c) => {
                const isSelected = c._id === selectedSellerId;
                const unreadCount = c.unreadForAdmin || 0;
                const hasUnread = unreadCount > 0;
                const isGuestConvo = c.isGuest || c.type === 'guest';
                const storeTitle = c.storeName || c.seller?.storeName || (isGuestConvo ? 'Guest Visitor' : 'Unknown Store');

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
                    <div className="convo-avatar" style={{ background: isGuestConvo ? '#e0f2fe' : '#fef3c7', color: isGuestConvo ? '#0369a1' : '#b45309' }}>
                      <span>{isGuestConvo ? '👤' : (storeTitle[0] || 'S').toUpperCase()}</span>
                      {hasUnread && <span className="avatar-unread-dot" />}
                    </div>
                    <div className="convo-body">
                      <div className="convo-top">
                        <div className="convo-title-box">
                          <b className="convo-name">{storeTitle}</b>
                          {isGuestConvo ? (
                            <span style={{ fontSize: 10.5, fontWeight: 800, background: '#e0f2fe', color: '#0369a1', padding: '1px 6px', borderRadius: 4 }}>
                              GUEST
                            </span>
                          ) : (
                            <span style={{ fontSize: 10.5, fontWeight: 800, background: '#fef3c7', color: '#b45309', padding: '1px 6px', borderRadius: 4 }}>
                              SELLER
                            </span>
                          )}
                          {hasUnread && (
                            <span className="seller-unread-pill-label" title={`${unreadCount} unread message(s)`}>
                              {unreadCount} NEW
                            </span>
                          )}
                        </div>
                        <small className="convo-time">{c.lastAt ? fmtDay(c.lastAt) : ''}</small>
                      </div>
                      <div className="convo-sub">
                        <span className={`convo-last-msg ${hasUnread ? 'convo-last-msg-bold' : ''}`}>
                          {c.lastMessage || 'No messages yet'}
                        </span>
                        {hasUnread && (
                          <span className="convo-unread-bubble-count">{unreadCount}</span>
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
              {!loading && filteredTeamMembers.length === 0 && (
                <div className="p-6 text-center muted">No team members found.</div>
              )}
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
                    <div className={`convo-avatar ${isSuper ? 'admin-avatar-super' : 'admin-avatar-team'}`}>
                      <span>{(t.name?.[0] || 'A').toUpperCase()}</span>
                      {hasUnread && <span className="avatar-unread-dot" />}
                    </div>
                    <div className="convo-body">
                      <div className="convo-top">
                        <div className="convo-title-box">
                          <b className="convo-name">{t.name}</b>
                          <span className={`admin-role-badge-sm role-${t.role}`}>
                            {ROLE_LABELS[t.role] || t.role}
                          </span>
                        </div>
                        <small className="convo-time">{t.lastAt ? fmtDay(t.lastAt) : ''}</small>
                      </div>
                      <div className="convo-sub">
                        <span className={`convo-last-msg ${hasUnread ? 'convo-last-msg-bold' : ''}`}>
                          {t.lastMessage || 'Click to start conversation'}
                        </span>
                        {hasUnread && (
                          <span className="seller-unread-pill-label">{unreadCount} NEW</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>

      {/* CHAT THREAD AREA */}
      <div className="admin-chat-thread">
        {/* 1. SELLER SUPPORT THREAD */}
        {activeTab === 'sellers' && selectedSellerConv && (
          <>
            <div className="admin-thread-head">
              <div className="ath-left">
                <button
                  type="button"
                  className="mobile-back-btn"
                  onClick={() => setSelectedSellerId(null)}
                  title="Back to seller list"
                >
                  <Ic name="arrowLeft" size={18} />
                </button>
                <div className="ath-info">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <b className="ath-name">{selectedSellerConv.storeName || selectedSellerConv.seller?.storeName || (selectedSellerConv.isGuest ? 'Guest Support' : 'Support Thread')}</b>
                    {selectedSellerConv.isGuest || selectedSellerConv.type === 'guest' ? (
                      <span style={{ fontSize: 11, fontWeight: 800, background: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: 4 }}>
                        👤 Guest Inquiry (Pre-Login)
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, fontWeight: 800, background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: 4 }}>
                        🏪 Registered Merchant
                      </span>
                    )}
                  </div>
                  <div className="ath-meta">
                    <span>{selectedSellerConv.isGuest ? `Guest ID: ${selectedSellerConv.guestId || 'Unregistered'}` : `Owner: ${selectedSellerConv.sellerName || selectedSellerConv.seller?.ownerName || 'Merchant'}`}</span>
                    <span>•</span>
                    <span>{selectedSellerConv.sellerEmail || selectedSellerConv.seller?.email || 'Live Channel'}</span>
                  </div>
                </div>
              </div>

              <div className="ath-actions">
                <button
                  type="button"
                  className={`btn-status-toggle ${selectedSellerConv.status === 'resolved' ? 'status-resolved' : 'status-open'}`}
                  onClick={handleToggleResolve}
                >
                  {selectedSellerConv.status === 'resolved' ? '✅ Resolved (Reopen)' : 'Mark as Resolved'}
                </button>
              </div>
            </div>

            <div className="admin-thread-messages">
              {messages.map((m) => {
                const isAdmin = m.sender === 'admin' || m.sender === 'staff';
                return (
                  <ChatMessageBubble
                    key={m._id}
                    msg={m}
                    isMe={isAdmin}
                    myRole="admin"
                    onReply={handleStartReply}
                    onEdit={handleStartEdit}
                    onDelete={handleDeleteMessage}
                  />
                );
              })}
              <div ref={scrollRef} />
            </div>
          </>
        )}

        {/* 2. TEAM & SUPER ADMIN DIRECT THREAD */}
        {activeTab === 'team' && currentTeamMember && (
          <>
            <div className="admin-thread-head">
              <div className="ath-left">
                <button
                  type="button"
                  className="mobile-back-btn"
                  onClick={() => setSelectedTeamId(null)}
                  title="Back to team list"
                >
                  <Ic name="arrowLeft" size={18} />
                </button>
                <div className="ath-info">
                  <div className="flex items-center gap-2">
                    <b className="ath-name">{currentTeamMember.name}</b>
                    <span className={`admin-role-badge-sm role-${currentTeamMember.role}`}>
                      {ROLE_LABELS[currentTeamMember.role] || currentTeamMember.role}
                    </span>
                  </div>
                  <div className="ath-meta">
                    <span>{currentTeamMember.email}</span>
                    {currentTeamMember.phone && (
                      <>
                        <span>•</span>
                        <span>{currentTeamMember.phone}</span>
                      </>
                    )}
                    <span>•</span>
                    <span style={{ color: '#16a34a', fontWeight: 600 }}>● Internal Team Channel</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="admin-thread-messages">
              {messages.map((m) => {
                const isMe = String(m.senderAdmin) === String(me?.id) || (m.sender === 'admin' && !m.senderAdmin && m.senderName === me?.name);
                return (
                  <ChatMessageBubble
                    key={m._id}
                    msg={m}
                    isMe={isMe}
                    myRole="admin"
                    onReply={handleStartReply}
                    onEdit={handleStartEdit}
                    onDelete={handleDeleteMessage}
                  />
                );
              })}
              <div ref={scrollRef} />
            </div>
          </>
        )}

        {/* EMPTY STATE */}
        {!hasSelection && (
          <div className="admin-chat-empty">
            <div className="empty-icon">
              <Ic name={activeTab === 'sellers' ? 'chat' : 'user'} size={40} />
            </div>
            <h3>{activeTab === 'sellers' ? 'Select an Inquiry' : 'Select a Team Member or Super Admin'}</h3>
            <p>
              {activeTab === 'sellers'
                ? 'Select a registered merchant or guest visitor to review inquiries and provide real-time vendor assistance.'
                : 'Select an administrator, super admin, or staff member to begin direct internal team messaging.'}
            </p>
          </div>
        )}

        {/* SHARED INPUT & REPLY FORM (WITH MULTILINE AUTO-EXPANDING TEXTAREA) */}
        {hasSelection && (
          <>
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

            {/* Input Bar with Multiline Auto-Expanding Textarea (4-5 lines visible) */}
            <form onSubmit={handleSend} className="admin-reply-bar" style={{ alignItems: 'flex-end' }}>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
                style={{ display: 'none' }}
              />
              <button
                type="button"
                className="chat-attach-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={sending}
                title="Attach photo or PDF document"
                style={{ marginBottom: 8 }}
              >
                <Ic name="paperclip" size={20} stroke={2} />
              </button>
              <textarea
                ref={textInputRef}
                rows={3}
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
                    ? 'Add a caption...'
                    : replyingTo
                    ? `Reply to ${replyingTo.senderName || 'message'}... (Enter to send, Shift+Enter for new line)`
                    : activeTab === 'sellers'
                    ? `Message ${selectedSellerConv?.seller?.storeName || selectedSellerConv?.storeName || 'Merchant'}... (Enter to send, Shift+Enter for new line)`
                    : `Message ${currentTeamMember?.name || 'Admin'}... (Enter to send, Shift+Enter for new line)`
                }
                disabled={sending}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: '1px solid #cbd5e1',
                  resize: 'vertical',
                  minHeight: 65,
                  maxHeight: 160,
                  fontFamily: 'inherit',
                  fontSize: 13.5,
                  lineHeight: 1.45,
                }}
              />
              <button
                type="submit"
                className="btn-primary"
                disabled={sending || (!text.trim() && !file)}
                style={{ height: 42, marginBottom: 4, display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                {sending ? (uploading ? 'Uploading...' : 'Sending...') : <><Ic name="send" size={16} /> Send</>}
              </button>
            </form>
          </>
        )}
      </div>

      {/* AUTO-REPLY SETTINGS MODAL */}
      {autoReplyModal && (
        <div className="admin-modal-overlay" onClick={() => setAutoReplyModal(false)}>
          <div className="admin-modal-box" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-top">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 24 }}>🤖</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16 }}>Live Support Auto-Reply Settings</h3>
                  <p className="muted" style={{ margin: '2px 0 0', fontSize: 12 }}>
                    Automatically reply to sellers &amp; guests when admin support is away
                  </p>
                </div>
              </div>
              <button onClick={() => setAutoReplyModal(false)} className="btn-close-modal">✕</button>
            </div>

            <form onSubmit={handleSaveAutoReply} style={{ padding: '18px 22px' }}>
              <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc', padding: '12px 16px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                <div>
                  <b style={{ fontSize: 13.5, display: 'block' }}>Enable Automatic Response</b>
                  <small style={{ color: '#64748b', fontSize: 12 }}>Send instant canned response on new incoming inquiries</small>
                </div>
                <input
                  type="checkbox"
                  checked={autoReply.enabled}
                  onChange={(e) => setAutoReply({ ...autoReply, enabled: e.target.checked })}
                  style={{ width: 20, height: 20, cursor: 'pointer' }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12.5, fontWeight: 700, display: 'block', marginBottom: 6 }}>
                  Auto-Reply Message Text:
                </label>
                <textarea
                  rows={4}
                  value={autoReply.message}
                  onChange={(e) => setAutoReply({ ...autoReply, message: e.target.value })}
                  placeholder="Type auto-reply message..."
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, fontFamily: 'inherit' }}
                  required
                />
              </div>

              <div className="modal-bottom-actions">
                <button type="button" onClick={() => setAutoReplyModal(false)} className="btn-cancel">Cancel</button>
                <button type="submit" className="btn-primary" disabled={savingAutoReply}>
                  {savingAutoReply ? 'Saving...' : '💾 Save Auto-Reply Settings'}
                </button>
              </div>
            </form>
          </div>
        </div>
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
