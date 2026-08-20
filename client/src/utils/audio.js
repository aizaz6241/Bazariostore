// Web Audio API Synthesized Sound Generator
// 100% self-contained, zero-dependency, zero-latency, never fails to load.

let audioCtx = null;

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

// Ensure audio context resumes on first user interaction anywhere
if (typeof window !== 'undefined') {
  const unlockAudio = () => {
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    window.removeEventListener('click', unlockAudio);
    window.removeEventListener('keydown', unlockAudio);
    window.removeEventListener('touchstart', unlockAudio);
  };
  window.addEventListener('click', unlockAudio, { passive: true });
  window.addEventListener('keydown', unlockAudio, { passive: true });
  window.addEventListener('touchstart', unlockAudio, { passive: true });
}

/**
 * Play a synthesized chime note with soft bell envelope
 */
function playTone(ctx, freq, startTime, duration = 0.35, gainValue = 0.15, type = 'sine') {
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(gainValue, startTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + duration);
  } catch (e) {
    console.warn('Audio tone play failed:', e);
  }
}

/**
 * Play notification sound according to event type
 * @param {'deposit' | 'withdrawal' | 'approval' | 'order' | 'chat' | 'default'} soundType
 */
export function playNotificationSound(soundType = 'default') {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    switch (soundType) {
      case 'deposit':
      case 'payment':
        // Uplifting financial coin/chime arpeggio: C5 -> E5 -> G5 -> C6
        playTone(ctx, 523.25, now + 0.00, 0.25, 0.18, 'triangle');
        playTone(ctx, 659.25, now + 0.08, 0.25, 0.18, 'triangle');
        playTone(ctx, 783.99, now + 0.16, 0.30, 0.20, 'sine');
        playTone(ctx, 1046.5, now + 0.24, 0.45, 0.22, 'sine');
        break;

      case 'withdrawal':
        // Distinct bell chime: F5 -> A5 -> C6
        playTone(ctx, 698.46, now + 0.00, 0.22, 0.18, 'sine');
        playTone(ctx, 880.00, now + 0.10, 0.25, 0.18, 'sine');
        playTone(ctx, 1046.5, now + 0.20, 0.40, 0.20, 'sine');
        break;

      case 'approval':
      case 'success':
        // Victory double chime: G5 -> C6
        playTone(ctx, 783.99, now + 0.00, 0.20, 0.18, 'triangle');
        playTone(ctx, 1046.5, now + 0.12, 0.50, 0.25, 'sine');
        break;

      case 'order':
        // High attention store bell: E5 -> G#5 -> B5 -> E6
        playTone(ctx, 659.25, now + 0.00, 0.18, 0.16, 'sine');
        playTone(ctx, 830.61, now + 0.08, 0.20, 0.18, 'sine');
        playTone(ctx, 987.77, now + 0.16, 0.22, 0.20, 'sine');
        playTone(ctx, 1318.5, now + 0.24, 0.50, 0.25, 'sine');
        break;

      case 'chat':
      case 'message':
        // Soft friendly bubble pop: D5 -> A5
        playTone(ctx, 587.33, now + 0.00, 0.14, 0.15, 'sine');
        playTone(ctx, 880.00, now + 0.08, 0.25, 0.18, 'sine');
        break;

      case 'default':
      default:
        // Pleasant modern two-tone notification ping: A5 -> E6
        playTone(ctx, 880.00, now + 0.00, 0.18, 0.18, 'sine');
        playTone(ctx, 1318.5, now + 0.10, 0.35, 0.22, 'sine');
        break;
    }
  } catch (err) {
    console.warn('Notification sound error:', err);
  }
}
