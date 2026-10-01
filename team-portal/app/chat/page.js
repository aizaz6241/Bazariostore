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
  Loader2,
  Download,
  ZoomIn,
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
  const [pendingImagePreview, setPendingImagePreview] = useState(null); // { file, previewUrl, caption: '' }
  const [fullscreenImage, setFullscreenImage] = useState(null); // Image URL for lightbox viewer
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
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(errData.message || 'Failed to send message');
      }
    } catch (err) {
      console.error('Send message failed:', err);
      alert('Network error while sending message. Please try again.');
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
                      : 'bg-slate-500/20 text-slate-300'
                  }`}
                >
                  {activeChat.type === 'group'
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
                                <div className="space-y-1.5 my-1">
                                  <div
                                    className="relative rounded-2xl overflow-hidden cursor-pointer group/img max-w-xs sm:max-w-sm bg-black/5"
                                    onClick={() => setFullscreenImage(msg.mediaUrl)}
                                    title="Click to view full photo"
                                  >
                                    <img
                                      src={msg.mediaUrl}
                                      alt="Shared photo"
                                      className="max-h-72 w-auto object-contain rounded-2xl border border-black/10 group-hover/img:scale-[1.01] transition duration-200 mx-auto"
                                      loading="lazy"
                                    />
                                    <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/30 transition flex items-center justify-center opacity-0 group-hover/img:opacity-100">
                                      <span className="px-3 py-1.5 rounded-xl bg-black/75 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-md backdrop-blur-xs">
                                        <ZoomIn className="w-4 h-4" />
                                        <span>Click to View</span>
                                      </span>
                                    </div>
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
                onChange={handleImageFileSelect}
              />

              {/* Photo Button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingImage}
                className="p-2.5 rounded-2xl text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 transition active:scale-95 shrink-0 disabled:opacity-50"
                title="Attach Picture"
              >
                {uploadingImage ? (
                  <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
                ) : (
                  <ImageIcon className="w-5 h-5" />
                )}
              </button>

              {/* Voice Button */}
              <button
                type="button"
                onClick={() => setIsRecordingVoice(true)}
                disabled={uploadingImage}
                className="p-2.5 rounded-2xl text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 transition active:scale-95 shrink-0 disabled:opacity-50"
                title="Record Voice Note"
              >
                <Mic className="w-5 h-5" />
              </button>

              {/* Text Input */}
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onPaste={handlePasteEvent}
                disabled={uploadingImage}
                placeholder={
                  uploadingImage
                    ? 'Processing picture...'
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
                    {activeChat.type === 'group'
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
            <div className="flex items-center space-x-3">
              <a
                href={fullscreenImage}
                download={`chat-photo-${Date.now()}.jpg`}
                target="_blank"
                rel="noreferrer"
                className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition flex items-center space-x-1.5 text-xs font-semibold shadow-sm"
                title="Download / Save Photo"
              >
                <Download className="w-4 h-4" />
                <span>Save</span>
              </a>
              <button
                onClick={() => setFullscreenImage(null)}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition"
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
            Click outside or press <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white text-[10px]">Esc</kbd> to return to chat
          </div>
        </div>
      )}
    </div>
  );
}
