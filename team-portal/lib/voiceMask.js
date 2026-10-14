/**
 * "Anonymous voice" for chat voice notes — built so the real voice can NOT be brought back.
 *
 * How (a channel vocoder, done entirely on the phone with the browser's Web Audio):
 *   1. Background noise is cut first: a noise gate learns how loud the room is and lets sound
 *      through only while the person is actually speaking (no hiss / hum between words).
 *   2. The voice is split into 48 frequency bands and only HOW LOUD each band is, moment by
 *      moment, is measured. Everything else of the real voice is thrown away: its pitch, its
 *      melody and the fine detail of its tone. What is left is only enough to understand words.
 *   3. A new, synthetic voice (a machine tone + a little air for s / sh / f) is shaped with those
 *      loudness curves, moved DOWN in frequency (formant shift) so even the shape of the
 *      speaker's mouth / throat sounds different.
 *
 * Only this synthetic sound is recorded and sent: the real voice never leaves the phone, is never
 * stored, and the discarded information is simply not in the file — no software can restore it.
 * The tone's pitch and the formant shift are slightly random on every recording.
 *
 * Works on iPhone (Safari 14.5+), Android and computers. If a browser cannot do this, recording
 * in this mode is refused — it never falls back to sending the real voice.
 */

export const VOICE_EFFECT_HACKER = 'hacker'; // stored name of the effect (shown as "Anonymous voice")

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

/**
 * Close the sound engine after a recording. On iPhone an open engine keeps the phone in
 * "call mode" (sound comes out of the earpiece, very quietly), so the preview seemed silent.
 */
export function releaseVoiceAudio() {
  const ctx = sharedCtx;
  sharedCtx = null;
  if (ctx && ctx.state !== 'closed') ctx.close().catch(() => {});
}

export function voiceMaskSupported() {
  if (typeof window === 'undefined') return false;
  const AC = window.AudioContext || window.webkitAudioContext;
  return !!(AC && AC.prototype && 'createMediaStreamDestination' in AC.prototype && window.MediaRecorder);
}

const rand = (a, b) => a + Math.random() * (b - a);

// ── Noise gate (runs in the audio thread). It keeps the quietest level of the last ~2 s as the
// room's noise, and opens only when the sound is clearly above it. ──
const GATE_CODE = `
class BzGate extends AudioWorkletProcessor {
  constructor() {
    super();
    this.env = 0; this.gain = 0; this.open = false; this.hold = 0;
    this.segMin = 1; this.segBlocks = 0; this.mins = []; this.floor = 0.003;
    this.segLen = Math.max(1, Math.round(0.1 * sampleRate / 128));   // 100 ms
    this.holdLen = Math.round(0.18 * sampleRate / 128);              // keep open 180 ms after a word
  }
  process(inputs, outputs) {
    const out = outputs[0] && outputs[0][0];
    if (!out) return true;
    const inp = inputs[0] && inputs[0][0];
    if (!inp) { out.fill(0); return true; }
    let s = 0;
    for (let i = 0; i < inp.length; i++) s += inp[i] * inp[i];
    const rms = Math.sqrt(s / inp.length);
    this.env += (rms - this.env) * (rms > this.env ? 0.6 : 0.12);

    // noise floor = quietest 100 ms of the last 2 s
    if (this.env < this.segMin) this.segMin = this.env;
    if (++this.segBlocks >= this.segLen) {
      this.mins.push(this.segMin); if (this.mins.length > 20) this.mins.shift();
      this.segMin = 1; this.segBlocks = 0;
      let m = 1; for (const v of this.mins) if (v < m) m = v;
      this.floor = Math.min(Math.max(m, 0.0006), 0.04);
    }
    const openAt = Math.max(this.floor * 2.8, 0.004);
    const closeAt = Math.max(this.floor * 1.8, 0.0028);
    if (this.env > openAt) { this.open = true; this.hold = this.holdLen; }
    else if (this.env < closeAt) { if (this.hold > 0) this.hold--; else this.open = false; }

    const g0 = this.gain, target = this.open ? 1 : 0;
    const g1 = g0 + (target - g0) * (target > g0 ? 0.5 : 0.07);
    this.gain = g1;
    for (let i = 0; i < out.length; i++) out[i] = inp[i] * (g0 + ((g1 - g0) * i) / out.length);
    return true;
  }
}
registerProcessor('bz-gate', BzGate);
`;

const gateLoaded = new WeakSet();

async function makeGate(ctx) {
  try {
    if (ctx.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
      if (!gateLoaded.has(ctx)) {
        const url = URL.createObjectURL(new Blob([GATE_CODE], { type: 'application/javascript' }));
        try {
          await ctx.audioWorklet.addModule(url);
        } finally {
          URL.revokeObjectURL(url);
        }
        gateLoaded.add(ctx);
      }
      const node = new AudioWorkletNode(ctx, 'bz-gate', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
      return { input: node, output: node };
    }
  } catch {}
  // Older browsers: a fixed gate built from ordinary nodes (sound below ~-40 dB is cut)
  const pass = ctx.createGain();
  pass.gain.value = 0;
  const level = ctx.createWaveShaper();
  level.curve = rectifierCurve(0);
  const smooth = ctx.createBiquadFilter();
  smooth.type = 'lowpass';
  smooth.frequency.value = 12;
  const knee = ctx.createWaveShaper();
  const n = 1025;
  const kc = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const t = Math.min(1, Math.max(0, (x - 0.008) / (0.025 - 0.008)));
    kc[i] = t * t;
  }
  knee.curve = kc;
  const input = ctx.createGain();
  input.connect(pass);
  input.connect(level);
  level.connect(smooth);
  smooth.connect(knee);
  knee.connect(pass.gain);
  return { input, output: pass };
}

function rectifierCurve(deadZone = 0.0015) {
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
 * Builds the anonymous voice between `input` (an AudioNode with the voice) and the returned
 * output node. Returns { output, stop } — call stop() when done.
 */
export async function buildHackerVoice(ctx, input) {
  const BANDS = 48;
  const LOW = 140;
  const HIGH = 7500;
  const carrierHz = rand(98, 112); // one steady machine pitch: the speaker's own pitch & melody are gone
  const formantShift = rand(0.85, 0.9); // every band is re-voiced lower than where it was heard

  // ── analysis side: the real voice, cleaned (low rumble cut, then the noise gate) ──
  const pre = ctx.createBiquadFilter();
  pre.type = 'highpass';
  pre.frequency.value = 110;
  const gate = await makeGate(ctx);
  const preGain = ctx.createGain();
  preGain.gain.value = 2.0;
  input.connect(pre);
  pre.connect(gate.input);
  gate.output.connect(preGain);

  // ── synthetic sources (nothing of the real voice is in these) ──
  const buzz = ctx.createOscillator();
  buzz.type = 'sawtooth';
  buzz.frequency.value = carrierHz;
  // a slow, tiny wobble keeps the machine tone from sounding like a pure beep
  const wobble = ctx.createOscillator();
  wobble.frequency.value = 4.6;
  const wobbleDepth = ctx.createGain();
  wobbleDepth.gain.value = carrierHz * 0.012;
  wobble.connect(wobbleDepth);
  wobbleDepth.connect(buzz.frequency);
  const buzzMix = ctx.createGain();
  buzzMix.gain.value = 0.9;
  buzz.connect(buzzMix);

  const hiss = ctx.createBufferSource();
  hiss.buffer = noiseBuffer(ctx);
  hiss.loop = true;
  const hissMix = ctx.createGain();
  hissMix.gain.value = 0.32;
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
    aBand.Q.value = 12;
    const rect = ctx.createWaveShaper();
    rect.curve = curve;
    const smooth1 = ctx.createBiquadFilter();
    smooth1.type = 'lowpass';
    smooth1.frequency.value = 70;
    const smooth2 = ctx.createBiquadFilter();
    smooth2.type = 'lowpass';
    smooth2.frequency.value = 70;
    const envGain = ctx.createGain();
    envGain.gain.value = 9 + i * 0.3; // higher bands are quieter in speech: lift them
    preGain.connect(aBand);
    aBand.connect(rect);
    rect.connect(smooth1);
    smooth1.connect(smooth2);
    smooth2.connect(envGain);

    // the synthetic voice in the (shifted) band, opened and closed by that loudness
    const sBand = ctx.createBiquadFilter();
    sBand.type = 'bandpass';
    sBand.frequency.value = Math.max(90, f * formantShift);
    sBand.Q.value = 11;
    if (f < 3800) buzzMix.connect(sBand);
    else {
      hissMix.connect(sBand); // s / sh / f sounds need air to stay clear
      if (f < 5500) buzzMix.connect(sBand);
    }
    const vca = ctx.createGain();
    vca.gain.value = 0;
    envGain.connect(vca.gain);
    sBand.connect(vca);
    vca.connect(sum);
  }

  // ── colour + even loudness: a faint metallic ring, gentle compression ──
  const comb = ctx.createDelay(0.05);
  comb.delayTime.value = rand(0.0055, 0.0075);
  const combFb = ctx.createGain();
  combFb.gain.value = 0.2;
  const combMix = ctx.createGain();
  combMix.gain.value = 0.1;
  sum.connect(comb);
  comb.connect(combFb);
  combFb.connect(comb);
  comb.connect(combMix);

  const merged = ctx.createGain();
  sum.connect(merged);
  combMix.connect(merged);

  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 7000;
  merged.connect(tone);

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -24;
  comp.knee.value = 12;
  comp.ratio.value = 2.5;
  comp.attack.value = 0.005;
  comp.release.value = 0.2;
  tone.connect(comp);

  // never clip (clipping sounds like crackling noise): a fast limiter, then a soft ceiling
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.08;
  const level = ctx.createGain();
  level.gain.value = 0.9;
  comp.connect(level);
  level.connect(limiter);
  const ceiling = ctx.createWaveShaper();
  const cc = new Float32Array(2049);
  for (let i = 0; i < cc.length; i++) {
    const x = (i / (cc.length - 1)) * 2 - 1;
    cc[i] = Math.tanh(1.4 * x) / Math.tanh(1.4) * 0.95;
  }
  ceiling.curve = cc;
  limiter.connect(ceiling);
  const output = ctx.createGain();
  output.gain.value = 1;
  ceiling.connect(output);

  const t = ctx.currentTime;
  buzz.start(t);
  wobble.start(t);
  hiss.start(t);

  const stop = () => {
    try {
      buzz.stop();
      wobble.stop();
      hiss.stop();
    } catch {}
    try {
      input.disconnect();
    } catch {}
  };
  return { output, stop };
}
