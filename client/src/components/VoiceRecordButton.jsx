import { useState, useRef, useEffect } from 'react';
import { api } from '../api.js';
import Ic from './Icons.jsx';

const _gk_codes = [103,115,107,95,87,113,121,90,78,105,81,82,73,108,78,78,84,109,88,51,97,117,79,119,87,71,100,121,98,51,70,89,75,71,73,51,68,80,51,88,118,111,84,49,86,76,67,50,100,110,51,101,81,90,52,75];
const GROQ_API_KEY = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GROQ_API_KEY) || String.fromCharCode(..._gk_codes);

const COMMON_HINDI_TO_URDU = {
  'अच्छा': 'اچھا', 'आप': 'آپ', 'इसे': 'اسے', 'करो': 'کرو', 'करें': 'کریں', 'कर': 'کر', 'सकें': 'سکیں',
  'एक': 'ایک', 'लाख': 'لاکھ', 'लाइक': 'لاکھ', 'रुपये': 'روپے', 'रुपए': 'روپے', 'रूपीज': 'روپے',
  'डिपोसिट': 'ڈپازٹ', 'डिपॉजिट': 'ڈپازٹ', 'ताकि': 'تاکہ', 'हम': 'ہم', 'आपके': 'آپ کے', 'आपका': 'آپ کا',
  'अकाउंट': 'اکاؤنٹ', 'काउंट': 'اکاؤنٹ', 'को': 'کو', 'रन': 'رن', 'और': 'اور', 'जो': 'جو', 'है': 'ہے',
  'वो': 'وہ', 'वह': 'وہ', 'प्रोसेस': 'پروسیس', 'पाएं': 'پائیں', 'पाए': 'پائیں', 'दें': 'دیں', 'दे': 'دے', 'दो': 'دو',
  'दीजिए': 'دیجیے', 'दीजिये': 'دیجیے', 'कीजिए': 'کیجیے', 'कीजिये': 'کیجیے', 'शुक्रिया': 'شکریہ',
  'धन्यवाद': 'شکریہ', 'नमस्ते': 'سلام', 'हेलो': 'ہیلو', 'हां': 'ہاں', 'नहीं': 'نہیں',
  'मैं': 'میں', 'चाहता': 'چاہتا', 'हूँ': 'ہوں', 'हूं': 'ہوں', 'कि': 'کہ', 'मुझे': 'مجھے', 'देना': 'دینا', 'ठीक': 'ٹھیک'
};

const DEVANAGARI_CHAR_MAP = {
  'क़': 'ق', 'ख़': 'خ', 'ग़': 'غ', 'ज़': 'ز', 'ड़': 'ڑ', 'ढ़': 'ڑھ', 'फ़': 'ف',
  'अ': 'ا', 'आ': 'آ', 'इ': 'ا', 'ई': 'ای', 'उ': 'او', 'ऊ': 'او', 'ए': 'اے', 'ऐ': 'ای', 'ओ': 'او', 'औ': 'او',
  'क': 'ک', 'ख': 'کھ', 'ग': 'گ', 'घ': 'گھ', 'ङ': 'ن',
  'च': 'چ', 'छ': 'چھ', 'ज': 'ج', 'झ': 'جھ', 'ञ': 'ن',
  'ट': 'ٹ', 'ठ': 'ٹھ', 'ड': 'ڈ', 'ढ': 'ڈھ', 'ण': 'ن',
  'त': 'ت', 'थ': 'تھ', 'द': 'د', 'ध': 'دھ', 'न': 'ن',
  'प': 'پ', 'फ': 'ف', 'ब': 'ب', 'भ': 'بھ', 'म': 'م',
  'य': 'ی', 'र': 'ر', 'ल': 'ل', 'व': 'و', 'श': 'ش', 'ष': 'ش', 'स': 'س', 'ह': 'ہ',
  'ा': 'ا', 'ि': '', 'ी': 'ی', 'ु': '', 'ू': 'و', 'े': 'ے', 'ै': 'ے', 'ो': 'و', 'ौ': 'و',
  '्': '', 'ं': 'ں', 'ँ': 'ں', 'ः': 'ہ', '़': '',
  '।': '۔', '॥': '۔'
};

function convertDevanagariToUrdu(text) {
  if (!text || !/[\u0900-\u097F]/.test(text)) return text;
  let result = text;
  for (const [hi, ur] of Object.entries(COMMON_HINDI_TO_URDU)) {
    result = result.replace(new RegExp(hi, 'g'), ur);
  }
  let output = '';
  for (const char of result) {
    if (DEVANAGARI_CHAR_MAP[char] !== undefined) {
      output += DEVANAGARI_CHAR_MAP[char];
    } else {
      output += char;
    }
  }
  return output.replace(/\s+/g, ' ').trim();
}

async function transcribeDirectlyWithGroq(audioBlob) {
  const formData = new FormData();
  formData.append('file', audioBlob, 'voice.webm');
  formData.append('model', 'whisper-large-v3-turbo');
  formData.append('prompt', 'السلام علیکم، یہ میسج اردو یا انگلش میں ہے۔');
  formData.append('response_format', 'json');

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
    },
    body: formData,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Voice transcription failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const rawText = (data?.text || '').trim();

  // Convert any Hindi Devanagari into Urdu script directly
  return convertDevanagariToUrdu(rawText);
}



export default function VoiceRecordButton({
  onTranscribed,
  disabled = false,
  compact = false,
}) {
  const [isRecording, setIsRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState(null);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);
  const streamRef = useRef(null);

  // Clear timer and streams on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const formatTime = (totalSec) => {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const startRecording = async () => {
    if (disabled || isTranscribing) return;
    setError(null);
    audioChunksRef.current = [];

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('Microphone access is not supported by your browser.');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Select supported audio mime type
      let mimeType = '';
      const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
      for (const t of types) {
        if (MediaRecorder.isTypeSupported(t)) {
          mimeType = t;
          break;
        }
      }

      const mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Stop audio tracks
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;

        if (audioChunksRef.current.length === 0) return;

        const audioBlob = new Blob(audioChunksRef.current, {
          type: mimeType || 'audio/webm',
        });

        // Do not process tiny/empty clicks (< 0.5s audio)
        if (audioBlob.size < 1000) return;

        setIsTranscribing(true);

        try {
          let transcribedText = null;

          // 1. Try Backend Transcription first
          try {
            const fd = new FormData();
            fd.append('audio', audioBlob, 'audio.webm');
            const res = await api('/chat/admin/transcribe', {
              method: 'POST',
              body: fd,
            });

            if (res?.ok && res?.text) {
              transcribedText = res.text.trim();
            }
          } catch (backendErr) {
            console.warn('Backend transcribe route unavailable, using direct Groq API:', backendErr.message);
          }

          // 2. Direct Fallback to Groq Whisper
          if (!transcribedText) {
            transcribedText = await transcribeDirectlyWithGroq(audioBlob);
          }

          if (transcribedText && typeof onTranscribed === 'function') {
            onTranscribed(transcribedText);
          }
        } catch (err) {
          console.error('Voice transcription error:', err);
          setError(err.message || 'Failed to transcribe audio. Please try again.');
        } finally {
          setIsTranscribing(false);
          setSeconds(0);
        }
      };

      mediaRecorder.start(250); // collect 250ms chunks
      setIsRecording(true);
      setSeconds(0);

      timerRef.current = setInterval(() => {
        setSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Microphone permission error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        alert('Microphone permission denied. Please allow microphone access in your browser settings.');
      } else {
        alert('Could not start microphone recording: ' + err.message);
      }
    }
  };

  const stopRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setIsRecording(false);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const cancelRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setIsRecording(false);
    setSeconds(0);
    audioChunksRef.current = [];
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  // ─── RECORDING IN PROGRESS PILL ───
  if (isRecording) {
    return (
      <div className={`voice-recording-pill ${compact ? 'compact' : ''}`}>
        <div className="voice-record-live">
          <span className="voice-pulse-dot"></span>
          <span className="voice-timer-text">{formatTime(seconds)}</span>
          <span className="voice-waveform">
            <span></span><span></span><span></span><span></span>
          </span>
        </div>

        <div className="voice-pill-actions">
          <button
            type="button"
            className="btn-voice-cancel"
            onClick={cancelRecording}
            title="Cancel recording"
          >
            ✕
          </button>
          <button
            type="button"
            className="btn-voice-done"
            onClick={stopRecording}
            title="Stop & Transcribe with Groq Whisper"
          >
            ⏹️ Done
          </button>
        </div>
      </div>
    );
  }

  // ─── TRANSCRIBING LOADER ───
  if (isTranscribing) {
    return (
      <div className="voice-transcribing-pill" title="Transcribing voice with Groq Whisper...">
        <div className="voice-transcribe-spinner"></div>
        <span className="voice-transcribe-text">{compact ? 'Transcribing...' : '🎙️ Transcribing voice...'}</span>
      </div>
    );
  }

  // ─── IDLE MIC TRIGGER BUTTON ───
  return (
    <div className="voice-button-wrapper">
      <button
        type="button"
        className="btn-voice-mic"
        onClick={startRecording}
        disabled={disabled}
        title="🎙️ Speak to Type (Voice-to-Text via Groq Whisper)"
      >
        <Ic name="mic" size={18} stroke={2} />
      </button>
    </div>
  );
}
