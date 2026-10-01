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
  Sparkles,
  Lock,
  Clock,
  Check,
  CheckCheck,
  Award,
  ChevronDown,
} from 'lucide-react';

export default function ChatPage() {
  const { user } = useAuth();
  const [chatType, setChatType] = useState('group'); // 'group' or 'personal'
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [membersList, setMembersList] = useState([]);
  const [selectedTargetMember, setSelectedTargetMember] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const isAdmin = user?.role === 'admin';

  // Fetch team members list for Admin to choose who to 1-on-1 chat with
  useEffect(() => {
    if (isAdmin) {
      const fetchMembers = async () => {
        try {
          const token = localStorage.getItem('portal_token');
          const res = await fetch('/api/members', {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const data = await res.json();
            const onlyMembers = data.members.filter((m) => m.role === 'member');
            setMembersList(onlyMembers);
            if (onlyMembers.length > 0 && !selectedTargetMember) {
              setSelectedTargetMember(onlyMembers[0]);
            }
          }
        } catch (err) {
          console.error('Fetch members for chat error:', err);
        }
      };
      fetchMembers();
    }
  }, [isAdmin]);

  // Fetch messages for current chat view
  const fetchMessages = async (quiet = false) => {
    try {
      if (!quiet) setLoading(true);
      const token = localStorage.getItem('portal_token');
      let url = `/api/chat?chatType=${chatType}`;

      if (chatType === 'personal' && isAdmin && selectedTargetMember) {
        url += `&targetMemberId=${selectedTargetMember._id}`;
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
      if (!quiet) setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();
    // Auto-polling for new incoming messages every 3.5 seconds
    const interval = setInterval(() => {
      fetchMessages(true);
    }, 3500);
    return () => clearInterval(interval);
  }, [chatType, selectedTargetMember]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (payload) => {
    try {
      const token = localStorage.getItem('portal_token');
      const body = {
        chatType,
        targetMemberId: chatType === 'personal' && isAdmin ? selectedTargetMember?._id : null,
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

  return (
    <div className="h-[calc(100vh-140px)] sm:h-[calc(100vh-120px)] flex flex-col bg-white rounded-3xl border border-slate-200/80 shadow-md overflow-hidden">
      {/* Chat Room Top Bar */}
      <div className="bg-slate-900 text-white px-4 py-3 sm:px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-3">
          {/* Channel Selector Toggle */}
          <div className="flex bg-slate-800 p-1 rounded-2xl border border-slate-700">
            <button
              onClick={() => setChatType('group')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                chatType === 'group'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Team Group</span>
            </button>

            <button
              onClick={() => setChatType('personal')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                chatType === 'personal'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Personal 1-on-1</span>
            </button>
          </div>

          {/* Current Chat Title */}
          <div className="hidden sm:block border-l border-slate-700 pl-3">
            <h2 className="text-xs sm:text-sm font-bold flex items-center space-x-1.5 text-slate-100">
              {chatType === 'group' ? (
                <>
                  <span>Bazario Team General Discussion</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-normal">
                    Admins & Members
                  </span>
                </>
              ) : isAdmin ? (
                <span>Private Chat with: {selectedTargetMember?.name || 'Select Member'}</span>
              ) : (
                <span>Direct Support Line with Administrator</span>
              )}
            </h2>
          </div>
        </div>

        {/* Admin Member Picker (when in Personal 1-on-1 Chat) */}
        {chatType === 'personal' && isAdmin && (
          <div className="flex items-center space-x-2">
            <span className="text-xs text-slate-400 hidden md:inline">Talking with:</span>
            <select
              value={selectedTargetMember?._id || ''}
              onChange={(e) => {
                const found = membersList.find((m) => m._id === e.target.value);
                if (found) setSelectedTargetMember(found);
              }}
              className="bg-slate-800 border border-slate-700 text-white text-xs rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              {membersList.map((m) => (
                <option key={m._id} value={m._id}>
                  {m.name} (@{m.username})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3.5 bg-slate-50/50">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-2">
              <Users className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-slate-600">No messages in this chat yet</p>
            <p className="text-xs text-slate-400 max-w-xs mt-1">
              Start the discussion by typing a message, recording a voice note, or sharing an image.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.senderId === user?._id;
            const isSystemBonus = msg.messageType === 'system_bonus';
            const isSystemAlert = msg.messageType === 'system_alert';

            // Special System Bonus Celebration Banner in Group Chat
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

            // System Alert message (e.g. client assignment)
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

            // Regular user / admin chat bubble
            return (
              <div
                key={msg._id}
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-full`}
              >
                {/* Sender Name & Role */}
                {!isMe && (
                  <div className="flex items-center space-x-1.5 mb-1 px-1">
                    <span className="text-xs font-bold text-slate-800">{msg.senderName}</span>
                    <span
                      className={`text-[9px] px-1.5 py-0.2 rounded-full font-bold uppercase ${
                        msg.senderRole === 'admin'
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-emerald-100 text-emerald-700'
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

                  {/* Timestamp & Read Ticks */}
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

      {/* Input / Control Bar */}
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
              className="p-2.5 rounded-2xl text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 transition active:scale-95"
              title="Attach Picture"
            >
              <ImageIcon className="w-5 h-5" />
            </button>

            {/* Voice Note Button */}
            <button
              type="button"
              onClick={() => setIsRecordingVoice(true)}
              className="p-2.5 rounded-2xl text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 transition active:scale-95"
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
                chatType === 'group'
                  ? 'Message the team...'
                  : isAdmin
                  ? `Reply to ${selectedTargetMember?.name || 'Member'}...`
                  : 'Message the Admin privately...'
              }
              className="flex-1 px-4 py-2.5 bg-slate-100 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition"
            />

            {/* Send Button */}
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="p-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white transition active:scale-95 shadow-md shadow-emerald-500/20"
              title="Send Message"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
