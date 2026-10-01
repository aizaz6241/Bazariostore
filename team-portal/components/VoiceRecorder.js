'use client';

import React, { useState, useRef } from 'react';
import { Mic, Square, Trash2, Send, Play, Pause } from 'lucide-react';

export default function VoiceRecorder({ onSendAudio, onCancel }) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioUrl, setAudioUrl] = useState(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerIntervalRef = useRef(null);
  const previewAudioRef = useRef(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          setAudioUrl(reader.result);
        };
        // Stop all audio tracks
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setRecordingSeconds(0);

      timerIntervalRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Audio permission error:', err);
      alert('Microphone access is required to record voice notes. Please grant permission.');
      onCancel?.();
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(timerIntervalRef.current);
    }
  };

  const cancelRecording = () => {
    if (isRecording) {
      stopRecording();
    }
    clearInterval(timerIntervalRef.current);
    setAudioUrl(null);
    onCancel?.();
  };

  const handleSend = () => {
    if (audioUrl) {
      onSendAudio(audioUrl, recordingSeconds);
      setAudioUrl(null);
      setRecordingSeconds(0);
    }
  };

  const formatTime = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const togglePreview = () => {
    if (!previewAudioRef.current) {
      previewAudioRef.current = new Audio(audioUrl);
      previewAudioRef.current.onended = () => setIsPlayingPreview(false);
    }

    if (isPlayingPreview) {
      previewAudioRef.current.pause();
      setIsPlayingPreview(false);
    } else {
      previewAudioRef.current.play();
      setIsPlayingPreview(true);
    }
  };

  // Auto-start recording on mount if not already recorded
  React.useEffect(() => {
    startRecording();
    return () => {
      clearInterval(timerIntervalRef.current);
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
      }
    };
  }, []);

  return (
    <div className="flex items-center space-x-3 w-full bg-emerald-50/90 border border-emerald-200 px-4 py-2.5 rounded-2xl animate-fade-in shadow-sm">
      {isRecording ? (
        <>
          <div className="w-3 h-3 rounded-full bg-red-500 animate-ping" />
          <span className="text-xs font-semibold text-emerald-900 font-mono">
            Recording {formatTime(recordingSeconds)}
          </span>

          <div className="flex-1 flex items-center justify-center space-x-1">
            <span className="w-1 h-3 bg-emerald-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
            <span className="w-1 h-5 bg-emerald-600 rounded-full animate-bounce [animation-delay:-0.15s]" />
            <span className="w-1 h-4 bg-emerald-500 rounded-full animate-bounce" />
            <span className="w-1 h-6 bg-emerald-700 rounded-full animate-bounce [animation-delay:-0.2s]" />
            <span className="w-1 h-3 bg-emerald-500 rounded-full animate-bounce [animation-delay:-0.1s]" />
          </div>

          <button
            onClick={stopRecording}
            className="p-2 rounded-xl bg-red-500 text-white hover:bg-red-600 transition shadow-sm"
            title="Stop Recording"
          >
            <Square className="w-4 h-4 fill-white" />
          </button>

          <button
            onClick={cancelRecording}
            className="p-2 rounded-xl text-slate-500 hover:text-red-500 hover:bg-white/80 transition"
            title="Cancel"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </>
      ) : (
        <>
          <button
            onClick={togglePreview}
            className="p-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition shadow-sm"
            title="Preview Audio"
          >
            {isPlayingPreview ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-white" />}
          </button>

          <div className="flex-1 text-xs text-slate-700 font-medium">
            Voice Note ready ({formatTime(recordingSeconds)})
          </div>

          <button
            onClick={cancelRecording}
            className="p-2 rounded-xl text-slate-500 hover:text-red-500 hover:bg-white/80 transition"
            title="Discard"
          >
            <Trash2 className="w-4 h-4" />
          </button>

          <button
            onClick={handleSend}
            className="p-2 rounded-xl bg-brand-600 text-white hover:bg-brand-700 transition shadow-md shadow-brand-500/20"
            title="Send Voice Note"
          >
            <Send className="w-4 h-4" />
          </button>
        </>
      )}
    </div>
  );
}
