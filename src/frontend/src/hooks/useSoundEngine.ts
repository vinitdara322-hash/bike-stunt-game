import { useCallback, useEffect, useRef, useState } from "react";

// ─── useSoundEngine ───────────────────────────────────────────────────────────
// All sounds synthesized via Web Audio API — no audio files required.
// AudioContext is created lazily on the first user interaction to satisfy
// browser autoplay policy.

export function useSoundEngine() {
  const ctxRef = useRef<AudioContext | null>(null);
  const engineOscRef = useRef<OscillatorNode | null>(null);
  const engineGainRef = useRef<GainNode | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const engineRunningRef = useRef(false);
  const wheelieTimerRef = useRef(0);
  const lastWheelieTickRef = useRef(0);

  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);

  // Keep mutedRef in sync with state so callbacks always see fresh value
  useEffect(() => {
    mutedRef.current = muted;
    if (masterGainRef.current) {
      masterGainRef.current.gain.setTargetAtTime(
        muted ? 0 : 1,
        masterGainRef.current.context.currentTime,
        0.05,
      );
    }
  }, [muted]);

  // ─── Lazy AudioContext init ─────────────────────────────────────────────────

  const getCtx = useCallback((): AudioContext | null => {
    if (ctxRef.current) return ctxRef.current;
    try {
      const ctx = new AudioContext();
      ctxRef.current = ctx;

      // Master gain node (mute control lives here)
      const master = ctx.createGain();
      master.gain.value = mutedRef.current ? 0 : 1;
      master.connect(ctx.destination);
      masterGainRef.current = master;

      // Engine oscillator — persistent, always running while game is active
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = 80;

      const engineGain = ctx.createGain();
      engineGain.gain.value = 0;

      // Light low-pass to tame harsh sawtooth
      const lpf = ctx.createBiquadFilter();
      lpf.type = "lowpass";
      lpf.frequency.value = 600;

      osc.connect(lpf);
      lpf.connect(engineGain);
      engineGain.connect(master);

      osc.start();
      engineOscRef.current = osc;
      engineGainRef.current = engineGain;
      engineRunningRef.current = true;

      return ctx;
    } catch {
      return null;
    }
  }, []);

  // ─── Engine sound: call every frame with current speed (km/h) ───────────────

  const setEngineSpeed = useCallback(
    (speedKmh: number) => {
      const ctx = getCtx();
      if (!ctx || !engineOscRef.current || !engineGainRef.current) return;
      const now = ctx.currentTime;

      // Map 0–100 km/h → 80–220 Hz
      const normalised = Math.min(1, Math.max(0, speedKmh / 100));
      const freq = 80 + normalised * 140;
      const gain = 0.04 + normalised * 0.12;

      engineOscRef.current.frequency.setTargetAtTime(freq, now, 0.15);
      engineGainRef.current.gain.setTargetAtTime(gain, now, 0.1);
    },
    [getCtx],
  );

  // ─── Stop engine (on game over) ────────────────────────────────────────────

  const stopEngine = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx || !engineGainRef.current) return;
    engineGainRef.current.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
  }, []);

  // ─── Boost pickup: triple ascending beeps ──────────────────────────────────

  const playBoost = useCallback(() => {
    const ctx = getCtx();
    if (!ctx || !masterGainRef.current) return;

    const freqs = [440, 660, 880];
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(masterGainRef.current!);

      const start = ctx.currentTime + i * 0.08;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.1);

      osc.start(start);
      osc.stop(start + 0.12);
    });
  }, [getCtx]);

  // ─── Flip whoosh: filtered white-noise burst (0.3s) ────────────────────────

  const playFlipWhoosh = useCallback(() => {
    const ctx = getCtx();
    if (!ctx || !masterGainRef.current) return;

    const bufferSize = ctx.sampleRate * 0.35;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    // Sweep bandpass: center freq rises 200 → 1800 Hz for "whoosh"
    const bpf = ctx.createBiquadFilter();
    bpf.type = "bandpass";
    bpf.frequency.value = 200;
    bpf.Q.value = 0.8;

    const gain = ctx.createGain();
    gain.gain.value = 0;

    source.connect(bpf);
    bpf.connect(gain);
    gain.connect(masterGainRef.current);

    const now = ctx.currentTime;
    bpf.frequency.setValueAtTime(200, now);
    bpf.frequency.linearRampToValueAtTime(1800, now + 0.3);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.3, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    source.start(now);
    source.stop(now + 0.35);
  }, [getCtx]);

  // ─── Landing thud: low-freq impact, volume scales with velocity ────────────

  const playLandingThud = useCallback(
    (impactVelY: number) => {
      const ctx = getCtx();
      if (!ctx || !masterGainRef.current) return;

      const intensity = Math.min(1, Math.max(0, impactVelY / 800));
      if (intensity < 0.05) return; // too gentle to bother

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";

      const startFreq = 80 + intensity * 20;
      const endFreq = 30;

      osc.connect(gain);
      gain.connect(masterGainRef.current);

      const now = ctx.currentTime;
      osc.frequency.setValueAtTime(startFreq, now);
      osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.25);

      const peakGain = 0.4 + intensity * 0.5;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(peakGain, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.start(now);
      osc.stop(now + 0.4);

      // Optional sub-thud noise layer for hard landings
      if (intensity > 0.5) {
        const bufSz = Math.floor(ctx.sampleRate * 0.12);
        const buf = ctx.createBuffer(1, bufSz, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < bufSz; i++) d[i] = Math.random() * 2 - 1;

        const ns = ctx.createBufferSource();
        ns.buffer = buf;
        const lpf = ctx.createBiquadFilter();
        lpf.type = "lowpass";
        lpf.frequency.value = 200;
        const ng = ctx.createGain();
        ng.gain.value = 0;
        ns.connect(lpf);
        lpf.connect(ng);
        ng.connect(masterGainRef.current);

        ng.gain.setValueAtTime(0, now);
        ng.gain.linearRampToValueAtTime(0.2 * intensity, now + 0.005);
        ng.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        ns.start(now);
        ns.stop(now + 0.15);
      }
    },
    [getCtx],
  );

  // ─── Wheelie tick: short high tick every 0.5s during wheelie ───────────────

  const playWheelTick = useCallback(() => {
    const ctx = getCtx();
    if (!ctx || !masterGainRef.current) return;

    const now = ctx.currentTime;
    // Throttle: only one tick per 0.45s
    if (now - lastWheelieTickRef.current < 0.45) return;
    lastWheelieTickRef.current = now;
    wheelieTimerRef.current = now;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = 1200;

    osc.connect(gain);
    gain.connect(masterGainRef.current);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    osc.start(now);
    osc.stop(now + 0.05);
  }, [getCtx]);

  // ─── Crash sound: descending noise/tone 300 → 80 Hz over 0.8s ─────────────

  const playCrash = useCallback(() => {
    const ctx = getCtx();
    if (!ctx || !masterGainRef.current) return;

    stopEngine();

    const now = ctx.currentTime;

    // Descending tone
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.8);

    oscGain.gain.setValueAtTime(0, now);
    oscGain.gain.linearRampToValueAtTime(0.35, now + 0.02);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

    osc.connect(oscGain);
    oscGain.connect(masterGainRef.current);
    osc.start(now);
    osc.stop(now + 0.85);

    // Crunch noise layer
    const bufSz = Math.floor(ctx.sampleRate * 0.7);
    const buf = ctx.createBuffer(1, bufSz, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufSz; i++) d[i] = Math.random() * 2 - 1;

    const ns = ctx.createBufferSource();
    ns.buffer = buf;
    const lpf = ctx.createBiquadFilter();
    lpf.type = "lowpass";
    lpf.frequency.setValueAtTime(3000, now);
    lpf.frequency.exponentialRampToValueAtTime(300, now + 0.7);

    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0, now);
    ng.gain.linearRampToValueAtTime(0.25, now + 0.02);
    ng.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

    ns.connect(lpf);
    lpf.connect(ng);
    ng.connect(masterGainRef.current);
    ns.start(now);
    ns.stop(now + 0.75);
  }, [getCtx, stopEngine]);

  // ─── Toggle mute ───────────────────────────────────────────────────────────

  const toggleMute = useCallback(() => {
    setMuted((prev) => !prev);
  }, []);

  // ─── Cleanup on unmount ────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (ctxRef.current) {
        ctxRef.current.close().catch(() => {});
        ctxRef.current = null;
      }
    };
  }, []);

  return {
    playBoost,
    playFlipWhoosh,
    playLandingThud,
    playWheelTick,
    playCrash,
    setEngineSpeed,
    stopEngine,
    muted,
    toggleMute,
  };
}
