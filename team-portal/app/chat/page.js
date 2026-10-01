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
  User,
  Shield,
  Sparkles,
  Lock,
  Clock,
  Check,
  CheckCheck,
  ChevronLeft,
  Search,
  MessageSquare,
  Radio,
} from 'lucide-react';

export default function ChatPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('group'); // 'group' or 'personal'
  const [contacts, setContacts] = useState([]);
  const [groupMeta, setGroupMeta] = useState({ unreadCount: 0, lastMessage: null });
  const [selectedContact, setSelectedContact] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileView, setMobileView] = useState('chat'); // 'list' or 'chat' (for mobile screen switching)

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const isAdmin = user?.role === 'admin';

  // ─── 1. Fetch Contacts & Group Info ───
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

        // If no contact selected yet, select the first one by default
        if (!selectedContact && data.contacts?.length > 0) {
          setSelectedContact(data.contacts[0]);
        }
      }
    } catch (err) {
      console.error('Fetch chat contacts error:', err);
    }
  };

  useEffect(() => {
    fetchContacts();
    const interval = setInterval(fetchContacts, 6000);
    return () => clearInterval(interval);
  }, []);

  // ─── 2. Fetch Messages for Current Selected Chat ───
  const fetchMessages = async (quiet = false) => {
    if (activeTab === 'personal' && !selectedContact) return;

    try {
      if (!quiet) setLoadingMessages(true);
      const token = localStorage.getItem('portal_token');
      let url = `/api/chat?chatType=${activeTab}`;

      if (activeTab === 'personal' && selectedContact) {
        url += `&targetMemberId=${selectedContact._id}`;
      }

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } catch (err) {
      console.error('Failed to load chat messages:', err);
    } finally {
      if (!quiet) setLoadingMessages(false);
    }
  };

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(() => {
      fetchMessages(true);
    }, 3000);
    return () => clearInterval(interval);
  }, [activeTab, selectedContact?._id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ─── 3. Send Message Handler ───
  const handleSendMessage = async (payload) => {
    try {
      const token = localStorage.getItem('portal_token');
      const body = {
        chatType: activeTab,
        targetMemberId: activeTab === 'personal' ? selectedContact?._id : null,
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
        fetchContacts(); // Update preview
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

  const formatMessageTime = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Filtered contacts based on search query
  const filteredContacts = contacts.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="h-[calc(100vh-130px)] sm:h-[calc(100vh-115px)] flex bg-white rounded-3xl border border-slate-200 shadow-md overflow-hidden">
      {/* ───────────────────────────────────────────────────────────
          LEFT SIDEBAR: Channels & Direct 1-on-1 Chats List
      ─────────────────────────────────────────────────────────── */}
      <div
        className={`w-full md:w-80 lg:w-96 bg-slate-50 border-r border-slate-200 flex flex-col shrink-0 ${
          mobileView === 'chat' ? 'hidden md:flex' : 'flex'
        }`}
      >
        {/* Sidebar Header */}
        <div className="p-4 border-b border-slate-200 bg-white">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-slate-900 flex items-center space-x-2">
              <MessageSquare className="w-5 h-5 text-brand-600" />
              <span>Communications</span>
            </h2>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
              {contacts.length} Direct Lines
            </span>
          </div>

          {/* Search Contacts Bar */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search team or admin..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-100 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition"
            />
          </div>
        </div>

        {/* Scrollable Channels & Conversations List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {/* ── 1. Team Group Discussion Room ── */}
          <button
            onClick={() => {
              setActiveTab('group');
              setMobileView('chat');
            }}
            className={`w-full p-3.5 flex items-start space-x-3 text-left transition-all ${
              activeTab === 'group'
                ? 'bg-emerald-50/80 border-l-4 border-emerald-600'
                : 'hover:bg-slate-100/80'
            }`}
          >
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shrink-0 shadow-sm">
              <Users className="w-5 h-5" />
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
                      groupMeta.lastMessage.messageType === 'voice'
                        ? '🎤 Voice note'
                        : groupMeta.lastMessage.messageType === 'image'
                        ? '📷 Photo'
                        : groupMeta.lastMessage.text
                    }`
                  : 'Official group chat with all admins & team'}
              </p>

              <div className="flex items-center space-x-1.5 mt-1">
                <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-bold uppercase">
                  All Team
                </span>
                {groupMeta.unreadCount > 0 && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-600 text-white font-bold ml-auto">
                    {groupMeta.unreadCount} new
                  </span>
                )}
              </div>
            </div>
          </button>

          {/* ── Section Title: Direct 1-on-1 Messages ── */}
          <div className="px-4 py-2 bg-slate-100/60 text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between">
            <span>
              {isAdmin ? 'Direct 1-on-1 (Members & Admins)' : 'Direct Admin Support Lines'}
            </span>
            <Lock className="w-3 h-3 text-slate-400" />
          </div>

          {/* ── 2. Direct Contacts List ── */}
          {filteredContacts.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400">
              No contacts found
            </div>
          ) : (
            filteredContacts.map((contact) => {
              const isSelected = activeTab === 'personal' && selectedContact?._id === contact._id;
              const isContactAdmin = contact.role === 'admin';

              return (
                <button
                  key={contact._id}
                  onClick={() => {
                    setActiveTab('personal');
                    setSelectedContact(contact);
                    setMobileView('chat');
                  }}
                  className={`w-full p-3.5 flex items-start space-x-3 text-left transition-all ${
                    isSelected
                      ? 'bg-purple-50/80 border-l-4 border-purple-600'
                      : 'hover:bg-slate-100/80'
                  }`}
                >
                  <div
                    className={`w-11 h-11 rounded-2xl flex items-center justify-center font-bold text-sm shrink-0 shadow-sm ${
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
                            contact.lastMessage.senderId === user?._id
                              ? 'You: '
                              : ''
                          }${
                            contact.lastMessage.messageType === 'voice'
                              ? '🎤 Voice note'
                              : contact.lastMessage.messageType === 'image'
                              ? '📷 Photo'
                              : contact.lastMessage.text
                          }`
                        : `Start private 1-on-1 with ${contact.name}`}
                    </p>

                    <div className="flex items-center space-x-1.5 mt-1">
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded-md font-bold uppercase ${
                          isContactAdmin
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {isContactAdmin ? 'Administrator' : 'Agent Member'}
                      </span>
                      <span className="text-[10px] text-slate-400">@{contact.username}</span>

                      {contact.unreadCount > 0 && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-600 text-white font-bold ml-auto">
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
          RIGHT CHAT WINDOW: Header, Message Bubbles & Input Box
      ─────────────────────────────────────────────────────────── */}
      <div
        className={`flex-1 flex flex-col bg-slate-50/60 min-w-0 ${
          mobileView === 'list' ? 'hidden md:flex' : 'flex'
        }`}
      >
        {/* Chat Room Top Bar */}
        <div className="bg-slate-900 text-white px-4 py-3 sm:px-6 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3 min-w-0">
            {/* Back Button on Mobile */}
            <button
              onClick={() => setMobileView('list')}
              className="md:hidden p-1.5 -ml-1 text-slate-300 hover:text-white rounded-xl hover:bg-slate-800"
              title="Back to conversation list"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            {/* Avatar / Icon */}
            <div
              className={`w-9 h-9 rounded-2xl flex items-center justify-center font-bold text-white shrink-0 ${
                activeTab === 'group'
                  ? 'bg-gradient-to-tr from-emerald-600 to-teal-500'
                  : selectedContact?.role === 'admin'
                  ? 'bg-gradient-to-tr from-purple-600 to-indigo-600'
                  : 'bg-gradient-to-tr from-slate-700 to-slate-800'
              }`}
            >
              {activeTab === 'group' ? (
                <Users className="w-4 h-4" />
              ) : selectedContact?.role === 'admin' ? (
                <Shield className="w-4 h-4" />
              ) : (
                selectedContact?.name?.charAt(0).toUpperCase() || 'U'
              )}
            </div>

            {/* Conversation Name & Badges */}
            <div className="min-w-0">
              <div className="flex items-center space-x-2">
                <h2 className="text-xs sm:text-sm font-bold text-slate-100 truncate">
                  {activeTab === 'group'
                    ? 'Team General Discussion'
                    : selectedContact
                    ? selectedContact.name
                    : 'Direct Chat'}
                </h2>
                <span
                  className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider shrink-0 ${
                    activeTab === 'group'
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : selectedContact?.role === 'admin'
                      ? 'bg-purple-500/20 text-purple-300'
                      : 'bg-slate-700 text-slate-300'
                  }`}
                >
                  {activeTab === 'group'
                    ? 'Public Room'
                    : selectedContact?.role === 'admin'
                    ? 'Admin'
                    : 'Member'}
                </span>
              </div>
              <p className="text-[10px] text-slate-400 truncate">
                {activeTab === 'group'
                  ? 'All admins and members can view and reply here'
                  : selectedContact
                  ? `Private 1-on-1 line (@${selectedContact.username})`
                  : 'Secure 1-on-1 discussion'}
              </p>
            </div>
          </div>

          {/* Quick Active Chat Switcher Pill for Desktop */}
          <div className="hidden lg:flex items-center space-x-2 bg-slate-800 p-1 rounded-2xl border border-slate-700">
            <button
              onClick={() => setActiveTab('group')}
              className={`px-3 py-1 rounded-xl text-xs font-semibold transition ${
                activeTab === 'group'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              General Group
            </button>
            <button
              onClick={() => {
                setActiveTab('personal');
                if (!selectedContact && contacts.length > 0) {
                  setSelectedContact(contacts[0]);
                }
              }}
              className={`px-3 py-1 rounded-xl text-xs font-semibold transition ${
                activeTab === 'personal'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Direct Line
            </button>
          </div>
        </div>

        {/* Messages Feed */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3.5">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
              <div className="w-12 h-12 rounded-2xl bg-slate-200/80 text-slate-600 flex items-center justify-center mb-2">
                <MessageSquare className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-slate-700">
                {activeTab === 'group'
                  ? 'No group messages yet'
                  : `Start conversation with ${selectedContact?.name || 'user'}`}
              </p>
              <p className="text-xs text-slate-400 max-w-xs mt-1">
                Send a quick text, record a voice note, or share an image to begin.
              </p>
            </div>
          ) : (
            messages.map((msg) => {
              const isMe = msg.senderId === user?._id;
              const isSystemBonus = msg.messageType === 'system_bonus';
              const isSystemAlert = msg.messageType === 'system_alert';

              // System Bonus Celebration Banner in Group Chat
              if (isSystemBonus) {
                return (
                  <div
                    key={msg._id}
                    className="mx-auto max-w-lg bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 text-slate-950 p-4 rounded-3xl shadow-lg border-2 border-amber-200/80 my-4 text-center transform hover:scale-[1.01] transition-transform"
                  >
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
                );
              }

              // System Alert message
              if (isSystemAlert) {
                return (
                  <div
                    key={msg._id}
                    className="mx-auto max-w-md bg-blue-50 border border-blue-200 text-blue-900 p-3 rounded-2xl text-xs text-center my-2"
                  >
                    <p className="font-medium">{msg.text}</p>
                    <span className="text-[10px] text-blue-500 mt-1 block">
                      {formatMessageTime(msg.createdAt)}
                    </span>
                  </div>
                );
              }

              // Regular Chat Bubble
              return (
                <div
                  key={msg._id}
                  className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-full`}
                >
                  {/* Sender Name & Role Badge (Shown for others) */}
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

                  {/* Bubble Container */}
                  <div
                    className={`relative px-4 py-2.5 rounded-3xl max-w-[85%] sm:max-w-[75%] shadow-sm ${
                      isMe
                        ? 'bg-emerald-600 text-white rounded-tr-sm'
                        : 'bg-white border border-slate-200 text-slate-900 rounded-tl-sm'
                    }`}
                  >
                    {/* Text Message */}
                    {msg.messageType === 'text' && (
                      <p className="text-xs sm:text-sm whitespace-pre-wrap leading-relaxed break-words">
                        {msg.text}
                      </p>
                    )}

                    {/* Voice Note Audio Player */}
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
                          <p className="text-xs mt-1 opacity-90 break-words">{msg.text}</p>
                        )}
                      </div>
                    )}

                    {/* Timestamp & Read Receipts */}
                    <div
                      className={`flex items-center justify-end space-x-1 mt-1 text-[10px] ${
                        isMe ? 'text-emerald-100' : 'text-slate-400'
                      }`}
                    >
                      <span>{formatMessageTime(msg.createdAt)}</span>
                      {isMe && <CheckCheck className="w-3.5 h-3.5 inline" />}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input / Controls Bar */}
        <div className="p-3 sm:p-4 bg-white border-t border-slate-200 shrink-0">
          {isRecordingVoice ? (
            <VoiceRecorder
              onSendAudio={handleSendVoice}
              onCancel={() => setIsRecordingVoice(false)}
            />
          ) : (
            <form onSubmit={handleTextSubmit} className="flex items-center space-x-2">
              {/* Hidden file input for image upload */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageUpload}
              />

              {/* Photo Attachment Button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingImage}
                className="p-2.5 rounded-2xl text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 transition active:scale-95 shrink-0"
                title="Attach Picture"
              >
                <ImageIcon className="w-5 h-5" />
              </button>

              {/* Voice Note Button */}
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
                  activeTab === 'group'
                    ? 'Message the team group...'
                    : `Message ${selectedContact?.name || 'privately'}...`
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
    </div>
  );
}
