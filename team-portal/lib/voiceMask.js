/**
 * "Hacker" voice for chat voice notes — built so the real voice can NOT be brought back.
 *
 * How (a channel vocoder, done entirely on the phone with the browser's Web Audio):
 *   1. The microphone sound is split into 32 frequency bands, and only HOW LOUD each band is,
 *      moment by moment, is measured (a slow "envelope", smoothed to ~70 Hz).
 *   2. Everything else of the real voice is thrown away: its pitch, its melody, the fine detail
 *      of its tone. What is left is only enough to understand the words.
 *   3. A new, synthetic voice (a flat machine buzz + a little hiss for the s / sh sounds) is
 *      shaped with those loudness curves — moved DOWN in frequency (formant shift) so even the
 *      shape of the speaker's mouth/throat sounds different.
 *   4. A short metallic echo and a compressor give the "movie hacker" colour.
 *
 * Only this synthetic sound is recorded and sent: the real voice never leaves the phone, is never
 * stored, and the discarded information is simply not in the file — no software can restore it.
 * The buzz pitch and the formant shift are slightly random on every recording, so two notes of
 * the same person are not even processed identically.
 *
 * Works on iPhone (Safari 14.5+), Android and computers. If a browser cannot do this, recording
 * in hacker mode is refused — it never falls back to sending the real voice.
 */

export const VOICE_EFFECT_HACKER = 'hacker';

let sharedCtx = null;

/** The AudioContext must be started from a tap on iPhone: call this inside the button's onClick. */
export function primeVoiceAudio() {
  try {
    const AC = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null;
    if (!AC) return null;
    if (!sharedCtx || sharedCtx.state === 'closed') sharedCtx = new AC();
    if (sharedCtx.state === 'suspended') sharedCtx.resume().catch(() => {});
    return sharedCtx;
  } catch {
    return null;
  }
}

export function voiceMaskSupported() {
  if (typeof window === 'undefined') return false;
  const AC = window.AudioContext || window.webkitAudioContext;
  return !!(AC && AC.prototype && 'createMediaStreamDestination' in AC.prototype && window.MediaRecorder);
}

const rand = (a, b) => a + Math.random() * (b - a);

function rectifierCurve(deadZone = 0.0025) {
  // |x| with a small dead zone, so room noise between words stays silent
  const n = 2049;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    curve[i] = a < deadZone ? 0 : a - deadZone;
  }
  return curve;
}

function noiseBuffer(ctx, seconds = 2) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

/**
 * Builds the hacker voice between `input` (any AudioNode with the voice) and the returned output
 * node. Returns { output, stop } — call stop() when done to stop the internal generators.
 */
export function buildHackerVoice(ctx, input) {
  const BANDS = 32;
  const LOW = 140;
  const HIGH = 7500;
  const carrierHz = rand(84, 96); // flat "machine" pitch: the speaker's own pitch & melody are gone
  const formantShift = rand(0.84, 0.9); // every band is re-voiced lower than where it was heard

  // ── analysis side: the real voice, cleaned a little ──
  const pre = ctx.createBiquadFilter();
  pre.type = 'highpass';
  pre.frequency.value = 120;
  const preGain = ctx.createGain();
  preGain.gain.value = 2.2;
  input.connect(pre);
  pre.connect(preGain);

  // ── synthetic sources (nothing of the real voice is in these) ──
  const buzz = ctx.createOscillator();
  buzz.type = 'sawtooth';
  buzz.frequency.value = carrierHz;
  const buzz2 = ctx.createOscillator(); // a second, slightly detuned buzz: thicker, less "pure tone"
  buzz2.type = 'sawtooth';
  buzz2.frequency.value = carrierHz * 1.007;
  const buzzMix = ctx.createGain();
  buzzMix.gain.value = 0.5;
  buzz.connect(buzzMix);
  buzz2.connect(buzzMix);

  const hiss = ctx.createBufferSource();
  hiss.buffer = noiseBuffer(ctx);
  hiss.loop = true;
  const hissMix = ctx.createGain();
  hissMix.gain.value = 0.6;
  hiss.connect(hissMix);

  const sum = ctx.createGain();
  sum.gain.value = 1;
  const curve = rectifierCurve();
  const ratio = Math.pow(HIGH / LOW, 1 / (BANDS - 1));

  for (let i = 0; i < BANDS; i++) {
    const f = LOW * Math.pow(ratio, i);

    // how loud the real voice is in this band (only this survives)
    const aBand = ctx.createBiquadFilter();
    aBand.type = 'bandpass';
    aBand.frequency.value = f;
    aBand.Q.value = 8;
    const rect = ctx.createWaveShaper();
    rect.curve = curve;
    const smooth1 = ctx.createBiquadFilter();
    smooth1.type = 'lowpass';
    smooth1.frequency.value = 70;
    const smooth2 = ctx.createBiquadFilter();
    smooth2.type = 'lowpass';
    smooth2.frequency.value = 70;
    const envGain = ctx.createGain();
    envGain.gain.value = 9 + i * 0.45; // higher bands are quieter in speech: lift them
    preGain.connect(aBand);
    aBand.connect(rect);
    rect.connect(smooth1);
    smooth1.connect(smooth2);
    smooth2.connect(envGain);

    // the synthetic voice in the (shifted) band, opened and closed by that loudness
    const sBand = ctx.createBiquadFilter();
    sBand.type = 'bandpass';
    sBand.frequency.value = Math.max(90, f * formantShift);
    sBand.Q.value = 7;
    if (f < 2600) buzzMix.connect(sBand);
    else {
      hissMix.connect(sBand); // s / sh / f sounds need noise to stay clear
      if (f < 4500) buzzMix.connect(sBand);
    }
    const vca = ctx.createGain();
    vca.gain.value = 0;
    envGain.connect(vca.gain);
    sBand.connect(vca);
    vca.connect(sum);
  }

  // ── "movie hacker" colour: short metallic comb + a little grit, then even loudness ──
  const comb = ctx.createDelay(0.05);
  comb.delayTime.value = rand(0.0055, 0.0075);
  const combFb = ctx.createGain();
  combFb.gain.value = 0.25;
  const combMix = ctx.createGain();
  combMix.gain.value = 0.15;
  sum.connect(comb);
  comb.connect(combFb);
  combFb.connect(comb);
  comb.connect(combMix);

  const merged = ctx.createGain();
  sum.connect(merged);
  combMix.connect(merged);

  const grit = ctx.createWaveShaper();
  const gc = new Float32Array(1025);
  for (let i = 0; i < gc.length; i++) {
    const x = (i / (gc.length - 1)) * 2 - 1;
    gc[i] = Math.tanh(1.2 * x) / Math.tanh(1.2);
  }
  grit.curve = gc;
  merged.connect(grit);

  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 6500;
  grit.connect(tone);

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -28;
  comp.knee.value = 10;
  comp.ratio.value = 3;
  comp.attack.value = 0.004;
  comp.release.value = 0.18;
  tone.connect(comp);

  const output = ctx.createGain();
  output.gain.value = 1.15;
  comp.connect(output);

  const t = ctx.currentTime;
  buzz.start(t);
  buzz2.start(t);
  hiss.start(t);

  const stop = () => {
    try {
      buzz.stop();
      buzz2.stop();
      hiss.stop();
    } catch {}
    try {
      input.disconnect();
    } catch {}
  };
  return { output, stop };
}
