'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/components/AuthProvider';
import VoiceRecorder from '@/components/VoiceRecorder';
import AudioPlayer from '@/components/AudioPlayer';
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
} from 'lucide-react';

export default function ChatPage() {
  const { user } = useAuth();

  // Unified Active Chat State:
  // { type: 'group' } OR { type: 'personal', contact: contactObject }
  const [activeChat, setActiveChat] = useState({ type: 'group' });
  const [contacts, setContacts] = useState([]);
  const [groupMeta, setGroupMeta] = useState({ unreadCount: 0, lastMessage: null });

  // Mobile View Flow (WhatsApp Style): 'list' (shows all chats) or 'chat' (inside active conversation)
  const [mobileView, setMobileView] = useState('list');

  // Messages in current chat
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
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

  const isAdmin = user?.role === 'admin';

  // ─── 1. Fetch Contacts & Group Metadata ───
  const fetchContacts = async () => {
    try {
      const token = localStorage.getItem('portal_token');
      const res = await fetch('/api/chat/contacts', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setContacts(data.contacts || []);
        setGroupMeta(data.group || { unreadCount: 0, lastMessage: null });
      }
    } catch (err) {
      console.error('Fetch chat contacts error:', err);
    }
  };

  useEffect(() => {
    fetchContacts();
    const interval = setInterval(fetchContacts, 4000);
    return () => clearInterval(interval);
  }, []);

  // ─── 2. Fetch Messages for Current Active Chat ───
  const fetchMessages = async (quiet = false) => {
    try {
      if (!quiet) setLoadingMessages(true);
      const token = localStorage.getItem('portal_token');

      let url = `/api/chat?chatType=${activeChat.type}`;
      if (activeChat.type === 'personal') {
        if (!activeChat.contact?._id) return;
        url += `&targetMemberId=${activeChat.contact._id}`;
      }

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        const incoming = data.messages || [];

        // Check if new messages arrived while user was scrolled up
        if (prevMessagesLengthRef.current > 0 && incoming.length > prevMessagesLengthRef.current) {
          const diff = incoming.length - prevMessagesLengthRef.current;
          if (showScrollBottom) {
            setUnreadWhileScrolled((prev) => prev + diff);
          }
          const latest = incoming[incoming.length - 1];
          if (latest && latest.senderId !== user?._id) {
            setHighlightedMsgId(latest._id);
            setTimeout(() => setHighlightedMsgId(null), 4000);
          }
        }

        prevMessagesLengthRef.current = incoming.length;
        setMessages(incoming);
      }
    } catch (err) {
      console.error('Failed to load chat messages:', err);
    } finally {
      if (!quiet) setLoadingMessages(false);
    }
  };

  // Immediate message fetch when activeChat changes, plus auto-polling every 2.5 seconds
  useEffect(() => {
    setMessages([]);
    prevMessagesLengthRef.current = 0;
    setUnreadWhileScrolled(0);
    fetchMessages(false);

    const interval = setInterval(() => {
      fetchMessages(true);
    }, 2500);

    return () => clearInterval(interval);
  }, [activeChat.type, activeChat.contact?._id]);

  // Auto-scroll on initial load or when at bottom
  useEffect(() => {
    if (!showScrollBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, showScrollBottom]);

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

  // ─── 3. Send Message ───
  const handleSendMessage = async (payload) => {
    try {
      const token = localStorage.getItem('portal_token');
      const body = {
        chatType: activeChat.type,
        targetMemberId: activeChat.type === 'personal' ? activeChat.contact?._id : null,
        ...payload,
      };

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
        setMessages((prev) => [...prev, data.chatMessage]);
        fetchContacts();
        scrollToBottom();
      }
    } catch (err) {
      console.error('Send message failed:', err);
    }
  };

  const handleTextSubmit = (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    handleSendMessage({
      messageType: 'text',
      text: inputText.trim(),
    });
    setInputText('');
  };

  const handleSendVoice = (audioBase64, durationSec) => {
    handleSendMessage({
      messageType: 'voice',
      mediaUrl: audioBase64,
      audioDuration: durationSec,
    });
    setIsRecordingVoice(false);
  };

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 8 * 1024 * 1024) {
      alert('Image size exceeds 8MB limit');
      return;
    }

    setUploadingImage(true);
    const reader = new FileReader();
    reader.onloadend = () => {
      handleSendMessage({
        messageType: 'image',
        mediaUrl: reader.result,
        text: file.name,
      });
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsDataURL(file);
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
  const getDayLabel = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
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
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const distinctDays = Array.from(
    new Set(messages.map((m) => getDayLabel(m.createdAt)))
  ).filter(Boolean);

  const jumpToDate = (dayLabel) => {
    setIsDatePickerOpen(false);
    const el = document.getElementById(`day-divider-${dayLabel.replace(/\s+/g, '-')}`);
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
            onClick={() => {
              setActiveChat({ type: 'group' });
              setMobileView('chat');
            }}
            className={`w-full p-3.5 flex items-start space-x-3 text-left transition-all ${
              activeChat.type === 'group'
                ? 'bg-emerald-50/90 border-l-4 border-emerald-600'
                : 'hover:bg-slate-50'
            }`}
          >
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shrink-0 shadow-sm">
              <Users className="w-6 h-6" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 truncate">
                  Team General Discussion
                </span>
                {groupMeta.lastMessage && (
                  <span className="text-[10px] text-slate-400 shrink-0 ml-1">
                    {formatMessageTime(groupMeta.lastMessage.createdAt)}
                  </span>
                )}
              </div>

              <p className="text-[11px] text-slate-500 truncate mt-0.5">
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

              <div className="flex items-center space-x-1.5 mt-1">
                <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-bold uppercase">
                  All Team
                </span>
                {groupMeta.unreadCount > 0 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-600 text-white font-bold ml-auto shadow-xs">
                    {groupMeta.unreadCount}
                  </span>
                )}
              </div>
            </div>
          </button>

          {/* Section Divider: Direct 1-on-1 Messages */}
          <div className="px-4 py-2 bg-slate-100/70 text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between">
            <span>Direct Messages (Admins & Members)</span>
            <span className="text-[9px] lowercase font-normal text-slate-400">1-on-1</span>
          </div>

          {/* ── 2. Direct Contacts (Admins & Members alike) ── */}
          {filteredContacts.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400">
              No contacts available
            </div>
          ) : (
            filteredContacts.map((contact) => {
              const isSelected =
                activeChat.type === 'personal' && activeChat.contact?._id === contact._id;
              const isContactAdmin = contact.role === 'admin';

              return (
                <button
                  key={contact._id}
                  onClick={() => {
                    setActiveChat({ type: 'personal', contact });
                    setMobileView('chat');
                  }}
                  className={`w-full p-3.5 flex items-start space-x-3 text-left transition-all ${
                    isSelected
                      ? 'bg-purple-50/90 border-l-4 border-purple-600'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  <div
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-base shrink-0 shadow-sm ${
                      isContactAdmin
                        ? 'bg-gradient-to-tr from-purple-600 to-indigo-600 text-white'
                        : 'bg-gradient-to-tr from-slate-700 to-slate-800 text-white'
                    }`}
                  >
                    {isContactAdmin ? (
                      <Shield className="w-5 h-5" />
                    ) : (
                      contact.name.charAt(0).toUpperCase()
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900 truncate">
                        {contact.name}
                      </span>
                      {contact.lastMessage && (
                        <span className="text-[10px] text-slate-400 shrink-0 ml-1">
                          {formatMessageTime(contact.lastMessage.createdAt)}
                        </span>
                      )}
                    </div>

                    <p className="text-[11px] text-slate-500 truncate mt-0.5">
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

                    <div className="flex items-center space-x-1.5 mt-1">
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded-md font-bold uppercase ${
                          isContactAdmin
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {isContactAdmin ? 'Admin' : 'Member'}
                      </span>
                      <span className="text-[10px] text-slate-400">@{contact.username}</span>

                      {contact.unreadCount > 0 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-600 text-white font-bold ml-auto shadow-xs">
                          {contact.unreadCount}
                        </span>
                      )}
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
      <div
        className={`flex-1 flex flex-col bg-slate-50/60 min-w-0 relative ${
          mobileView === 'list' ? 'hidden md:flex' : 'flex'
        }`}
      >
        {/* Chat Room Top Bar */}
        <div className="bg-slate-900 text-white px-4 py-3 sm:px-6 flex items-center justify-between shrink-0 z-20">
          <div className="flex items-center space-x-3 min-w-0">
            {/* Back Button on Mobile (Returns to Chats List) */}
            <button
              onClick={() => setMobileView('list')}
              className="md:hidden p-1.5 -ml-1 text-slate-300 hover:text-white rounded-xl hover:bg-slate-800 transition"
              title="Back to all chats"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            {/* Avatar */}
            <div
              className={`w-9 h-9 rounded-2xl flex items-center justify-center font-bold text-white shrink-0 ${
                activeChat.type === 'group'
                  ? 'bg-gradient-to-tr from-emerald-600 to-teal-500'
                  : activeChat.contact?.role === 'admin'
                  ? 'bg-gradient-to-tr from-purple-600 to-indigo-600'
                  : 'bg-gradient-to-tr from-slate-700 to-slate-800'
              }`}
            >
              {activeChat.type === 'group' ? (
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
                  {activeChat.type === 'group'
                    ? 'Team General Discussion'
                    : activeChat.contact
                    ? activeChat.contact.name
                    : 'Direct Chat'}
                </h2>
                <span
                  className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider shrink-0 ${
                    activeChat.type === 'group'
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : activeChat.contact?.role === 'admin'
                      ? 'bg-purple-500/20 text-purple-300'
                      : 'bg-emerald-500/20 text-emerald-300'
                  }`}
                >
                  {activeChat.type === 'group'
                    ? 'Public'
                    : activeChat.contact?.role === 'admin'
                    ? 'Admin'
                    : 'Member'}
                </span>
              </div>
              <p className="text-[10px] text-slate-400 truncate">
                {activeChat.type === 'group'
                  ? 'All admins and members can view & reply here'
                  : activeChat.contact
                  ? `Private 1-on-1 line (@${activeChat.contact.username})`
                  : 'Secure 1-on-1 line'}
              </p>
            </div>
          </div>

          {/* Right Header Controls: Jump to Date */}
          <div className="relative">
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
                        key={day}
                        onClick={() => jumpToDate(day)}
                        className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-slate-800 hover:text-white rounded-xl transition flex items-center justify-between"
                      >
                        <span>{day}</span>
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
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
              <div className="w-12 h-12 rounded-2xl bg-slate-200/80 text-slate-600 flex items-center justify-center mb-2">
                <MessageSquare className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-slate-700">
                {activeChat.type === 'group'
                  ? 'No messages in group yet'
                  : `Start conversation with ${activeChat.contact?.name || 'user'}`}
              </p>
              <p className="text-xs text-slate-400 max-w-xs mt-1">
                Type a text, record a voice note, or attach a picture to begin.
              </p>
            </div>
          ) : (
            messages.map((msg, index) => {
              const isMe = msg.senderId === user?._id;
              const isSystemBonus = msg.messageType === 'system_bonus';
              const isSystemAlert = msg.messageType === 'system_alert';
              const isHighlighted = highlightedMsgId === msg._id;

              // Day divider check
              const currentDay = getDayLabel(msg.createdAt);
              const prevDay = index > 0 ? getDayLabel(messages[index - 1].createdAt) : null;
              const isNewDay = currentDay !== prevDay;

              // Seen by users
              const seenUsers = (msg.readBy || []).filter(
                (reader) => reader._id !== msg.senderId && reader._id !== user?._id
              );

              // Admin or sender can edit/delete
              const canModify = (isAdmin || isMe) && !msg.isDeleted;

              return (
                <React.Fragment key={msg._id}>
                  {/* WhatsApp-Style Sticky Day Divider */}
                  {isNewDay && (
                    <div
                      id={`day-divider-${currentDay.replace(/\s+/g, '-')}`}
                      className="flex justify-center my-4 sticky top-1 z-10"
                    >
                      <span className="px-3.5 py-1 bg-white/95 backdrop-blur border border-slate-200 text-slate-600 text-[11px] font-bold rounded-full shadow-xs uppercase tracking-wider">
                        {currentDay}
                      </span>
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
                              {msg.messageType === 'voice' && (
                                <AudioPlayer
                                  src={msg.mediaUrl}
                                  duration={msg.audioDuration}
                                  isOutgoing={isMe}
                                />
                              )}

                              {/* Image Attachment */}
                              {msg.messageType === 'image' && (
                                <div className="space-y-1">
                                  <img
                                    src={msg.mediaUrl}
                                    alt="Shared image"
                                    className="max-h-72 w-auto rounded-2xl object-cover border border-black/10 cursor-pointer hover:opacity-95 transition"
                                    onClick={() => window.open(msg.mediaUrl, '_blank')}
                                  />
                                  {msg.text && (
                                    <p className="text-xs mt-1 opacity-90 break-words">
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
                            <span>{formatMessageTime(msg.createdAt)}</span>
                            {isMe && <CheckCheck className="w-3.5 h-3.5 inline" />}
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
          {isRecordingVoice ? (
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
                onChange={handleImageUpload}
              />

              {/* Photo Button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingImage}
                className="p-2.5 rounded-2xl text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 transition active:scale-95 shrink-0"
                title="Attach Picture"
              >
                <ImageIcon className="w-5 h-5" />
              </button>

              {/* Voice Button */}
              <button
                type="button"
                onClick={() => setIsRecordingVoice(true)}
                className="p-2.5 rounded-2xl text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 transition active:scale-95 shrink-0"
                title="Record Voice Note"
              >
                <Mic className="w-5 h-5" />
              </button>

              {/* Text Input */}
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={
                  activeChat.type === 'group'
                    ? 'Message the team group...'
                    : `Message ${activeChat.contact?.name || 'privately'}...`
                }
                className="flex-1 min-w-0 px-4 py-2.5 bg-slate-100 border border-slate-200 rounded-2xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition"
              />

              {/* Send Button */}
              <button
                type="submit"
                disabled={!inputText.trim()}
                className="p-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white transition active:scale-95 shadow-md shadow-emerald-500/20 shrink-0"
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
    </div>
  );
}
