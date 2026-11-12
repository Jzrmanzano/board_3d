/* One square-wave oscillator stands in for the piezo buzzer. */
let ctx: AudioContext | null = null, osc: OscillatorNode, gain: GainNode;

/** Browsers only allow audio to start from a click, so call this from the Run and Sound buttons. */
export function ensureAudio() {
  if (ctx) return;
  try {
    ctx = new AudioContext();
    osc = ctx.createOscillator(); osc.type = 'square';
    gain = ctx.createGain(); gain.gain.value = 0;
    osc.connect(gain); gain.connect(ctx.destination); osc.start();
  } catch { ctx = null; }
}

export function setTone(freq: number) {
  if (!ctx) return;
  if (freq > 0) { osc.frequency.value = freq; gain.gain.value = 0.035; } else gain.gain.value = 0;
}
