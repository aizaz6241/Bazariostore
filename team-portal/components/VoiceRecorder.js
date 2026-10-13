'use client';

import React, { useState, useRef } from 'react';
import { Mic, Square, Trash2, Send, Play, Pause, VenetianMask } from 'lucide-react';
import { VOICE_EFFECT_HACKER, buildHackerVoice, primeVoiceAudio, voiceMaskSupported } from '@/lib/voiceMask';

// Speech does not need music quality: a small recording sends fast and a long one stays sendable
const VOICE_BITS_PER_SECOND = 32000;

function recorderOptions() {
  const options = { audioBitsPerSecond: VOICE_BITS_PER_SECOND };
  try {
    const wanted = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
    const type = wanted.find((t) => window.MediaRecorder?.isTypeSupported?.(t));
    if (type) options.mimeType = type;
  } catch (e) {}
  return options;
}

/**
 * @param effect '' (real voice) or 'hacker' (voice changed on the phone before anything is recorded:
 *               only the changed sound is recorded and sent, see lib/voiceMask.js)
 */
export default function VoiceRecorder({ onSendAudio, onCancel, effect = '' }) {
  const masked = effect === VOICE_EFFECT_HACKER;
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioUrl, setAudioUrl] = useState(null); // the finished recording, for the preview
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioBlobRef = useRef(null);
  const timerIntervalRef = useRef(null);
  const startedAtRef = useRef(0);
  const previewAudioRef = useRef(null);
  const streamRef = useRef(null);
  const wakeLockRef = useRef(null);
  const cancelledRef = useRef(false);
  const effectRef = useRef(null); // the running voice changer (stopped with the recording)

  // A long recording: keep the phone screen awake, otherwise the phone stops the microphone
  const keepAwake = async () => {
    try {
      if (navigator.wakeLock?.request) wakeLockRef.current = await navigator.wakeLock.request('screen');
    } catch (e) {}
  };
  const letSleep = () => {
    try {
      wakeLockRef.current?.release?.();
    } catch (e) {}
    wakeLockRef.current = null;
  };

  const startRecording = async () => {
    try {
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      } catch (e) {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      streamRef.current = stream;

      // Hacker voice: the microphone goes through the voice changer and ONLY its output is
      // recorded. If this phone cannot do it, nothing is recorded (never the real voice instead).
      let recordStream = stream;
      if (masked) {
        const ctx = voiceMaskSupported() ? primeVoiceAudio() : null;
        if (!ctx) {
          stream.getTracks().forEach((t) => t.stop());
          alert('The hacker voice does not work in this browser. Turn it off to send your real voice, or open the portal in an up-to-date browser.');
          onCancel?.();
          return;
        }
        try {
          if (ctx.state !== 'running') await ctx.resume();
        } catch (e) {}
        const source = ctx.createMediaStreamSource(stream);
        const fx = buildHackerVoice(ctx, source);
        const dest = ctx.createMediaStreamDestination();
        try {
          dest.channelCount = 1;
        } catch (e) {}
        fx.output.connect(dest);
        effectRef.current = { ...fx, dest };
        recordStream = dest.stream;
      }

      let recorder;
      try {
        recorder = new MediaRecorder(recordStream, recorderOptions());
      } catch (e) {
        recorder = new MediaRecorder(recordStream);
      }
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      audioBlobRef.current = null;
      cancelledRef.current = false;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        clearInterval(timerIntervalRef.current);
        letSleep();
        // Stop all audio tracks (and the voice changer)
        stream.getTracks().forEach((track) => track.stop());
        stopEffect();
        setIsRecording(false);
        if (cancelledRef.current) return;
        setRecordingSeconds(Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000)));
        // the type the recorder really produced (webm on Android / computers, mp4 on iPhone)
        const type = (recorder.mimeType || audioChunksRef.current[0]?.type || 'audio/webm').split(';')[0];
        const audioBlob = new Blob(audioChunksRef.current, { type });
        audioBlobRef.current = audioBlob;
        setAudioUrl(URL.createObjectURL(audioBlob));
      };
      // the microphone was taken away (a call came in, the app went to the background):
      // keep what was recorded so far instead of losing it
      stream.getTracks().forEach((track) => {
        track.onended = () => {
          if (recorder.state !== 'inactive') recorder.stop();
        };
      });

      // hand over the sound every second: a long recording is never held back in one block
      recorder.start(1000);
      startedAtRef.current = Date.now();
      setIsRecording(true);
      setRecordingSeconds(0);
      keepAwake();

      timerIntervalRef.current = setInterval(() => {
        setRecordingSeconds(Math.round((Date.now() - startedAtRef.current) / 1000));
      }, 500);
    } catch (err) {
      console.error('Audio permission error:', err);
      alert('Microphone access is required to record voice notes. Please grant permission.');
      onCancel?.();
    }
  };

  const stopEffect = () => {
    const fx = effectRef.current;
    effectRef.current = null;
    if (!fx) return;
    try {
      fx.stop();
      fx.output.disconnect();
      fx.dest.stream.getTracks().forEach((t) => t.stop());
    } catch (e) {}
  };

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    clearInterval(timerIntervalRef.current);
  };

  const dropPreview = () => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }
    setIsPlayingPreview(false);
  };

  const cancelRecording = () => {
    cancelledRef.current = true;
    stopRecording();
    dropPreview();
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    audioBlobRef.current = null;
    setAudioUrl(null);
    onCancel?.();
  };

  const handleSend = () => {
    const blob = audioBlobRef.current;
    if (blob && blob.size > 0) {
      dropPreview();
      // the chat keeps playing this recording from the same address: it is not thrown away here
      onSendAudio(blob, recordingSeconds, audioUrl, masked ? VOICE_EFFECT_HACKER : '');
      audioBlobRef.current = null;
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
      // the recorder was closed while still recording: release the microphone
      cancelledRef.current = true;
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== 'inactive') recorder.stop();
      else streamRef.current?.getTracks().forEach((track) => track.stop());
      stopEffect();
      letSleep();
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
          {masked && <MaskChip />}

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

          <div className="flex-1 flex items-center gap-2 text-xs text-slate-700 font-medium min-w-0">
            <span className="truncate">Voice Note ready ({formatTime(recordingSeconds)})</span>
            {masked && <MaskChip />}
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

function MaskChip() {
  return (
    <span className="inline-flex items-center gap-1 shrink-0 px-2 py-0.5 rounded-full bg-slate-900 text-white text-[10px] font-bold" title="Your real voice is not recorded">
      <VenetianMask className="w-3 h-3" /> Hacker voice
    </span>
  );
}
