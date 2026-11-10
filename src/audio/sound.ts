export interface SoundState {
  speed: number;
  surf: number;
  lap: number;
  open: number;
  flapPhase: number;
  flapPower: number;
  visiting: boolean;
  water: number;
  region: 'island' | 'city' | 'arcade';
}

const CHORDS = [
  [38, 45, 54, 57, 64],
  [35, 47, 54, 57, 62],
  [31, 43, 50, 59, 66],
  [33, 45, 52, 57, 62],
];
const SCALE = [62, 64, 66, 69, 71, 74, 76, 78, 81];
const NIGHT = [
  [38, 45, 53, 57, 64],
  [34, 46, 53, 57, 62],
  [31, 43, 50, 58, 65],
  [33, 45, 52, 55, 62],
];
const CHORD_SECONDS = 9;
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

export class Sound {
  enabled = false;
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private noise!: AudioBuffer;
  private wind!: GainNode;
  private windTone!: BiquadFilterNode;
  private hiss!: GainNode;
  private sea!: GainNode;
  private slosh!: GainNode;
  private lap!: GainNode;
  private nextGull = 0;
  private wings!: GainNode;
  private score!: GainNode;
  private meter: AnalyserNode | null = null;
  private nextChord = 0;
  private chord = 0;
  private beat = -1;
  private seed = 7;
  private region: SoundState['region'] = 'island';

  level(): number {
    if (!this.meter) return 0;
    const data = new Float32Array(this.meter.fftSize);
    this.meter.getFloatTimeDomainData(data);
    let sum = 0;
    for (const v of data) sum += v * v;
    return Math.sqrt(sum / data.length);
  }

  private random(): number {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  constructor() {
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx || !this.enabled) return;
      if (document.visibilityState === 'hidden') void this.ctx.suspend();
      else void this.ctx.resume();
    });
    window.addEventListener('pointerdown', () => {
      if (this.ctx && this.enabled && this.ctx.state !== 'running' && document.visibilityState === 'visible') void this.ctx.resume();
    });
  }

  toggle(): boolean {
    this.enabled = !this.enabled;
    if (this.enabled) {
      if (!this.ctx) this.build();
      const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
      if (session) session.type = 'playback';
      const ctx = this.ctx!;
      void ctx.resume();
      this.nextChord = Math.max(this.nextChord, ctx.currentTime + 0.3);
      this.master.gain.cancelScheduledValues(ctx.currentTime);
      this.master.gain.setTargetAtTime(0.9, ctx.currentTime, 0.6);
    } else if (this.ctx) {
      const ctx = this.ctx;
      this.master.gain.cancelScheduledValues(ctx.currentTime);
      this.master.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
      setTimeout(() => {
        if (!this.enabled) void ctx.suspend();
      }, 900);
    }
    return this.enabled;
  }

  private loop(buffer: AudioBuffer, rate = 1): AudioBufferSourceNode {
    const source = this.ctx!.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.playbackRate.value = rate;
    source.start(0, this.random() * buffer.duration);
    return source;
  }

  private build(): void {
    const ctx = (this.ctx = new AudioContext({ latencyHint: 'playback' }));
    const length = ctx.sampleRate * 4;
    this.noise = ctx.createBuffer(1, length, ctx.sampleRate);
    const samples = this.noise.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < length; i++) {
      const white = this.random() * 2 - 1;
      brown = (brown + white * 0.045) / 1.012;
      samples[i] = white * 0.35 + brown * 2.6;
    }

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -14;
    limiter.ratio.value = 6;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(limiter).connect(ctx.destination);
    this.meter = ctx.createAnalyser();
    this.meter.fftSize = 2048;
    limiter.connect(this.meter);

    this.windTone = ctx.createBiquadFilter();
    this.windTone.type = 'bandpass';
    this.windTone.Q.value = 0.55;
    this.wind = ctx.createGain();
    this.wind.gain.value = 0;
    this.loop(this.noise).connect(this.windTone).connect(this.wind).connect(this.master);

    const high = ctx.createBiquadFilter();
    high.type = 'highpass';
    high.frequency.value = 2600;
    this.hiss = ctx.createGain();
    this.hiss.gain.value = 0;
    this.loop(this.noise, 1.3).connect(high).connect(this.hiss).connect(this.master);

    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 520;
    const swell = ctx.createGain();
    swell.gain.value = 0.55;
    for (const [rate, depth] of [
      [0.09, 0.3],
      [0.143, 0.18],
    ]) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = rate;
      const amount = ctx.createGain();
      amount.gain.value = depth;
      lfo.connect(amount).connect(swell.gain);
      lfo.start();
    }
    this.sea = ctx.createGain();
    this.sea.gain.value = 0;
    this.loop(this.noise, 0.8).connect(low).connect(swell).connect(this.sea).connect(this.master);

    const splash = ctx.createBiquadFilter();
    splash.type = 'bandpass';
    splash.frequency.value = 1500;
    splash.Q.value = 0.8;
    const wave = ctx.createGain();
    wave.gain.value = 0.5;
    const pulse = ctx.createOscillator();
    pulse.frequency.value = 1 / 3.4;
    const pulseDepth = ctx.createGain();
    pulseDepth.gain.value = 0.45;
    pulse.connect(pulseDepth).connect(wave.gain);
    pulse.start();
    const brook = ctx.createBiquadFilter();
    brook.type = 'bandpass';
    brook.frequency.value = 1250;
    brook.Q.value = 1.4;
    const ripple = ctx.createGain();
    ripple.gain.value = 0.5;
    for (const [rate, depth] of [
      [2.3, 0.22],
      [3.7, 0.16],
      [0.31, 0.2],
    ]) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = rate;
      const amount = ctx.createGain();
      amount.gain.value = depth;
      lfo.connect(amount).connect(ripple.gain);
      lfo.start();
    }
    this.lap = ctx.createGain();
    this.lap.gain.value = 0;
    this.loop(this.noise, 1.7).connect(brook).connect(ripple).connect(this.lap).connect(this.master);

    this.slosh = ctx.createGain();
    this.slosh.gain.value = 0;
    this.loop(this.noise, 1.1).connect(splash).connect(wave).connect(this.slosh).connect(this.master);

    this.wings = ctx.createGain();
    this.wings.gain.value = 1;
    this.wings.connect(this.master);

    const reverb = ctx.createConvolver();
    const tail = ctx.createBuffer(2, ctx.sampleRate * 4, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = tail.getChannelData(channel);
      for (let i = 0; i < data.length; i++) data[i] = (this.random() * 2 - 1) * Math.exp((-i / data.length) * 5.5);
    }
    reverb.buffer = tail;
    const wet = ctx.createGain();
    wet.gain.value = 0.75;
    this.score = ctx.createGain();
    this.score.gain.value = 0.5;
    this.score.connect(this.master);
    this.score.connect(reverb).connect(wet).connect(this.master);
  }

  private voice(type: OscillatorType, frequency: number, at: number, attack: number, hold: number, release: number, level: number, cutoff: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    osc.detune.value = (this.random() - 0.5) * 14;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(level, at + attack);
    gain.gain.setValueAtTime(level, at + attack + hold);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + attack + hold + release);
    osc.connect(filter).connect(gain).connect(this.score);
    osc.start(at);
    osc.stop(at + attack + hold + release + 0.1);
  }

  private schedule(at: number): void {
    if (this.region === 'city') {
      const notes = NIGHT[this.chord % NIGHT.length];
      this.chord++;
      notes.forEach((note, i) => {
        this.voice('sawtooth', hz(note), at + i * 0.1, 1.6, CHORD_SECONDS - 3, 3, i === 0 ? 0.05 : 0.022, 520);
      });
      const steps = 32;
      for (let i = 0; i < steps; i++) {
        const note = notes[1 + ((i * 3) % (notes.length - 1))] + (i % 8 > 3 ? 12 : 0) + 12;
        const when = at + (i * CHORD_SECONDS) / steps;
        this.voice('square', hz(note), when, 0.005, 0.04, 0.22, 0.016, 1500 + (i % 16) * 90);
        if (i % 8 === 0) this.voice('sine', hz(notes[0] - 12), when, 0.01, 0.1, 0.5, 0.11, 300);
      }
      return;
    }
    if (this.region === 'arcade') {
      const notes = CHORDS[this.chord % CHORDS.length];
      this.chord++;
      const steps = 24;
      let step = 2 + Math.floor(this.random() * 4);
      for (let i = 0; i < steps; i++) {
        const when = at + (i * CHORD_SECONDS) / steps;
        if (i % 3 === 0) this.voice('triangle', hz(notes[i % 6 === 0 ? 0 : 1]), when, 0.005, 0.12, 0.2, 0.09, 900);
        if (this.random() < 0.72) {
          step = Math.max(0, Math.min(SCALE.length - 1, step + Math.floor(this.random() * 5) - 2));
          this.voice('square', hz(SCALE[step] + 12), when, 0.004, 0.09, 0.14, 0.02, 3200);
        }
        if (i % 6 === 3) this.voice('square', hz(notes[2 + (i % 3)] + 12), when, 0.004, 0.05, 0.1, 0.012, 2600);
      }
      return;
    }
    const notes = CHORDS[this.chord % CHORDS.length];
    this.chord++;
    notes.forEach((note, i) => {
      const level = i === 0 ? 0.11 : 0.05;
      this.voice('sine', hz(note), at + i * 0.22, 3.2, CHORD_SECONDS - 4, 5, level, 1200);
      if (i > 0) this.voice('triangle', hz(note) * 1.003, at + i * 0.22, 4, CHORD_SECONDS - 5, 5, level * 0.35, 700);
    });
    const plucks = 2 + Math.floor(this.random() * 4);
    let step = Math.floor(this.random() * SCALE.length);
    for (let i = 0; i < plucks; i++) {
      step = Math.max(0, Math.min(SCALE.length - 1, step + Math.floor(this.random() * 5) - 2));
      const when = at + 0.8 + (i + this.random() * 0.6) * ((CHORD_SECONDS - 1.5) / plucks);
      this.voice('triangle', hz(SCALE[step]), when, 0.02, 0.05, 3.2, 0.06, 2200);
      this.voice('sine', hz(SCALE[step]) * 2, when, 0.01, 0.02, 1.4, 0.018, 4000);
    }
  }

  chime(shift = 0): void {
    if (!this.ctx || !this.enabled) return;
    const at = this.ctx.currentTime + 0.02;
    [74, 78, 81, 86, 90, 93].forEach((base, i) => {
      const note = base + shift;
      this.voice('sine', hz(note), at + i * 0.075, 0.02, 0.05, 1.8, 0.07, 5000);
      this.voice('triangle', hz(note + 12), at + i * 0.075 + 0.03, 0.02, 0.03, 0.9, 0.02, 6000);
    });
  }

  whistle(pan = 0): void {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const out = ctx.createStereoPanner();
    out.pan.value = 0;
    out.connect(this.master);
    const echo = ctx.createStereoPanner();
    echo.pan.value = Math.max(-1, Math.min(1, pan));
    echo.connect(this.master);
    const notes: [number, number, number, number, StereoPannerNode, number][] = [
      [0, 2100, 2900, 0.16, out, 0.1],
      [0.2, 2500, 3300, 0.14, out, 0.1],
      [0.38, 3300, 2400, 0.3, out, 0.1],
      [1.0, 2100, 2900, 0.16, echo, 0.045],
      [1.2, 2500, 3300, 0.14, echo, 0.045],
      [1.38, 3300, 2400, 0.3, echo, 0.045],
    ];
    for (const [delay, from, to, length, target, level] of notes) {
      const at = ctx.currentTime + 0.03 + delay;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(from, at);
      osc.frequency.exponentialRampToValueAtTime(to, at + length);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(level, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + length + 0.08);
      osc.connect(gain).connect(target);
      osc.start(at);
      osc.stop(at + length + 0.15);
    }
  }

  private gull(): void {
    const ctx = this.ctx!;
    const pan = ctx.createStereoPanner();
    pan.pan.value = this.random() * 1.6 - 0.8;
    const far = 0.25 + this.random() * 0.75;
    pan.connect(this.master);
    const calls = 2 + Math.floor(this.random() * 4);
    let at = ctx.currentTime + 0.05;
    const base = 1250 + this.random() * 500;
    for (let i = 0; i < calls; i++) {
      const long = i === calls - 1 ? 0.5 : 0.2 + this.random() * 0.12;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(base * 0.85, at);
      osc.frequency.linearRampToValueAtTime(base * 1.45, at + 0.07);
      osc.frequency.exponentialRampToValueAtTime(base * 0.8, at + long);
      const vibrato = ctx.createOscillator();
      vibrato.frequency.value = 26;
      const depth = ctx.createGain();
      depth.gain.value = 45;
      vibrato.connect(depth).connect(osc.frequency);
      const tone = ctx.createBiquadFilter();
      tone.type = 'bandpass';
      tone.frequency.value = base * 1.3;
      tone.Q.value = 2.2;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.028 * far, at + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + long);
      osc.connect(tone).connect(gain).connect(pan);
      osc.start(at);
      vibrato.start(at);
      osc.stop(at + long + 0.05);
      vibrato.stop(at + long + 0.05);
      at += long + 0.06 + this.random() * 0.1;
    }
  }

  private flap(power: number): void {
    const ctx = this.ctx!;
    const at = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.1;
    filter.frequency.setValueAtTime(950, at);
    filter.frequency.exponentialRampToValueAtTime(260, at + 0.17);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.05 + power * 0.11, at + 0.035);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
    source.connect(filter).connect(gain).connect(this.wings);
    source.start(at, this.random() * 3);
    source.stop(at + 0.25);
  }

  update(state: SoundState): void {
    const ctx = this.ctx;
    if (!ctx || !this.enabled || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (state.region !== this.region) {
      this.region = state.region;
      this.nextChord = Math.min(this.nextChord, now + 0.4);
    }
    const fast = Math.min(1, Math.max(0, (state.speed - 5) / 41));
    const calm = state.visiting ? 0.55 : 1;
    this.wind.gain.setTargetAtTime((0.018 + fast * 0.1 + state.open * 0.03) * calm, now, 0.25);
    this.windTone.frequency.setTargetAtTime(260 + fast * 900, now, 0.3);
    this.hiss.gain.setTargetAtTime(fast * fast * 0.03 * calm, now, 0.25);
    this.sea.gain.setTargetAtTime(state.surf * 0.4 + state.open * 0.035, now, 0.9);
    this.lap.gain.setTargetAtTime(state.lap * 0.07, now, 0.9);
    if (state.surf > 0.3 && state.region === 'island' && now > this.nextGull) {
      this.gull();
      this.nextGull = now + 5 + this.random() * 13;
    }
    this.slosh.gain.setTargetAtTime(state.water * 0.16, now, 0.5);
    this.score.gain.setTargetAtTime(state.visiting ? 0.62 : 0.5, now, 1.5);

    const beat = Math.floor(state.flapPhase / (Math.PI * 2));
    if (beat !== this.beat) {
      if (this.beat >= 0 && state.flapPower > 0.12) this.flap(Math.min(1.2, state.flapPower));
      this.beat = beat;
    }
    if (this.nextChord < now + 1.2) {
      this.schedule(Math.max(this.nextChord, now + 0.1));
      this.nextChord = Math.max(this.nextChord, now + 0.1) + CHORD_SECONDS;
    }
  }
}
