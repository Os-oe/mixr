// MIXR audio — procedural WebAudio synth (no files, 0 latency).
// Kie-SFX bridge fallback decision documented in LESSONS.md.
class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = localStorage.getItem('mixr-sound') !== 'off';
  }
  ensure() {
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  }
  toggle() {
    this.enabled = !this.enabled;
    localStorage.setItem('mixr-sound', this.enabled ? 'on' : 'off');
    return this.enabled;
  }
  _env(node, t0, a, d, peak = 1) {
    node.gain.setValueAtTime(0.0001, t0);
    node.gain.exponentialRampToValueAtTime(peak, t0 + a);
    node.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }
  _osc(type, f0, f1, t0, dur, peak = 0.5) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    this._env(g, t0, 0.008, dur, peak);
    o.connect(g).connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  _noise(dur, t0, filterFreq = 1200, peak = 0.3, q = 1) {
    const ctx = this.ctx;
    const len = Math.ceil(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = filterFreq; f.Q.value = q;
    const g = ctx.createGain();
    this._env(g, t0, 0.02, dur, peak);
    src.connect(f).connect(g).connect(this.master);
    src.start(t0); src.stop(t0 + dur + 0.05);
    return f;
  }
  play(name) {
    if (!this.enabled || !this.ensure()) return;
    const t = this.ctx.currentTime + 0.01;
    switch (name) {
      case 'pour': { // bubbling filtered noise, rising pitch
        const f = this._noise(1.1, t, 700, 0.22, 2);
        f.frequency.linearRampToValueAtTime(1400, t + 1.1);
        break;
      }
      case 'drop': // plop
        this._osc('sine', 420, 90, t, 0.16, 0.5);
        this._noise(0.06, t + 0.01, 2200, 0.12);
        break;
      case 'layer':
        this._osc('sine', 200, 320, t, 0.35, 0.25);
        break;
      case 'sprinkle':
        for (let i = 0; i < 7; i++) this._noise(0.03, t + i * 0.045, 4200 + Math.random() * 1500, 0.1, 4);
        break;
      case 'swirl': {
        const f = this._noise(0.7, t, 500, 0.25, 1.5);
        f.frequency.linearRampToValueAtTime(2600, t + 0.45);
        f.frequency.linearRampToValueAtTime(700, t + 0.7);
        break;
      }
      case 'tap':
        this._osc('triangle', 880, 660, t, 0.05, 0.18);
        break;
      case 'explode':
        this._noise(0.4, t, 900, 0.3, 0.8);
        this._osc('sine', 160, 60, t, 0.4, 0.4);
        [523, 659, 784].forEach((f, i) => this._osc('triangle', f, f, t + 0.25 + i * 0.07, 0.18, 0.2));
        break;
      case 'blip':
        this._osc('square', 980, 1320, t, 0.07, 0.12);
        break;
      case 'bad':
        this._osc('square', 220, 110, t, 0.18, 0.15);
        break;
      case 'confetti':
      case 'chime':
        [523, 659, 784, 1047].forEach((f, i) => this._osc('triangle', f, f, t + i * 0.09, 0.3, 0.25));
        this._noise(0.25, t, 5000, 0.08, 3);
        break;
    }
  }
}
export const audio = new Audio();
